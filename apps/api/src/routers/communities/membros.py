"""Rotas da comunidade v5 (24/11/2026): WhatsApp na entrada (N42),
configurações da org e grupo de autores (N45), salvos e compartilhar (N44).

Montadas em ``/social`` junto com o social contido. Toda rota com dados de
pessoa exige sessão e checa a org no service; a única rota aberta é a prévia
de um post compartilhável (``/social/compartilhado/{uuid}``), que devolve 404
para tudo o que não pode sair da comunidade.
"""

from typing import List

from fastapi import APIRouter, Depends, Query, Request
from sqlmodel.ext.asyncio.session import AsyncSession

from src.core.events.database import get_db_session
from src.db.communities.membros import (
    CommunityConfigRead,
    MemberWhatsappAdminRead,
    MyWhatsappRead,
    MyWhatsappUpdate,
    OrgSettingsRead,
    OrgSettingsUpdate,
    SharedPostRead,
    ShareToggle,
)
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.communities import membros

router = APIRouter()


@router.get("/config", response_model=CommunityConfigRead, summary="O que a interface precisa saber (autor, links)")
async def api_config(
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await membros.get_config(db_session, current_user, org_id)


@router.get("/whatsapp", response_model=MyWhatsappRead, summary="Meu grupo do WhatsApp (só eu e admins vemos)")
async def api_get_my_whatsapp(
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await membros.get_my_whatsapp(db_session, current_user, org_id)


@router.put("/whatsapp", response_model=MyWhatsappRead, summary="Escolher o grupo do WhatsApp ou 'Agora não'")
async def api_update_my_whatsapp(
    data: MyWhatsappUpdate,
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await membros.update_my_whatsapp(db_session, current_user, org_id, data)


@router.get("/admin/settings", response_model=OrgSettingsRead, summary="Configurações da comunidade (admin)")
async def api_get_org_settings(
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await membros.get_org_settings(db_session, current_user, org_id)


@router.put("/admin/settings", response_model=OrgSettingsRead, summary="Atualizar grupo de autores e links (admin)")
async def api_update_org_settings(
    data: OrgSettingsUpdate,
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await membros.update_org_settings(db_session, current_user, org_id, data)


@router.get(
    "/admin/whatsapp", response_model=List[MemberWhatsappAdminRead],
    summary="Escolhas de grupo do WhatsApp, com sugestão de grupo de usuários (admin)",
)
async def api_admin_whatsapp(
    org_id: int = Query(...),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await membros.list_members_whatsapp(db_session, current_user, org_id, page, limit)


@router.get("/salvos", summary="Meus posts salvos (privado)")
async def api_list_saved(
    request: Request,
    org_id: int = Query(...),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await membros.list_saved(request, db_session, current_user, org_id, page, limit)


@router.put("/discussions/{discussion_uuid}/salvo", summary="Salvar um post")
async def api_save(
    request: Request,
    discussion_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await membros.set_saved(request, db_session, current_user, discussion_uuid, True)


@router.delete("/discussions/{discussion_uuid}/salvo", summary="Tirar um post dos salvos")
async def api_unsave(
    request: Request,
    discussion_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await membros.set_saved(request, db_session, current_user, discussion_uuid, False)


@router.put("/discussions/{discussion_uuid}/compartilhamento", summary="Ligar/desligar o compartilhamento (autor)")
async def api_share_toggle(
    request: Request,
    discussion_uuid: str,
    data: ShareToggle,
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await membros.set_share_enabled(request, db_session, current_user, discussion_uuid, data.enabled)


@router.get(
    "/compartilhado/{discussion_uuid}", response_model=SharedPostRead,
    summary="Prévia pública de um post compartilhável (sem login)",
)
async def api_shared_post(
    request: Request,
    discussion_uuid: str,
    org_id: int = Query(...),
    db_session: AsyncSession = Depends(get_db_session),
):
    ip = request.client.host if request.client else "anon"
    membros._throttle_or_429(f"shared_post:{ip}", 120, 60)
    return await membros.get_shared_post(db_session, org_id, discussion_uuid)
