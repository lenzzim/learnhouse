"""Caderno privado (decisão N30): visibilidade de discussions.

Uma discussion com ``visibility='private'`` é uma nota pessoal: SÓ o autor a
lê. Nem admins da org nem moderadores da comunidade enxergam notas privadas de
outras pessoas — é dado de convicção religiosa (LGPD art. 11). Por isso todo
caminho de leitura passa por estes helpers:

- consultas em lote usam :func:`visible_discussions_clause`;
- leituras unitárias usam :func:`ensure_discussion_visible` (404, igual a
  "não existe", para não revelar que a nota existe);
- interações (comentar, votar, reagir) usam
  :func:`ensure_discussion_open_for_interaction`: 404 para quem não é o autor e
  403 para o próprio autor, já que uma nota privada não tem público.

Tokens de API nunca enxergam notas privadas (tratados como visitante), mesmo
que o criador do token seja o autor: integrações não devem ler o caderno.
"""

from datetime import datetime
from typing import List, Union

from fastapi import HTTPException, Request
from sqlalchemy import or_
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.communities.communities import Community
from src.db.communities.discussion_votes import DiscussionVote
from src.db.communities.discussions import (
    DISCUSSION_VISIBILITIES,
    DISCUSSION_VISIBILITY_PRIVATE,
    DISCUSSION_VISIBILITY_PUBLIC,
    Discussion,
    DiscussionReadWithVoteStatus,
    NotebookDiscussionRead,
)
from src.db.users import AnonymousUser, APITokenUser, PublicUser, User, UserReadAuthor
from src.security.rbac import (
    AccessAction,
    authorization_verify_if_user_is_anon,
    check_resource_access,
)
from src.services.analytics import events as analytics_events
from src.services.analytics.analytics import track
from src.services.communities.moderation import validate_discussion_content
from src.services.webhooks.dispatch import dispatch_webhooks


CurrentUser = Union[PublicUser, AnonymousUser, APITokenUser]

NOT_FOUND_DETAIL = "Discussion not found"


# ---------------------------------------------------------------------------
# Helpers de leitura
# ---------------------------------------------------------------------------


def privacy_viewer_id(current_user: CurrentUser) -> int:
    """Id do usuário para fins de privacidade (0 = só conteúdo público)."""
    if isinstance(current_user, APITokenUser):
        return 0
    return int(getattr(current_user, "id", 0) or 0)


def is_private(discussion: Discussion) -> bool:
    return (discussion.visibility or DISCUSSION_VISIBILITY_PUBLIC) == DISCUSSION_VISIBILITY_PRIVATE


def can_view_discussion(discussion: Discussion, current_user: CurrentUser) -> bool:
    if not is_private(discussion):
        return True
    viewer_id = privacy_viewer_id(current_user)
    return viewer_id != 0 and discussion.author_id == viewer_id


def ensure_discussion_visible(discussion: Discussion, current_user: CurrentUser) -> None:
    """404 se a discussion for privada e o usuário não for o autor."""
    if not can_view_discussion(discussion, current_user):
        raise HTTPException(status_code=404, detail=NOT_FOUND_DETAIL)


def ensure_discussion_open_for_interaction(
    discussion: Discussion, current_user: CurrentUser
) -> None:
    """Comentários, votos e reações só existem em discussions públicas."""
    ensure_discussion_visible(discussion, current_user)
    if is_private(discussion):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "DISCUSSION_PRIVATE",
                "message": "Private discussions cannot receive comments, votes or reactions. Publish it first.",
            },
        )


def visible_discussions_clause(current_user: CurrentUser):
    """Filtro SQL: públicas + as privadas do próprio usuário."""
    viewer_id = privacy_viewer_id(current_user)
    public = Discussion.visibility == DISCUSSION_VISIBILITY_PUBLIC
    if viewer_id:
        return or_(public, Discussion.author_id == viewer_id)
    return public


def validate_visibility(value: str) -> str:
    if value not in DISCUSSION_VISIBILITIES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid visibility. Allowed values: {', '.join(DISCUSSION_VISIBILITIES)}",
        )
    return value


# ---------------------------------------------------------------------------
# Transições publicar / despublicar
# ---------------------------------------------------------------------------


async def announce_publication(
    discussion: Discussion,
    community: Community,
    current_user: CurrentUser,
) -> None:
    """Webhooks/analytics de "discussion postada" — só quando fica pública.

    Uma nota criada como privada não dispara nada para fora (o título seguiria
    para integrações externas); ao ser publicada, ela é anunciada como nova.
    """
    await track(
        event_name=analytics_events.DISCUSSION_POSTED,
        org_id=community.org_id,
        user_id=discussion.author_id,
        properties={
            "community_uuid": community.community_uuid,
            "discussion_uuid": discussion.discussion_uuid,
            "label": discussion.label,
        },
    )
    await dispatch_webhooks(
        event_name=analytics_events.DISCUSSION_POSTED,
        org_id=community.org_id,
        data={
            "user": {
                "user_uuid": getattr(current_user, "user_uuid", None),
                "email": getattr(current_user, "email", None),
                "username": getattr(current_user, "username", None),
            },
            "discussion": {"discussion_uuid": discussion.discussion_uuid, "title": discussion.title},
            "community": {"community_uuid": community.community_uuid},
        },
    )


def apply_visibility(discussion: Discussion, visibility: str) -> bool:
    """Aplica a visibilidade no objeto. Retorna True se acabou de ser publicada.

    Publicar renova ``creation_date``: para a comunidade o post é novo e deve
    aparecer no topo de "recentes" (senão um devocional escrito semanas atrás
    seria publicado já enterrado no feed). Despublicar desafixa: moderadores
    não enxergam notas privadas, então um destaque deles não deve sobreviver.
    """
    now = str(datetime.now())
    was_private = is_private(discussion)
    discussion.visibility = visibility
    discussion.update_date = now
    if visibility == DISCUSSION_VISIBILITY_PUBLIC and was_private:
        discussion.creation_date = now
        return True
    if visibility == DISCUSSION_VISIBILITY_PRIVATE:
        discussion.is_pinned = False
    return False


async def _read_with_vote_status(
    discussion: Discussion, viewer_id: int, db_session: AsyncSession
) -> DiscussionReadWithVoteStatus:
    author = (await db_session.execute(
        select(User).where(User.id == discussion.author_id)
    )).scalars().first()
    vote = None
    if viewer_id:
        vote = (await db_session.execute(
            select(DiscussionVote).where(
                DiscussionVote.discussion_id == discussion.id,
                DiscussionVote.user_id == viewer_id,
            )
        )).scalars().first()
    return DiscussionReadWithVoteStatus(
        **discussion.model_dump(),
        author=UserReadAuthor.model_validate(author.model_dump()) if author else None,
        has_voted=vote is not None,
    )


async def set_discussion_visibility(
    request: Request,
    discussion_uuid: str,
    visibility: str,
    current_user: CurrentUser,
    db_session: AsyncSession,
) -> DiscussionReadWithVoteStatus:
    """Publica (private→public) ou despublica (public→private). Só o autor."""
    viewer_id = privacy_viewer_id(current_user)
    await authorization_verify_if_user_is_anon(viewer_id)
    validate_visibility(visibility)

    discussion = (await db_session.execute(
        select(Discussion).where(Discussion.discussion_uuid == discussion_uuid)
    )).scalars().first()
    if not discussion:
        raise HTTPException(status_code=404, detail=NOT_FOUND_DETAIL)
    ensure_discussion_visible(discussion, current_user)

    if discussion.author_id != viewer_id:
        raise HTTPException(
            status_code=403,
            detail="Only the author can change the visibility of this discussion",
        )

    community = (await db_session.execute(
        select(Community).where(Community.id == discussion.community_id)
    )).scalars().first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")

    if visibility == discussion.visibility:
        return await _read_with_vote_status(discussion, viewer_id, db_session)

    if visibility == DISCUSSION_VISIBILITY_PUBLIC:
        # Publicar exige poder ler a comunidade e passar pela moderação dela.
        await check_resource_access(
            request, db_session, current_user, community.community_uuid, AccessAction.READ
        )
        await validate_discussion_content(
            discussion.title, discussion.content or "", community.id, db_session
        )

    just_published = apply_visibility(discussion, visibility)
    db_session.add(discussion)
    await db_session.commit()
    await db_session.refresh(discussion)

    if just_published:
        await announce_publication(discussion, community, current_user)

    return await _read_with_vote_status(discussion, viewer_id, db_session)


# ---------------------------------------------------------------------------
# Meu caderno
# ---------------------------------------------------------------------------


async def get_my_notebook(
    request: Request,
    org_id: int,
    current_user: CurrentUser,
    db_session: AsyncSession,
    page: int = 1,
    limit: int = 20,
) -> List[NotebookDiscussionRead]:
    """Notas privadas do usuário atual nas comunidades da org (mais novas primeiro)."""
    viewer_id = privacy_viewer_id(current_user)
    await authorization_verify_if_user_is_anon(viewer_id)

    page = max(1, page)
    limit = max(1, min(limit, 100))

    rows = (await db_session.execute(
        select(Discussion, Community.community_uuid, Community.name)
        .join(Community, Community.id == Discussion.community_id)
        .where(
            Discussion.org_id == org_id,
            Discussion.author_id == viewer_id,
            Discussion.visibility == DISCUSSION_VISIBILITY_PRIVATE,
        )
        .order_by(Discussion.creation_date.desc())  # type: ignore[union-attr]
        .offset((page - 1) * limit)
        .limit(limit)
    )).all()

    if not rows:
        return []

    author = (await db_session.execute(
        select(User).where(User.id == viewer_id)
    )).scalars().first()
    author_read = UserReadAuthor.model_validate(author.model_dump()) if author else None

    discussion_ids = [d.id for d, _, _ in rows]
    voted = set((await db_session.execute(
        select(DiscussionVote.discussion_id).where(
            DiscussionVote.discussion_id.in_(discussion_ids),  # type: ignore[attr-defined]
            DiscussionVote.user_id == viewer_id,
        )
    )).scalars().all())

    return [
        NotebookDiscussionRead(
            **discussion.model_dump(),
            author=author_read,
            has_voted=discussion.id in voted,
            community_uuid=community_uuid or "",
            community_name=community_name or "",
        )
        for discussion, community_uuid, community_name in rows
    ]
