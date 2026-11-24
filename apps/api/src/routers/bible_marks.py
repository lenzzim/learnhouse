"""Destaques e favoritos do leitor bíblico — /api/v1/biblia/marcas.

    GET  /biblia/marcas?livro=JHN&capitulo=3     marcas de um capítulo
    GET  /biblia/marcas/lista?tipo=&page=&limit= "Meus destaques" (mais recentes primeiro)
    PUT  /biblia/marcas                          cor e/ou favorito em vários versículos

Só a própria pessoa logada (sessão): tokens de API e visitantes recebem 403.
As marcas são por livro, capítulo e versículo, independentes da versão.
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel.ext.asyncio.session import AsyncSession

from src.core.events.database import get_db_session
from src.db.bible_marks import MarkListResponse, MarkRead, MarksUpdate
from src.security.auth import get_current_user
from src.services import bible_marks as svc

router = APIRouter()


@router.get("", response_model=List[MarkRead], summary="My highlights and favorites in a chapter")
async def api_list_chapter(
    livro: str = Query(..., min_length=3, max_length=3),
    capitulo: int = Query(..., ge=1, le=150),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    return await svc.list_chapter(db, current_user, livro, capitulo)


@router.get("/lista", response_model=MarkListResponse, summary="List my highlights and favorites")
async def api_list_marks(
    tipo: Optional[str] = Query(default=None, description="highlight | favorite"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=100),
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    return await svc.list_marks(db, current_user, tipo, page, limit)


@router.put("", response_model=List[MarkRead], summary="Highlight, favorite or clear verses")
async def api_update_marks(
    body: MarksUpdate,
    current_user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    return await svc.update_marks(db, current_user, body)
