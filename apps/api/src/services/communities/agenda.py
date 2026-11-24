"""Agenda de eventos: regiões, grupo de organizadores, preferências e feed ICS.

O resto (eventos, presença, ``.ics`` de um evento, lembretes) fica em
``batepapos.py``, que nasceu como "Bate-papo Online" e virou a Agenda.

- **Regiões**: tabela por org, editável pelo admin. Na primeira leitura de
  uma org sem nenhuma região, cria as padrão (Online primeiro, depois São
  Paulo, Campinas, São Carlos, Rio de Janeiro e Minas Gerais). Regiões nunca
  são apagadas, só desativadas (eventos antigos continuam apontando para elas).
- **Quem organiza**: admins/mantenedores, grupo de autores ("Equipe") e o
  grupo de organizadores (padrão: o grupo chamado "Discípulos", enquanto o
  admin não escolher outro no painel).
- **Feed pessoal** ("Minha agenda Discipulei"): URL com token secreto
  (32 bytes aleatórios), guardado só como SHA-256. Lista só os eventos em
  que a pessoa respondeu "Vou"; endereço e link entram porque ela é inscrita.
  "Gerar novo link" troca o token (o antigo passa a dar 404); "Desligar"
  apaga o hash.
"""

from __future__ import annotations

import hashlib
import re
import secrets
import unicodedata
from datetime import datetime
from typing import Dict, List, Optional, Union
from uuid import uuid4

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.communities.batepapos import (
    DEFAULT_REGIONS,
    REGION_NAME_MAX,
    REGIONS_MAX,
    AgendaPrefsRead,
    AgendaPrefsUpdate,
    AgendaSettingsRead,
    AgendaSettingsUpdate,
    CommunityAgendaPref,
    CommunityEventRegion,
    FeedTokenRead,
    RegionRead,
)
from src.db.communities.membros import CommunityOrgSettings
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import AnonymousUser, APITokenUser, PublicUser

CurrentUser = Union[PublicUser, AnonymousUser, APITokenUser]

DEFAULT_ORGANIZERS_GROUP = "Discípulos"
FEED_TOKEN_BYTES = 32


def _now() -> str:
    return datetime.now().replace(microsecond=0).isoformat()


def _viewer_id(current_user: CurrentUser) -> int:
    if isinstance(current_user, APITokenUser):
        return 0
    return int(getattr(current_user, "id", 0) or 0)


def _fold(value: str) -> str:
    """Minúsculas sem acento (para comparar "Discípulos" com "discipulos")."""
    norm = unicodedata.normalize("NFKD", value or "")
    return "".join(c for c in norm if not unicodedata.combining(c)).strip().lower()


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", _fold(value)).strip("-")[:60] or "regiao"


# ---------------------------------------------------------------------------
# Quem organiza
# ---------------------------------------------------------------------------


async def _settings_row(db: AsyncSession, org_id: int) -> Optional[CommunityOrgSettings]:
    return (await db.execute(
        select(CommunityOrgSettings).where(CommunityOrgSettings.org_id == org_id)
    )).scalars().first()


async def organizers_group_id(db: AsyncSession, org_id: int) -> Optional[int]:
    """Grupo de organizadores efetivo (configurado ou, por padrão, "Discípulos")."""
    row = await _settings_row(db, org_id)
    if row is not None and row.organizers_configured:
        return row.organizers_usergroup_id
    target = _fold(DEFAULT_ORGANIZERS_GROUP)
    for gid, name in (await db.execute(
        select(UserGroup.id, UserGroup.name).where(UserGroup.org_id == org_id)
    )).all():
        if _fold(name) == target:
            return gid
    return None


async def is_organizer(db: AsyncSession, user_id: int, org_id: int) -> bool:
    if not user_id:
        return False
    gid = await organizers_group_id(db, org_id)
    if not gid:
        return False
    found = (await db.execute(
        select(UserGroupUser.id).where(UserGroupUser.usergroup_id == gid, UserGroupUser.user_id == user_id)
    )).first()
    return found is not None


async def is_staff(db: AsyncSession, user_id: int, org_id: int) -> bool:
    """Admins/mantenedores e Equipe (autores): editam qualquer evento."""
    if not user_id:
        return False
    from src.services.communities.membros import _is_admin, is_author

    return await _is_admin(db, user_id, org_id) or await is_author(db, user_id, org_id)


async def can_create_events(db: AsyncSession, user_id: int, org_id: int) -> bool:
    return await is_staff(db, user_id, org_id) or await is_organizer(db, user_id, org_id)


# ---------------------------------------------------------------------------
# Regiões
# ---------------------------------------------------------------------------


def region_read(r: CommunityEventRegion) -> RegionRead:
    return RegionRead(
        region_uuid=r.region_uuid, slug=r.slug, name=r.name, is_online=bool(r.is_online),
        active=bool(r.active), position=int(r.position or 0),
    )


async def ensure_regions(db: AsyncSession, org_id: int) -> None:
    """Cria as regiões padrão numa org que ainda não tem nenhuma."""
    n = (await db.execute(
        select(func.count(CommunityEventRegion.id)).where(CommunityEventRegion.org_id == org_id)
    )).scalar_one()
    if n:
        return
    now = _now()
    for pos, (slug, name, online) in enumerate(DEFAULT_REGIONS):
        db.add(CommunityEventRegion(
            region_uuid=f"region_{uuid4()}", org_id=org_id, slug=slug, name=name, position=pos,
            is_online=online, active=True, creation_date=now, update_date=now,
        ))
    try:
        await db.commit()
    except IntegrityError:
        # Outra requisição criou ao mesmo tempo.
        await db.rollback()


async def list_regions(db: AsyncSession, org_id: int, include_inactive: bool = False) -> List[CommunityEventRegion]:
    await ensure_regions(db, org_id)
    stmt = select(CommunityEventRegion).where(CommunityEventRegion.org_id == org_id)
    if not include_inactive:
        stmt = stmt.where(CommunityEventRegion.active == True)  # noqa: E712
    stmt = stmt.order_by(CommunityEventRegion.position.asc(), CommunityEventRegion.id.asc())  # type: ignore[union-attr]
    return list((await db.execute(stmt)).scalars().all())


async def regions_by_id(db: AsyncSession, org_id: int) -> Dict[int, CommunityEventRegion]:
    return {r.id: r for r in await list_regions(db, org_id, include_inactive=True)}


async def region_by_uuid(db: AsyncSession, org_id: int, region_uuid: str) -> CommunityEventRegion:
    await ensure_regions(db, org_id)
    r = (await db.execute(
        select(CommunityEventRegion).where(
            CommunityEventRegion.org_id == org_id,
            (CommunityEventRegion.region_uuid == region_uuid) | (CommunityEventRegion.slug == region_uuid),
        )
    )).scalars().first()
    if not r:
        raise HTTPException(status_code=422, detail="Region not found")
    return r


async def online_region(db: AsyncSession, org_id: int) -> Optional[CommunityEventRegion]:
    await ensure_regions(db, org_id)
    return (await db.execute(
        select(CommunityEventRegion)
        .where(CommunityEventRegion.org_id == org_id, CommunityEventRegion.is_online == True)  # noqa: E712
        .order_by(CommunityEventRegion.position.asc())  # type: ignore[union-attr]
    )).scalars().first()


# ---------------------------------------------------------------------------
# Painel do admin
# ---------------------------------------------------------------------------


async def _require_admin(db: AsyncSession, current_user: CurrentUser, org_id: int) -> int:
    from src.services.communities.membros import _require_admin as require

    return await require(db, current_user, org_id)


async def _settings_read(db: AsyncSession, org_id: int) -> AgendaSettingsRead:
    gid = await organizers_group_id(db, org_id)
    g = (await db.execute(select(UserGroup).where(UserGroup.id == gid))).scalars().first() if gid else None
    return AgendaSettingsRead(
        organizers_usergroup_uuid=g.usergroup_uuid if g else None,
        organizers_usergroup_name=g.name if g else None,
        regions=[region_read(r) for r in await list_regions(db, org_id, include_inactive=True)],
    )


async def get_settings(db: AsyncSession, current_user: CurrentUser, org_id: int) -> AgendaSettingsRead:
    await _require_admin(db, current_user, org_id)
    return await _settings_read(db, org_id)


async def update_settings(
    db: AsyncSession, current_user: CurrentUser, org_id: int, data: AgendaSettingsUpdate
) -> AgendaSettingsRead:
    await _require_admin(db, current_user, org_id)
    now = _now()
    if data.organizers_usergroup_uuid is not None:
        from src.services.communities.membros import _resolve_group

        gid = await _resolve_group(db, org_id, data.organizers_usergroup_uuid)
        row = await _settings_row(db, org_id)
        if row is None:
            row = CommunityOrgSettings(org_id=org_id, creation_date=now, update_date=now)
        row.organizers_usergroup_id = gid
        row.organizers_configured = True
        row.update_date = now
        db.add(row)
        await db.commit()

    if data.regions is not None:
        if len(data.regions) > REGIONS_MAX:
            raise HTTPException(status_code=422, detail=f"At most {REGIONS_MAX} regions")
        existing = {r.region_uuid: r for r in await list_regions(db, org_id, include_inactive=True)}
        used_slugs = {r.slug for r in existing.values()}
        seen = set()
        for pos, item in enumerate(data.regions):
            name = (item.name or "").strip()
            if not name or len(name) > REGION_NAME_MAX:
                raise HTTPException(status_code=422, detail="Region name is required (max 80)")
            if item.region_uuid:
                r = existing.get(item.region_uuid)
                if r is None:
                    raise HTTPException(status_code=422, detail="Region not found")
                if r.region_uuid in seen:
                    raise HTTPException(status_code=422, detail="Duplicated region")
            else:
                base = slugify(name)
                slug, i = base, 2
                while slug in used_slugs:
                    slug, i = f"{base}-{i}"[:60], i + 1
                used_slugs.add(slug)
                r = CommunityEventRegion(
                    region_uuid=f"region_{uuid4()}", org_id=org_id, slug=slug, is_online=False,
                    creation_date=now,
                )
            seen.add(r.region_uuid)
            r.name = name
            r.position = pos
            r.active = bool(item.active)
            r.update_date = now
            db.add(r)
        # Ausentes da lista: ficam inativas (nunca apagadas) e vão para o fim.
        for uuid, r in existing.items():
            if uuid not in seen:
                r.active = False
                r.position = len(data.regions) + (r.position or 0)
                r.update_date = now
                db.add(r)
        await db.commit()
    return await _settings_read(db, org_id)


# ---------------------------------------------------------------------------
# Preferências da pessoa e feed ICS pessoal
# ---------------------------------------------------------------------------


def hash_token(token: str) -> str:
    return hashlib.sha256((token or "").encode("utf-8")).hexdigest()


async def _require_member(db: AsyncSession, current_user: CurrentUser, org_id: int) -> int:
    from src.services.communities.social import _require_member as require

    return await require(db, current_user, org_id)


async def get_pref_row(db: AsyncSession, user_id: int, org_id: int) -> Optional[CommunityAgendaPref]:
    return (await db.execute(
        select(CommunityAgendaPref).where(
            CommunityAgendaPref.user_id == user_id, CommunityAgendaPref.org_id == org_id
        )
    )).scalars().first()


def _prefs_read(row: Optional[CommunityAgendaPref]) -> AgendaPrefsRead:
    from src.services.communities.batepapos import email_reminders_enabled

    return AgendaPrefsRead(
        email_reminders=True if row is None else bool(row.email_reminders),
        email_available=email_reminders_enabled(),
        feed_active=bool(row and row.feed_token_hash),
        feed_created_at=(row.feed_created_at or None) if row and row.feed_token_hash else None,
    )


async def get_prefs(db: AsyncSession, current_user: CurrentUser, org_id: int) -> AgendaPrefsRead:
    viewer_id = await _require_member(db, current_user, org_id)
    return _prefs_read(await get_pref_row(db, viewer_id, org_id))


async def _pref_or_new(db: AsyncSession, user_id: int, org_id: int) -> CommunityAgendaPref:
    row = await get_pref_row(db, user_id, org_id)
    if row is None:
        now = _now()
        row = CommunityAgendaPref(user_id=user_id, org_id=org_id, creation_date=now, update_date=now)
    return row


async def update_prefs(
    db: AsyncSession, current_user: CurrentUser, org_id: int, data: AgendaPrefsUpdate
) -> AgendaPrefsRead:
    viewer_id = await _require_member(db, current_user, org_id)
    row = await _pref_or_new(db, viewer_id, org_id)
    if data.email_reminders is not None:
        row.email_reminders = bool(data.email_reminders)
    row.update_date = _now()
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return _prefs_read(row)


async def rotate_feed(db: AsyncSession, current_user: CurrentUser, org_id: int) -> FeedTokenRead:
    """Gera (ou troca) o link secreto do feed. O token só sai nesta resposta."""
    viewer_id = await _require_member(db, current_user, org_id)
    from src.services.communities.social import _throttle_or_429

    _throttle_or_429(f"agenda_feed:{viewer_id}", 10, 3600)
    row = await _pref_or_new(db, viewer_id, org_id)
    token = secrets.token_urlsafe(FEED_TOKEN_BYTES)
    row.feed_token_hash = hash_token(token)
    row.feed_created_at = _now()
    row.update_date = row.feed_created_at
    db.add(row)
    await db.commit()
    return FeedTokenRead(token=token, path=f"agenda/feed/{token}.ics")


async def revoke_feed(db: AsyncSession, current_user: CurrentUser, org_id: int) -> AgendaPrefsRead:
    viewer_id = await _require_member(db, current_user, org_id)
    row = await get_pref_row(db, viewer_id, org_id)
    if row is not None and row.feed_token_hash:
        row.feed_token_hash = None
        row.feed_created_at = ""
        row.update_date = _now()
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return _prefs_read(row)


async def feed_owner(db: AsyncSession, token: str) -> Optional[CommunityAgendaPref]:
    token = (token or "").strip()
    if len(token) < 20 or len(token) > 200:
        return None
    return (await db.execute(
        select(CommunityAgendaPref).where(CommunityAgendaPref.feed_token_hash == hash_token(token))
    )).scalars().first()


async def email_opted_out(db: AsyncSession, user_id: int, org_id: int) -> bool:
    row = await get_pref_row(db, user_id, org_id)
    return row is not None and not row.email_reminders
