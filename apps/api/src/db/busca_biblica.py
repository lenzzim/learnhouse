"""Tabelas da busca bíblica (migração e3a4b5c6d7e8).

- ``discussion_bible_ref``: passagens citadas em cada discussão (título +
  corpo), extraídas pelo servidor com as mesmas regras do Caderno
  (services/biblia/referencias.py). Capítulo inteiro = versos nulos; um
  versículo = ``verse_start == verse_end``. Preenchida ao criar/editar a
  discussão; as antigas entram pelo comando ``indexar-referencias-discussoes``.
  A leitura SEMPRE passa pelas regras da discussão (comunidade legível,
  visibilidade): a tabela é só um índice, nunca uma fonte de conteúdo.
- ``bible_verse``: versículos das versões ABERTAS (BLIVRE, ONBV, BPM, KJV,
  WEB, RV1909, VBL), lidos dos JSON estáticos do front pelo comando
  ``indexar-biblia``. Texto licenciado (NVI, ARA...) nunca entra aqui. No
  PostgreSQL há ainda a coluna ``tsv`` (tsvector com o dicionário do idioma +
  unaccent) e o índice GIN; ela não é declarada no modelo para que o SQLite
  dos testes funcione com ``create_all`` (lá a busca cai no LIKE).
"""

from typing import Optional

from sqlalchemy import Column, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlmodel import Field, SQLModel

# a FK de discussion_bible_ref precisa da tabela discussion no mesmo metadata
import src.db.communities.discussions  # noqa: F401,E402


class DiscussionBibleRef(SQLModel, table=True):
    __tablename__ = "discussion_bible_ref"
    __table_args__ = (
        Index("ix_discussion_bible_ref_passagem", "book", "chapter", "verse_start", "verse_end"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    discussion_id: int = Field(
        sa_column=Column(
            Integer, ForeignKey("discussion.id", ondelete="CASCADE"), nullable=False, index=True
        )
    )
    org_id: int = Field(sa_column=Column(Integer, nullable=False))
    book: str = Field(sa_column=Column(String(3), nullable=False))
    chapter: int = Field(sa_column=Column(Integer, nullable=False))
    verse_start: Optional[int] = Field(default=None, sa_column=Column(Integer, nullable=True))
    verse_end: Optional[int] = Field(default=None, sa_column=Column(Integer, nullable=True))
    # o trecho como aparece no post ("1Pe 1:3"), para destacar no resultado
    trecho: str = Field(default="", sa_column=Column(String(80), nullable=False, server_default=""))


class BibleVerse(SQLModel, table=True):
    __tablename__ = "bible_verse"
    __table_args__ = (
        UniqueConstraint("version", "book", "chapter", "verse", name="uq_bible_verse_ref"),
        Index("ix_bible_verse_ordem", "version", "book_order", "chapter", "verse"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    version: str = Field(sa_column=Column(String(12), nullable=False))
    book: str = Field(sa_column=Column(String(3), nullable=False))
    # posição canônica do livro (0 = Gênesis ... 65 = Apocalipse): ordena e
    # filtra por testamento (AT < 39) sem tabela auxiliar
    book_order: int = Field(sa_column=Column(Integer, nullable=False))
    chapter: int = Field(sa_column=Column(Integer, nullable=False))
    verse: int = Field(sa_column=Column(Integer, nullable=False))
    text: str = Field(sa_column=Column(Text, nullable=False))
