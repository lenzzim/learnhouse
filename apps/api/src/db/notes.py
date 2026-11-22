"""Caderno Bíblico: notas pessoais, separadas das discussions.

Toda nota pertence a UMA pessoa (``user_id``) dentro de uma org. Nenhum papel
(admin, moderador) lê notas de outra pessoa — fé é dado sensível (LGPD art.
11). O compartilhamento é por token (``note_share``, guardado só como hash) ou
por cópia publicada numa comunidade (``published_discussion_id``).

Datas são strings ISO-8601 em UTC (convenção do repo); ``tcd_date`` é
``YYYY-MM-DD`` e só existe nas notas do tipo TCD (Tempo com Deus).
"""

from typing import List, Optional

from pydantic import BaseModel
from sqlalchemy import (
    Column,
    ForeignKey,
    Index,
    Integer,
    PrimaryKeyConstraint,
    String,
    Text,
    UniqueConstraint,
)
from sqlmodel import Field, SQLModel


NOTE_KIND_NOTE = "note"
NOTE_KIND_TCD = "tcd"
NOTE_KIND_STUDY = "study"
NOTE_KINDS = (NOTE_KIND_NOTE, NOTE_KIND_TCD, NOTE_KIND_STUDY)

NOTE_VISIBILITY_PRIVATE = "private"
NOTE_VISIBILITY_LINK = "link"
NOTE_VISIBILITY_COMMUNITY = "community"

SHARE_SCOPE_ANYONE = "anyone_with_link"
SHARE_SCOPE_MEMBERS = "members"
SHARE_SCOPES = (SHARE_SCOPE_ANYONE, SHARE_SCOPE_MEMBERS)

TITLE_MAX = 300
CONTENT_MAX = 1_000_000


class NoteCollection(SQLModel, table=True):
    __tablename__ = "note_collection"
    __table_args__ = (Index("ix_note_collection_user_org", "user_id", "org_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    collection_uuid: str = Field(sa_column=Column(String(64), nullable=False, unique=True, index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False))
    name: str = Field(sa_column=Column(String(200), nullable=False))
    parent_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("note_collection.id", ondelete="SET NULL"), nullable=True),
    )
    position: int = Field(default=0, sa_column=Column(Integer, nullable=False, default=0, server_default="0"))
    created_at: str = Field(default="", sa_column=Column(String(40), nullable=False, default=""))
    updated_at: str = Field(default="", sa_column=Column(String(40), nullable=False, default=""))


class Note(SQLModel, table=True):
    __tablename__ = "note"
    __table_args__ = (
        UniqueConstraint("user_id", "org_id", "tcd_date", name="uq_note_user_org_tcd_date"),
        Index("ix_note_user_org_deleted", "user_id", "org_id", "deleted_at"),
        Index("ix_note_user_org_updated", "user_id", "org_id", "updated_at"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    note_uuid: str = Field(sa_column=Column(String(64), nullable=False, unique=True, index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False))
    title: str = Field(default="", sa_column=Column(String(TITLE_MAX), nullable=False, default=""))
    content_json: str = Field(default="", sa_column=Column(Text, nullable=False, default=""))
    content_text: str = Field(default="", sa_column=Column(Text, nullable=False, default=""))
    kind: str = Field(
        default=NOTE_KIND_NOTE,
        sa_column=Column(String(10), nullable=False, default=NOTE_KIND_NOTE, server_default=NOTE_KIND_NOTE),
    )
    tcd_date: Optional[str] = Field(default=None, sa_column=Column(String(10), nullable=True))
    collection_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("note_collection.id", ondelete="SET NULL"), nullable=True),
    )
    visibility: str = Field(
        default=NOTE_VISIBILITY_PRIVATE,
        sa_column=Column(
            String(12), nullable=False, default=NOTE_VISIBILITY_PRIVATE, server_default=NOTE_VISIBILITY_PRIVATE
        ),
    )
    published_discussion_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("discussion.id", ondelete="SET NULL"), nullable=True),
    )
    legacy_discussion_id: Optional[int] = Field(default=None, sa_column=Column(Integer, nullable=True))
    created_at: str = Field(default="", sa_column=Column(String(40), nullable=False, default=""))
    updated_at: str = Field(default="", sa_column=Column(String(40), nullable=False, default=""))
    deleted_at: Optional[str] = Field(default=None, sa_column=Column(String(40), nullable=True))


class NoteTag(SQLModel, table=True):
    __tablename__ = "note_tag"
    __table_args__ = (UniqueConstraint("user_id", "org_id", "name_lower", name="uq_note_tag_user_org_name"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    tag_uuid: str = Field(sa_column=Column(String(64), nullable=False, unique=True, index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False))
    name: str = Field(sa_column=Column(String(60), nullable=False))
    name_lower: str = Field(sa_column=Column(String(60), nullable=False))


class NoteTagMap(SQLModel, table=True):
    __tablename__ = "note_tag_map"
    __table_args__ = (PrimaryKeyConstraint("note_id", "tag_id", name="pk_note_tag_map"),)

    note_id: int = Field(sa_column=Column(Integer, ForeignKey("note.id", ondelete="CASCADE"), nullable=False))
    tag_id: int = Field(
        sa_column=Column(Integer, ForeignKey("note_tag.id", ondelete="CASCADE"), nullable=False, index=True)
    )


class NoteLink(SQLModel, table=True):
    __tablename__ = "note_link"
    __table_args__ = (Index("ix_note_link_target_title", "target_title_lower"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    source_note_id: int = Field(
        sa_column=Column(Integer, ForeignKey("note.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    target_note_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("note.id", ondelete="SET NULL"), nullable=True, index=True),
    )
    target_title: str = Field(sa_column=Column(String(TITLE_MAX), nullable=False))
    target_title_lower: str = Field(sa_column=Column(String(TITLE_MAX), nullable=False))


class NoteBibleRef(SQLModel, table=True):
    __tablename__ = "note_bible_ref"
    __table_args__ = (Index("ix_note_bible_ref_book_chapter", "book", "chapter"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    note_id: int = Field(
        sa_column=Column(Integer, ForeignKey("note.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    book: str = Field(sa_column=Column(String(3), nullable=False))
    chapter: int = Field(sa_column=Column(Integer, nullable=False))
    verse_start: Optional[int] = Field(default=None, sa_column=Column(Integer, nullable=True))
    verse_end: Optional[int] = Field(default=None, sa_column=Column(Integer, nullable=True))


class NoteShare(SQLModel, table=True):
    __tablename__ = "note_share"

    id: Optional[int] = Field(default=None, primary_key=True)
    share_uuid: str = Field(sa_column=Column(String(64), nullable=False, unique=True, index=True))
    note_id: int = Field(
        sa_column=Column(Integer, ForeignKey("note.id", ondelete="CASCADE"), nullable=False, index=True)
    )
    token_hash: str = Field(sa_column=Column(String(64), nullable=False, unique=True, index=True))
    scope: str = Field(sa_column=Column(String(20), nullable=False))
    created_by: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    created_at: str = Field(default="", sa_column=Column(String(40), nullable=False, default=""))
    expires_at: Optional[str] = Field(default=None, sa_column=Column(String(40), nullable=True))
    revoked_at: Optional[str] = Field(default=None, sa_column=Column(String(40), nullable=True))


TEMPLATE_NAME_MAX = 120
TEMPLATES_PER_USER_ORG = 100


class NoteTemplate(SQLModel, table=True):
    """Modelo de nota salvo pela pessoa (privado ao dono, como as notas)."""

    __tablename__ = "note_template"
    __table_args__ = (Index("ix_note_template_user_org", "user_id", "org_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    template_uuid: str = Field(sa_column=Column(String(64), nullable=False, unique=True, index=True))
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    org_id: int = Field(sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False))
    name: str = Field(sa_column=Column(String(TEMPLATE_NAME_MAX), nullable=False))
    content_json: str = Field(default="", sa_column=Column(Text, nullable=False, default=""))
    kind: Optional[str] = Field(default=None, sa_column=Column(String(10), nullable=True))
    created_at: str = Field(default="", sa_column=Column(String(40), nullable=False, default=""))
    updated_at: str = Field(default="", sa_column=Column(String(40), nullable=False, default=""))


# ---------------------------------------------------------------------------
# Esquemas de entrada/saída
# ---------------------------------------------------------------------------


class BibleRefIn(BaseModel):
    book: str
    chapter: int
    verse_start: Optional[int] = None
    verse_end: Optional[int] = None


class BibleRefOut(BaseModel):
    book: str
    chapter: int
    verse_start: Optional[int] = None
    verse_end: Optional[int] = None


class NoteLinkOut(BaseModel):
    target_title: str
    target_note_uuid: Optional[str] = None


class NoteSummary(BaseModel):
    note_uuid: str
    title: str
    kind: str
    tcd_date: Optional[str] = None
    collection_uuid: Optional[str] = None
    visibility: str
    excerpt: str = ""
    tags: List[str] = []
    created_at: str
    updated_at: str
    deleted_at: Optional[str] = None


class NoteRead(BaseModel):
    note_uuid: str
    org_id: int
    title: str
    content_json: str
    kind: str
    tcd_date: Optional[str] = None
    collection_uuid: Optional[str] = None
    visibility: str
    tags: List[str] = []
    links: List[NoteLinkOut] = []
    bible_refs: List[BibleRefOut] = []
    published_discussion_uuid: Optional[str] = None
    published_community_uuid: Optional[str] = None
    created_at: str
    updated_at: str
    deleted_at: Optional[str] = None


class NoteListResponse(BaseModel):
    items: List[NoteSummary]
    total: int
    page: int
    limit: int


class NoteCreate(BaseModel):
    org_id: int
    title: str = ""
    content_json: str = ""
    kind: str = NOTE_KIND_NOTE
    collection_uuid: Optional[str] = None
    bible_refs: Optional[List[BibleRefIn]] = None


class NoteUpdate(BaseModel):
    title: Optional[str] = None
    content_json: Optional[str] = None
    collection_uuid: Optional[str] = None
    bible_refs: Optional[List[BibleRefIn]] = None


class TcdRequest(BaseModel):
    org_id: int
    date: str


class TcdCalendar(BaseModel):
    dates: List[str]
    streak: int


class CollectionRead(BaseModel):
    collection_uuid: str
    name: str
    parent_uuid: Optional[str] = None
    position: int = 0
    note_count: int = 0


class CollectionCreate(BaseModel):
    org_id: int
    name: str
    parent_uuid: Optional[str] = None


class CollectionUpdate(BaseModel):
    name: Optional[str] = None
    parent_uuid: Optional[str] = None
    position: Optional[int] = None


class TagRead(BaseModel):
    tag_uuid: str
    name: str
    count: int = 0


class TagRename(BaseModel):
    name: str


class ShareCreate(BaseModel):
    scope: str = SHARE_SCOPE_ANYONE
    expires_in_days: Optional[int] = None


class ShareRead(BaseModel):
    share_uuid: str
    scope: str
    created_at: str
    expires_at: Optional[str] = None


class ShareCreated(ShareRead):
    token: str


class SharedNoteRead(BaseModel):
    title: str
    content_json: str
    kind: str
    tcd_date: Optional[str] = None
    updated_at: str
    author_name: str = ""
    scope: str


class PublishRequest(BaseModel):
    community_uuid: str
    label: Optional[str] = None


class PublishResult(BaseModel):
    discussion_uuid: str
    community_uuid: str


class MigrateLegacyResult(BaseModel):
    copied: int


class TemplateRead(BaseModel):
    template_uuid: str
    name: str
    kind: Optional[str] = None
    content_json: str
    created_at: str
    updated_at: str


class TemplateCreate(BaseModel):
    org_id: int
    name: str
    content_json: str = ""
    kind: Optional[str] = None


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    content_json: Optional[str] = None
    kind: Optional[str] = None
