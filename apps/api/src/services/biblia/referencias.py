"""Referências bíblicas em texto livre (porta em Python de
``apps/web/lib/biblia/referencias.ts``).

Mesmas regras do Caderno e do leitor, para o servidor indexar as passagens
citadas nas discussões (título + corpo) e interpretar a consulta da busca:

- :func:`encontrar_referencias` acha "Jo 3:16", "1 Pe 1", "1Pedro 1:3-5",
  "Sl 23", "John 3:16", "Juan 3:16"... em texto livre, com as defesas contra
  falsos positivos do front (abreviação ambígua exige maiúscula + versículo,
  nome comum exige maiúscula, validação contra a contagem real da BLIVRE).
  Isso cobre as citações completas ("— João 3:16 (NVI)") e as menções
  ("Jo 3:16 (NVI)"), que no conteúdo são texto.
- :func:`interpretar_consulta` lê uma consulta que é SÓ uma referência, no
  modo não estrito (como o seletor do editor), aceitando também o livro
  sozinho ("Salmos", "1 Pe", "1pedro").

Módulo puro: nada de banco, nada de log de conteúdo.
"""

from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple

from src.services.biblia.tabela_livros import NOMES_EN, NOMES_ES, NOMES_PT, TABELA


@dataclass(frozen=True)
class Livro:
    id: str
    nome: str
    abrev: str
    versos: Tuple[int, ...]
    testamento: str  # 'AT' | 'NT'


LIVROS: Tuple[Livro, ...] = tuple(
    Livro(i, n, a, tuple(int(x) for x in v.split(",")), "AT" if k < 39 else "NT")
    for k, (i, n, a, v) in enumerate(TABELA)
)
POR_ID: Dict[str, Livro] = {livro.id: livro for livro in LIVROS}
ORDEM: Dict[str, int] = {livro.id: k for k, livro in enumerate(LIVROS)}


def livro_por_id(livro_id: str) -> Optional[Livro]:
    return POR_ID.get((livro_id or "").upper())


@dataclass
class Referencia:
    livro: str
    capitulo: Optional[int] = None  # None = o livro inteiro (só na consulta)
    verso_ini: Optional[int] = None
    verso_fim: Optional[int] = None

    @property
    def tipo(self) -> str:
        """'livro' | 'capitulo' | 'versiculo' | 'intervalo'."""
        if self.capitulo is None:
            return "livro"
        if self.verso_ini is None:
            return "capitulo"
        if self.verso_fim is not None and self.verso_fim != self.verso_ini:
            return "intervalo"
        return "versiculo"

    def codigo(self) -> str:
        """'PSA', 'JHN.3', 'JHN.3.16' ou 'JHN.3.16-18' (formato do leitor)."""
        if self.capitulo is None:
            return self.livro
        s = f"{self.livro}.{self.capitulo}"
        if self.verso_ini is not None:
            s += f".{self.verso_ini}"
            if self.verso_fim is not None and self.verso_fim != self.verso_ini:
                s += f"-{self.verso_fim}"
        return s

    def formatar(self) -> str:
        """'1 Pedro 1', 'Mateus 28:18-20' (nomes em português da BLIVRE)."""
        livro = POR_ID.get(self.livro)
        nome = livro.nome if livro else self.livro
        if self.capitulo is None:
            return nome
        s = f"{nome} {self.capitulo}"
        if self.verso_ini is not None:
            s += f":{self.verso_ini}"
            if self.verso_fim is not None and self.verso_fim != self.verso_ini:
                s += f"-{self.verso_fim}"
        return s


@dataclass
class ReferenciaEncontrada(Referencia):
    inicio: int = 0
    fim: int = 0
    texto: str = ""


# Abreviações que também são palavras comuns: exigem maiúscula + versículo.
ABREV_AMBIGUAS = {"os", "na", "ap", "ag", "am", "at", "ed", "et", "num", "mi", "santiago"}
# Nomes que também são substantivos comuns: exigem inicial maiúscula.
NOMES_COMUNS = {
    "numeros", "atos", "juizes", "reis", "cronicas", "lamentacoes", "proverbios",
    "cantares", "canticos", "numbers", "judges", "kings", "chronicles",
    "lamentations", "proverbs", "acts", "mark", "revelation", "revelations", "job",
    "is", "jueces", "reyes", "lamentaciones", "hechos", "sal", "mal", "dan",
}


def sem_acento(s: str) -> str:
    return "".join(c for c in unicodedata.normalize("NFD", s or "") if unicodedata.category(c) != "Mn")


def _chave_nome(s: str) -> str:
    return re.sub(r"\s+", " ", s.lower()).strip()


_IDIOMAS = (("pt", NOMES_PT), ("en", NOMES_EN), ("es", NOMES_ES))
# chave ("<n>|<nome>" para livros numerados) -> [(livro, {idiomas})], ordem pt, en, es
_ALIAS: Dict[str, List[Tuple[str, set]]] = {}


def _montar() -> List[str]:
    pares = []
    for idioma, tabela in _IDIOMAS:
        for livro_id, nomes in tabela.items():
            num = livro_id[0] + "|" if livro_id[0] in "123" else ""
            for nome in nomes:
                pares.append((num + _chave_nome(nome), livro_id, idioma))

    def adicionar(k: str, livro_id: str, idioma: str) -> None:
        lista = _ALIAS.setdefault(k, [])
        for lid, idiomas in lista:
            if lid == livro_id:
                idiomas.add(idioma)
                return
        lista.append((livro_id, {idioma}))

    # explícitos primeiro; variantes sem acento só onde não colidem ("Jó" -> "jo" é João)
    explicitos = {k for k, _, _ in pares}
    for k, lid, idi in pares:
        adicionar(k, lid, idi)
    for k, lid, idi in pares:
        s = sem_acento(k)
        if s != k and s not in explicitos:
            adicionar(s, lid, idi)
    return sorted({re.sub(r"^[1-3]\|", "", k) for k in _ALIAS}, key=len, reverse=True)


_TODOS_NOMES = _montar()


def _candidatos(chave: str, idioma: str) -> List[Livro]:
    lista = _ALIAS.get(chave) or []
    ordenada = [c for c in lista if idioma in c[1]] + [c for c in lista if idioma not in c[1]]
    return [POR_ID[c[0]] for c in ordenada if c[0] in POR_ID]


# "1", "1ª", "1º", "1.", "1st", "I", "Primeira", "Primera", "First"...
_PREFIXO = (
    r"((?:[123]\s*(?:[ªº°]\.?|(?:st|nd|rd)(?=\s)|[ao](?=\s)|\.)?|(?:iii|ii|i)(?=\s)|"
    r"primeir[ao]|segund[ao]|terceir[ao]|primer[ao]?|tercer[ao]?|first|second|third)\s*)?"
)
_NOMES_RE = "|".join(re.escape(n).replace(r"\ ", r"\s+") for n in _TODOS_NOMES)
# Grupos: 1 fronteira, 2 prefixo, 3 nome, 4 separador, 5 capítulo.
_PADRAO = re.compile(
    r"(^|[\W_])" + _PREFIXO + "(" + _NOMES_RE + r")(\.?\s*)(\d{1,3})(?!\d)",
    re.IGNORECASE,
)
# Só o livro (sem capítulo), ancorado: a consulta inteira é o nome do livro.
_PADRAO_LIVRO = re.compile(r"^" + _PREFIXO + "(" + _NOMES_RE + r")\.?$", re.IGNORECASE)


def _numero_do_prefixo(p: str) -> int:
    s = p.strip().lower()
    if s[:1] in ("1", "2", "3"):
        return int(s[0])
    if s.startswith(("iii", "tercer", "terceir", "third")):
        return 3
    if s.startswith(("ii", "segund", "second")):
        return 2
    return 1


def _eh_digito(texto: str, i: int) -> bool:
    return 0 <= i < len(texto) and "0" <= texto[i] <= "9"


def _ler_numero(texto: str, i: int) -> Optional[Tuple[int, int]]:
    j = i
    while _eh_digito(texto, j):
        j += 1
    if j == i or j - i > 3:
        return None
    return int(texto[i:j]), j


def encontrar_referencias(texto: str, estrito: bool = True, idioma: str = "pt") -> List[ReferenciaEncontrada]:
    """Todas as referências do texto, na ordem, com offsets (mesmas regras do front)."""
    achados: List[ReferenciaEncontrada] = []
    texto = texto or ""
    pos = 0
    while True:
        m = _PADRAO.search(texto, pos)
        if not m:
            break
        fronteira = m.group(1)
        prefixo = m.group(2) or ""
        nome = m.group(3)
        inicio_prefixo = m.start() + len(fronteira)
        inicio_nome = inicio_prefixo + len(prefixo)
        fim_cap = m.end()

        chave = _chave_nome(nome)
        possiveis: List[Livro] = []
        inicio = inicio_prefixo
        if prefixo:
            possiveis = _candidatos(f"{_numero_do_prefixo(prefixo)}|{chave}", idioma)
        if not possiveis:
            # "2 Gn 1:1": o "2" não faz parte de um livro numerado
            possiveis = _candidatos(chave, idioma)
            inicio = inicio_nome
        if not possiveis:
            pos = m.start() + 1
            continue

        capitulo = int(m.group(5))
        verso_ini: Optional[int] = None
        verso_fim: Optional[int] = None
        fim = fim_cap
        sep = texto[fim_cap:fim_cap + 1]
        if sep in (":", ".") and _eh_digito(texto, fim_cap + 1):
            v = _ler_numero(texto, fim_cap + 1)
            if v:
                verso_ini, fim = v
                traco = texto[fim:fim + 1]
                if traco in ("-", "–") and _eh_digito(texto, fim + 1):
                    w = _ler_numero(texto, fim + 1)
                    # "3:16-4:2" (atravessa capítulos) não é suportado: fica só 3:16
                    cruza = bool(w) and texto[w[1]:w[1] + 1] in (":", ".") and _eh_digito(texto, w[1] + 1)
                    if w and not cruza:
                        verso_fim, fim = w

        # fronteira à direita: "Sl 23ª" e "Jo 3x" não valem; "Jo 3:16a" vale como 3:16
        depois = texto[fim:fim + 1]
        rejeitar = False
        if depois and depois.isalpha():
            seguinte = texto[fim + 1:fim + 2] or " "
            meio_verso = verso_ini is not None and depois.lower() in "abc" and not seguinte.isalpha()
            if not meio_verso:
                rejeitar = True

        maiuscula = nome[0] != nome[0].lower()
        if estrito and not rejeitar and not prefixo:
            chave_sa = sem_acento(chave)
            if chave_sa in ABREV_AMBIGUAS and (not maiuscula or verso_ini is None):
                rejeitar = True
            if chave_sa.split(" ")[0] in NOMES_COMUNS and not maiuscula:
                rejeitar = True
        if estrito and not rejeitar and prefixo and sem_acento(chave) in NOMES_COMUNS and not maiuscula:
            rejeitar = True

        def cabe(livro: Livro) -> bool:
            return 1 <= capitulo <= len(livro.versos) and (
                verso_ini is None or 1 <= verso_ini <= livro.versos[capitulo - 1]
            )

        livro = next((x for x in possiveis if cabe(x)), possiveis[0])
        if not rejeitar and not cabe(livro):
            rejeitar = True
        if not rejeitar and verso_ini is not None and verso_fim is not None:
            total = livro.versos[capitulo - 1]
            if verso_fim <= verso_ini or verso_fim > total:
                verso_fim = None  # intervalo inválido: fica o primeiro versículo
                fim = fim_cap + 1 + len(str(verso_ini))

        if rejeitar:
            pos = m.start() + 1
            continue

        achados.append(ReferenciaEncontrada(
            livro=livro.id, capitulo=capitulo, verso_ini=verso_ini, verso_fim=verso_fim,
            inicio=inicio, fim=fim, texto=texto[inicio:fim],
        ))
        pos = fim
    return achados


_CODIGO = re.compile(r"^([1-3]?[A-Z]{2,3})(?:\.(\d{1,3})(?:\.(\d{1,3})(?:-(\d{1,3}))?)?)?$")


def ler_codigo(codigo: str) -> Optional[Referencia]:
    """'JHN.3.16-18', 'JHN.3' ou 'PSA' (só ids USFM válidos)."""
    m = _CODIGO.match((codigo or "").strip().upper())
    if not m or m.group(1) not in POR_ID:
        return None
    livro = POR_ID[m.group(1)]
    if not m.group(2):
        return Referencia(livro.id)
    cap = int(m.group(2))
    if not 1 <= cap <= len(livro.versos):
        return None
    ref = Referencia(livro.id, cap)
    if m.group(3):
        total = livro.versos[cap - 1]
        ini = int(m.group(3))
        if 1 <= ini <= total:
            ref.verso_ini = ini
            if m.group(4):
                fim = int(m.group(4))
                if ini < fim <= total:
                    ref.verso_fim = fim
    return ref


def _completar(ref: Referencia) -> Referencia:
    if ref.verso_ini is not None and ref.verso_fim is None:
        ref.verso_fim = ref.verso_ini
    return ref


def interpretar_consulta(texto: str, idioma: str = "pt") -> Optional[Referencia]:
    """A consulta é SÓ uma referência? Livro, capítulo, versículo ou intervalo.

    "Salmos" / "Sl" / "1 Pe" / "1pedro" -> livro; "1Pe 1" -> capítulo;
    "Mt 28:19" -> versículo; "Mt 28:18-20" -> intervalo. Palavras soltas ou
    duas referências -> None. Versículo sozinho sai com ``verso_fim == verso_ini``.
    """
    t = re.sub(r"\s+", " ", (texto or "").strip())
    if not t or len(t) > 60:
        return None
    if re.match(r"^[1-3]?[A-Z]{2,3}\.\d", t):
        ref = ler_codigo(t)
        if ref:
            return _completar(ref)
    achados = encontrar_referencias(t, estrito=False, idioma=idioma)
    if len(achados) == 1 and achados[0].inicio == 0 and achados[0].fim == len(t):
        a = achados[0]
        return _completar(Referencia(a.livro, a.capitulo, a.verso_ini, a.verso_fim))
    m = _PADRAO_LIVRO.match(t)
    if m:
        prefixo = m.group(1) or ""
        nome = m.group(2)
        chave = _chave_nome(nome)
        chave_sa = sem_acento(chave)
        # "mal", "sal", "atos", "os": palavra comum em minúscula não é o livro
        if not prefixo and nome[0] == nome[0].lower() and (
            chave_sa in ABREV_AMBIGUAS or chave_sa.split(" ")[0] in NOMES_COMUNS
        ):
            return None
        possiveis: List[Livro] = []
        if prefixo:
            possiveis = _candidatos(f"{_numero_do_prefixo(prefixo)}|{chave}", idioma)
        if not possiveis:
            possiveis = _candidatos(chave, idioma)
        if not possiveis and not prefixo:
            # "Pedro" sozinho: livro numerado sem número -> o primeiro (1 Pedro)
            possiveis = _candidatos(f"1|{chave}", idioma)
        if possiveis:
            return Referencia(possiveis[0].id)
    return None
