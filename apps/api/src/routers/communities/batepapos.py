"""Rotas do Bate-papo Online (Bible Talk, N45), montadas em ``/batepapos``.

A agenda é aberta (visitante vê título, tema, data e quem conduz), mas o
link da reunião só vai para membros logados da org, também no ``.ics``.
Criar, editar, apagar e ver a lista de confirmados: admins e grupo de
autores. As regras ficam em ``src/services/communities/batepapos.py``.
"""

from typing import List

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from sqlmodel.ext.asyncio.session import AsyncSession

from src.core.events.database import get_db_session
from src.db.communities.batepapos import AttendeeList, EventCreate, EventRead, EventUpdate, RsvpUpdate
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.communities import batepapos

router = APIRouter()


@router.get("", response_model=List[EventRead], summary="Agenda de bate-papos (próximos ou passados)")
async def api_list_events(
    org_id: int = Query(...),
    quando: str = Query(default="proximos", pattern="^(proximos|passados)$"),
    limit: int = Query(default=20, ge=1, le=50),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    when = "past" if quando == "passados" else "upcoming"
    return await batepapos.list_events(db_session, current_user, org_id, when, limit)


@router.post("", response_model=EventRead, summary="Criar um bate-papo (admins e autores)")
async def api_create_event(
    request: Request,
    data: EventCreate,
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await batepapos.create_event(request, db_session, current_user, org_id, data)


@router.get("/{event_uuid}", response_model=EventRead, summary="Um bate-papo")
async def api_get_event(
    event_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await batepapos.get_event(db_session, current_user, _uuid(event_uuid))


@router.put("/{event_uuid}", response_model=EventRead, summary="Editar um bate-papo (admins e autores)")
async def api_update_event(
    event_uuid: str,
    data: EventUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await batepapos.update_event(db_session, current_user, _uuid(event_uuid), data)


@router.delete("/{event_uuid}", summary="Apagar um bate-papo (admins e autores)")
async def api_delete_event(
    event_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await batepapos.delete_event(db_session, current_user, _uuid(event_uuid))


@router.put("/{event_uuid}/presenca", response_model=EventRead, summary="Vou / Talvez / cancelar")
async def api_rsvp(
    event_uuid: str,
    data: RsvpUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await batepapos.set_rsvp(db_session, current_user, _uuid(event_uuid), data.status)


@router.get("/{event_uuid}/confirmados", response_model=AttendeeList, summary="Quem confirmou (admins e autores)")
async def api_attendees(
    event_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await batepapos.list_attendees(db_session, current_user, _uuid(event_uuid))


@router.get("/{event_uuid}/ics", summary="Arquivo .ics para adicionar à agenda")
async def api_ics(
    event_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    filename, body = await batepapos.event_ics(db_session, current_user, _uuid(event_uuid))
    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # O conteúdo muda conforme quem pede (link só para membros).
            "Cache-Control": "private, no-store",
        },
    )


def _uuid(value: str) -> str:
    """Aceita o uuid com ou sem o prefixo ``event_`` (URLs mais curtas)."""
    return value if value.startswith("event_") else f"event_{value}"
