"""Destaques e favoritos do leitor bíblico (ver src/db/bible_marks.py).

Toda função recebe a pessoa da sessão e só toca nas linhas dela (checagem de
dono pelo ``user_id``): não há id de marca exposto, então não há como pedir a
marca de outra pessoa. Token de API e visitante recebem 403.
"""

from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import func
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.bible_marks import (
    MARK_COLORS,
    MARK_VERSE_MAX,
    MARKS_PER_USER,
    BibleVerseMark,
    MarkListResponse,
    MarkRead,
    MarksUpdate,
)
from src.services.biblia.versoes import CAPITULOS_POR_LIVRO
from src.services.notes.notes import CurrentUser, now_iso, require_user_id

KINDS = ("highlight", "favorite")


def _book_chapter(book: str, chapter: int) -> str:
    livro = (book or "").upper()
    maximo = CAPITULOS_POR_LIVRO.get(livro)
    if not maximo:
        raise HTTPException(status_code=422, detail="Unknown book")
    if not isinstance(chapter, int) or chapter < 1 or chapter > maximo:
        raise HTTPException(status_code=422, detail="Invalid chapter")
    return livro


def _read(m: BibleVerseMark) -> MarkRead:
    return MarkRead(book=m.book, chapter=m.chapter, verse=m.verse, color=m.color, favorite=bool(m.favorite),
                    updated_at=m.updated_at or "")


async def _chapter_rows(db: AsyncSession, user_id: int, book: str, chapter: int) -> List[BibleVerseMark]:
    return list((await db.execute(
        select(BibleVerseMark)
        .where(BibleVerseMark.user_id == user_id, BibleVerseMark.book == book, BibleVerseMark.chapter == chapter)
        .order_by(BibleVerseMark.verse)
    )).scalars().all())


async def list_chapter(db: AsyncSession, current_user: CurrentUser, book: str, chapter: int) -> List[MarkRead]:
    user_id = await require_user_id(current_user)
    book = _book_chapter(book, chapter)
    return [_read(m) for m in await _chapter_rows(db, user_id, book, chapter)]


async def list_marks(db: AsyncSession, current_user: CurrentUser, kind: Optional[str], page: int,
                     limit: int) -> MarkListResponse:
    """"Meus destaques": mais recentes primeiro. ``kind`` filtra destaques ou favoritos."""
    user_id = await require_user_id(current_user)
    if kind is not None and kind not in KINDS:
        raise HTTPException(status_code=422, detail=f"Invalid kind. Allowed: {', '.join(KINDS)}")
    filtros = [BibleVerseMark.user_id == user_id]
    if kind == "highlight":
        filtros.append(BibleVerseMark.color.is_not(None))
    elif kind == "favorite":
        filtros.append(BibleVerseMark.favorite.is_(True))
    total = (await db.execute(select(func.count()).select_from(BibleVerseMark).where(*filtros))).scalar_one()
    rows = (await db.execute(
        select(BibleVerseMark)
        .where(*filtros)
        .order_by(BibleVerseMark.updated_at.desc(), BibleVerseMark.id.desc())
        .offset((page - 1) * limit)
        .limit(limit)
    )).scalars().all()
    return MarkListResponse(items=[_read(m) for m in rows], total=int(total), page=page, limit=limit)


async def update_marks(db: AsyncSession, current_user: CurrentUser, data: MarksUpdate) -> List[MarkRead]:
    """Aplica cor e/ou favorito a vários versículos; devolve as marcas do capítulo."""
    user_id = await require_user_id(current_user)
    book = _book_chapter(data.book, data.chapter)
    if data.color is None and data.favorite is None:
        raise HTTPException(status_code=422, detail="Nothing to change")
    if data.color not in (None, "") and data.color not in MARK_COLORS:
        raise HTTPException(status_code=422, detail=f"Invalid color. Allowed: {', '.join(MARK_COLORS)}")
    verses = sorted(set(data.verses))
    if any(not isinstance(v, int) or v < 1 or v > MARK_VERSE_MAX for v in verses):
        raise HTTPException(status_code=422, detail="Invalid verse")

    existentes = {m.verse: m for m in await _chapter_rows(db, user_id, book, data.chapter)}
    novos = [v for v in verses if v not in existentes]
    cria = bool(data.color) or data.favorite is True
    if novos and cria:
        total = (await db.execute(
            select(func.count()).select_from(BibleVerseMark).where(BibleVerseMark.user_id == user_id)
        )).scalar_one()
        if total + len(novos) > MARKS_PER_USER:
            raise HTTPException(status_code=409, detail=f"Mark limit reached ({MARKS_PER_USER})")

    now = now_iso()
    for v in verses:
        m = existentes.get(v)
        if m is None:
            if not cria:
                continue  # tirar o que não existe: nada a fazer
            m = BibleVerseMark(user_id=user_id, book=book, chapter=data.chapter, verse=v, color=None,
                               favorite=False, created_at=now, updated_at=now)
        if data.color is not None:
            m.color = data.color or None
        if data.favorite is not None:
            m.favorite = data.favorite
        m.updated_at = now
        if not m.color and not m.favorite:
            if m.id is not None:
                await db.delete(m)
            continue
        db.add(m)
    await db.commit()
    return [_read(m) for m in await _chapter_rows(db, user_id, book, data.chapter)]
