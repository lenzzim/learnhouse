"""Busca de posts por passagem bíblica (pedido do dono de 24/11/2026).

A consulta é interpretada por :func:`interpretar_consulta` ("Salmos",
"1Pe 1", "Mt 28:18-20", "Mt 28:19", com ou sem espaço e acento) e casa com
as passagens indexadas em ``discussion_bible_ref``:

- **livro** ("Salmos"): qualquer passagem do livro;
- **capítulo** ("1Pe 1"): qualquer passagem do capítulo, inclusive versículos
  soltos e intervalos dentro dele;
- **intervalo** ("Mt 28:18-20"): só citações EXATAMENTE desse intervalo
  (regra do dono);
- **versículo** ("Mt 28:19"): toda citação que INCLUI o versículo (Mt 28:19,
  Mt 28:18-20) e também a citação do capítulo inteiro (Mt 28), que o contém.

Indexação (:func:`indexar_discussao`): título + texto do corpo (TipTap → texto,
o mesmo ``tiptap_to_text`` do Caderno), extraídos com as regras do Caderno.
Notas privadas NÃO são indexadas (dado de convicção religiosa: nem um índice
derivado delas existe); ao publicar, a nota entra; ao despublicar, sai.

Leitura: as mesmas regras da busca geral — ``readable_communities_clause``
(comunidades públicas / por grupo, como as de gênero / só membros / desafios
só para inscritos e admins) — e só discussões públicas. A tabela de
referências é só um índice; o que volta ao cliente sai da ``discussion``.
"""

from __future__ import annotations

from typing import List, Optional, Tuple, Union

from fastapi import Request
from pydantic import BaseModel
from sqlalchemy import and_, delete, func, or_
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.busca_biblica import DiscussionBibleRef
from src.db.communities.communities import Community
from src.db.communities.discussions import DISCUSSION_VISIBILITY_PUBLIC, Discussion
from src.db.organizations import Organization
from src.db.users import AnonymousUser, APITokenUser, PublicUser
from src.security.auth import resolve_acting_user_id
from src.security.org_auth import is_org_member
from src.security.rbac.resource_access import readable_communities_clause
from src.services.biblia.referencias import (
    Referencia,
    encontrar_referencias,
    interpretar_consulta,
)
from src.services.notes.parsing import tiptap_to_text

MAX_REFS_POR_DISCUSSAO = 200
JANELA_TRECHO = 90  # caracteres de contexto de cada lado da citação


# ---------------------------------------------------------------------------
# Extração e indexação
# ---------------------------------------------------------------------------


def texto_da_discussao(title: Optional[str], content: Optional[str]) -> str:
    return f"{title or ''}\n{tiptap_to_text(content or '')}"


def extrair_referencias(title: Optional[str], content: Optional[str]) -> List[dict]:
    """Passagens citadas (sem repetir), no formato das linhas do índice.

    Capítulo inteiro -> versos nulos; um versículo -> início == fim.
    """
    vistos = set()
    out: List[dict] = []
    for r in encontrar_referencias(texto_da_discussao(title, content)):
        vs = r.verso_ini
        ve = r.verso_fim if r.verso_fim is not None else r.verso_ini
        chave = (r.livro, r.capitulo, vs, ve)
        if chave in vistos:
            continue
        vistos.add(chave)
        out.append({
            "book": r.livro, "chapter": r.capitulo, "verse_start": vs, "verse_end": ve,
            "trecho": r.texto[:80],
        })
        if len(out) >= MAX_REFS_POR_DISCUSSAO:
            break
    return out


async def indexar_discussao(db_session: AsyncSession, discussion: Discussion) -> int:
    """Refaz as referências da discussão (não faz commit: vai na transação de quem chamou)."""
    if discussion.id is None:
        return 0
    await db_session.execute(
        delete(DiscussionBibleRef).where(DiscussionBibleRef.discussion_id == discussion.id)
    )
    if (discussion.visibility or DISCUSSION_VISIBILITY_PUBLIC) != DISCUSSION_VISIBILITY_PUBLIC:
        return 0
    refs = extrair_referencias(discussion.title, discussion.content)
    for ref in refs:
        db_session.add(DiscussionBibleRef(discussion_id=discussion.id, org_id=discussion.org_id, **ref))
    return len(refs)


async def indexar_discussao_seguro(db_session: AsyncSession, discussion: Discussion) -> None:
    """Indexa e grava, sem nunca derrubar o fluxo de criar/editar a discussão."""
    import logging

    try:
        await indexar_discussao(db_session, discussion)
        await db_session.commit()
    except Exception:  # índice é derivado: o comando de reindexação corrige depois
        logging.getLogger(__name__).warning(
            "busca: falha ao indexar passagens da discussão %s", discussion.id, exc_info=True
        )
        await db_session.rollback()
        try:  # o rollback expira o objeto; quem chamou ainda vai serializá-lo
            await db_session.refresh(discussion)
        except Exception:
            pass


async def reindexar_todas(db_session: AsyncSession, lote: int = 500) -> Tuple[int, int]:
    """Backfill idempotente: (discussões lidas, referências gravadas)."""
    ultimo = 0
    lidas = gravadas = 0
    while True:
        rows = (await db_session.execute(
            select(Discussion).where(Discussion.id > ultimo).order_by(Discussion.id).limit(lote)
        )).scalars().all()
        if not rows:
            break
        for d in rows:
            gravadas += await indexar_discussao(db_session, d)
            lidas += 1
            ultimo = d.id
        await db_session.commit()
    return lidas, gravadas


# ---------------------------------------------------------------------------
# Consulta
# ---------------------------------------------------------------------------


class PassagemConsulta(BaseModel):
    codigo: str
    tipo: str  # livro | capitulo | versiculo | intervalo
    livro: str
    capitulo: Optional[int] = None
    verso_ini: Optional[int] = None
    verso_fim: Optional[int] = None
    rotulo: str  # "1 Pedro 1"


class PassagemDiscussao(BaseModel):
    discussion_uuid: str
    community_uuid: str
    title: str
    emoji: Optional[str] = None
    label: Optional[str] = None
    creation_date: str
    trecho: str = ""
    # [início, fim) dentro de ``trecho`` para destacar a citação
    destaques: List[Tuple[int, int]] = []
    citacoes: List[str] = []  # "1 Pedro 1:3", "1 Pedro 1"


class PassagemResultado(BaseModel):
    passagem: Optional[PassagemConsulta] = None
    discussions: List[PassagemDiscussao] = []
    total: int = 0
    page: int = 1
    limit: int = 10


def consulta_da_referencia(ref: Referencia) -> PassagemConsulta:
    return PassagemConsulta(
        codigo=ref.codigo(), tipo=ref.tipo, livro=ref.livro, capitulo=ref.capitulo,
        verso_ini=ref.verso_ini, verso_fim=ref.verso_fim, rotulo=ref.formatar(),
    )


def condicao_passagem(ref: Referencia):
    """Predicado SQL sobre ``DiscussionBibleRef`` (usa o índice book/chapter/verses)."""
    R = DiscussionBibleRef
    cond = [R.book == ref.livro]
    if ref.capitulo is None:
        return and_(*cond)
    cond.append(R.chapter == ref.capitulo)
    tipo = ref.tipo
    if tipo == "intervalo":
        cond += [R.verse_start == ref.verso_ini, R.verse_end == ref.verso_fim]
    elif tipo == "versiculo":
        v = ref.verso_ini
        cond.append(or_(
            R.verse_start.is_(None),  # type: ignore[union-attr]
            and_(R.verse_start <= v, func.coalesce(R.verse_end, R.verse_start) >= v),
        ))
    return and_(*cond)


def _rotulo_linha(row: DiscussionBibleRef) -> str:
    return Referencia(row.book, row.chapter, row.verse_start, row.verse_end).formatar()


def montar_trecho(texto: str, trechos: List[str]) -> Tuple[str, List[Tuple[int, int]]]:
    """Recorte do texto em volta da primeira citação, com as citações destacadas.

    Prefere a citação no corpo (depois da 1ª linha, que é o título).
    """
    corpo_ini = texto.find("\n") + 1
    alvo = -1
    tamanho = 0
    for t in trechos:
        if not t:
            continue
        i = texto.find(t, corpo_ini)
        if i < 0:
            i = texto.find(t)
        if i >= 0 and (alvo < 0 or i < alvo):
            alvo, tamanho = i, len(t)
    corpo = texto[corpo_ini:]
    if alvo < 0:
        recorte = " ".join(corpo.split())[: 2 * JANELA_TRECHO]
        return recorte, []
    if alvo < corpo_ini:  # só no título: mostra o começo do corpo
        recorte = " ".join(corpo.split())[: 2 * JANELA_TRECHO]
        destaques = []
        for t in trechos:
            j = recorte.find(t) if t else -1
            if j >= 0:
                destaques.append((j, j + len(t)))
        return recorte, destaques
    ini = max(corpo_ini, alvo - JANELA_TRECHO)
    fim = min(len(texto), alvo + tamanho + JANELA_TRECHO)
    bruto = texto[ini:fim].replace("\n", " ")
    prefixo = "…" if ini > corpo_ini else ""
    sufixo = "…" if fim < len(texto) else ""
    recorte = prefixo + bruto + sufixo
    destaques = []
    for t in sorted(set(x for x in trechos if x), key=len, reverse=True):
        j = recorte.find(t)
        while j >= 0:
            if not any(a <= j < b for a, b in destaques):
                destaques.append((j, j + len(t)))
            j = recorte.find(t, j + len(t))
    destaques.sort()
    return recorte, destaques


async def buscar_por_passagem(
    request: Request,
    current_user: Union[PublicUser, AnonymousUser, APITokenUser],
    org_slug: str,
    consulta: str,
    db_session: AsyncSession,
    page: int = 1,
    limit: int = 10,
) -> PassagemResultado:
    """Posts que citam a passagem, mais novos primeiro (só o que a pessoa pode ler)."""
    from src.services.search.search import check_api_token_search_scope

    page = max(1, page)
    limit = max(1, min(limit, 50))
    ref = interpretar_consulta(consulta)
    if ref is None:
        return PassagemResultado(page=page, limit=limit)
    resultado = PassagemResultado(passagem=consulta_da_referencia(ref), page=page, limit=limit)

    org = (await db_session.execute(
        select(Organization).where(Organization.slug == org_slug)
    )).scalars().first()
    if not org:
        return resultado
    check_api_token_search_scope(org, current_user)

    is_anon = isinstance(current_user, AnonymousUser)
    user_is_member = (
        not is_anon and await is_org_member(resolve_acting_user_id(current_user), org.id, db_session)
    )
    community_access = await readable_communities_clause(
        request, db_session, current_user, org, is_member=user_is_member
    )

    cond = condicao_passagem(ref)
    citam = select(DiscussionBibleRef.discussion_id).where(
        DiscussionBibleRef.org_id == org.id, cond
    )
    base = (
        select(Discussion, Community.community_uuid)
        .join(Community, Community.id == Discussion.community_id)
        .where(
            Discussion.org_id == org.id,
            # nada de nota privada, nem do próprio autor
            Discussion.visibility == DISCUSSION_VISIBILITY_PUBLIC,
            Discussion.id.in_(citam),  # type: ignore[union-attr]
            community_access,
        )
    )
    total = (await db_session.execute(
        select(func.count()).select_from(base.subquery())
    )).scalar_one()
    rows = (await db_session.execute(
        base.order_by(Discussion.creation_date.desc(), Discussion.id.desc())  # type: ignore[union-attr]
        .offset((page - 1) * limit).limit(limit)
    )).all()
    resultado.total = int(total)
    if not rows:
        return resultado

    ids = [d.id for d, _ in rows]
    refs_rows = (await db_session.execute(
        select(DiscussionBibleRef).where(
            DiscussionBibleRef.discussion_id.in_(ids), cond  # type: ignore[attr-defined]
        ).order_by(DiscussionBibleRef.id)
    )).scalars().all()
    por_discussao: dict = {}
    for r in refs_rows:
        por_discussao.setdefault(r.discussion_id, []).append(r)

    for d, community_uuid in rows:
        linhas = por_discussao.get(d.id, [])
        trecho, destaques = montar_trecho(
            texto_da_discussao(d.title, d.content), [r.trecho for r in linhas]
        )
        citacoes: List[str] = []
        for r in linhas:
            rot = _rotulo_linha(r)
            if rot not in citacoes:
                citacoes.append(rot)
        resultado.discussions.append(PassagemDiscussao(
            discussion_uuid=d.discussion_uuid,
            community_uuid=community_uuid or "",
            title=d.title,
            emoji=d.emoji,
            label=d.label,
            creation_date=d.creation_date,
            trecho=trecho,
            destaques=destaques,
            citacoes=citacoes,
        ))
    return resultado
