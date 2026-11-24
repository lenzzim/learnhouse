"""Comunidade "social contido" (decisão N39, 23/11/2026).

Tabelas novas, todas por organização:

- ``community_profile``: o perfil opcional da página Pessoas. Desligado por
  padrão (``visible=False``); só aparece para membros logados da org.
- ``user_follow``: seguir pessoas. Seguir nunca dá acesso a nada: é só um
  filtro de leitura sobre o que a pessoa já podia ler.
- ``community_notification``: notificações simples no app (hoje, só menções).
- ``discussioncommentreaction``: "Amém" e "Orando" em comentários. Nos posts,
  as duas reações usam a tabela ``discussionreaction`` que já existia, com
  ``emoji`` = ``amem`` ou ``orando``.

Contagens (seguidores, reações) só vão para o dono (N22).
"""

from typing import Dict, List, Optional

from sqlalchemy import Boolean, Column, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlmodel import Field, SQLModel

# A FK de ``community_notification.event_id`` precisa da tabela registrada.
from src.db.communities import batepapos as _batepapos  # noqa: F401


# Reações de fé, nos posts e nos comentários. "Obrigado" e "Me tocou" entraram
# na v5 (N44); as contagens continuam só para o autor (N22).
FAITH_REACTIONS = ("amem", "orando", "obrigado", "tocou")

PROFILE_BIO_MAX = 280

NOTIFICATION_MENTION = "mention"


class CommunityProfile(SQLModel, table=True):
    __tablename__ = "community_profile"
    __table_args__ = (
        UniqueConstraint("user_id", "org_id", name="uq_community_profile_user_org"),
        Index("ix_community_profile_org_visible", "org_id", "visible"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False)
    )
    visible: bool = Field(
        default=False, sa_column=Column(Boolean, nullable=False, default=False, server_default="false")
    )
    bio: str = Field(default="", sa_column=Column(String(PROFILE_BIO_MAX), nullable=False, default="", server_default=""))
    creation_date: str = ""
    update_date: str = ""


class UserFollow(SQLModel, table=True):
    __tablename__ = "user_follow"
    __table_args__ = (
        UniqueConstraint("follower_id", "followed_id", "org_id", name="uq_user_follow"),
        Index("ix_user_follow_followed", "followed_id", "org_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    follower_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    followed_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False)
    )
    creation_date: str = ""


class CommunityNotification(SQLModel, table=True):
    __tablename__ = "community_notification"
    __table_args__ = (
        Index("ix_community_notification_user", "user_id", "org_id", "read_at"),
        # Um lembrete de cada tipo por pessoa e encontro (gerados sob demanda).
        UniqueConstraint("user_id", "event_id", "kind", name="uq_community_notification_event"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    notification_uuid: str = Field(default="", index=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False)
    )
    actor_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    kind: str = Field(default=NOTIFICATION_MENTION, sa_column=Column(String(20), nullable=False))
    # Menções apontam para a discussão; lembretes de bate-papo (v5), para o
    # encontro. Um dos dois sempre vem preenchido.
    discussion_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("discussion.id", ondelete="CASCADE"), nullable=True),
    )
    comment_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("discussioncomment.id", ondelete="CASCADE"), nullable=True),
    )
    event_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("community_event.id", ondelete="CASCADE"), nullable=True),
    )
    creation_date: str = ""
    read_at: Optional[str] = Field(default=None, sa_column=Column(String(40), nullable=True))


class DiscussionCommentReaction(SQLModel, table=True):
    __tablename__ = "discussioncommentreaction"
    __table_args__ = (
        UniqueConstraint("comment_id", "user_id", "kind", name="uq_comment_reaction"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    comment_id: int = Field(
        sa_column=Column(Integer, ForeignKey("discussioncomment.id", ondelete="CASCADE"), nullable=False)
    )
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    kind: str = Field(sa_column=Column(String(20), nullable=False))
    creation_date: str = ""


# ---------------------------------------------------------------------------
# Esquemas de entrada e saída (nunca com e-mail)
# ---------------------------------------------------------------------------


class ProfileUpdate(SQLModel):
    visible: Optional[bool] = None
    bio: Optional[str] = None


class MyProfileRead(SQLModel):
    visible: bool = False
    bio: str = ""
    # Só o dono recebe as contagens (N22).
    follower_count: int = 0
    following_count: int = 0


class PersonRead(SQLModel):
    user_uuid: str
    username: str
    first_name: str = ""
    last_name: str = ""
    avatar_image: Optional[str] = ""
    bio: str = ""
    is_self: bool = False
    is_following: bool = False
    # Preenchido só quando a pessoa vê o próprio perfil.
    follower_count: Optional[int] = None


class MentionCandidate(SQLModel):
    user_uuid: str
    username: str
    first_name: str = ""
    last_name: str = ""
    avatar_image: Optional[str] = ""


class NotificationRead(SQLModel):
    notification_uuid: str
    kind: str
    creation_date: str
    read: bool
    actor: Optional[MentionCandidate] = None
    discussion_uuid: str = ""
    discussion_title: str = ""
    community_uuid: str = ""
    comment_uuid: Optional[str] = None
    # Lembretes de bate-papo (v5).
    event_uuid: Optional[str] = None
    event_title: Optional[str] = None
    event_starts_at: Optional[str] = None


class FaithReactionState(SQLModel):
    reacted: bool = False
    # None para quem não é o autor do post/comentário (N22).
    count: Optional[int] = None


class FaithShareState(SQLModel):
    eligible: bool = False
    disabled_by_author: bool = False
    can_toggle: bool = False


class FaithReactionsRead(SQLModel):
    discussion: Dict[str, FaithReactionState] = {}
    comments: Dict[str, Dict[str, FaithReactionState]] = {}
    # v5: salvo por mim e estado do compartilhamento (N44).
    saved: bool = False
    share: FaithShareState = FaithShareState()


class AcceptedAnswerUpdate(SQLModel):
    comment_uuid: Optional[str] = None


class FollowingList(SQLModel):
    people: List[PersonRead] = []
