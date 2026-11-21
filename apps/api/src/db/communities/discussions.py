from typing import Optional
from sqlalchemy import Column, ForeignKey, Integer, Text, Boolean, String, Index
from sqlmodel import Field, SQLModel
from src.db.users import UserReadAuthor


# Available discussion labels
# Discipulei: categorias do fórum devocional (espelha DISCUSSION_LABELS em
# apps/web/services/communities/discussions.ts). Só estas são oferecidas.
DISCUSSION_LABELS = [
    {"id": "devocional", "name": "Devocional", "color": "#8fb8ea", "icon": "BookOpen"},
    {"id": "testemunho", "name": "Testemunho", "color": "#b9a6ec", "icon": "Sparkles"},
    {"id": "oracao", "name": "Pedido de oração", "color": "#e5978f", "icon": "HandHeart"},
    {"id": "question", "name": "Pergunta", "color": "#a3a19c", "icon": "HelpCircle"},
    {"id": "announcement", "name": "Aviso", "color": "#8a877f", "icon": "Megaphone"},
    {"id": "general", "name": "Geral", "color": "#7d7b75", "icon": "MessageSquare"},
]

# Rótulos do upstream que não são mais oferecidos, mas continuam válidos para
# que posts antigos (e edições deles) não sejam reclassificados como "general".
LEGACY_DISCUSSION_LABELS = [
    {"id": "idea", "name": "Ideas", "color": "#a3a19c", "icon": "Lightbulb"},
    {"id": "showcase", "name": "Show and Tell", "color": "#a3a19c", "icon": "Star"},
]

# Caderno privado (decisão N30): 'private' = só o autor vê.
DISCUSSION_VISIBILITY_PUBLIC = "public"
DISCUSSION_VISIBILITY_PRIVATE = "private"
DISCUSSION_VISIBILITIES = (DISCUSSION_VISIBILITY_PUBLIC, DISCUSSION_VISIBILITY_PRIVATE)


class DiscussionBase(SQLModel):
    title: str
    content: Optional[str] = Field(default=None, sa_column=Column(Text))
    label: Optional[str] = Field(default="general", sa_column=Column(String(50)))
    emoji: Optional[str] = Field(default=None, sa_column=Column(String(50)))


class Discussion(DiscussionBase, table=True):
    __table_args__ = (
        Index("ix_discussion_community_id", "community_id"),
        # "Meu caderno" lista por autor + visibilidade.
        Index("ix_discussion_author_visibility", "author_id", "visibility"),
    )
    id: Optional[int] = Field(default=None, primary_key=True)
    community_id: int = Field(
        sa_column=Column(Integer, ForeignKey("community.id", ondelete="CASCADE"))
    )
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"))
    )
    author_id: int = Field(
        sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"))
    )
    discussion_uuid: str = Field(default="", index=True)
    upvote_count: int = 0
    edit_count: int = 0
    is_pinned: bool = Field(default=False, sa_column=Column(Boolean, default=False))
    is_locked: bool = Field(default=False, sa_column=Column(Boolean, default=False))
    # 'public' | 'private'. server_default mantém linhas antigas públicas.
    visibility: str = Field(
        default=DISCUSSION_VISIBILITY_PUBLIC,
        sa_column=Column(
            String(20),
            nullable=False,
            default=DISCUSSION_VISIBILITY_PUBLIC,
            server_default=DISCUSSION_VISIBILITY_PUBLIC,
        ),
    )
    creation_date: str = ""
    update_date: str = ""


class DiscussionCreate(SQLModel):
    title: str
    content: Optional[str] = None
    label: Optional[str] = "general"
    emoji: Optional[str] = None
    visibility: Optional[str] = DISCUSSION_VISIBILITY_PUBLIC
    community_id: int = Field(default=None, foreign_key="community.id")
    org_id: int = Field(default=None, foreign_key="organization.id")
    author_id: int = Field(default=None, foreign_key="user.id")


class DiscussionUpdate(SQLModel):
    title: Optional[str] = None
    content: Optional[str] = None
    label: Optional[str] = None
    emoji: Optional[str] = None
    # Só o autor pode trocar; validado no service.
    visibility: Optional[str] = None


class DiscussionVisibilityUpdate(SQLModel):
    visibility: str


class DiscussionPinUpdate(SQLModel):
    is_pinned: bool


class DiscussionLockUpdate(SQLModel):
    is_locked: bool


class DiscussionRead(SQLModel):
    id: int
    title: str
    content: Optional[str] = None
    label: Optional[str] = "general"
    emoji: Optional[str] = None
    community_id: int = Field(default=None, foreign_key="community.id")
    org_id: int = Field(default=None, foreign_key="organization.id")
    author_id: int = Field(default=None, foreign_key="user.id")
    discussion_uuid: str
    upvote_count: int
    edit_count: int = 0
    is_pinned: bool = False
    is_locked: bool = False
    visibility: str = DISCUSSION_VISIBILITY_PUBLIC
    creation_date: str
    update_date: str


class DiscussionReadWithAuthor(DiscussionRead):
    author: Optional[UserReadAuthor] = None


class DiscussionReadWithVoteStatus(DiscussionReadWithAuthor):
    has_voted: bool = False


class NotebookDiscussionRead(DiscussionReadWithVoteStatus):
    """Item do "Meu caderno": carrega a comunidade para o link na UI."""
    community_uuid: str = ""
    community_name: str = ""


class DiscussionLabelInfo(SQLModel):
    id: str
    name: str
    color: str
    icon: str
