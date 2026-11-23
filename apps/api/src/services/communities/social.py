"""Comunidade "social contido" (decisão N39, 23/11/2026).

Regras de privacidade, todas checadas aqui no servidor:

- **Pessoas** só para membros logados da org. Só aparece quem ligou o perfil
  (desligado por padrão). Nunca sai e-mail.
- **Grupos restritos** (os grupos de usuários que fecham uma comunidade, como
  "Homens" e "Mulheres", N31): quem é de um desses grupos só aparece para
  quem também é do grupo. Vale para a lista, o perfil, seguir e as menções.
- **Posts no perfil e no feed de quem sigo** passam por
  ``readable_communities_clause`` (comunidades restritas e desafios só para
  inscritos) e só incluem discussões públicas.
- **Seguir** não dá acesso a nada: é só um filtro sobre o que a pessoa já lia.
- **Menções** só notificam quem pode ler o espaço; a checagem roda com as
  regras de leitura do mencionado, não as de quem escreveu.
- **Contagens** (seguidores, reações "Amém" e "Orando") só para o dono (N22).
"""

from __future__ import annotations

import json
import logging
import re
from datetime import datetime
from typing import Dict, Iterable, List, Optional, Set, Union
from uuid import uuid4

from fastapi import HTTPException, Request
from sqlalchemy import func, or_
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.communities.communities import Community
from src.db.communities.discussion_comments import DiscussionComment
from src.db.communities.discussion_reactions import DiscussionReaction
from src.db.communities.discussions import (
    DISCUSSION_VISIBILITY_PUBLIC,
    Discussion,
    DiscussionReadWithVoteStatus,
)
from src.db.communities.social import (
    FAITH_REACTIONS,
    NOTIFICATION_MENTION,
    PROFILE_BIO_MAX,
    CommunityNotification,
    CommunityProfile,
    DiscussionCommentReaction,
    FaithReactionsRead,
    FaithReactionState,
    MentionCandidate,
    MyProfileRead,
    NotificationRead,
    PersonRead,
    ProfileUpdate,
    UserFollow,
)
from src.db.communities.discussion_votes import DiscussionVote
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.users import AnonymousUser, APITokenUser, PublicUser, User, UserReadAuthor
from src.security.rbac import (
    AccessAction,
    ResourceAccessChecker,
    check_resource_access,
    readable_communities_clause,
)
from src.services.communities.moderation import get_community_settings
from src.services.communities.visibility import (
    ensure_discussion_open_for_interaction,
    ensure_discussion_visible,
    is_private,
)

logger = logging.getLogger(__name__)

CurrentUser = Union[PublicUser, AnonymousUser, APITokenUser]

MAX_MENTIONS_PER_POST = 10
PEOPLE_PAGE_MAX = 50


def _now() -> str:
    return str(datetime.now())


# ---------------------------------------------------------------------------
# Limites de ritmo (Redis). Sem Redis (dev, testes) não bloqueia.
# ---------------------------------------------------------------------------


def _throttle(key: str, max_attempts: int, window_seconds: int) -> bool:
    """True se pode seguir. Falha aberta quando o Redis não está disponível."""
    try:
        from src.services.security.rate_limiting import check_rate_limit

        allowed, _count, _retry = check_rate_limit(key, max_attempts, window_seconds)
        return bool(allowed)
    except Exception:
        return True


def _throttle_or_429(key: str, max_attempts: int, window_seconds: int) -> None:
    if not _throttle(key, max_attempts, window_seconds):
        raise HTTPException(status_code=429, detail="Too many requests. Please slow down.")


# ---------------------------------------------------------------------------
# Quem é a pessoa e o que ela pode ver
# ---------------------------------------------------------------------------


def _viewer_id(current_user: CurrentUser) -> int:
    """Só pessoas logadas; tokens de API não usam o social."""
    if isinstance(current_user, APITokenUser):
        return 0
    return int(getattr(current_user, "id", 0) or 0)


async def _get_org(db: AsyncSession, org_id: int) -> Organization:
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalars().first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


async def _is_member(db: AsyncSession, user_id: int, org_id: int) -> bool:
    from src.security.org_auth import is_org_member

    return await is_org_member(user_id, org_id, db)


async def _require_member(db: AsyncSession, current_user: CurrentUser, org_id: int) -> int:
    viewer_id = _viewer_id(current_user)
    if not viewer_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not await _is_member(db, viewer_id, org_id):
        raise HTTPException(status_code=403, detail="Only members of this organization can see this")
    return viewer_id


async def _restricted_group_ids(db: AsyncSession, org_id: int) -> Set[int]:
    """Grupos que fecham alguma comunidade da org (ex.: "Homens", "Mulheres")."""
    community_uuids = select(Community.community_uuid).where(Community.org_id == org_id)
    rows = (await db.execute(
        select(UserGroupResource.usergroup_id).where(
            UserGroupResource.resource_uuid.in_(community_uuids)  # type: ignore[attr-defined]
        )
    )).scalars().all()
    return set(rows)


async def _groups_by_user(db: AsyncSession, user_ids: Iterable[int], group_ids: Set[int]) -> Dict[int, Set[int]]:
    ids = list(set(user_ids))
    out: Dict[int, Set[int]] = {uid: set() for uid in ids}
    if not ids or not group_ids:
        return out
    rows = (await db.execute(
        select(UserGroupUser.user_id, UserGroupUser.usergroup_id).where(
            UserGroupUser.user_id.in_(ids),  # type: ignore[attr-defined]
            UserGroupUser.usergroup_id.in_(group_ids),  # type: ignore[attr-defined]
        )
    )).all()
    for uid, gid in rows:
        out.setdefault(uid, set()).add(gid)
    return out


class _Visibility:
    """Filtro dos grupos restritos para um leitor numa org."""

    def __init__(self, viewer_id: int, viewer_groups: Set[int], groups_of: Dict[int, Set[int]]):
        self.viewer_id = viewer_id
        self.viewer_groups = viewer_groups
        self.groups_of = groups_of

    def can_see(self, person_id: int) -> bool:
        if person_id == self.viewer_id:
            return True
        return self.groups_of.get(person_id, set()) <= self.viewer_groups


async def _visibility_for(db: AsyncSession, org_id: int, viewer_id: int, person_ids: Iterable[int]) -> _Visibility:
    restricted = await _restricted_group_ids(db, org_id)
    ids = set(person_ids) | {viewer_id}
    groups = await _groups_by_user(db, ids, restricted)
    return _Visibility(viewer_id, groups.get(viewer_id, set()), groups)


async def _visible_profiles(db: AsyncSession, org_id: int, user_ids: Optional[Iterable[int]] = None) -> Dict[int, CommunityProfile]:
    """Perfis ligados de quem ainda é membro da org."""
    stmt = (
        select(CommunityProfile)
        .join(UserOrganization, (UserOrganization.user_id == CommunityProfile.user_id)
              & (UserOrganization.org_id == CommunityProfile.org_id))
        .where(CommunityProfile.org_id == org_id, CommunityProfile.visible == True)  # noqa: E712
    )
    if user_ids is not None:
        ids = list(set(user_ids))
        if not ids:
            return {}
        stmt = stmt.where(CommunityProfile.user_id.in_(ids))  # type: ignore[attr-defined]
    rows = (await db.execute(stmt)).scalars().all()
    return {p.user_id: p for p in rows}


async def _person_or_404(
    db: AsyncSession, org_id: int, viewer_id: int, user_uuid: str
) -> tuple[User, Optional[CommunityProfile]]:
    """A pessoa, se o leitor puder vê-la. O próprio dono sempre se vê."""
    user = (await db.execute(select(User).where(User.user_uuid == user_uuid))).scalars().first()
    if not user or not await _is_member(db, user.id, org_id):
        raise HTTPException(status_code=404, detail="Person not found")
    profiles = await _visible_profiles(db, org_id, [user.id])
    profile = profiles.get(user.id)
    if user.id == viewer_id:
        own = (await db.execute(
            select(CommunityProfile).where(CommunityProfile.user_id == user.id, CommunityProfile.org_id == org_id)
        )).scalars().first()
        return user, own
    if not profile:
        raise HTTPException(status_code=404, detail="Person not found")
    vis = await _visibility_for(db, org_id, viewer_id, [user.id])
    if not vis.can_see(user.id):
        raise HTTPException(status_code=404, detail="Person not found")
    return user, profile


def _person_read(user: User, profile: Optional[CommunityProfile], *, viewer_id: int, following: Set[int]) -> PersonRead:
    return PersonRead(
        user_uuid=user.user_uuid,
        username=user.username,
        first_name=user.first_name or "",
        last_name=user.last_name or "",
        avatar_image=user.avatar_image or "",
        bio=(profile.bio if profile else "") or "",
        is_self=user.id == viewer_id,
        is_following=user.id in following,
    )


async def _following_ids(db: AsyncSession, viewer_id: int, org_id: int) -> Set[int]:
    rows = (await db.execute(
        select(UserFollow.followed_id).where(UserFollow.follower_id == viewer_id, UserFollow.org_id == org_id)
    )).scalars().all()
    return set(rows)


async def user_can_read_community(request: Request, db: AsyncSession, user: User, community: Community) -> bool:
    """Regras de leitura de OUTRA pessoa (menções). Checker novo, sem cache da requisição."""
    try:
        reader = PublicUser.model_validate(user.model_dump())
        checker = ResourceAccessChecker(request, db, reader)
        decision = await checker.check_access(community.community_uuid, AccessAction.READ)
        return bool(decision.allowed)
    except Exception:
        # Ex.: política de 2FA da org levanta exceção para quem não ativou.
        return False


# ---------------------------------------------------------------------------
# Perfil próprio
# ---------------------------------------------------------------------------


async def get_my_profile(db: AsyncSession, current_user: CurrentUser, org_id: int) -> MyProfileRead:
    viewer_id = await _require_member(db, current_user, org_id)
    profile = (await db.execute(
        select(CommunityProfile).where(CommunityProfile.user_id == viewer_id, CommunityProfile.org_id == org_id)
    )).scalars().first()
    followers = (await db.execute(
        select(func.count()).select_from(UserFollow).where(
            UserFollow.followed_id == viewer_id, UserFollow.org_id == org_id
        )
    )).scalar_one()
    following = (await db.execute(
        select(func.count()).select_from(UserFollow).where(
            UserFollow.follower_id == viewer_id, UserFollow.org_id == org_id
        )
    )).scalar_one()
    return MyProfileRead(
        visible=bool(profile and profile.visible),
        bio=(profile.bio if profile else "") or "",
        follower_count=int(followers or 0),
        following_count=int(following or 0),
    )


async def update_my_profile(db: AsyncSession, current_user: CurrentUser, org_id: int, data: ProfileUpdate) -> MyProfileRead:
    viewer_id = await _require_member(db, current_user, org_id)
    profile = (await db.execute(
        select(CommunityProfile).where(CommunityProfile.user_id == viewer_id, CommunityProfile.org_id == org_id)
    )).scalars().first()
    if not profile:
        profile = CommunityProfile(user_id=viewer_id, org_id=org_id, visible=False, bio="", creation_date=_now())
    if data.bio is not None:
        bio = " ".join(data.bio.split())
        if len(bio) > PROFILE_BIO_MAX:
            raise HTTPException(status_code=422, detail=f"Bio must have at most {PROFILE_BIO_MAX} characters")
        profile.bio = bio
    if data.visible is not None:
        profile.visible = bool(data.visible)
    profile.update_date = _now()
    db.add(profile)
    await db.commit()
    return await get_my_profile(db, current_user, org_id)


# ---------------------------------------------------------------------------
# Pessoas
# ---------------------------------------------------------------------------


async def list_people(
    db: AsyncSession,
    current_user: CurrentUser,
    org_id: int,
    q: Optional[str] = None,
    page: int = 1,
    limit: int = 30,
    only_following: bool = False,
) -> List[PersonRead]:
    viewer_id = await _require_member(db, current_user, org_id)
    page = max(1, page)
    limit = max(1, min(limit, PEOPLE_PAGE_MAX))

    stmt = (
        select(User, CommunityProfile)
        .join(CommunityProfile, CommunityProfile.user_id == User.id)
        .join(UserOrganization, (UserOrganization.user_id == User.id) & (UserOrganization.org_id == org_id))
        .where(CommunityProfile.org_id == org_id, CommunityProfile.visible == True)  # noqa: E712
    )
    if q and q.strip():
        like = f"%{q.strip().lower()[:60]}%"
        stmt = stmt.where(or_(
            func.lower(User.username).like(like),
            func.lower(User.first_name).like(like),
            func.lower(User.last_name).like(like),
        ))
    following = await _following_ids(db, viewer_id, org_id)
    if only_following:
        if not following:
            return []
        stmt = stmt.where(User.id.in_(following))  # type: ignore[union-attr]
    stmt = stmt.order_by(func.lower(User.first_name), func.lower(User.last_name), User.id)
    rows = (await db.execute(stmt)).all()

    vis = await _visibility_for(db, org_id, viewer_id, [u.id for u, _ in rows])
    visible = [(u, p) for u, p in rows if vis.can_see(u.id)]
    start = (page - 1) * limit
    return [_person_read(u, p, viewer_id=viewer_id, following=following) for u, p in visible[start:start + limit]]


async def get_person(db: AsyncSession, current_user: CurrentUser, org_id: int, user_uuid: str) -> PersonRead:
    viewer_id = await _require_member(db, current_user, org_id)
    user, profile = await _person_or_404(db, org_id, viewer_id, user_uuid)
    following = await _following_ids(db, viewer_id, org_id)
    person = _person_read(user, profile, viewer_id=viewer_id, following=following)
    if user.id == viewer_id:
        mine = await get_my_profile(db, current_user, org_id)
        person.follower_count = mine.follower_count
    return person


async def _discussions_read(
    db: AsyncSession, discussions: List[Discussion], viewer_id: int
) -> List[DiscussionReadWithVoteStatus]:
    if not discussions:
        return []
    author_ids = {d.author_id for d in discussions}
    authors = {
        a.id: a for a in (await db.execute(select(User).where(User.id.in_(author_ids)))).scalars().all()  # type: ignore[attr-defined]
    }
    voted: Set[int] = set()
    if viewer_id:
        voted = set((await db.execute(
            select(DiscussionVote.discussion_id).where(
                DiscussionVote.discussion_id.in_([d.id for d in discussions]),  # type: ignore[attr-defined]
                DiscussionVote.user_id == viewer_id,
            )
        )).scalars().all())
    out = []
    for d in discussions:
        a = authors.get(d.author_id)
        out.append(DiscussionReadWithVoteStatus(
            **d.model_dump(),
            author=UserReadAuthor.model_validate(a.model_dump()) if a else None,
            has_voted=d.id in voted,
        ))
    return out


async def _readable_public_discussions(
    request: Request,
    db: AsyncSession,
    current_user: CurrentUser,
    org: Organization,
    author_ids: Iterable[int],
    page: int,
    limit: int,
) -> List[Dict]:
    ids = list(set(author_ids))
    if not ids:
        return []
    clause = await readable_communities_clause(request, db, current_user, org, is_member=True)
    rows = (await db.execute(
        select(Discussion, Community.community_uuid, Community.name)
        .join(Community, Community.id == Discussion.community_id)
        .where(
            Discussion.org_id == org.id,
            Community.org_id == org.id,
            Discussion.author_id.in_(ids),  # type: ignore[attr-defined]
            Discussion.visibility == DISCUSSION_VISIBILITY_PUBLIC,
            clause,
        )
        .order_by(Discussion.creation_date.desc())  # type: ignore[union-attr]
        .offset((max(1, page) - 1) * limit)
        .limit(limit)
    )).all()
    reads = await _discussions_read(db, [d for d, _, _ in rows], _viewer_id(current_user))
    return [
        {**r.model_dump(), "community_uuid": cu or "", "community_name": cn or ""}
        for r, (_, cu, cn) in zip(reads, rows)
    ]


async def get_person_discussions(
    request: Request,
    db: AsyncSession,
    current_user: CurrentUser,
    org_id: int,
    user_uuid: str,
    page: int = 1,
    limit: int = 20,
) -> List[Dict]:
    viewer_id = await _require_member(db, current_user, org_id)
    user, _ = await _person_or_404(db, org_id, viewer_id, user_uuid)
    org = await _get_org(db, org_id)
    return await _readable_public_discussions(
        request, db, current_user, org, [user.id], page, max(1, min(limit, 50))
    )


async def get_following_feed(
    request: Request,
    db: AsyncSession,
    current_user: CurrentUser,
    org_id: int,
    page: int = 1,
    limit: int = 20,
) -> List[Dict]:
    viewer_id = await _require_member(db, current_user, org_id)
    following = await _following_ids(db, viewer_id, org_id)
    if not following:
        return []
    # Quem desligou o perfil ou saiu da visão do leitor some do feed.
    profiles = await _visible_profiles(db, org_id, following)
    vis = await _visibility_for(db, org_id, viewer_id, profiles.keys())
    authors = [uid for uid in profiles if vis.can_see(uid)]
    org = await _get_org(db, org_id)
    return await _readable_public_discussions(
        request, db, current_user, org, authors, page, max(1, min(limit, 50))
    )


# ---------------------------------------------------------------------------
# Seguir
# ---------------------------------------------------------------------------


async def follow_person(db: AsyncSession, current_user: CurrentUser, org_id: int, user_uuid: str) -> PersonRead:
    viewer_id = await _require_member(db, current_user, org_id)
    _throttle_or_429(f"social_follow:{viewer_id}", 30, 60)
    user, profile = await _person_or_404(db, org_id, viewer_id, user_uuid)
    if user.id == viewer_id:
        raise HTTPException(status_code=422, detail="You cannot follow yourself")
    if not profile or not profile.visible:
        raise HTTPException(status_code=404, detail="Person not found")
    exists = (await db.execute(
        select(UserFollow).where(
            UserFollow.follower_id == viewer_id, UserFollow.followed_id == user.id, UserFollow.org_id == org_id
        )
    )).scalars().first()
    if not exists:
        db.add(UserFollow(follower_id=viewer_id, followed_id=user.id, org_id=org_id, creation_date=_now()))
        await db.commit()
    return _person_read(user, profile, viewer_id=viewer_id, following={user.id})


async def unfollow_person(db: AsyncSession, current_user: CurrentUser, org_id: int, user_uuid: str) -> dict:
    viewer_id = await _require_member(db, current_user, org_id)
    user = (await db.execute(select(User).where(User.user_uuid == user_uuid))).scalars().first()
    if user:
        row = (await db.execute(
            select(UserFollow).where(
                UserFollow.follower_id == viewer_id, UserFollow.followed_id == user.id, UserFollow.org_id == org_id
            )
        )).scalars().first()
        if row:
            await db.delete(row)
            await db.commit()
    return {"following": False}


# ---------------------------------------------------------------------------
# Menções
# ---------------------------------------------------------------------------

MENTION_RE = re.compile(r"(?<![\w@.])@([A-Za-z0-9_][A-Za-z0-9_.\-]{1,39})")


def content_text(content: Optional[str]) -> str:
    """Texto puro de um conteúdo tiptap (JSON) ou texto simples."""
    if not content:
        return ""
    try:
        doc = json.loads(content)
    except (ValueError, TypeError):
        return content
    if not isinstance(doc, dict):
        return content
    parts: List[str] = []

    def walk(node):
        if isinstance(node, dict):
            if node.get("type") == "text":
                parts.append(str(node.get("text") or ""))
            elif node.get("type") == "mention":
                label = (node.get("attrs") or {}).get("id") or ""
                parts.append(f" @{label} ")
            for child in node.get("content") or []:
                walk(child)
            if node.get("type") in ("paragraph", "heading", "listItem", "hardBreak"):
                parts.append(" ")
        elif isinstance(node, list):
            for child in node:
                walk(child)

    walk(doc)
    return "".join(parts)


def extract_mentions(content: Optional[str]) -> Set[str]:
    names = set()
    for m in MENTION_RE.finditer(content_text(content)):
        name = m.group(1).rstrip(".-").lower()
        if len(name) >= 2:
            names.add(name)
    return names


async def notify_mentions(
    request: Request,
    db: AsyncSession,
    actor_id: int,
    discussion: Discussion,
    new_content: Optional[str],
    old_content: Optional[str] = None,
    comment: Optional[DiscussionComment] = None,
) -> int:
    """Cria notificações para menções novas. Nunca derruba quem chamou."""
    try:
        return await _notify_mentions(request, db, actor_id, discussion, new_content, old_content, comment)
    except Exception:  # pragma: no cover - defensivo
        logger.exception("Falha ao processar menções")
        try:
            await db.rollback()
            # O rollback expira os objetos da sessão; quem chamou ainda vai
            # ler a discussão/comentário (async não carrega sob demanda).
            await db.refresh(discussion)
            if comment is not None:
                await db.refresh(comment)
        except Exception:
            pass
        return 0


async def _notify_mentions(request, db, actor_id, discussion, new_content, old_content, comment) -> int:
    if not actor_id or is_private(discussion):
        return 0
    names = extract_mentions(new_content) - extract_mentions(old_content)
    if not names:
        return 0
    names = set(sorted(names)[:MAX_MENTIONS_PER_POST])

    community = (await db.execute(select(Community).where(Community.id == discussion.community_id))).scalars().first()
    if not community:
        return 0

    users = (await db.execute(
        select(User)
        .join(UserOrganization, (UserOrganization.user_id == User.id) & (UserOrganization.org_id == discussion.org_id))
        .where(func.lower(User.username).in_(names), User.id != actor_id)
    )).scalars().all()

    created = 0
    for user in users:
        # Limite por autor: no máximo 30 pessoas notificadas por hora.
        if not _throttle(f"social_mention:{actor_id}", 30, 3600):
            break
        if not await user_can_read_community(request, db, user, community):
            continue
        dup = (await db.execute(
            select(CommunityNotification.id).where(
                CommunityNotification.user_id == user.id,
                CommunityNotification.discussion_id == discussion.id,
                CommunityNotification.kind == NOTIFICATION_MENTION,
                CommunityNotification.comment_id == comment.id if comment else CommunityNotification.comment_id.is_(None),  # type: ignore[union-attr]
            )
        )).scalars().first()
        if dup:
            continue
        db.add(CommunityNotification(
            notification_uuid=f"notification_{uuid4()}",
            user_id=user.id,
            org_id=discussion.org_id,
            actor_id=actor_id,
            kind=NOTIFICATION_MENTION,
            discussion_id=discussion.id,
            comment_id=comment.id if comment else None,
            creation_date=_now(),
        ))
        created += 1
    if created:
        await db.commit()
    return created


async def mention_candidates(
    request: Request,
    db: AsyncSession,
    current_user: CurrentUser,
    community_uuid: str,
    q: str = "",
    discussion_uuid: Optional[str] = None,
) -> List[MentionCandidate]:
    """Quem dá para mencionar: perfis ligados + quem já está na conversa,
    sempre entre quem pode ler este espaço (e respeitando os grupos restritos)."""
    viewer_id = _viewer_id(current_user)
    if not viewer_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    await check_resource_access(request, db, current_user, community_uuid, AccessAction.READ)
    community = (await db.execute(select(Community).where(Community.community_uuid == community_uuid))).scalars().first()
    if not community:
        raise HTTPException(status_code=404, detail="Community not found")
    org_id = community.org_id

    candidate_ids: Set[int] = set((await _visible_profiles(db, org_id)).keys())
    if discussion_uuid:
        d = (await db.execute(select(Discussion).where(Discussion.discussion_uuid == discussion_uuid))).scalars().first()
        if d and d.community_id == community.id and not is_private(d):
            candidate_ids.add(d.author_id)
            candidate_ids |= set((await db.execute(
                select(DiscussionComment.author_id).where(DiscussionComment.discussion_id == d.id)
            )).scalars().all())
    candidate_ids.discard(viewer_id)
    if not candidate_ids:
        return []

    stmt = (
        select(User)
        .join(UserOrganization, (UserOrganization.user_id == User.id) & (UserOrganization.org_id == org_id))
        .where(User.id.in_(candidate_ids))  # type: ignore[union-attr]
    )
    term = (q or "").strip().lstrip("@").lower()[:40]
    if term:
        like = f"%{term}%"
        stmt = stmt.where(or_(
            func.lower(User.username).like(like),
            func.lower(User.first_name).like(like),
            func.lower(User.last_name).like(like),
        ))
    users = (await db.execute(stmt.order_by(func.lower(User.first_name)).limit(30))).scalars().all()
    vis = await _visibility_for(db, org_id, viewer_id, [u.id for u in users])
    out: List[MentionCandidate] = []
    for u in users:
        if not vis.can_see(u.id):
            continue
        if not await user_can_read_community(request, db, u, community):
            continue
        out.append(MentionCandidate(
            user_uuid=u.user_uuid, username=u.username, first_name=u.first_name or "",
            last_name=u.last_name or "", avatar_image=u.avatar_image or "",
        ))
        if len(out) >= 8:
            break
    return out


# ---------------------------------------------------------------------------
# Notificações
# ---------------------------------------------------------------------------


async def _notifications_query(request, db, current_user, org_id):
    viewer_id = await _require_member(db, current_user, org_id)
    org = await _get_org(db, org_id)
    clause = await readable_communities_clause(request, db, current_user, org, is_member=True)
    base = (
        select(CommunityNotification, Discussion, Community.community_uuid)
        .join(Discussion, Discussion.id == CommunityNotification.discussion_id)
        .join(Community, Community.id == Discussion.community_id)
        .where(
            CommunityNotification.user_id == viewer_id,
            CommunityNotification.org_id == org_id,
            # Nunca revela o título de algo que a pessoa deixou de poder ler.
            Discussion.visibility == DISCUSSION_VISIBILITY_PUBLIC,
            clause,
        )
    )
    return viewer_id, base


async def list_notifications(request, db, current_user, org_id: int, limit: int = 30) -> List[NotificationRead]:
    _viewer, base = await _notifications_query(request, db, current_user, org_id)
    rows = (await db.execute(
        base.order_by(CommunityNotification.creation_date.desc()).limit(max(1, min(limit, 50)))  # type: ignore[union-attr]
    )).all()
    actor_ids = {n.actor_id for n, _, _ in rows}
    actors = {
        u.id: u for u in (await db.execute(select(User).where(User.id.in_(actor_ids)))).scalars().all()  # type: ignore[attr-defined]
    } if actor_ids else {}
    comment_ids = {n.comment_id for n, _, _ in rows if n.comment_id}
    comments = dict((await db.execute(
        select(DiscussionComment.id, DiscussionComment.comment_uuid).where(DiscussionComment.id.in_(comment_ids))  # type: ignore[attr-defined]
    )).all()) if comment_ids else {}
    out = []
    for n, d, cu in rows:
        a = actors.get(n.actor_id)
        out.append(NotificationRead(
            notification_uuid=n.notification_uuid,
            kind=n.kind,
            creation_date=n.creation_date,
            read=n.read_at is not None,
            actor=MentionCandidate(
                user_uuid=a.user_uuid, username=a.username, first_name=a.first_name or "",
                last_name=a.last_name or "", avatar_image=a.avatar_image or "",
            ) if a else None,
            discussion_uuid=d.discussion_uuid,
            discussion_title=d.title,
            community_uuid=cu,
            comment_uuid=comments.get(n.comment_id) if n.comment_id else None,
        ))
    return out


async def unread_count(request, db, current_user, org_id: int) -> int:
    _viewer, base = await _notifications_query(request, db, current_user, org_id)
    sub = base.where(CommunityNotification.read_at.is_(None)).subquery()  # type: ignore[union-attr]
    return int((await db.execute(select(func.count()).select_from(sub))).scalar_one() or 0)


async def mark_notifications_read(db, current_user, org_id: int, notification_uuid: Optional[str] = None) -> dict:
    viewer_id = await _require_member(db, current_user, org_id)
    stmt = select(CommunityNotification).where(
        CommunityNotification.user_id == viewer_id,
        CommunityNotification.org_id == org_id,
        CommunityNotification.read_at.is_(None),  # type: ignore[union-attr]
    )
    if notification_uuid:
        stmt = stmt.where(CommunityNotification.notification_uuid == notification_uuid)
    now = _now()
    for n in (await db.execute(stmt)).scalars().all():
        n.read_at = now
        db.add(n)
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Reações "Amém" e "Orando"
# ---------------------------------------------------------------------------


def _validate_kind(kind: str) -> str:
    if kind not in FAITH_REACTIONS:
        raise HTTPException(status_code=422, detail=f"Reaction must be one of: {', '.join(FAITH_REACTIONS)}")
    return kind


async def _discussion_and_community(request, db, current_user, discussion_uuid: str, *, interact: bool):
    d = (await db.execute(select(Discussion).where(Discussion.discussion_uuid == discussion_uuid))).scalars().first()
    if not d:
        raise HTTPException(status_code=404, detail="Discussion not found")
    if interact:
        ensure_discussion_open_for_interaction(d, current_user)
    else:
        ensure_discussion_visible(d, current_user)
    c = (await db.execute(select(Community).where(Community.id == d.community_id))).scalars().first()
    if not c:
        raise HTTPException(status_code=404, detail="Community not found")
    await check_resource_access(request, db, current_user, c.community_uuid, AccessAction.READ)
    return d, c


async def get_faith_reactions(request, db, current_user, discussion_uuid: str) -> FaithReactionsRead:
    d, _c = await _discussion_and_community(request, db, current_user, discussion_uuid, interact=False)
    viewer_id = _viewer_id(current_user)

    rows = (await db.execute(
        select(DiscussionReaction.emoji, DiscussionReaction.user_id).where(
            DiscussionReaction.discussion_id == d.id,
            DiscussionReaction.emoji.in_(FAITH_REACTIONS),  # type: ignore[union-attr]
        )
    )).all()
    disc: Dict[str, FaithReactionState] = {}
    for kind in FAITH_REACTIONS:
        users = [uid for k, uid in rows if k == kind]
        disc[kind] = FaithReactionState(
            reacted=bool(viewer_id) and viewer_id in users,
            count=len(users) if viewer_id and viewer_id == d.author_id else None,
        )

    comments = (await db.execute(
        select(DiscussionComment.id, DiscussionComment.comment_uuid, DiscussionComment.author_id)
        .where(DiscussionComment.discussion_id == d.id)
    )).all()
    by_comment: Dict[str, Dict[str, FaithReactionState]] = {}
    if comments:
        ids = [cid for cid, _, _ in comments]
        reacts = (await db.execute(
            select(DiscussionCommentReaction.comment_id, DiscussionCommentReaction.kind, DiscussionCommentReaction.user_id)
            .where(DiscussionCommentReaction.comment_id.in_(ids))  # type: ignore[attr-defined]
        )).all()
        for cid, cuuid, author_id in comments:
            states = {}
            for kind in FAITH_REACTIONS:
                users = [uid for rc, k, uid in reacts if rc == cid and k == kind]
                states[kind] = FaithReactionState(
                    reacted=bool(viewer_id) and viewer_id in users,
                    count=len(users) if viewer_id and viewer_id == author_id else None,
                )
            by_comment[cuuid] = states
    return FaithReactionsRead(discussion=disc, comments=by_comment)


def _ensure_reactions_enabled(community: Community) -> None:
    if get_community_settings(community).get("disable_reactions"):
        raise HTTPException(
            status_code=403,
            detail={"message": "Reactions are disabled in this community.", "code": "MODERATION_REACTIONS_DISABLED"},
        )


async def toggle_discussion_faith_reaction(request, db, current_user, discussion_uuid: str, kind: str) -> dict:
    _validate_kind(kind)
    viewer_id = _viewer_id(current_user)
    if not viewer_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    d, c = await _discussion_and_community(request, db, current_user, discussion_uuid, interact=True)
    _ensure_reactions_enabled(c)
    _throttle_or_429(f"social_reaction:{viewer_id}", 60, 60)
    row = (await db.execute(
        select(DiscussionReaction).where(
            DiscussionReaction.discussion_id == d.id,
            DiscussionReaction.user_id == viewer_id,
            DiscussionReaction.emoji == kind,
        )
    )).scalars().first()
    if row:
        await db.delete(row)
        await db.commit()
        return {"kind": kind, "reacted": False}
    db.add(DiscussionReaction(
        discussion_id=d.id, user_id=viewer_id, emoji=kind,
        reaction_uuid=f"reaction_{uuid4()}", creation_date=_now(),
    ))
    await db.commit()
    return {"kind": kind, "reacted": True}


async def toggle_comment_faith_reaction(request, db, current_user, comment_uuid: str, kind: str) -> dict:
    _validate_kind(kind)
    viewer_id = _viewer_id(current_user)
    if not viewer_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    comment = (await db.execute(
        select(DiscussionComment).where(DiscussionComment.comment_uuid == comment_uuid)
    )).scalars().first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    d = (await db.execute(select(Discussion).where(Discussion.id == comment.discussion_id))).scalars().first()
    if not d:
        raise HTTPException(status_code=404, detail="Discussion not found")
    _d, c = await _discussion_and_community(request, db, current_user, d.discussion_uuid, interact=True)
    _ensure_reactions_enabled(c)
    _throttle_or_429(f"social_reaction:{viewer_id}", 60, 60)
    row = (await db.execute(
        select(DiscussionCommentReaction).where(
            DiscussionCommentReaction.comment_id == comment.id,
            DiscussionCommentReaction.user_id == viewer_id,
            DiscussionCommentReaction.kind == kind,
        )
    )).scalars().first()
    if row:
        await db.delete(row)
        await db.commit()
        return {"kind": kind, "reacted": False}
    db.add(DiscussionCommentReaction(comment_id=comment.id, user_id=viewer_id, kind=kind, creation_date=_now()))
    await db.commit()
    return {"kind": kind, "reacted": True}


# ---------------------------------------------------------------------------
# Resposta útil (perguntas)
# ---------------------------------------------------------------------------

QUESTION_LABEL = "question"


async def set_accepted_answer(request, db, current_user, discussion_uuid: str, comment_uuid: Optional[str]) -> dict:
    viewer_id = _viewer_id(current_user)
    if not viewer_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    d, c = await _discussion_and_community(request, db, current_user, discussion_uuid, interact=True)
    if (d.label or "") != QUESTION_LABEL:
        raise HTTPException(status_code=422, detail="Only questions can have a helpful answer")
    if d.author_id != viewer_id:
        decision = await check_resource_access(
            request, db, current_user, c.community_uuid, AccessAction.UPDATE, raise_on_deny=False
        )
        if not decision.allowed:
            raise HTTPException(status_code=403, detail="Only the author or a moderator can mark the helpful answer")

    if comment_uuid:
        comment = (await db.execute(
            select(DiscussionComment).where(DiscussionComment.comment_uuid == comment_uuid)
        )).scalars().first()
        if not comment or comment.discussion_id != d.id:
            raise HTTPException(status_code=404, detail="Comment not found")
        d.accepted_comment_id = comment.id
    else:
        d.accepted_comment_id = None
    db.add(d)
    await db.commit()
    return {"accepted_comment_id": d.accepted_comment_id, "accepted_comment_uuid": comment_uuid or None}
