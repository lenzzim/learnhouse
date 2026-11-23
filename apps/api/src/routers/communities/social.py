"""Rotas do "social contido" (decisão N39): Pessoas, seguir, menções,
notificações, reações "Amém"/"Orando" e resposta útil.

Toda rota exige sessão de pessoa e checa org e leitura no service
(``src/services/communities/social.py``). Nenhuma resposta traz e-mail.
"""

from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Query, Request
from sqlmodel.ext.asyncio.session import AsyncSession

from src.core.events.database import get_db_session
from src.db.communities.social import (
    AcceptedAnswerUpdate,
    FaithReactionsRead,
    MentionCandidate,
    MyProfileRead,
    NotificationRead,
    PersonRead,
    ProfileUpdate,
)
from src.db.users import PublicUser
from src.security.auth import get_current_user
from src.services.communities import social

router = APIRouter()


@router.get("/profile", response_model=MyProfileRead, summary="Meu perfil na página Pessoas")
async def api_get_my_profile(
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await social.get_my_profile(db_session, current_user, org_id)


@router.put("/profile", response_model=MyProfileRead, summary="Atualizar meu perfil (aparecer em Pessoas, bio)")
async def api_update_my_profile(
    data: ProfileUpdate,
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await social.update_my_profile(db_session, current_user, org_id, data)


@router.get("/people", response_model=List[PersonRead], summary="Página Pessoas")
async def api_list_people(
    org_id: int = Query(...),
    q: Optional[str] = Query(default=None, max_length=60),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=30, ge=1, le=50),
    following: bool = Query(default=False),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await social.list_people(db_session, current_user, org_id, q, page, limit, following)


@router.get("/people/{user_uuid}", response_model=PersonRead, summary="Perfil de uma pessoa")
async def api_get_person(
    user_uuid: str,
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await social.get_person(db_session, current_user, org_id, user_uuid)


@router.get("/people/{user_uuid}/discussions", summary="Posts públicos de uma pessoa que eu posso ler")
async def api_get_person_discussions(
    request: Request,
    user_uuid: str,
    org_id: int = Query(...),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
) -> List[Dict]:
    return await social.get_person_discussions(request, db_session, current_user, org_id, user_uuid, page, limit)


@router.post("/people/{user_uuid}/follow", response_model=PersonRead, summary="Seguir uma pessoa")
async def api_follow(
    user_uuid: str,
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await social.follow_person(db_session, current_user, org_id, user_uuid)


@router.delete("/people/{user_uuid}/follow", summary="Deixar de seguir")
async def api_unfollow(
    user_uuid: str,
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
) -> dict:
    return await social.unfollow_person(db_session, current_user, org_id, user_uuid)


@router.get("/feed/following", summary="Posts de pessoas que sigo")
async def api_following_feed(
    request: Request,
    org_id: int = Query(...),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=20, ge=1, le=50),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
) -> List[Dict]:
    return await social.get_following_feed(request, db_session, current_user, org_id, page, limit)


@router.get("/mentionable", response_model=List[MentionCandidate], summary="Quem posso mencionar neste espaço")
async def api_mentionable(
    request: Request,
    community_uuid: str = Query(..., max_length=100),
    q: str = Query(default="", max_length=40),
    discussion_uuid: Optional[str] = Query(default=None, max_length=100),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await social.mention_candidates(request, db_session, current_user, community_uuid, q, discussion_uuid)


@router.get("/notifications", response_model=List[NotificationRead], summary="Minhas notificações")
async def api_notifications(
    request: Request,
    org_id: int = Query(...),
    limit: int = Query(default=30, ge=1, le=50),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await social.list_notifications(request, db_session, current_user, org_id, limit)


@router.get("/notifications/unread", summary="Quantas notificações não lidas")
async def api_notifications_unread(
    request: Request,
    org_id: int = Query(...),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
) -> dict:
    return {"count": await social.unread_count(request, db_session, current_user, org_id)}


@router.post("/notifications/read", summary="Marcar notificações como lidas")
async def api_notifications_read(
    org_id: int = Query(...),
    notification_uuid: Optional[str] = Query(default=None, max_length=100),
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
) -> dict:
    return await social.mark_notifications_read(db_session, current_user, org_id, notification_uuid)


@router.get("/discussions/{discussion_uuid}/reacoes", response_model=FaithReactionsRead,
            summary="Amém e Orando no post e nos comentários")
async def api_get_faith_reactions(
    request: Request,
    discussion_uuid: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
):
    return await social.get_faith_reactions(request, db_session, current_user, discussion_uuid)


@router.post("/discussions/{discussion_uuid}/reacoes/{kind}", summary="Alternar Amém/Orando no post")
async def api_toggle_discussion_faith_reaction(
    request: Request,
    discussion_uuid: str,
    kind: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
) -> dict:
    return await social.toggle_discussion_faith_reaction(request, db_session, current_user, discussion_uuid, kind)


@router.post("/comments/{comment_uuid}/reacoes/{kind}", summary="Alternar Amém/Orando num comentário")
async def api_toggle_comment_faith_reaction(
    request: Request,
    comment_uuid: str,
    kind: str,
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
) -> dict:
    return await social.toggle_comment_faith_reaction(request, db_session, current_user, comment_uuid, kind)


@router.put("/discussions/{discussion_uuid}/resposta-util", summary="Marcar (ou desmarcar) a resposta útil")
async def api_set_accepted_answer(
    request: Request,
    discussion_uuid: str,
    data: AcceptedAnswerUpdate,
    current_user: PublicUser = Depends(get_current_user),
    db_session: AsyncSession = Depends(get_db_session),
) -> dict:
    return await social.set_accepted_answer(request, db_session, current_user, discussion_uuid, data.comment_uuid)
