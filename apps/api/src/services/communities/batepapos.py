"""Agenda de eventos (antes "Bate-papo Online", N45; Agenda, 24/11/2026).

Regras, todas checadas aqui (o front só mostra o que vem):

- **Criar**: admins/mantenedores, grupo de autores ("Equipe") e grupo de
  organizadores ("Discípulos", configurável; ver ``agenda.py``).
- **Editar, cancelar, apagar e ver a lista de nomes**: quem criou o evento,
  admins e Equipe.
- **Agenda aberta**: qualquer pessoa (inclusive visitante sem conta) vê
  título, tipo, região, cidade, bairro, data, duração, organizador e
  descrição.
- **Endereço exato e link online** (``address``/``meeting_url``): só para
  quem respondeu **"Vou"**, para quem criou e para admins/Equipe. "Talvez"
  não vê (decisão: endereço de casa de alguém só para quem confirmou). Vale
  para o JSON, o ``.ics``, o feed pessoal e as notificações (que nunca levam
  endereço nem link).
- **Vagas**: ``capacity`` opcional. Lotado bloqueia novos "Vou" (409);
  "Talvez" continua liberado e não ocupa vaga. Sem lista de espera.
- **Cancelar**: o evento fica na agenda marcado "Cancelado", sem presença
  nova, e quem tinha respondido recebe um aviso (app e, se ligado, e-mail).
  Mudança de horário/local também avisa os inscritos.
- **Presença**: "Vou", "Talvez" ou cancelar, só membros. A lista de nomes só
  para quem gerencia o evento; os outros veem só as contagens.
- **Lembretes** no app (``community_notification``): 1 dia antes, 15 minutos
  antes e ao começar, para quem respondeu "Vou" ou "Talvez".

  O LearnHouse não tem fila (Celery/RQ) nem cron; tem só laços ``asyncio``
  dentro da API (ex.: ``nudges/scheduler.py``). Por isso os lembretes são
  gerados **sob demanda**: quando a pessoa abre o app, consulta as
  notificações ou a contagem de não lidas, :func:`generate_due_reminders`
  cria o lembrete da janela em que o encontro está (um de cada tipo por
  pessoa e encontro, garantido por índice único). Janelas perdidas não são
  recriadas depois (quem abre o app durante o encontro recebe só o
  "Começou!"). O e-mail de lembrete é opcional e roda num laço próprio
  (``batepapos_scheduler.py``), desligado por padrão.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Dict, Iterable, List, Optional, Tuple, Union
from urllib.parse import urlparse
from uuid import uuid4
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException, Request
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.communities.batepapos import (
    ADDRESS_MAX,
    CAPACITY_MAX,
    CITY_MAX,
    DESCRIPTION_MAX,
    DURATION_MAX,
    DURATION_MIN,
    EVENT_KINDS,
    EVENT_MODES,
    HOST_MAX,
    MODE_IN_PERSON,
    MODE_ONLINE,
    NEIGHBORHOOD_MAX,
    NOTIFICATION_EVENT_15M,
    NOTIFICATION_EVENT_1D,
    NOTIFICATION_EVENT_CANCELLED,
    NOTIFICATION_EVENT_CHANGED,
    NOTIFICATION_EVENT_LIVE,
    PASSAGES_MAX,
    RSVP_GOING,
    RSVP_MAYBE,
    RSVP_STATUSES,
    STATUS_CANCELLED,
    STATUS_SCHEDULED,
    THEME_MAX,
    TITLE_MAX,
    URL_MAX,
    AttendeeList,
    AttendeeRead,
    CommunityEvent,
    CommunityEventRegion,
    CommunityEventRsvp,
    EventCreate,
    EventRead,
    EventUpdate,
)
from src.services.communities import agenda
from src.db.communities.communities import Community
from src.db.communities.discussions import Discussion
from src.db.communities.social import CommunityNotification
from src.db.organizations import Organization
from src.db.users import AnonymousUser, APITokenUser, PublicUser, User

logger = logging.getLogger(__name__)

CurrentUser = Union[PublicUser, AnonymousUser, APITokenUser]

DEFAULT_TZ = "America/Sao_Paulo"
LIST_MAX = 50
RANGE_LIST_MAX = 300
# O feed pessoal traz os eventos de até 60 dias atrás em diante.
FEED_PAST_DAYS = 60
FEED_MAX = 300

# Ordem dos lembretes: um posterior substitui os anteriores ainda não criados.
REMINDER_ORDER = (NOTIFICATION_EVENT_1D, NOTIFICATION_EVENT_15M, NOTIFICATION_EVENT_LIVE)


# ---------------------------------------------------------------------------
# Datas
# ---------------------------------------------------------------------------


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def fmt_utc(dt: datetime) -> str:
    """Formato fixo, comparável como texto: ``2026-12-01T23:00:00+00:00``."""
    return dt.astimezone(timezone.utc).replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%S+00:00")


def parse_utc(value: str) -> datetime:
    dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def _zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except (ZoneInfoNotFoundError, ValueError):
        raise HTTPException(status_code=422, detail="Unknown time zone")


def parse_starts_at(value: str, tz_name: str) -> str:
    """Entrada ISO (com ou sem deslocamento) -> UTC no formato fixo."""
    zone = _zone(tz_name or DEFAULT_TZ)
    try:
        dt = datetime.fromisoformat((value or "").strip().replace("Z", "+00:00"))
    except ValueError:
        raise HTTPException(status_code=422, detail="starts_at must be an ISO 8601 date and time")
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=zone)
    return fmt_utc(dt)


def event_window(ev: CommunityEvent) -> Tuple[datetime, datetime]:
    start = parse_utc(ev.starts_at)
    return start, start + timedelta(minutes=int(ev.duration_minutes or 60))


def event_status(ev: CommunityEvent, now: Optional[datetime] = None) -> str:
    now = now or utcnow()
    start, end = event_window(ev)
    if now < start:
        return "upcoming"
    if now < end:
        return "live"
    return "past"


# ---------------------------------------------------------------------------
# Quem é quem
# ---------------------------------------------------------------------------


def _viewer_id(current_user: CurrentUser) -> int:
    if isinstance(current_user, APITokenUser):
        return 0
    return int(getattr(current_user, "id", 0) or 0)


async def _get_org(db: AsyncSession, org_id: int) -> Organization:
    org = (await db.execute(select(Organization).where(Organization.id == org_id))).scalars().first()
    if not org:
        raise HTTPException(status_code=404, detail="Organization not found")
    return org


async def _is_member(db: AsyncSession, user_id: int, org_id: int) -> bool:
    if not user_id:
        return False
    from src.security.org_auth import is_org_member

    return await is_org_member(user_id, org_id, db)


async def _can_create(db: AsyncSession, user_id: int, org_id: int) -> bool:
    return await agenda.can_create_events(db, user_id, org_id)


async def _can_edit(db: AsyncSession, user_id: int, ev: CommunityEvent, staff: Optional[bool] = None) -> bool:
    """Quem criou o evento, admins e Equipe."""
    if not user_id:
        return False
    if ev.created_by and ev.created_by == user_id:
        return True
    return staff if staff is not None else await agenda.is_staff(db, user_id, ev.org_id)


async def _require_creator(db: AsyncSession, current_user: CurrentUser, org_id: int) -> int:
    viewer_id = _viewer_id(current_user)
    if not viewer_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not await _is_member(db, viewer_id, org_id) or not await _can_create(db, viewer_id, org_id):
        raise HTTPException(status_code=403, detail="Only organizers, the team and admins can create events")
    return viewer_id


async def _require_editor(db: AsyncSession, current_user: CurrentUser, ev: CommunityEvent) -> int:
    viewer_id = _viewer_id(current_user)
    if not viewer_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not await _is_member(db, viewer_id, ev.org_id) or not await _can_edit(db, viewer_id, ev):
        raise HTTPException(status_code=403, detail="Only the organizer of this event and admins can change it")
    return viewer_id


def _throttle_or_429(key: str, max_attempts: int, window_seconds: int) -> None:
    from src.services.communities.social import _throttle_or_429 as throttle

    throttle(key, max_attempts, window_seconds)


async def _event_or_404(db: AsyncSession, event_uuid: str) -> CommunityEvent:
    ev = (await db.execute(select(CommunityEvent).where(CommunityEvent.event_uuid == event_uuid))).scalars().first()
    if not ev:
        raise HTTPException(status_code=404, detail="Event not found")
    return ev


# ---------------------------------------------------------------------------
# Validação
# ---------------------------------------------------------------------------


def _text(value: Optional[str], limit: int, field: str, *, required: bool = False) -> str:
    value = (value or "").strip()
    if required and not value:
        raise HTTPException(status_code=422, detail=f"{field} is required")
    if len(value) > limit:
        raise HTTPException(status_code=422, detail=f"{field} is too long (max {limit})")
    return value


def _meeting_url(value: Optional[str]) -> str:
    value = (value or "").strip()
    if not value:
        return ""
    parsed = urlparse(value)
    if parsed.scheme != "https" or not parsed.netloc or len(value) > URL_MAX or " " in value:
        raise HTTPException(status_code=422, detail="The meeting link must be an https:// address")
    return value


def _choice(value: Optional[str], allowed, field: str) -> str:
    value = (value or "").strip()
    if value not in allowed:
        raise HTTPException(status_code=422, detail=f"{field} must be one of: {', '.join(allowed)}")
    return value


def _capacity(value: Optional[int]) -> Optional[int]:
    if value is None:
        return None
    value = int(value)
    if value <= 0:
        return None
    if value > CAPACITY_MAX:
        raise HTTPException(status_code=422, detail=f"Capacity must be at most {CAPACITY_MAX}")
    return value


async def _place(
    db: AsyncSession, org_id: int, mode: str, region_uuid: Optional[str]
) -> Tuple[str, Optional[int]]:
    """(modalidade, region_id) coerentes: região Online só com evento online;
    evento online sem região cai em "Online"; presencial exige região."""
    mode = _choice(mode or MODE_ONLINE, EVENT_MODES, "mode")
    region: Optional[CommunityEventRegion] = None
    if region_uuid:
        region = await agenda.region_by_uuid(db, org_id, region_uuid)
    if mode == MODE_ONLINE and region is None:
        region = await agenda.online_region(db, org_id)
    if mode == MODE_IN_PERSON:
        if region is None:
            raise HTTPException(status_code=422, detail="In-person events need a region")
        if region.is_online:
            raise HTTPException(status_code=422, detail="The Online region is only for online events")
    return mode, region.id if region else None


def _duration(value: Optional[int]) -> int:
    value = int(value or 60)
    if value < DURATION_MIN or value > DURATION_MAX:
        raise HTTPException(status_code=422, detail=f"Duration must be between {DURATION_MIN} and {DURATION_MAX} minutes")
    return value


# ---------------------------------------------------------------------------
# Leitura
# ---------------------------------------------------------------------------


async def _counts(db: AsyncSession, event_ids: Iterable[int]) -> Dict[int, Dict[str, int]]:
    ids = list(set(event_ids))
    out: Dict[int, Dict[str, int]] = {i: {RSVP_GOING: 0, RSVP_MAYBE: 0} for i in ids}
    if not ids:
        return out
    rows = (await db.execute(
        select(CommunityEventRsvp.event_id, CommunityEventRsvp.status, func.count(CommunityEventRsvp.id))
        .where(CommunityEventRsvp.event_id.in_(ids))  # type: ignore[attr-defined]
        .group_by(CommunityEventRsvp.event_id, CommunityEventRsvp.status)
    )).all()
    for eid, status, n in rows:
        out.setdefault(eid, {RSVP_GOING: 0, RSVP_MAYBE: 0})[status] = int(n)
    return out


async def _reads(
    db: AsyncSession, events: List[CommunityEvent], viewer_id: int, org_id: int
) -> List[EventRead]:
    if not events:
        return []
    member = await _is_member(db, viewer_id, org_id)
    staff = member and await agenda.is_staff(db, viewer_id, org_id)
    counts = await _counts(db, [e.id for e in events])
    mine: Dict[int, str] = {}
    if member:
        mine = dict((await db.execute(
            select(CommunityEventRsvp.event_id, CommunityEventRsvp.status).where(
                CommunityEventRsvp.user_id == viewer_id,
                CommunityEventRsvp.event_id.in_([e.id for e in events]),  # type: ignore[attr-defined]
            )
        )).all())
    regions = await agenda.regions_by_id(db, org_id)
    creator_ids = {e.created_by for e in events if e.created_by}
    creators = {
        u.id: u for u in (await db.execute(select(User).where(User.id.in_(creator_ids)))).scalars().all()  # type: ignore[attr-defined]
    } if creator_ids else {}
    ann_ids = [e.announcement_discussion_id for e in events if e.announcement_discussion_id]
    announcements: Dict[int, Tuple[str, str]] = {}
    if ann_ids:
        for did, duuid, cuuid in (await db.execute(
            select(Discussion.id, Discussion.discussion_uuid, Community.community_uuid)
            .join(Community, Community.id == Discussion.community_id)
            .where(Discussion.id.in_(ann_ids), Discussion.visibility == "public")  # type: ignore[attr-defined]
        )).all():
            announcements[did] = (duuid, cuuid)
    now = utcnow()
    out = []
    for e in events:
        _start, end = event_window(e)
        ann = announcements.get(e.announcement_discussion_id or 0)
        c = counts.get(e.id, {})
        going = c.get(RSVP_GOING, 0)
        my_status = mine.get(e.id)
        manage = member and (staff or (bool(e.created_by) and e.created_by == viewer_id))
        # Endereço e link: só "Vou", quem criou e admins/Equipe.
        private = manage or (member and my_status == RSVP_GOING)
        has_private = bool(e.address or e.meeting_url)
        region = regions.get(e.region_id or 0)
        creator = creators.get(e.created_by or 0)
        capacity = int(e.capacity) if e.capacity else None
        out.append(EventRead(
            event_uuid=e.event_uuid,
            title=e.title,
            theme=e.theme or "",
            description=e.description or "",
            starts_at=e.starts_at,
            ends_at=fmt_utc(end),
            timezone=e.timezone or DEFAULT_TZ,
            duration_minutes=int(e.duration_minutes or 60),
            kind=e.kind or "bible_talk",
            mode=e.mode or MODE_ONLINE,
            region=agenda.region_read(region) if region else None,
            city=e.city or "",
            neighborhood=e.neighborhood or "",
            meeting_url=(e.meeting_url or None) if private else None,
            address=(e.address or None) if private else None,
            details_locked=has_private and not private,
            host_name=e.host_name or "",
            organizer_name=display_name(creator) if creator else "",
            passages=e.passages or "",
            capacity=capacity,
            spots_left=max(0, capacity - going) if capacity else None,
            is_full=bool(capacity and going >= capacity),
            cancelled=e.status == STATUS_CANCELLED,
            announcement_discussion_uuid=ann[0] if ann else None,
            announcement_community_uuid=ann[1] if ann else None,
            my_status=my_status,
            going_count=going,
            maybe_count=c.get(RSVP_MAYBE, 0),
            can_manage=manage,
            status=event_status(e, now),
        ))
    return out


def display_name(u: User) -> str:
    return f"{u.first_name or ''} {u.last_name or ''}".strip() or u.username


async def list_events(
    db: AsyncSession,
    current_user: CurrentUser,
    org_id: int,
    when: str = "upcoming",
    limit: int = 20,
    region_uuid: Optional[str] = None,
    kind: Optional[str] = None,
    start: Optional[str] = None,
    end: Optional[str] = None,
) -> List[EventRead]:
    """Agenda. ``upcoming`` inclui o que está acontecendo agora.

    Com ``start``/``end`` (ISO), devolve o intervalo inteiro (calendário do
    mês), passados e futuros, em ordem. Filtros opcionais: região e tipo.
    """
    await _get_org(db, org_id)
    now = utcnow()
    stmt = select(CommunityEvent).where(CommunityEvent.org_id == org_id)
    if region_uuid:
        region = await agenda.region_by_uuid(db, org_id, region_uuid)
        stmt = stmt.where(CommunityEvent.region_id == region.id)
    if kind:
        stmt = stmt.where(CommunityEvent.kind == _choice(kind, EVENT_KINDS, "kind"))
    if start or end:
        limit = max(1, min(limit, RANGE_LIST_MAX))
        if start:
            stmt = stmt.where(CommunityEvent.starts_at >= fmt_utc(parse_utc(_iso_or_422(start))))
        if end:
            stmt = stmt.where(CommunityEvent.starts_at < fmt_utc(parse_utc(_iso_or_422(end))))
        stmt = stmt.order_by(CommunityEvent.starts_at.asc())  # type: ignore[union-attr]
        events = list((await db.execute(stmt.limit(limit))).scalars().all())
        return await _reads(db, events, _viewer_id(current_user), org_id)
    limit = max(1, min(limit, LIST_MAX))
    # Os encontros duram no máximo DURATION_MAX: filtra por texto e confere o fim.
    horizon = fmt_utc(now - timedelta(minutes=DURATION_MAX))
    if when == "past":
        stmt = stmt.where(CommunityEvent.starts_at <= fmt_utc(now)).order_by(CommunityEvent.starts_at.desc())  # type: ignore[union-attr]
        events = [e for e in (await db.execute(stmt.limit(limit + 20))).scalars().all() if event_status(e, now) == "past"]
    else:
        stmt = stmt.where(CommunityEvent.starts_at >= horizon).order_by(CommunityEvent.starts_at.asc())  # type: ignore[union-attr]
        events = [e for e in (await db.execute(stmt.limit(limit + 20))).scalars().all() if event_status(e, now) != "past"]
    return await _reads(db, events[:limit], _viewer_id(current_user), org_id)


def _iso_or_422(value: str) -> str:
    try:
        parse_utc(value)
    except ValueError:
        raise HTTPException(status_code=422, detail="Dates must be ISO 8601")
    return value


async def list_regions(db: AsyncSession, org_id: int) -> list:
    await _get_org(db, org_id)
    return [agenda.region_read(r) for r in await agenda.list_regions(db, org_id)]


async def get_event(db: AsyncSession, current_user: CurrentUser, event_uuid: str) -> EventRead:
    ev = await _event_or_404(db, event_uuid)
    return (await _reads(db, [ev], _viewer_id(current_user), ev.org_id))[0]


# ---------------------------------------------------------------------------
# Criar, editar, apagar
# ---------------------------------------------------------------------------


def _announcement_content(ev: CommunityEvent, event_path: str) -> str:
    """Post de divulgação em tiptap JSON (sem o link da reunião nem endereço)."""
    start = parse_utc(ev.starts_at).astimezone(_zone(ev.timezone or DEFAULT_TZ))
    quando = start.strftime("%d/%m/%Y, %H:%M")
    paragraphs = []
    if ev.theme:
        paragraphs.append(f"Tema: {ev.theme}")
    paragraphs.append(f"Quando: {quando} ({ev.timezone or DEFAULT_TZ}), {int(ev.duration_minutes or 60)} min")
    # Só o público: cidade e bairro (nunca endereço nem link).
    if ev.mode == MODE_IN_PERSON and (ev.city or ev.neighborhood):
        paragraphs.append("Onde: " + " · ".join(p for p in (ev.neighborhood, ev.city) if p))
    if ev.host_name:
        paragraphs.append(f"Quem conduz: {ev.host_name}")
    if ev.passages:
        paragraphs.append(f"Passagens: {ev.passages}")
    if ev.description:
        paragraphs.extend(p for p in ev.description.split("\n") if p.strip())
    content = [{"type": "paragraph", "content": [{"type": "text", "text": p}]} for p in paragraphs]
    content.append({
        "type": "paragraph",
        "content": [{
            "type": "text",
            "text": "Confirmar presença na agenda",
            "marks": [{"type": "link", "attrs": {"href": event_path}}],
        }],
    })
    return json.dumps({"type": "doc", "content": content}, ensure_ascii=False)


async def create_event(
    request: Request, db: AsyncSession, current_user: CurrentUser, org_id: int, data: EventCreate
) -> EventRead:
    viewer_id = await _require_creator(db, current_user, org_id)
    _throttle_or_429(f"batepapo_create:{viewer_id}", 20, 3600)
    tz_name = _text(data.timezone or DEFAULT_TZ, 64, "timezone", required=True)
    mode, region_id = await _place(db, org_id, data.mode, data.region_uuid)
    now = _utc_str()
    ev = CommunityEvent(
        event_uuid=f"event_{uuid4()}",
        org_id=org_id,
        title=_text(data.title, TITLE_MAX, "title", required=True),
        theme=_text(data.theme, THEME_MAX, "theme"),
        description=_text(data.description, DESCRIPTION_MAX, "description"),
        starts_at=parse_starts_at(data.starts_at, tz_name),
        timezone=tz_name,
        duration_minutes=_duration(data.duration_minutes),
        meeting_url=_meeting_url(data.meeting_url),
        host_name=_text(data.host_name, HOST_MAX, "host_name"),
        passages=_text(data.passages, PASSAGES_MAX, "passages"),
        kind=_choice(data.kind or "bible_talk", EVENT_KINDS, "kind"),
        mode=mode,
        region_id=region_id,
        city=_text(data.city, CITY_MAX, "city"),
        neighborhood=_text(data.neighborhood, NEIGHBORHOOD_MAX, "neighborhood"),
        address=_text(data.address, ADDRESS_MAX, "address") if mode == MODE_IN_PERSON else "",
        capacity=_capacity(data.capacity),
        status=STATUS_SCHEDULED,
        created_by=viewer_id,
        creation_date=now,
        update_date=now,
    )

    community = None
    if data.announce_community_uuid:
        community = (await db.execute(
            select(Community).where(Community.community_uuid == data.announce_community_uuid)
        )).scalars().first()
        if not community or community.org_id != org_id:
            raise HTTPException(status_code=404, detail="Community not found")
        # Confere antes de gravar o encontro: quem cria precisa poder ler e
        # publicar no espaço da divulgação.
        from src.security.rbac import AccessAction, check_resource_access
        from src.services.communities.publicacao import ensure_can_post

        await check_resource_access(request, db, current_user, community.community_uuid, AccessAction.READ)
        await ensure_can_post(db, viewer_id, community)

    db.add(ev)
    await db.commit()
    await db.refresh(ev)

    if community is not None:
        # Divulgação: um post comum no espaço escolhido, com as mesmas regras
        # (leitura, quem pode publicar, moderação) de qualquer post.
        from src.services.communities.discussions import create_discussion

        short = ev.event_uuid.replace("event_", "")
        post = await create_discussion(
            request,
            community.community_uuid,
            f"Agenda: {ev.title}",
            _announcement_content(ev, f"/agenda/{short}"),
            "announcement",
            current_user,
            db,
        )
        did = (await db.execute(
            select(Discussion.id).where(Discussion.discussion_uuid == post.discussion_uuid)
        )).scalars().first()
        ev.announcement_discussion_id = did
        db.add(ev)
        await db.commit()
        await db.refresh(ev)

    return (await _reads(db, [ev], viewer_id, org_id))[0]


async def update_event(db: AsyncSession, current_user: CurrentUser, event_uuid: str, data: EventUpdate) -> EventRead:
    ev = await _event_or_404(db, event_uuid)
    viewer_id = await _require_editor(db, current_user, ev)
    # O que, mudando, merece aviso aos inscritos (horário e lugar).
    before = (ev.starts_at, ev.duration_minutes, ev.mode, ev.region_id, ev.city, ev.neighborhood,
              ev.address, ev.meeting_url)
    if data.title is not None:
        ev.title = _text(data.title, TITLE_MAX, "title", required=True)
    if data.theme is not None:
        ev.theme = _text(data.theme, THEME_MAX, "theme")
    if data.description is not None:
        ev.description = _text(data.description, DESCRIPTION_MAX, "description")
    if data.timezone is not None:
        ev.timezone = _text(data.timezone, 64, "timezone", required=True)
        _zone(ev.timezone)
    if data.starts_at is not None:
        new_start = parse_starts_at(data.starts_at, ev.timezone or DEFAULT_TZ)
        if new_start != ev.starts_at:
            ev.starts_at = new_start
            # Lembretes já criados não valem para o novo horário.
            for n in (await db.execute(
                select(CommunityNotification).where(
                    CommunityNotification.event_id == ev.id,
                    CommunityNotification.kind.in_(REMINDER_ORDER),  # type: ignore[attr-defined]
                )
            )).scalars().all():
                await db.delete(n)
    if data.duration_minutes is not None:
        ev.duration_minutes = _duration(data.duration_minutes)
    if data.meeting_url is not None:
        ev.meeting_url = _meeting_url(data.meeting_url)
    if data.host_name is not None:
        ev.host_name = _text(data.host_name, HOST_MAX, "host_name")
    if data.passages is not None:
        ev.passages = _text(data.passages, PASSAGES_MAX, "passages")
    if data.kind is not None:
        ev.kind = _choice(data.kind, EVENT_KINDS, "kind")
    if data.mode is not None or data.region_uuid is not None:
        region_uuid = data.region_uuid
        if region_uuid is None and ev.region_id:
            current = (await agenda.regions_by_id(db, ev.org_id)).get(ev.region_id)
            region_uuid = current.region_uuid if current else None
            # Mudou para online e a região atual é de cidade: volta para "Online".
            if data.mode == MODE_ONLINE and current is not None and not current.is_online:
                region_uuid = None
        ev.mode, ev.region_id = await _place(db, ev.org_id, data.mode or ev.mode, region_uuid)
    if data.city is not None:
        ev.city = _text(data.city, CITY_MAX, "city")
    if data.neighborhood is not None:
        ev.neighborhood = _text(data.neighborhood, NEIGHBORHOOD_MAX, "neighborhood")
    if data.address is not None:
        ev.address = _text(data.address, ADDRESS_MAX, "address")
    if ev.mode != MODE_IN_PERSON:
        ev.address = ""
    if data.capacity is not None:
        ev.capacity = _capacity(data.capacity)
    ev.update_date = _utc_str()
    db.add(ev)
    await db.commit()
    await db.refresh(ev)
    after = (ev.starts_at, ev.duration_minutes, ev.mode, ev.region_id, ev.city, ev.neighborhood,
             ev.address, ev.meeting_url)
    if before != after and ev.status != STATUS_CANCELLED and event_status(ev) != "past":
        await _notify_attendees(db, ev, NOTIFICATION_EVENT_CHANGED, exclude_user=viewer_id, replace=True)
    return (await _reads(db, [ev], viewer_id, ev.org_id))[0]


async def _notify_attendees(
    db: AsyncSession, ev: CommunityEvent, kind: str, exclude_user: int = 0, replace: bool = False
) -> List[int]:
    """Um aviso no app para quem respondeu "Vou" ou "Talvez". Idempotente:
    um por pessoa, evento e tipo (índice único); com ``replace``, o aviso
    anterior do mesmo tipo é trocado (ex.: segunda mudança de horário)."""
    user_ids = [uid for uid in (await db.execute(
        select(CommunityEventRsvp.user_id).where(
            CommunityEventRsvp.event_id == ev.id,
            CommunityEventRsvp.status.in_(RSVP_STATUSES),  # type: ignore[attr-defined]
        )
    )).scalars().all() if uid != exclude_user]
    if not user_ids:
        return []
    existing = {n.user_id: n for n in (await db.execute(
        select(CommunityNotification).where(
            CommunityNotification.event_id == ev.id, CommunityNotification.kind == kind,
        )
    )).scalars().all()}
    if replace:
        for n in existing.values():
            await db.delete(n)
        await db.commit()
        existing = {}
    created = []
    for uid in user_ids:
        if uid in existing:
            continue
        db.add(CommunityNotification(
            notification_uuid=f"notification_{uuid4()}",
            user_id=uid,
            org_id=ev.org_id,
            actor_id=uid,
            kind=kind,
            event_id=ev.id,
            creation_date=str(datetime.now()),
        ))
        created.append(uid)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        return []
    return created


async def cancel_event(db: AsyncSession, current_user: CurrentUser, event_uuid: str) -> EventRead:
    """Cancela sem apagar: fica na agenda como "Cancelado" e avisa os inscritos."""
    ev = await _event_or_404(db, event_uuid)
    viewer_id = await _require_editor(db, current_user, ev)
    if ev.status != STATUS_CANCELLED:
        ev.status = STATUS_CANCELLED
        ev.update_date = _utc_str()
        db.add(ev)
        await db.commit()
        await db.refresh(ev)
        notified = await _notify_attendees(db, ev, NOTIFICATION_EVENT_CANCELLED, exclude_user=viewer_id)
        if notified and email_reminders_enabled():
            await _email_cancellation(db, ev, notified)
    return (await _reads(db, [ev], viewer_id, ev.org_id))[0]


async def _email_cancellation(db: AsyncSession, ev: CommunityEvent, user_ids: List[int]) -> None:
    from src.services.communities.batepapos_scheduler import send_cancellation

    users = (await db.execute(select(User).where(User.id.in_(user_ids)))).scalars().all()  # type: ignore[attr-defined]
    for u in users:
        if not u.email or await agenda.email_opted_out(db, u.id, ev.org_id):
            continue
        try:
            await asyncio.to_thread(send_cancellation, u.email, ev)
        except Exception as exc:  # pragma: no cover - provedor externo
            logger.warning("Aviso de cancelamento não enviado: %s", exc)


async def delete_event(db: AsyncSession, current_user: CurrentUser, event_uuid: str) -> dict:
    ev = await _event_or_404(db, event_uuid)
    await _require_editor(db, current_user, ev)
    # Cascata no banco; no SQLite dos testes as FKs podem estar desligadas.
    for model in (CommunityNotification, CommunityEventRsvp):
        for row in (await db.execute(select(model).where(model.event_id == ev.id))).scalars().all():
            await db.delete(row)
    await db.delete(ev)
    await db.commit()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Presença
# ---------------------------------------------------------------------------


def _utc_str() -> str:
    return fmt_utc(utcnow())


async def set_rsvp(db: AsyncSession, current_user: CurrentUser, event_uuid: str, status: Optional[str]) -> EventRead:
    ev = await _event_or_404(db, event_uuid)
    viewer_id = _viewer_id(current_user)
    if not viewer_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not await _is_member(db, viewer_id, ev.org_id):
        raise HTTPException(status_code=403, detail="Only members of this organization can confirm attendance")
    if status is not None and status not in RSVP_STATUSES:
        raise HTTPException(status_code=422, detail="status must be 'vou', 'talvez' or null")
    if status is not None and event_status(ev) == "past":
        raise HTTPException(status_code=422, detail="This event has already ended")
    if status is not None and ev.status == STATUS_CANCELLED:
        raise HTTPException(status_code=422, detail="This event was cancelled")
    _throttle_or_429(f"batepapo_rsvp:{viewer_id}", 30, 60)
    row = (await db.execute(
        select(CommunityEventRsvp).where(CommunityEventRsvp.event_id == ev.id, CommunityEventRsvp.user_id == viewer_id)
    )).scalars().first()
    if status == RSVP_GOING and ev.capacity and (row is None or row.status != RSVP_GOING):
        # Trava a linha do evento (Postgres) para duas pessoas não pegarem a
        # última vaga ao mesmo tempo. No SQLite dos testes é um no-op.
        await db.execute(select(CommunityEvent.id).where(CommunityEvent.id == ev.id).with_for_update())
        going = (await db.execute(
            select(func.count(CommunityEventRsvp.id)).where(
                CommunityEventRsvp.event_id == ev.id, CommunityEventRsvp.status == RSVP_GOING,
            )
        )).scalar_one()
        if int(going) >= int(ev.capacity):
            raise HTTPException(status_code=409, detail="This event is full")
    now = _utc_str()
    if status is None:
        if row:
            await db.delete(row)
    elif row:
        row.status = status
        row.update_date = now
        db.add(row)
    else:
        db.add(CommunityEventRsvp(event_id=ev.id, user_id=viewer_id, status=status, creation_date=now, update_date=now))
    try:
        await db.commit()
    except IntegrityError:
        # Dois cliques ao mesmo tempo: a outra requisição já gravou.
        await db.rollback()
    return (await _reads(db, [ev], viewer_id, ev.org_id))[0]


async def list_attendees(db: AsyncSession, current_user: CurrentUser, event_uuid: str) -> AttendeeList:
    ev = await _event_or_404(db, event_uuid)
    await _require_editor(db, current_user, ev)
    rows = (await db.execute(
        select(CommunityEventRsvp.status, User)
        .join(User, User.id == CommunityEventRsvp.user_id)
        .where(CommunityEventRsvp.event_id == ev.id)
        .order_by(CommunityEventRsvp.creation_date.asc())  # type: ignore[union-attr]
    )).all()
    out = AttendeeList()
    for status, u in rows:
        item = AttendeeRead(
            user_uuid=u.user_uuid, username=u.username, first_name=u.first_name or "",
            last_name=u.last_name or "", avatar_image=u.avatar_image or "", status=status,
        )
        (out.going if status == RSVP_GOING else out.maybe).append(item)
    return out


# ---------------------------------------------------------------------------
# .ics
# ---------------------------------------------------------------------------


def _ics_escape(value: str) -> str:
    return (
        (value or "")
        .replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\r\n", "\\n")
        .replace("\n", "\\n")
    )


def _ics_fold(line: str) -> str:
    """Quebra linhas em 75 octetos (RFC 5545 §3.1)."""
    raw = line.encode("utf-8")
    if len(raw) <= 75:
        return line
    parts = []
    current = b""
    for ch in line:
        b = ch.encode("utf-8")
        limit = 75 if not parts else 74
        if len(current) + len(b) > limit:
            parts.append(current.decode("utf-8"))
            current = b""
        current += b
    parts.append(current.decode("utf-8"))
    return "\r\n ".join(parts)


def _ics_dt(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def _sequence(ev: CommunityEvent) -> int:
    """SEQUENCE do .ics: cresce a cada edição (segundos desde 2020)."""
    try:
        return max(0, int((parse_utc(ev.update_date) - datetime(2020, 1, 1, tzinfo=timezone.utc)).total_seconds()))
    except (ValueError, TypeError):
        return 0


def _public_location(ev: CommunityEvent, region_name: str = "") -> str:
    if ev.mode == MODE_IN_PERSON:
        return ", ".join(p for p in (ev.neighborhood, ev.city or region_name) if p)
    return "Online"


def _vevent(ev: CommunityEvent, private: bool, region_name: str = "", event_url: str = "") -> List[str]:
    """Um VEVENT. Endereço e link só com ``private`` (inscrito "Vou",
    quem criou, admins/Equipe); sem isso, só cidade/bairro ou "Online"."""
    start, end = event_window(ev)
    desc = []
    if ev.status == STATUS_CANCELLED:
        desc.append("CANCELADO")
    if ev.theme:
        desc.append(f"Tema: {ev.theme}")
    if ev.host_name:
        desc.append(f"Quem conduz: {ev.host_name}")
    if ev.passages:
        desc.append(f"Passagens: {ev.passages}")
    if ev.description:
        desc.append(ev.description)
    if private and ev.meeting_url:
        desc.append(f"Entrar: {ev.meeting_url}")
    if private and ev.address:
        desc.append(f"Endereço: {ev.address}")
    if event_url:
        desc.append(event_url)
    if private and ev.mode == MODE_IN_PERSON and ev.address:
        location = ", ".join(p for p in (ev.address, ev.neighborhood, ev.city) if p)
    elif private and ev.meeting_url:
        location = ev.meeting_url
    else:
        location = _public_location(ev, region_name)
    lines = [
        "BEGIN:VEVENT",
        f"UID:{ev.event_uuid}@discipulei",
        f"DTSTAMP:{_ics_dt(utcnow())}",
        f"SEQUENCE:{_sequence(ev)}",
        f"DTSTART:{_ics_dt(start)}",
        f"DTEND:{_ics_dt(end)}",
        f"SUMMARY:{_ics_escape(('[Cancelado] ' if ev.status == STATUS_CANCELLED else '') + ev.title)}",
        f"STATUS:{'CANCELLED' if ev.status == STATUS_CANCELLED else 'CONFIRMED'}",
    ]
    if desc:
        lines.append(f"DESCRIPTION:{_ics_escape(chr(10).join(desc))}")
    if location:
        lines.append(f"LOCATION:{_ics_escape(location)}")
    if private and ev.meeting_url:
        lines.append(f"URL:{ev.meeting_url}")
    elif event_url:
        lines.append(f"URL:{event_url}")
    if ev.status != STATUS_CANCELLED:
        lines += [
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{_ics_escape(ev.title)}",
            "TRIGGER:-PT15M",
            "END:VALARM",
        ]
    lines.append("END:VEVENT")
    return lines


def _calendar(vevents: List[List[str]], name: Optional[str] = None) -> str:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Discipulei//Agenda//PT",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
    ]
    if name:
        lines.append(f"X-WR-CALNAME:{_ics_escape(name)}")
        lines.append("REFRESH-INTERVAL;VALUE=DURATION:PT1H")
        lines.append("X-PUBLISHED-TTL:PT1H")
    for v in vevents:
        lines += v
    lines.append("END:VCALENDAR")
    return "\r\n".join(_ics_fold(line) for line in lines) + "\r\n"


async def _can_see_private(db: AsyncSession, viewer_id: int, ev: CommunityEvent) -> bool:
    if not viewer_id or not await _is_member(db, viewer_id, ev.org_id):
        return False
    if await _can_edit(db, viewer_id, ev):
        return True
    status = (await db.execute(
        select(CommunityEventRsvp.status).where(
            CommunityEventRsvp.event_id == ev.id, CommunityEventRsvp.user_id == viewer_id,
        )
    )).scalars().first()
    return status == RSVP_GOING


async def event_ics(db: AsyncSession, current_user: CurrentUser, event_uuid: str) -> Tuple[str, str]:
    """(nome do arquivo, conteúdo). Endereço e link só para quem pode ver."""
    ev = await _event_or_404(db, event_uuid)
    private = await _can_see_private(db, _viewer_id(current_user), ev)
    region = (await agenda.regions_by_id(db, ev.org_id)).get(ev.region_id or 0)
    body = _calendar([_vevent(ev, private, region.name if region else "")])
    slug = re.sub(r"[^a-z0-9]+", "-", agenda.slugify(ev.title)).strip("-")[:40] or "evento"
    return f"{slug}.ics", body


async def feed_ics(db: AsyncSession, token: str, base_url: str = "") -> str:
    """Feed pessoal ("Minha agenda Discipulei"): só os eventos com "Vou" de
    quem é dono do token. 404 para token errado ou revogado."""
    owner = await agenda.feed_owner(db, token)
    if owner is None or not await _is_member(db, owner.user_id, owner.org_id):
        raise HTTPException(status_code=404, detail="Not found")
    lower = fmt_utc(utcnow() - timedelta(days=FEED_PAST_DAYS))
    events = (await db.execute(
        select(CommunityEvent)
        .join(CommunityEventRsvp, CommunityEventRsvp.event_id == CommunityEvent.id)
        .where(
            CommunityEventRsvp.user_id == owner.user_id,
            CommunityEventRsvp.status == RSVP_GOING,
            CommunityEvent.org_id == owner.org_id,
            CommunityEvent.starts_at >= lower,
        )
        .order_by(CommunityEvent.starts_at.asc())  # type: ignore[union-attr]
        .limit(FEED_MAX)
    )).scalars().all()
    regions = await agenda.regions_by_id(db, owner.org_id)
    base = (base_url or "").rstrip("/")
    vevents = []
    for ev in events:
        region = regions.get(ev.region_id or 0)
        url = f"{base}/agenda/{ev.event_uuid.replace('event_', '')}" if base else ""
        # Inscrito ("Vou"): endereço e link entram.
        vevents.append(_vevent(ev, True, region.name if region else "", url))
    return _calendar(vevents, name="Minha agenda Discipulei")


# ---------------------------------------------------------------------------
# Lembretes sob demanda
# ---------------------------------------------------------------------------


def reminder_kind_for(ev: CommunityEvent, now: datetime, rsvp_created: Optional[str] = None) -> Optional[str]:
    """Qual lembrete vale agora (ou None fora das janelas)."""
    start, end = event_window(ev)
    if start <= now < end:
        return NOTIFICATION_EVENT_LIVE
    if start - timedelta(minutes=15) <= now < start:
        return NOTIFICATION_EVENT_15M
    if start - timedelta(days=1) <= now < start - timedelta(minutes=15):
        # Quem confirmou já dentro das últimas 24 h acabou de ver o encontro:
        # o "falta 1 dia" seria só ruído.
        if rsvp_created:
            try:
                if parse_utc(rsvp_created) >= start - timedelta(days=1):
                    return None
            except ValueError:
                pass
        return NOTIFICATION_EVENT_1D
    return None


async def generate_due_reminders(
    db: AsyncSession, user_id: int, org_id: Optional[int] = None, now: Optional[datetime] = None
) -> List[CommunityNotification]:
    """Cria os lembretes devidos de uma pessoa (idempotente). Devolve os novos."""
    if not user_id:
        return []
    now = now or utcnow()
    lower = fmt_utc(now - timedelta(minutes=DURATION_MAX))
    upper = fmt_utc(now + timedelta(days=1))
    stmt = (
        select(CommunityEvent, CommunityEventRsvp.creation_date)
        .join(CommunityEventRsvp, CommunityEventRsvp.event_id == CommunityEvent.id)
        .where(
            CommunityEventRsvp.user_id == user_id,
            CommunityEventRsvp.status.in_(RSVP_STATUSES),  # type: ignore[attr-defined]
            CommunityEvent.starts_at >= lower,
            CommunityEvent.starts_at <= upper,
            CommunityEvent.status != STATUS_CANCELLED,
        )
    )
    if org_id is not None:
        stmt = stmt.where(CommunityEvent.org_id == org_id)
    rows = (await db.execute(stmt)).all()
    if not rows:
        return []
    existing: Dict[int, set] = {}
    for eid, kind in (await db.execute(
        select(CommunityNotification.event_id, CommunityNotification.kind).where(
            CommunityNotification.user_id == user_id,
            CommunityNotification.event_id.in_([e.id for e, _ in rows]),  # type: ignore[attr-defined]
        )
    )).all():
        existing.setdefault(eid, set()).add(kind)
    created = []
    for ev, rsvp_created in rows:
        kind = reminder_kind_for(ev, now, rsvp_created)
        if not kind:
            continue
        have = existing.get(ev.id, set())
        later = REMINDER_ORDER[REMINDER_ORDER.index(kind):]
        if any(k in have for k in later):
            continue
        n = CommunityNotification(
            notification_uuid=f"notification_{uuid4()}",
            user_id=user_id,
            org_id=ev.org_id,
            # Lembrete não tem autor; a própria pessoa fica como "ator".
            actor_id=user_id,
            kind=kind,
            event_id=ev.id,
            creation_date=str(datetime.now()),
        )
        db.add(n)
        try:
            await db.commit()
            created.append(n)
        except IntegrityError:
            # Outra requisição criou o mesmo lembrete ao mesmo tempo.
            await db.rollback()
    return created


def email_reminders_enabled() -> bool:
    return os.environ.get("DISCIPULEI_LEMBRETES_EMAIL", "").strip().lower() in ("1", "true", "yes", "on")
