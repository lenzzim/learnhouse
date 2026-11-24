"""Rotas da Agenda de eventos (antes "Bate-papo Online", N45).

Montadas em ``/agenda`` e, por compatibilidade, também em ``/batepapos``.

A agenda é aberta (visitante vê título, tipo, região, cidade, data e quem
organiza), mas o endereço exato e o link online só vão para quem respondeu
"Vou", para quem criou e para admins/Equipe, também no ``.ics``. As regras
ficam em ``src/services/communities/batepapos.py`` e ``agenda.py``.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import Response
from sqlmodel.ext.asyncio.session import AsyncSession

from src.core.events.database import get_db_session
from src.db.communities.batepapos import (
    AgendaPrefsRead,
    AgendaPrefsUpdate,
    AgendaSettingsRead,
    AgendaSettingsUpdate,
    AttendeeList,
    EventCreate,
    EventRead,
    EventUpdate,
    FeedTokenRead,
    RegionRead,
    RsvpUpdate,
)
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.communities import agenda, batepapos

router = APIRouter()


def _ics_response(filename: str, body: str) -> Response:
    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            # O conteúdo muda conforme quem pede (endereço/link só para inscritos).
            "Cache-Control": "private, no-store",
        },
    )


@router.get("", response_model=List[EventRead], summary="Agenda (próximos, passados ou um intervalo)")
async def api_list_events(
    org_id: int = Query(...),
    quando: str = Query(default="proximos", pattern="^(proximos|passados)$"),
    limit: int = Query(default=20, ge=1, le=300),
    regiao: Optional[str] = Query(default=None, max_length=80),
    tipo: Optional[str] = Query(default=None, max_length=20),
    de: Optional[str] = Query(default=None, max_length=40, description="Início do intervalo (ISO)"),
    ate: Optional[str] = Query(default=None, max_length=40, description="Fim do intervalo (ISO, exclusivo)"),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    when = "past" if quando == "passados" else "upcoming"
    return await batepapos.list_events(
        db_session, current_user, org_id, when, limit, region_uuid=regiao, kind=tipo, start=de, end=ate
    )


@router.post("", response_model=EventRead, summary="Criar um evento (organizadores, Equipe e admins)")
async def api_create_event(
    request: Request,
    data: EventCreate,
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await batepapos.create_event(request, db_session, current_user, org_id, data)


# --- Regiões e painel (antes de /{event_uuid}) --------------------------------


@router.get("/regioes", response_model=List[RegionRead], summary="Regiões ativas da agenda (público)")
async def api_regions(
    org_id: int = Query(...),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await batepapos.list_regions(db_session, org_id)


@router.get("/admin/config", response_model=AgendaSettingsRead, summary="Configuração da agenda (admins)")
async def api_admin_settings(
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await agenda.get_settings(db_session, current_user, org_id)


@router.put("/admin/config", response_model=AgendaSettingsRead, summary="Salvar grupo de organizadores e regiões")
async def api_admin_update_settings(
    data: AgendaSettingsUpdate,
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await agenda.update_settings(db_session, current_user, org_id, data)


# --- Minha agenda: preferências e feed pessoal -----------------------------------


@router.get("/preferencias", response_model=AgendaPrefsRead, summary="Minhas preferências da agenda")
async def api_prefs(
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await agenda.get_prefs(db_session, current_user, org_id)


@router.put("/preferencias", response_model=AgendaPrefsRead, summary="Lembretes por e-mail (liga/desliga)")
async def api_update_prefs(
    data: AgendaPrefsUpdate,
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await agenda.update_prefs(db_session, current_user, org_id, data)


@router.post("/feed", response_model=FeedTokenRead, summary="Gerar (ou trocar) o link secreto do feed pessoal")
async def api_rotate_feed(
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await agenda.rotate_feed(db_session, current_user, org_id)


@router.delete("/feed", response_model=AgendaPrefsRead, summary="Desligar o feed pessoal (o link para de funcionar)")
async def api_revoke_feed(
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await agenda.revoke_feed(db_session, current_user, org_id)


@router.get("/feed/{token}.ics", summary="Feed ICS pessoal (assinatura no Google/Apple)")
async def api_feed(token: str, db_session: AsyncSession = Depends(get_db_session)):
    body = await batepapos.feed_ics(db_session, token, _frontend_base())
    return Response(
        content=body,
        media_type="text/calendar; charset=utf-8",
        headers={"Cache-Control": "private, max-age=900", "X-Robots-Tag": "noindex"},
    )


def _frontend_base() -> str:
    try:
        from config.config import get_learnhouse_config

        cfg = get_learnhouse_config().hosting_config
        dom = (getattr(cfg, "frontend_domain", "") or "").strip().rstrip("/")
        if not dom:
            return ""
        if "://" in dom:
            return dom
        return f"{'https' if getattr(cfg, 'ssl', False) else 'http'}://{dom}"
    except Exception:
        return ""


# --- Um evento -------------------------------------------------------------------


@router.get("/{event_uuid}", response_model=EventRead, summary="Um evento")
async def api_get_event(
    event_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await batepapos.get_event(db_session, current_user, _uuid(event_uuid))


@router.put("/{event_uuid}", response_model=EventRead, summary="Editar um evento (quem criou, Equipe e admins)")
async def api_update_event(
    event_uuid: str,
    data: EventUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await batepapos.update_event(db_session, current_user, _uuid(event_uuid), data)


@router.post("/{event_uuid}/cancelar", response_model=EventRead, summary="Cancelar um evento (avisa os inscritos)")
async def api_cancel_event(
    event_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await batepapos.cancel_event(db_session, current_user, _uuid(event_uuid))


@router.delete("/{event_uuid}", summary="Apagar um evento (quem criou, Equipe e admins)")
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


@router.get("/{event_uuid}/confirmados", response_model=AttendeeList, summary="Quem confirmou (quem gerencia)")
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
    return _ics_response(filename, body)


def _uuid(value: str) -> str:
    """Aceita o uuid com ou sem o prefixo ``event_`` (URLs mais curtas)."""
    return value if value.startswith("event_") else f"event_{value}"
