"""Busca por palavras dentro da Bíblia (pedido do dono de 24/11/2026).

Versões ABERTAS (BLIVRE, ONBV, BPM, KJV, WEB, RV1909, VBL): índice no banco
(``bible_verse``), gerado pelo comando idempotente ``indexar-biblia`` a partir
dos JSON estáticos do front. No PostgreSQL:

- ``tsv = to_tsvector(<dicionário do idioma>, discipulei_unaccent(text))``
  com índice GIN: sem acento ("coracao" acha "coração") e com stemming
  ("pecados" acha "pecado", "amados" acha "amado");
- a consulta é montada termo a termo, com parâmetros (nada de SQL com texto
  do usuário): palavras são E (todas precisam estar no versículo, como na
  API.Bible e no Bible Gateway), "frase entre aspas" vira ``phraseto_tsquery``,
  ``-palavra`` exclui, ``pala*`` busca por prefixo e cada palavra conhecida
  vira um OU com as variações simples de :data:`SINONIMOS` (amor/amar/
  caridade, perdão/perdoar...), que o stemmer sozinho não junta;
- ranking por ``ts_rank_cd`` (densidade dos termos), desempate pela ordem
  canônica; ``ordem=canonica`` lista de Gênesis a Apocalipse.

No SQLite (testes) a mesma consulta vira LIKE (sem stemming nem unaccent).

O destaque é calculado aqui (:func:`destacar`): intervalos ``[início, fim)``
do texto, que o front marca com <mark>. Nada de HTML vindo do servidor.

Busca semântica por embeddings NÃO entra nesta rodada (ver o relatório).
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Sequence, Tuple

from pydantic import BaseModel
from sqlalchemy import and_, func, not_, or_, text
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.busca_biblica import BibleVerse
from src.services.biblia.referencias import LIVROS, ORDEM, POR_ID, sem_acento

# versão aberta -> idioma (mesmos ids de apps/web/public/biblia-dados/catalogo.json)
VERSOES_ABERTAS: Dict[str, str] = {
    "blivre": "pt", "onbv": "pt", "bpm": "pt",
    "kjv": "en", "web": "en",
    "rv1909": "es", "vbl": "es",
}
# idioma -> dicionário do full-text do PostgreSQL (lista fechada: vai no SQL)
DICIONARIOS: Dict[str, str] = {"pt": "portuguese", "en": "english", "es": "spanish"}
# versão aberta de recuo por idioma (busca nas licenciadas sem endpoint)
ABERTA_DO_IDIOMA: Dict[str, str] = {"pt": "blivre", "en": "web", "es": "rv1909"}

MAX_TERMOS = 8
MAX_POR_PAGINA = 50

# Variações simples que o stemmer não junta (substantivo x verbo, termos
# antigos das traduções clássicas). Grupos simétricos, sem acento.
_GRUPOS_SINONIMOS: Dict[str, Sequence[Sequence[str]]] = {
    "pt": (
        ("amor", "amar", "caridade"),
        ("perdao", "perdoar"),
        ("oracao", "orar"),
        ("louvor", "louvar"),
        ("salvacao", "salvar", "salvador"),
        ("fe", "crer"),
        ("alegria", "alegrar", "regozijo"),
        ("esperanca", "esperar"),
        ("gloria", "glorificar"),
        ("batismo", "batizar"),
        ("ressurreicao", "ressuscitar"),
        ("cristo", "messias"),
        ("medo", "temor"),
        ("morte", "morrer"),
        ("vida", "viver"),
        ("justica", "justo"),
        ("misericordia", "compaixao"),
        ("pecado", "transgressao"),
        ("bencao", "abencoar"),
        ("adoracao", "adorar"),
    ),
    "en": (
        ("love", "charity"),
        ("faith", "believe"),
        ("forgive", "forgiveness"),
        ("pray", "prayer"),
        ("fear", "afraid"),
        ("salvation", "save", "saviour", "savior"),
        ("joy", "rejoice"),
        ("christ", "messiah"),
        ("sin", "transgression"),
        ("worship", "adore"),
    ),
    "es": (
        ("amor", "amar", "caridad"),
        ("perdon", "perdonar"),
        ("oracion", "orar"),
        ("fe", "creer"),
        ("salvacion", "salvar", "salvador"),
        ("gozo", "alegria", "regocijo"),
        ("cristo", "mesias"),
        ("pecado", "transgresion"),
    ),
}
SINONIMOS: Dict[str, Dict[str, List[str]]] = {}
for _idioma, _grupos in _GRUPOS_SINONIMOS.items():
    _mapa: Dict[str, List[str]] = {}
    for _g in _grupos:
        for _p in _g:
            _mapa[_p] = [x for x in _g if x != _p]
    SINONIMOS[_idioma] = _mapa


def normalizar(s: str) -> str:
    return sem_acento(s or "").lower()


# ---------------------------------------------------------------------------
# Consulta
# ---------------------------------------------------------------------------


@dataclass
class Termo:
    palavra: str  # normalizada (sem acento, minúscula)
    prefixo: bool = False
    variacoes: List[str] = field(default_factory=list)
    original: str = ""  # como foi digitada (minúscula, com acento): recuo LIKE


@dataclass
class Consulta:
    termos: List[Termo] = field(default_factory=list)
    frases: List[str] = field(default_factory=list)
    excluir: List[str] = field(default_factory=list)

    @property
    def vazia(self) -> bool:
        return not self.termos and not self.frases


_FRASE = re.compile(r'"([^"]{1,120})"')
_PALAVRA = re.compile(r"[\w*-]+", re.UNICODE)


def interpretar(consulta: str, idioma: str = "pt") -> Consulta:
    """'"filho pródigo" -irmão perd*' -> frases, termos com variações, exclusões."""
    c = Consulta()
    bruto = (consulta or "")[:200]
    for m in _FRASE.finditer(bruto):
        frase = " ".join(m.group(1).split())
        if frase:
            c.frases.append(frase)
    resto = _FRASE.sub(" ", bruto).replace('"', " ")
    sin = SINONIMOS.get(idioma, {})
    vistos = set()
    for m in _PALAVRA.finditer(resto):
        p = m.group(0)
        negar = p.startswith("-")
        p = p.strip("-")
        prefixo = p.endswith("*")
        cru = re.sub(r"[^\w]", "", p, flags=re.UNICODE).lower()
        p = normalizar(cru)
        if not p:
            continue
        if negar:
            if p not in c.excluir:
                c.excluir.append(p)
            continue
        if (p, prefixo) in vistos:
            continue
        vistos.add((p, prefixo))
        if prefixo and len(p) < 2:
            continue
        c.termos.append(Termo(p, prefixo, [] if prefixo else list(sin.get(p, [])), cru))
    c.termos = c.termos[:MAX_TERMOS]
    c.frases = c.frases[:3]
    c.excluir = c.excluir[:3]
    return c


def _raiz(p: str) -> str:
    """Raiz grosseira para o destaque ("pecados" -> "peca", "amor" -> "amor")."""
    return p if len(p) <= 4 else p[: max(4, len(p) - 3)]


def destacar(texto: str, consulta: Consulta) -> List[Tuple[int, int]]:
    """Intervalos [início, fim) das palavras do versículo que casam com a consulta."""
    alvos: List[Tuple[str, bool]] = []
    for t in consulta.termos:
        if t.prefixo:
            alvos.append((t.palavra, True))
        else:
            alvos.append((_raiz(t.palavra), len(t.palavra) > 4))
            alvos += [(_raiz(v), len(v) > 4) for v in t.variacoes]
    for f in consulta.frases:
        for p in f.split():
            p = normalizar(p)
            if len(p) > 2:
                alvos.append((_raiz(p), len(p) > 4))
    if not alvos:
        return []
    out: List[Tuple[int, int]] = []
    for m in re.finditer(r"\w+", texto or "", re.UNICODE):
        palavra = normalizar(m.group(0))
        for alvo, por_inicio in alvos:
            if palavra == alvo or (por_inicio and palavra.startswith(alvo)):
                out.append((m.start(), m.end()))
                break
    return out


# ---------------------------------------------------------------------------
# Resultado
# ---------------------------------------------------------------------------


class VersiculoEncontrado(BaseModel):
    livro: str
    capitulo: int
    verso: int
    codigo: str  # "JHN.3.16" (abre no leitor)
    referencia: str  # "João 3:16"
    texto: str
    destaques: List[Tuple[int, int]] = []


class BuscaBibliaResultado(BaseModel):
    consulta: str
    versao: str  # versão pedida (o clique abre nela)
    versao_texto: str  # versão de onde veio o texto exibido
    recuo: bool = False  # True: licenciada sem busca/texto; texto de uma aberta
    provedor: Optional[str] = None  # 'youversion' | 'apibible' | None (banco)
    referencia: Optional[str] = None  # consulta era uma referência: código p/ o leitor
    total: int = 0
    page: int = 1
    limit: int = 20
    versiculos: List[VersiculoEncontrado] = []
    fums: Optional[str] = None
    copyright: Optional[str] = None


def _referencia(livro: str, cap: int, verso: int) -> str:
    info = POR_ID.get(livro)
    return f"{info.nome if info else livro} {cap}:{verso}"


def montar_versiculo(livro: str, cap: int, verso: int, texto: str, consulta: Consulta) -> VersiculoEncontrado:
    return VersiculoEncontrado(
        livro=livro, capitulo=cap, verso=verso, codigo=f"{livro}.{cap}.{verso}",
        referencia=_referencia(livro, cap, verso), texto=texto, destaques=destacar(texto, consulta),
    )


def _filtros(versao: str, testamento: Optional[str], livro: Optional[str]):
    cond = [BibleVerse.version == versao]
    if livro and livro.upper() in POR_ID:
        cond.append(BibleVerse.book == livro.upper())
    elif testamento == "AT":
        cond.append(BibleVerse.book_order < 39)
    elif testamento == "NT":
        cond.append(BibleVerse.book_order >= 39)
    return cond


async def _buscar_postgres(
    db: AsyncSession, c: Consulta, versao: str, idioma: str, testamento, livro, page, limit, ordem
) -> Tuple[int, list]:
    dic = DICIONARIOS[idioma]  # lista fechada
    params: Dict[str, object] = {"versao": versao, "limit": limit, "offset": (page - 1) * limit}
    partes: List[str] = []

    def plain(p: str) -> str:
        k = f"p{len(params)}"
        params[k] = p
        return f"plainto_tsquery('{dic}', discipulei_unaccent(:{k}))"

    for t in c.termos:
        if t.prefixo:
            k = f"p{len(params)}"
            params[k] = re.sub(r"[^a-z0-9]", "", t.palavra)
            if not params[k]:
                continue
            partes.append(f"to_tsquery('{dic}', :{k} || ':*')")
        else:
            ors = [plain(t.palavra)] + [plain(v) for v in t.variacoes]
            partes.append("(" + " || ".join(ors) + ")")
    for f in c.frases:
        k = f"p{len(params)}"
        params[k] = f
        partes.append(f"phraseto_tsquery('{dic}', discipulei_unaccent(:{k}))")
    for e in c.excluir:
        partes.append(f"!!{plain(e)}")
    if not partes:
        return 0, []
    tsq = " && ".join(partes)

    where = ["v.version = :versao", "v.tsv @@ q.query"]
    if livro and livro.upper() in POR_ID:
        params["livro"] = livro.upper()
        where.append("v.book = :livro")
    elif testamento == "AT":
        where.append("v.book_order < 39")
    elif testamento == "NT":
        where.append("v.book_order >= 39")
    ordem_sql = (
        "v.book_order, v.chapter, v.verse" if ordem == "canonica"
        else "rank DESC, v.book_order, v.chapter, v.verse"
    )
    sql = text(
        f"WITH q AS (SELECT {tsq} AS query) "
        "SELECT v.book, v.chapter, v.verse, v.text, ts_rank_cd(v.tsv, q.query) AS rank, "
        "count(*) OVER () AS total "
        f"FROM bible_verse v, q WHERE {' AND '.join(where)} "
        f"ORDER BY {ordem_sql} LIMIT :limit OFFSET :offset"
    )
    rows = (await db.execute(sql, params)).all()
    total = int(rows[0].total) if rows else 0
    if not rows and page > 1:
        # página além do fim: ainda dá o total para a paginação
        sql_total = text(
            f"WITH q AS (SELECT {tsq} AS query) SELECT count(*) FROM bible_verse v, q "
            f"WHERE {' AND '.join(where)}"
        )
        total = int((await db.execute(sql_total, params)).scalar_one())
    return total, [(r.book, r.chapter, r.verse, r.text) for r in rows]


async def _buscar_like(
    db: AsyncSession, c: Consulta, versao: str, testamento, livro, page, limit, ordem
) -> Tuple[int, list]:
    """Recuo portátil (SQLite dos testes): LIKE, sem stemming nem unaccent."""
    col = func.lower(BibleVerse.text)

    def like(p: str):
        p = p.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
        return col.like(f"%{p.lower()}%", escape="\\")

    cond = _filtros(versao, testamento, livro)
    for t in c.termos:
        formas = {t.palavra, t.original or t.palavra, *t.variacoes}
        cond.append(or_(*[like(f) for f in sorted(formas)]))
    for f in c.frases:
        cond.append(like(f))
    for e in c.excluir:
        cond.append(not_(like(e)))
    q = select(BibleVerse).where(and_(*cond))
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar_one()
    rows = (await db.execute(
        q.order_by(BibleVerse.book_order, BibleVerse.chapter, BibleVerse.verse)
        .offset((page - 1) * limit).limit(limit)
    )).scalars().all()
    return int(total), [(r.book, r.chapter, r.verse, r.text) for r in rows]


async def buscar_aberta(
    db: AsyncSession,
    consulta: str,
    versao: str,
    testamento: Optional[str] = None,
    livro: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    ordem: str = "relevancia",
) -> BuscaBibliaResultado:
    versao = versao.lower()
    idioma = VERSOES_ABERTAS[versao]
    page = max(1, page)
    limit = max(1, min(limit, MAX_POR_PAGINA))
    c = interpretar(consulta, idioma)
    res = BuscaBibliaResultado(consulta=consulta, versao=versao, versao_texto=versao, page=page, limit=limit)
    if c.vazia:
        return res
    if db.bind.dialect.name == "postgresql":  # type: ignore[union-attr]
        total, rows = await _buscar_postgres(db, c, versao, idioma, testamento, livro, page, limit, ordem)
    else:
        total, rows = await _buscar_like(db, c, versao, testamento, livro, page, limit, ordem)
    res.total = total
    res.versiculos = [montar_versiculo(b, ch, v, t, c) for b, ch, v, t in rows]
    return res


async def textos_abertos(
    db: AsyncSession, versao: str, refs: List[Tuple[str, int, int]]
) -> Dict[Tuple[str, int, int], str]:
    """Texto de uma versão aberta para uma lista de (livro, cap, verso)."""
    if not refs:
        return {}
    cond = [
        and_(BibleVerse.book == b, BibleVerse.chapter == ch, BibleVerse.verse == v)
        for b, ch, v in refs
    ]
    rows = (await db.execute(
        select(BibleVerse).where(BibleVerse.version == versao, or_(*cond))
    )).scalars().all()
    return {(r.book, r.chapter, r.verse): r.text for r in rows}


# ---------------------------------------------------------------------------
# Indexação (comando ``indexar-biblia``)
# ---------------------------------------------------------------------------


def ler_versao(pasta: str, versao: str):
    """Gera (livro, ordem, cap, verso, texto) a partir dos JSON <pasta>/<versao>/<USFM>.json."""
    base = os.path.join(pasta, versao)
    for livro in LIVROS:
        caminho = os.path.join(base, f"{livro.id}.json")
        if not os.path.exists(caminho):
            continue
        with open(caminho, encoding="utf-8") as fh:
            dados = json.load(fh)
        for ci, versos in enumerate(dados.get("capitulos") or [], start=1):
            for vi, texto in enumerate(versos or [], start=1):
                if isinstance(texto, str) and texto.strip():
                    yield livro.id, ORDEM[livro.id], ci, vi, " ".join(texto.split())


async def indexar_versao(db: AsyncSession, pasta: str, versao: str, lote: int = 2000) -> int:
    """Recarrega uma versão inteira (apaga e insere): idempotente."""
    versao = versao.lower()
    if versao not in VERSOES_ABERTAS:
        raise ValueError(f"versão não é aberta: {versao}")
    linhas = list(ler_versao(pasta, versao))
    if not linhas:
        return 0
    await db.execute(BibleVerse.__table__.delete().where(BibleVerse.version == versao))  # type: ignore[attr-defined]
    tabela = BibleVerse.__table__  # type: ignore[attr-defined]
    for i in range(0, len(linhas), lote):
        await db.execute(tabela.insert(), [
            {"version": versao, "book": b, "book_order": o, "chapter": c, "verse": v, "text": t}
            for b, o, c, v, t in linhas[i:i + lote]
        ])
    if db.bind.dialect.name == "postgresql":  # type: ignore[union-attr]
        dic = DICIONARIOS[VERSOES_ABERTAS[versao]]
        await db.execute(text("ALTER TABLE bible_verse ADD COLUMN IF NOT EXISTS tsv tsvector"))
        await db.execute(text(
            f"UPDATE bible_verse SET tsv = to_tsvector('{dic}', discipulei_unaccent(text)) "
            "WHERE version = :versao"
        ), {"versao": versao})
        await db.execute(text("CREATE INDEX IF NOT EXISTS ix_bible_verse_tsv ON bible_verse USING gin (tsv)"))
    await db.commit()
    return len(linhas)


# ---------------------------------------------------------------------------
# Entrada única (rota /biblia/buscar)
# ---------------------------------------------------------------------------


def _filtrar_refs(refs: List[str], testamento: Optional[str], livro: Optional[str]) -> List[Tuple[str, int, int]]:
    out = []
    for r in refs:
        b, ch, v = r.split(".")
        if b not in ORDEM:
            continue
        if livro and b != livro.upper():
            continue
        if not livro and testamento == "AT" and ORDEM[b] >= 39:
            continue
        if not livro and testamento == "NT" and ORDEM[b] < 39:
            continue
        out.append((b, int(ch), int(v)))
    return out


async def buscar_biblia(
    db: AsyncSession,
    consulta: str,
    versao: str,
    testamento: Optional[str] = None,
    livro: Optional[str] = None,
    page: int = 1,
    limit: int = 20,
    ordem: str = "relevancia",
) -> BuscaBibliaResultado:
    """Busca na versão pedida, com as regras de cada fonte.

    - Consulta que é uma referência ("Jo 3:16", "Sl 23") -> só ``referencia``
      (o front abre o leitor direto).
    - Versão aberta -> banco (FTS).
    - API.Bible (ARA, ARC, NTLH...) -> endpoint de busca pelo proxy, cache de
      7 dias, cota diária, FUMS quando vier.
    - YouVersion (NVI) -> ``/v1/search-verses`` (só referências); o texto
      exibido é o da versão aberta do idioma (BLIVRE), rotulado como tal, e o
      clique abre a passagem na NVI.
    - Sem chave, cota esgotada ou erro do provedor -> recuo para a versão
      aberta do idioma (``recuo=True``), clique ainda na versão pedida.
    """
    from src.services.biblia import apibible, youversion
    from src.services.biblia.apibible import ErroBiblia
    from src.services.biblia.referencias import interpretar_consulta
    from src.services.biblia.versoes import versao_por_id

    versao = (versao or "blivre").lower()
    page = max(1, page)
    limit = max(1, min(limit, MAX_POR_PAGINA))
    testamento = testamento if testamento in ("AT", "NT") else None
    livro = livro.upper() if livro and livro.upper() in POR_ID else None

    ref = interpretar_consulta(consulta)
    if ref is not None:
        codigo = ref.codigo() if ref.capitulo is not None else f"{ref.livro}.1"
        return BuscaBibliaResultado(
            consulta=consulta, versao=versao, versao_texto=versao, referencia=codigo, page=page, limit=limit,
        )

    if versao in VERSOES_ABERTAS:
        return await buscar_aberta(db, consulta, versao, testamento, livro, page, limit, ordem)

    lic = versao_por_id(versao)
    if lic is None:
        return await buscar_aberta(db, consulta, "blivre", testamento, livro, page, limit, ordem)
    aberta = ABERTA_DO_IDIOMA.get(lic.idioma, "blivre")
    c = interpretar(consulta, lic.idioma)

    try:
        if lic.provedor == "youversion":
            refs = _filtrar_refs(await youversion.buscar_referencias(versao, consulta), testamento, livro)
            if ordem == "canonica":
                refs.sort(key=lambda r: (ORDEM[r[0]], r[1], r[2]))
            pagina = refs[(page - 1) * limit: page * limit]
            textos = await textos_abertos(db, aberta, pagina)
            return BuscaBibliaResultado(
                consulta=consulta, versao=versao, versao_texto=aberta, recuo=True, provedor="youversion",
                total=len(refs), page=page, limit=limit,
                versiculos=[montar_versiculo(b, ch, v, textos.get((b, ch, v), ""), c) for b, ch, v in pagina],
            )
        dados = await apibible.buscar(
            versao, consulta, livro=livro, testamento=testamento,
            offset=(page - 1) * limit, limit=limit, ordem=ordem,
        )
        return BuscaBibliaResultado(
            consulta=consulta, versao=versao, versao_texto=versao, provedor="apibible",
            total=dados["total"], page=page, limit=limit, fums=dados.get("fums"),
            copyright=dados.get("copyright"),
            versiculos=[
                montar_versiculo(x["livro"], x["capitulo"], x["verso"], x["texto"], c) for x in dados["versos"]
            ],
        )
    except ErroBiblia:
        res = await buscar_aberta(db, consulta, aberta, testamento, livro, page, limit, ordem)
        res.versao = versao
        res.recuo = True
        return res
