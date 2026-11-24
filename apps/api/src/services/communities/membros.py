"""Comunidade v5 (24/11/2026): WhatsApp na entrada (N42), configurações da org
(grupo de autores, N45), posts salvos e compartilhamento público (N44).

Privacidade, toda checada aqui:

- A escolha "Sou homem / Sou mulher" só volta para a própria pessoa e para
  admins/mantenedores. Não é usada para mais nada (nem para filtrar, nem para
  colocar a pessoa num grupo): a lista do admin só *sugere* o grupo de
  usuários correspondente, e a entrada segue aprovada por um líder (N31).
- "Salvos" é privado: só a própria pessoa lista, e só o que ainda pode ler.
- O link público de um post só existe para posts que passam por
  :func:`discussion_is_shareable`; para o resto, 404 (igual a "não existe").
"""

from __future__ import annotations

import html
import logging
import re
from datetime import datetime
from typing import Dict, List, Optional, Union

from fastapi import HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.communities.communities import Community
from src.db.communities.discussions import DISCUSSION_VISIBILITY_PUBLIC, Discussion
from src.db.communities.membros import (
    WHATSAPP_GROUPS,
    WHATSAPP_HOMENS,
    WHATSAPP_MULHERES,
    WHATSAPP_URL_PREFIX,
    CommunityConfigRead,
    CommunityMemberPref,
    CommunityOrgSettings,
    MemberWhatsappAdminRead,
    MyWhatsappRead,
    MyWhatsappUpdate,
    OrgSettingsRead,
    OrgSettingsUpdate,
    SavedDiscussion,
    SharedPostRead,
    UserGroupRef,
    WhatsappConfigured,
    default_whatsapp_url,
)
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import AnonymousUser, APITokenUser, PublicUser, User
from src.security.rbac import AccessAction, check_resource_access, readable_communities_clause
from src.services.communities.publicacao import discussion_is_shareable
from src.services.communities.visibility import ensure_discussion_visible

logger = logging.getLogger(__name__)

CurrentUser = Union[PublicUser, AnonymousUser, APITokenUser]

EXCERPT_CHARS = 280
SAVED_PAGE_MAX = 50


def _now() -> str:
    return str(datetime.now())


def _viewer_id(current_user: CurrentUser) -> int:
    if isinstance(current_user, APITokenUser):
        return 0
    return int(getattr(current_user, "id", 0) or 0)


def _throttle_or_429(key: str, max_attempts: int, window_seconds: int) -> None:
    from src.services.communities.social import _throttle_or_429 as throttle

    throttle(key, max_attempts, window_seconds)


async def _require_member(db: AsyncSession, current_user: CurrentUser, org_id: int) -> int:
    from src.services.communities.social import _require_member as require

    return await require(db, current_user, org_id)


async def _is_admin(db: AsyncSession, user_id: int, org_id: int) -> bool:
    from src.security.org_auth import is_org_admin

    return bool(user_id) and await is_org_admin(user_id, org_id, db)


async def _require_admin(db: AsyncSession, current_user: CurrentUser, org_id: int) -> int:
    viewer_id = await _require_member(db, current_user, org_id)
    if not await _is_admin(db, viewer_id, org_id):
        raise HTTPException(status_code=403, detail="Only admins can do this")
    return viewer_id


# ---------------------------------------------------------------------------
# Configurações da org
# ---------------------------------------------------------------------------


async def get_org_settings_row(db: AsyncSession, org_id: int) -> Optional[CommunityOrgSettings]:
    return (await db.execute(
        select(CommunityOrgSettings).where(CommunityOrgSettings.org_id == org_id)
    )).scalars().first()


def whatsapp_url(row: Optional[CommunityOrgSettings], group: Optional[str]) -> str:
    """Link efetivo de um grupo: o do painel, senão o do env, senão vazio."""
    if group == WHATSAPP_MULHERES:
        return (row.whatsapp_women_url if row and row.whatsapp_women_url else default_whatsapp_url(WHATSAPP_MULHERES))
    if group == WHATSAPP_HOMENS:
        return (row.whatsapp_men_url if row and row.whatsapp_men_url else default_whatsapp_url(WHATSAPP_HOMENS))
    return ""


def whatsapp_configured(row: Optional[CommunityOrgSettings]) -> WhatsappConfigured:
    return WhatsappConfigured(
        mulheres=bool(whatsapp_url(row, WHATSAPP_MULHERES)),
        homens=bool(whatsapp_url(row, WHATSAPP_HOMENS)),
    )


async def is_author(db: AsyncSession, user_id: int, org_id: int, row: Optional[CommunityOrgSettings] = None) -> bool:
    """Do grupo de autores da org (N45). Admins não entram aqui: veja can_manage_events."""
    if not user_id:
        return False
    row = row if row is not None else await get_org_settings_row(db, org_id)
    if not row or not row.authors_usergroup_id:
        return False
    found = (await db.execute(
        select(UserGroupUser.id).where(
            UserGroupUser.usergroup_id == row.authors_usergroup_id,
            UserGroupUser.user_id == user_id,
        )
    )).first()
    return found is not None


async def can_manage_events(db: AsyncSession, user_id: int, org_id: int) -> bool:
    """Admins, mantenedores e o grupo de autores criam e editam bate-papos."""
    if not user_id:
        return False
    if await _is_admin(db, user_id, org_id):
        return True
    return await is_author(db, user_id, org_id)


async def get_config(db: AsyncSession, current_user: CurrentUser, org_id: int) -> CommunityConfigRead:
    viewer_id = await _require_member(db, current_user, org_id)
    row = await get_org_settings_row(db, org_id)
    author = await is_author(db, viewer_id, org_id, row)
    manage = author or await _is_admin(db, viewer_id, org_id)
    return CommunityConfigRead(is_author=author, can_manage_events=manage, whatsapp=whatsapp_configured(row))


async def _group_ref(db: AsyncSession, group_id: Optional[int]) -> Optional[UserGroupRef]:
    if not group_id:
        return None
    g = (await db.execute(select(UserGroup).where(UserGroup.id == group_id))).scalars().first()
    return UserGroupRef(usergroup_uuid=g.usergroup_uuid, name=g.name) if g else None


async def _org_settings_read(db: AsyncSession, row: Optional[CommunityOrgSettings]) -> OrgSettingsRead:
    return OrgSettingsRead(
        authors_usergroup=await _group_ref(db, row.authors_usergroup_id if row else None),
        men_usergroup=await _group_ref(db, row.men_usergroup_id if row else None),
        women_usergroup=await _group_ref(db, row.women_usergroup_id if row else None),
        whatsapp_men_url=(row.whatsapp_men_url if row else "") or "",
        whatsapp_women_url=(row.whatsapp_women_url if row else "") or "",
        default_whatsapp_men_url=default_whatsapp_url(WHATSAPP_HOMENS),
        default_whatsapp_women_url=default_whatsapp_url(WHATSAPP_MULHERES),
        whatsapp_men_missing=not whatsapp_url(row, WHATSAPP_HOMENS),
        whatsapp_women_missing=not whatsapp_url(row, WHATSAPP_MULHERES),
    )


async def get_org_settings(db: AsyncSession, current_user: CurrentUser, org_id: int) -> OrgSettingsRead:
    await _require_admin(db, current_user, org_id)
    return await _org_settings_read(db, await get_org_settings_row(db, org_id))


async def _resolve_group(db: AsyncSession, org_id: int, uuid: str) -> Optional[int]:
    if not uuid:
        return None
    g = (await db.execute(
        select(UserGroup).where(UserGroup.usergroup_uuid == uuid, UserGroup.org_id == org_id)
    )).scalars().first()
    if not g:
        raise HTTPException(status_code=422, detail="User group not found in this organization")
    return g.id


def _validate_whatsapp_url(value: str) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    # Só convites de grupo do WhatsApp, sem parâmetros de rastreio.
    value = value.split("?", 1)[0].split("#", 1)[0]
    if not value.startswith(WHATSAPP_URL_PREFIX) or len(value) > 300 or " " in value:
        raise HTTPException(status_code=422, detail=f"WhatsApp link must start with {WHATSAPP_URL_PREFIX}")
    return value


async def update_org_settings(
    db: AsyncSession, current_user: CurrentUser, org_id: int, data: OrgSettingsUpdate
) -> OrgSettingsRead:
    await _require_admin(db, current_user, org_id)
    row = await get_org_settings_row(db, org_id)
    if row is None:
        row = CommunityOrgSettings(org_id=org_id, creation_date=_now(), update_date=_now())
    if data.authors_usergroup_uuid is not None:
        row.authors_usergroup_id = await _resolve_group(db, org_id, data.authors_usergroup_uuid)
    if data.men_usergroup_uuid is not None:
        row.men_usergroup_id = await _resolve_group(db, org_id, data.men_usergroup_uuid)
    if data.women_usergroup_uuid is not None:
        row.women_usergroup_id = await _resolve_group(db, org_id, data.women_usergroup_uuid)
    if data.whatsapp_men_url is not None:
        row.whatsapp_men_url = _validate_whatsapp_url(data.whatsapp_men_url)
    if data.whatsapp_women_url is not None:
        row.whatsapp_women_url = _validate_whatsapp_url(data.whatsapp_women_url)
    row.update_date = _now()
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return await _org_settings_read(db, row)


# ---------------------------------------------------------------------------
# WhatsApp na entrada (N42)
# ---------------------------------------------------------------------------


async def _pref(db: AsyncSession, user_id: int, org_id: int) -> Optional[CommunityMemberPref]:
    return (await db.execute(
        select(CommunityMemberPref).where(
            CommunityMemberPref.user_id == user_id, CommunityMemberPref.org_id == org_id
        )
    )).scalars().first()


def _my_whatsapp(pref: Optional[CommunityMemberPref], row: Optional[CommunityOrgSettings]) -> MyWhatsappRead:
    group = pref.whatsapp_group if pref and pref.whatsapp_group in WHATSAPP_GROUPS else None
    # Só o link do grupo escolhido; sem escolha ("Não informar"), nenhum.
    url = whatsapp_url(row, group) or None if group else None
    return MyWhatsappRead(
        group=group, prompted=bool(pref and pref.whatsapp_prompted), url=url, configured=bool(url)
    )


async def get_my_whatsapp(db: AsyncSession, current_user: CurrentUser, org_id: int) -> MyWhatsappRead:
    viewer_id = await _require_member(db, current_user, org_id)
    return _my_whatsapp(await _pref(db, viewer_id, org_id), await get_org_settings_row(db, org_id))


async def update_my_whatsapp(
    db: AsyncSession, current_user: CurrentUser, org_id: int, data: MyWhatsappUpdate
) -> MyWhatsappRead:
    viewer_id = await _require_member(db, current_user, org_id)
    if data.group is not None and data.group not in WHATSAPP_GROUPS:
        raise HTTPException(status_code=422, detail="group must be 'homens' or 'mulheres'")
    _throttle_or_429(f"whatsapp_pref:{viewer_id}", 20, 60)
    pref = await _pref(db, viewer_id, org_id)
    if pref is None:
        pref = CommunityMemberPref(user_id=viewer_id, org_id=org_id, creation_date=_now(), update_date=_now())
    if data.group is not None:
        pref.whatsapp_group = data.group
    elif not data.dismissed:
        # group=None sem "Agora não" = apagar a escolha (em Conta).
        pref.whatsapp_group = None
    pref.whatsapp_prompted = True
    pref.update_date = _now()
    db.add(pref)
    try:
        await db.commit()
    except IntegrityError:
        # Duas abas ao mesmo tempo: a outra criou a linha; aplica nela.
        await db.rollback()
        existing = await _pref(db, viewer_id, org_id)
        if existing is None:
            raise
        if data.group is not None or not data.dismissed:
            existing.whatsapp_group = data.group
        existing.whatsapp_prompted = True
        existing.update_date = _now()
        db.add(existing)
        await db.commit()
        pref = existing
    return _my_whatsapp(pref, await get_org_settings_row(db, org_id))


async def list_members_whatsapp(
    db: AsyncSession, current_user: CurrentUser, org_id: int, page: int = 1, limit: int = 50
) -> List[MemberWhatsappAdminRead]:
    """Só admins: quem escolheu qual grupo e a sugestão de grupo de usuários."""
    await _require_admin(db, current_user, org_id)
    page = max(1, page)
    limit = max(1, min(limit, 100))
    row = await get_org_settings_row(db, org_id)
    rows = (await db.execute(
        select(CommunityMemberPref, User)
        .join(User, User.id == CommunityMemberPref.user_id)
        .join(UserOrganization, (UserOrganization.user_id == User.id) & (UserOrganization.org_id == org_id))
        .where(CommunityMemberPref.org_id == org_id, CommunityMemberPref.whatsapp_group.is_not(None))  # type: ignore[union-attr]
        .order_by(CommunityMemberPref.update_date.desc())  # type: ignore[union-attr]
        .offset((page - 1) * limit)
        .limit(limit)
    )).all()
    men = await _group_ref(db, row.men_usergroup_id if row else None)
    women = await _group_ref(db, row.women_usergroup_id if row else None)
    group_ids = [gid for gid in ((row.men_usergroup_id, row.women_usergroup_id) if row else ()) if gid]
    memberships: Dict[int, set] = {}
    if group_ids and rows:
        for uid, gid in (await db.execute(
            select(UserGroupUser.user_id, UserGroupUser.usergroup_id).where(
                UserGroupUser.usergroup_id.in_(group_ids),  # type: ignore[attr-defined]
                UserGroupUser.user_id.in_([u.id for _p, u in rows]),  # type: ignore[attr-defined]
            )
        )).all():
            memberships.setdefault(uid, set()).add(gid)
    out = []
    for pref, user in rows:
        suggested = None
        suggested_id = None
        if pref.whatsapp_group == WHATSAPP_HOMENS and men:
            suggested, suggested_id = men, row.men_usergroup_id
        elif pref.whatsapp_group == WHATSAPP_MULHERES and women:
            suggested, suggested_id = women, row.women_usergroup_id
        out.append(MemberWhatsappAdminRead(
            user_uuid=user.user_uuid,
            username=user.username,
            first_name=user.first_name or "",
            last_name=user.last_name or "",
            whatsapp_group=pref.whatsapp_group,
            suggested_usergroup=suggested,
            in_suggested_group=bool(suggested_id and suggested_id in memberships.get(user.id, set())),
        ))
    return out


# ---------------------------------------------------------------------------
# Salvos (privado)
# ---------------------------------------------------------------------------


async def _readable_discussion(request: Request, db: AsyncSession, current_user: CurrentUser, discussion_uuid: str):
    d = (await db.execute(select(Discussion).where(Discussion.discussion_uuid == discussion_uuid))).scalars().first()
    if not d:
        raise HTTPException(status_code=404, detail="Discussion not found")
    ensure_discussion_visible(d, current_user)
    c = (await db.execute(select(Community).where(Community.id == d.community_id))).scalars().first()
    if not c:
        raise HTTPException(status_code=404, detail="Community not found")
    await check_resource_access(request, db, current_user, c.community_uuid, AccessAction.READ)
    return d, c


async def set_saved(request: Request, db: AsyncSession, current_user: CurrentUser, discussion_uuid: str, saved: bool) -> dict:
    viewer_id = _viewer_id(current_user)
    if not viewer_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    d, _c = await _readable_discussion(request, db, current_user, discussion_uuid)
    if (d.visibility or DISCUSSION_VISIBILITY_PUBLIC) != DISCUSSION_VISIBILITY_PUBLIC:
        raise HTTPException(status_code=403, detail="Only published posts can be saved")
    _throttle_or_429(f"saved_post:{viewer_id}", 60, 60)
    row = (await db.execute(
        select(SavedDiscussion).where(SavedDiscussion.user_id == viewer_id, SavedDiscussion.discussion_id == d.id)
    )).scalars().first()
    if saved and not row:
        db.add(SavedDiscussion(user_id=viewer_id, discussion_id=d.id, org_id=d.org_id, creation_date=_now()))
        try:
            await db.commit()
        except IntegrityError:
            await db.rollback()
    elif not saved and row:
        await db.delete(row)
        await db.commit()
    return {"saved": saved}


async def is_saved(db: AsyncSession, user_id: int, discussion_id: int) -> bool:
    if not user_id:
        return False
    return (await db.execute(
        select(SavedDiscussion.id).where(SavedDiscussion.user_id == user_id, SavedDiscussion.discussion_id == discussion_id)
    )).first() is not None


async def list_saved(request: Request, db: AsyncSession, current_user: CurrentUser, org_id: int, page: int = 1, limit: int = 20):
    """Os salvos da própria pessoa que ela ainda pode ler (mais recentes primeiro)."""
    from src.services.communities.social import _discussions_read, _get_org

    viewer_id = await _require_member(db, current_user, org_id)
    org = await _get_org(db, org_id)
    clause = await readable_communities_clause(request, db, current_user, org, is_member=True)
    page = max(1, page)
    limit = max(1, min(limit, SAVED_PAGE_MAX))
    rows = (await db.execute(
        select(Discussion, Community.community_uuid, Community.name)
        .join(SavedDiscussion, SavedDiscussion.discussion_id == Discussion.id)
        .join(Community, Community.id == Discussion.community_id)
        .where(
            SavedDiscussion.user_id == viewer_id,
            SavedDiscussion.org_id == org_id,
            Discussion.org_id == org_id,
            Discussion.visibility == DISCUSSION_VISIBILITY_PUBLIC,
            clause,
        )
        .order_by(SavedDiscussion.creation_date.desc())  # type: ignore[union-attr]
        .offset((page - 1) * limit)
        .limit(limit)
    )).all()
    reads = await _discussions_read(db, [d for d, _, _ in rows], viewer_id)
    return [
        {**r.model_dump(), "community_uuid": cu or "", "community_name": cn or "", "saved": True}
        for r, (_, cu, cn) in zip(reads, rows)
    ]


# ---------------------------------------------------------------------------
# Compartilhar (N44)
# ---------------------------------------------------------------------------


async def set_share_enabled(
    request: Request, db: AsyncSession, current_user: CurrentUser, discussion_uuid: str, enabled: bool
) -> dict:
    viewer_id = _viewer_id(current_user)
    if not viewer_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    d, c = await _readable_discussion(request, db, current_user, discussion_uuid)
    if d.author_id != viewer_id:
        raise HTTPException(status_code=403, detail="Only the author can change sharing for this post")
    d.share_disabled = not enabled
    db.add(d)
    await db.commit()
    await db.refresh(d)
    return {"enabled": enabled, "shareable": await discussion_is_shareable(db, d, c)}


def _excerpt(content: Optional[str], limit: int = EXCERPT_CHARS) -> tuple[str, bool]:
    from src.services.communities.social import content_text

    text = content_text(content) or ""
    if "<" in text:
        # Conteúdo em HTML (editor antigo): só o texto.
        text = html.unescape(re.sub(r"<[^>]+>", " ", text))
    text = " ".join(text.split())
    if len(text) <= limit:
        return text, False
    cut = text[:limit]
    space = cut.rfind(" ")
    if space > limit * 0.6:
        cut = cut[:space]
    return cut.rstrip(" ,.;:—-") + "…", True


async def get_shared_post(db: AsyncSession, org_id: int, discussion_uuid: str) -> SharedPostRead:
    """Prévia pública de um post compartilhável. Sem login. 404 para todo o resto."""
    uuid = discussion_uuid if discussion_uuid.startswith("discussion_") else f"discussion_{discussion_uuid}"
    d = (await db.execute(select(Discussion).where(Discussion.discussion_uuid == uuid))).scalars().first()
    if not d or d.org_id != org_id:
        raise HTTPException(status_code=404, detail="Post not found")
    c = (await db.execute(select(Community).where(Community.id == d.community_id))).scalars().first()
    if not c or c.org_id != org_id or not await discussion_is_shareable(db, d, c):
        raise HTTPException(status_code=404, detail="Post not found")
    author = (await db.execute(select(User).where(User.id == d.author_id))).scalars().first()
    # Nome público: nome e sobrenome, ou o @usuário. Nunca e-mail.
    name = ""
    if author:
        name = " ".join(p for p in (author.first_name or "", author.last_name or "") if p).strip() or author.username
    excerpt, truncated = _excerpt(d.content)
    return SharedPostRead(
        discussion_uuid=d.discussion_uuid,
        community_uuid=c.community_uuid,
        title=d.title,
        author_name=name,
        excerpt=excerpt,
        truncated=truncated,
        label=d.label,
        creation_date=d.creation_date,
    )
