"""Bate-papo Online (Bible Talk, decisão N45, 24/11/2026).

Regras, todas checadas aqui:

- **Criar, editar e apagar**: só admins/mantenedores da org e o grupo de
  autores (``community_org_settings.authors_usergroup_id``).
- **Agenda**: qualquer pessoa vê título, tema, data e quem conduz. O **link
  da reunião** só vai para membros logados da org (visitante e token de API
  recebem ``None``, também no ``.ics``).
- **Presença**: "Vou", "Talvez" ou cancelar, só membros. A lista de nomes só
  para quem pode gerenciar; os outros veem só as contagens.
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
    DESCRIPTION_MAX,
    DURATION_MAX,
    DURATION_MIN,
    HOST_MAX,
    NOTIFICATION_EVENT_15M,
    NOTIFICATION_EVENT_1D,
    NOTIFICATION_EVENT_LIVE,
    PASSAGES_MAX,
    RSVP_GOING,
    RSVP_MAYBE,
    RSVP_STATUSES,
    THEME_MAX,
    TITLE_MAX,
    URL_MAX,
    AttendeeList,
    AttendeeRead,
    CommunityEvent,
    CommunityEventRsvp,
    EventCreate,
    EventRead,
    EventUpdate,
)
from src.db.communities.communities import Community
from src.db.communities.discussions import Discussion
from src.db.communities.social import CommunityNotification
from src.db.organizations import Organization
from src.db.users import AnonymousUser, APITokenUser, PublicUser, User

logger = logging.getLogger(__name__)

CurrentUser = Union[PublicUser, AnonymousUser, APITokenUser]

DEFAULT_TZ = "America/Sao_Paulo"
LIST_MAX = 50

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


async def _can_manage(db: AsyncSession, user_id: int, org_id: int) -> bool:
    from src.services.communities.membros import can_manage_events

    return await can_manage_events(db, user_id, org_id)


async def _require_manager(db: AsyncSession, current_user: CurrentUser, org_id: int) -> int:
    viewer_id = _viewer_id(current_user)
    if not viewer_id:
        raise HTTPException(status_code=401, detail="Authentication required")
    if not await _is_member(db, viewer_id, org_id) or not await _can_manage(db, viewer_id, org_id):
        raise HTTPException(status_code=403, detail="Only admins and authors can manage online talks")
    return viewer_id


def _throttle_or_429(key: str, max_attempts: int, window_seconds: int) -> None:
    from src.services.communities.social import _throttle_or_429 as throttle

    throttle(key, max_attempts, window_seconds)


async def _event_or_404(db: AsyncSession, event_uuid: str) -> CommunityEvent:
    ev = (await db.execute(select(CommunityEvent).where(CommunityEvent.event_uuid == event_uuid))).scalars().first()
    if not ev:
        raise HTTPException(status_code=404, detail="Online talk not found")
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
    manage = member and await _can_manage(db, viewer_id, org_id)
    counts = await _counts(db, [e.id for e in events])
    mine: Dict[int, str] = {}
    if member:
        mine = dict((await db.execute(
            select(CommunityEventRsvp.event_id, CommunityEventRsvp.status).where(
                CommunityEventRsvp.user_id == viewer_id,
                CommunityEventRsvp.event_id.in_([e.id for e in events]),  # type: ignore[attr-defined]
            )
        )).all())
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
        out.append(EventRead(
            event_uuid=e.event_uuid,
            title=e.title,
            theme=e.theme or "",
            description=e.description or "",
            starts_at=e.starts_at,
            ends_at=fmt_utc(end),
            timezone=e.timezone or DEFAULT_TZ,
            duration_minutes=int(e.duration_minutes or 60),
            # O link só para membros logados da org.
            meeting_url=(e.meeting_url or None) if member else None,
            host_name=e.host_name or "",
            passages=e.passages or "",
            announcement_discussion_uuid=ann[0] if ann else None,
            announcement_community_uuid=ann[1] if ann else None,
            my_status=mine.get(e.id),
            going_count=c.get(RSVP_GOING, 0),
            maybe_count=c.get(RSVP_MAYBE, 0),
            can_manage=manage,
            status=event_status(e, now),
        ))
    return out


async def list_events(
    db: AsyncSession, current_user: CurrentUser, org_id: int, when: str = "upcoming", limit: int = 20
) -> List[EventRead]:
    """Agenda. ``upcoming`` inclui o que está acontecendo agora."""
    await _get_org(db, org_id)
    limit = max(1, min(limit, LIST_MAX))
    now = utcnow()
    stmt = select(CommunityEvent).where(CommunityEvent.org_id == org_id)
    # Os encontros duram no máximo DURATION_MAX: filtra por texto e confere o fim.
    horizon = fmt_utc(now - timedelta(minutes=DURATION_MAX))
    if when == "past":
        stmt = stmt.where(CommunityEvent.starts_at <= fmt_utc(now)).order_by(CommunityEvent.starts_at.desc())  # type: ignore[union-attr]
        events = [e for e in (await db.execute(stmt.limit(limit + 20))).scalars().all() if event_status(e, now) == "past"]
    else:
        stmt = stmt.where(CommunityEvent.starts_at >= horizon).order_by(CommunityEvent.starts_at.asc())  # type: ignore[union-attr]
        events = [e for e in (await db.execute(stmt.limit(limit + 20))).scalars().all() if event_status(e, now) != "past"]
    return await _reads(db, events[:limit], _viewer_id(current_user), org_id)


async def get_event(db: AsyncSession, current_user: CurrentUser, event_uuid: str) -> EventRead:
    ev = await _event_or_404(db, event_uuid)
    return (await _reads(db, [ev], _viewer_id(current_user), ev.org_id))[0]


# ---------------------------------------------------------------------------
# Criar, editar, apagar
# ---------------------------------------------------------------------------


def _announcement_content(ev: CommunityEvent, event_path: str) -> str:
    """Post de divulgação em tiptap JSON (sem o link da reunião)."""
    start = parse_utc(ev.starts_at).astimezone(_zone(ev.timezone or DEFAULT_TZ))
    quando = start.strftime("%d/%m/%Y, %H:%M")
    paragraphs = []
    if ev.theme:
        paragraphs.append(f"Tema: {ev.theme}")
    paragraphs.append(f"Quando: {quando} ({ev.timezone or DEFAULT_TZ}), {int(ev.duration_minutes or 60)} min")
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
    viewer_id = await _require_manager(db, current_user, org_id)
    _throttle_or_429(f"batepapo_create:{viewer_id}", 20, 3600)
    tz_name = _text(data.timezone or DEFAULT_TZ, 64, "timezone", required=True)
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
            f"Bate-papo: {ev.title}",
            _announcement_content(ev, f"/batepapos/{short}"),
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
    viewer_id = await _require_manager(db, current_user, ev.org_id)
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
                select(CommunityNotification).where(CommunityNotification.event_id == ev.id)
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
    ev.update_date = _utc_str()
    db.add(ev)
    await db.commit()
    await db.refresh(ev)
    return (await _reads(db, [ev], viewer_id, ev.org_id))[0]


async def delete_event(db: AsyncSession, current_user: CurrentUser, event_uuid: str) -> dict:
    ev = await _event_or_404(db, event_uuid)
    await _require_manager(db, current_user, ev.org_id)
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
        raise HTTPException(status_code=422, detail="This online talk has already ended")
    _throttle_or_429(f"batepapo_rsvp:{viewer_id}", 30, 60)
    row = (await db.execute(
        select(CommunityEventRsvp).where(CommunityEventRsvp.event_id == ev.id, CommunityEventRsvp.user_id == viewer_id)
    )).scalars().first()
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
    await _require_manager(db, current_user, ev.org_id)
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


async def event_ics(db: AsyncSession, current_user: CurrentUser, event_uuid: str) -> Tuple[str, str]:
    """(nome do arquivo, conteúdo). O link da reunião só para membros."""
    ev = await _event_or_404(db, event_uuid)
    member = await _is_member(db, _viewer_id(current_user), ev.org_id)
    start, end = event_window(ev)
    desc = []
    if ev.theme:
        desc.append(f"Tema: {ev.theme}")
    if ev.host_name:
        desc.append(f"Quem conduz: {ev.host_name}")
    if ev.passages:
        desc.append(f"Passagens: {ev.passages}")
    if ev.description:
        desc.append(ev.description)
    if member and ev.meeting_url:
        desc.append(f"Entrar: {ev.meeting_url}")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//Discipulei//Bate-papo Online//PT",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{ev.event_uuid}@discipulei",
        f"DTSTAMP:{_ics_dt(utcnow())}",
        f"DTSTART:{_ics_dt(start)}",
        f"DTEND:{_ics_dt(end)}",
        f"SUMMARY:{_ics_escape(ev.title)}",
    ]
    if desc:
        lines.append(f"DESCRIPTION:{_ics_escape(chr(10).join(desc))}")
    if member and ev.meeting_url:
        lines.append(f"LOCATION:{_ics_escape(ev.meeting_url)}")
        lines.append(f"URL:{ev.meeting_url}")
    lines += [
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        f"DESCRIPTION:{_ics_escape(ev.title)}",
        "TRIGGER:-PT15M",
        "END:VALARM",
        "END:VEVENT",
        "END:VCALENDAR",
    ]
    slug = re.sub(r"[^a-z0-9]+", "-", ev.title.lower()).strip("-")[:40] or "bate-papo"
    return f"{slug}.ics", "\r\n".join(_ics_fold(line) for line in lines) + "\r\n"


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
