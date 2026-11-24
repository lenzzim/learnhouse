"""Bate-papo Online (Bible Talk, decisão N45, 24/11/2026).

Encontros online da comunidade, criados só por admins/mantenedores e pelo
grupo de autores. Membros veem a agenda, confirmam presença ("Vou" ou
"Talvez"), baixam o ``.ics`` e recebem lembretes no app.

Datas: ``starts_at`` é guardado em UTC, no formato ISO fixo
``YYYY-MM-DDTHH:MM:SS+00:00`` (comparável como texto, como o resto do
LearnHouse, que guarda datas em ``str``). ``timezone`` é o fuso IANA em que o
encontro foi marcado, para mostrar e para o ``.ics``.
"""

from typing import List, Optional

from sqlalchemy import Column, ForeignKey, Index, Integer, String, Text, UniqueConstraint
from sqlmodel import Field, SQLModel


RSVP_GOING = "vou"
RSVP_MAYBE = "talvez"
RSVP_STATUSES = (RSVP_GOING, RSVP_MAYBE)

# Tipos de notificação dos lembretes (em ``community_notification.kind``).
NOTIFICATION_EVENT_1D = "event_1d"
NOTIFICATION_EVENT_15M = "event_15m"
NOTIFICATION_EVENT_LIVE = "event_live"
EVENT_NOTIFICATION_KINDS = (NOTIFICATION_EVENT_1D, NOTIFICATION_EVENT_15M, NOTIFICATION_EVENT_LIVE)

TITLE_MAX = 160
THEME_MAX = 160
HOST_MAX = 120
PASSAGES_MAX = 300
URL_MAX = 500
DESCRIPTION_MAX = 4000
DURATION_MIN = 10
DURATION_MAX = 480

# O botão "Entrar" fica em destaque desde 10 minutos antes até o fim.
JOIN_HIGHLIGHT_MINUTES = 10


class CommunityEvent(SQLModel, table=True):
    __tablename__ = "community_event"
    __table_args__ = (
        Index("ix_community_event_org_starts", "org_id", "starts_at"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    event_uuid: str = Field(default="", index=True)
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False)
    )
    title: str = Field(sa_column=Column(String(TITLE_MAX), nullable=False))
    theme: str = Field(default="", sa_column=Column(String(THEME_MAX), nullable=False, default="", server_default=""))
    description: str = Field(default="", sa_column=Column(Text, nullable=False, default="", server_default=""))
    starts_at: str = Field(sa_column=Column(String(40), nullable=False))
    timezone: str = Field(
        default="America/Sao_Paulo",
        sa_column=Column(String(64), nullable=False, default="America/Sao_Paulo", server_default="America/Sao_Paulo"),
    )
    duration_minutes: int = Field(default=60, sa_column=Column(Integer, nullable=False, default=60, server_default="60"))
    meeting_url: str = Field(default="", sa_column=Column(String(URL_MAX), nullable=False, default="", server_default=""))
    host_name: str = Field(default="", sa_column=Column(String(HOST_MAX), nullable=False, default="", server_default=""))
    passages: str = Field(default="", sa_column=Column(String(PASSAGES_MAX), nullable=False, default="", server_default=""))
    # Post de divulgação (opcional), num espaço escolhido.
    announcement_discussion_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("discussion.id", ondelete="SET NULL"), nullable=True),
    )
    created_by: Optional[int] = Field(
        default=None, sa_column=Column(Integer, ForeignKey("user.id", ondelete="SET NULL"), nullable=True)
    )
    creation_date: str = ""
    update_date: str = ""


class CommunityEventRsvp(SQLModel, table=True):
    __tablename__ = "community_event_rsvp"
    __table_args__ = (
        UniqueConstraint("event_id", "user_id", name="uq_community_event_rsvp"),
        Index("ix_community_event_rsvp_user", "user_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    event_id: int = Field(
        sa_column=Column(Integer, ForeignKey("community_event.id", ondelete="CASCADE"), nullable=False)
    )
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    status: str = Field(sa_column=Column(String(10), nullable=False))
    creation_date: str = ""
    update_date: str = ""


# ---------------------------------------------------------------------------
# Esquemas
# ---------------------------------------------------------------------------


class EventCreate(SQLModel):
    title: str
    theme: str = ""
    description: str = ""
    # ISO 8601. Com deslocamento ("2026-12-01T20:00:00-03:00") ou sem ele; sem
    # deslocamento, vale o ``timezone``.
    starts_at: str
    timezone: str = "America/Sao_Paulo"
    duration_minutes: int = 60
    meeting_url: str = ""
    host_name: str = ""
    passages: str = ""
    # Espaço onde publicar a divulgação (opcional).
    announce_community_uuid: Optional[str] = None


class EventUpdate(SQLModel):
    title: Optional[str] = None
    theme: Optional[str] = None
    description: Optional[str] = None
    starts_at: Optional[str] = None
    timezone: Optional[str] = None
    duration_minutes: Optional[int] = None
    meeting_url: Optional[str] = None
    host_name: Optional[str] = None
    passages: Optional[str] = None


class RsvpUpdate(SQLModel):
    # 'vou' | 'talvez' | None (None cancela).
    status: Optional[str] = None


class EventRead(SQLModel):
    event_uuid: str
    title: str
    theme: str = ""
    description: str = ""
    starts_at: str
    ends_at: str
    timezone: str
    duration_minutes: int
    # Só para membros logados da org; visitante recebe None.
    meeting_url: Optional[str] = None
    host_name: str = ""
    passages: str = ""
    announcement_discussion_uuid: Optional[str] = None
    announcement_community_uuid: Optional[str] = None
    my_status: Optional[str] = None
    going_count: int = 0
    maybe_count: int = 0
    can_manage: bool = False
    status: str = "upcoming"  # upcoming | live | past


class AttendeeRead(SQLModel):
    user_uuid: str
    username: str
    first_name: str = ""
    last_name: str = ""
    avatar_image: Optional[str] = ""
    status: str


class AttendeeList(SQLModel):
    going: List[AttendeeRead] = []
    maybe: List[AttendeeRead] = []
