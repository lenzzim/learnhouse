"""Destaques e favoritos do leitor bíblico (P0 do plano do leitor, itens 1 e 2).

Uma linha por versículo marcado de uma pessoa: o tom do destaque (um dos 4
da paleta do Caderno) e/ou a estrela de favorito. A marca é por livro
(USFM), capítulo e versículo — **independente da versão**: destacar João
3:16 na NVI aparece também na BLIVRE, na ARA etc.

Privado ao dono, como as notas: toda consulta filtra pelo ``user_id`` da
sessão; ninguém (admin incluído) lê as marcas de outra pessoa. Nada de texto
bíblico é guardado aqui (só a posição), então as regras das licenciadas não
se aplicam. Linha sem cor e sem favorito é apagada.

Datas em ISO-8601 UTC (convenção do repo).
"""

from typing import List, Optional

from pydantic import BaseModel, Field as PField
from sqlalchemy import Boolean, Column, ForeignKey, Index, Integer, String, UniqueConstraint, false
from sqlmodel import Field, SQLModel


MARK_COLORS = ("verde", "azul", "rosa", "grafite")
MARK_BOOK_MAX = 3
MARK_VERSE_MAX = 200  # o maior capítulo (Sl 119) tem 176
MARKS_PER_REQUEST = 200
MARKS_PER_USER = 20_000


class BibleVerseMark(SQLModel, table=True):
    __tablename__ = "bible_verse_mark"
    __table_args__ = (
        UniqueConstraint("user_id", "book", "chapter", "verse", name="uq_bible_verse_mark"),
        Index("ix_bible_verse_mark_user_chapter", "user_id", "book", "chapter"),
        Index("ix_bible_verse_mark_user_updated", "user_id", "updated_at"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    book: str = Field(sa_column=Column(String(MARK_BOOK_MAX), nullable=False))
    chapter: int = Field(sa_column=Column(Integer, nullable=False))
    verse: int = Field(sa_column=Column(Integer, nullable=False))
    color: Optional[str] = Field(default=None, sa_column=Column(String(12), nullable=True))
    favorite: bool = Field(
        default=False, sa_column=Column(Boolean, nullable=False, default=False, server_default=false())
    )
    created_at: str = Field(default="", sa_column=Column(String(40), nullable=False, default=""))
    updated_at: str = Field(default="", sa_column=Column(String(40), nullable=False, default=""))


# --- API -------------------------------------------------------------------


class MarkRead(BaseModel):
    book: str
    chapter: int
    verse: int
    color: Optional[str] = None
    favorite: bool = False
    updated_at: str = ""


class MarksUpdate(BaseModel):
    """Aplica a mesma mudança a vários versículos de um capítulo.

    ``color``: um tom da paleta, ``""`` para tirar o destaque, ausente (null)
    para não mexer. ``favorite``: true/false, ausente para não mexer.
    """

    book: str
    chapter: int
    verses: List[int] = PField(min_length=1, max_length=MARKS_PER_REQUEST)
    color: Optional[str] = None
    favorite: Optional[bool] = None


class MarkListResponse(BaseModel):
    items: List[MarkRead]
    total: int
    page: int
    limit: int
