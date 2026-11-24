"""Agenda de eventos (antes "Bate-papo Online", N45, 24/11/2026).

Rodas de conversa (Bible Talk), cultos, estudos e encontros, online ou
presenciais, por região (São Paulo, Campinas, ..., Online). Criados por
admins, pelo grupo de autores ("Equipe") e pelo grupo de organizadores
("Discípulos"). Qualquer pessoa vê a agenda aberta; membros confirmam presença
("Vou" ou "Talvez"), baixam o ``.ics`` e recebem lembretes no app.

Privacidade (tudo checado no serviço): ``address`` (endereço exato) e
``meeting_url`` (link online) só saem para quem respondeu "Vou", para quem
criou o evento e para admins/Equipe.

Datas: ``starts_at`` é guardado em UTC, no formato ISO fixo
``YYYY-MM-DDTHH:MM:SS+00:00`` (comparável como texto, como o resto do
LearnHouse, que guarda datas em ``str``). ``timezone`` é o fuso IANA em que o
encontro foi marcado, para mostrar e para o ``.ics``.
"""

from typing import List, Optional

from sqlalchemy import Boolean, Column, ForeignKey, Index, Integer, String, Text, UniqueConstraint, false, true
from sqlmodel import Field, SQLModel


RSVP_GOING = "vou"
RSVP_MAYBE = "talvez"
RSVP_STATUSES = (RSVP_GOING, RSVP_MAYBE)

# Tipos de evento (``community_event.kind``).
KIND_BIBLE_TALK = "bible_talk"
KIND_WORSHIP = "worship"
KIND_STUDY = "study"
KIND_MEETUP = "meetup"
KIND_OTHER = "other"
EVENT_KINDS = (KIND_BIBLE_TALK, KIND_WORSHIP, KIND_STUDY, KIND_MEETUP, KIND_OTHER)

# Modalidade (``community_event.mode``).
MODE_ONLINE = "online"
MODE_IN_PERSON = "in_person"
EVENT_MODES = (MODE_ONLINE, MODE_IN_PERSON)

# Situação gravada (``community_event.status``); "ao vivo/passado" é calculado.
STATUS_SCHEDULED = "scheduled"
STATUS_CANCELLED = "cancelled"

# Tipos de notificação dos lembretes (em ``community_notification.kind``).
NOTIFICATION_EVENT_1D = "event_1d"
NOTIFICATION_EVENT_15M = "event_15m"
NOTIFICATION_EVENT_LIVE = "event_live"
# Aviso único para quem tinha respondido, quando o evento é cancelado.
NOTIFICATION_EVENT_CANCELLED = "event_cancelled"
# Mudou horário ou local (o aviso anterior do mesmo tipo é trocado).
NOTIFICATION_EVENT_CHANGED = "event_changed"
EVENT_NOTIFICATION_KINDS = (
    NOTIFICATION_EVENT_1D, NOTIFICATION_EVENT_15M, NOTIFICATION_EVENT_LIVE,
    NOTIFICATION_EVENT_CANCELLED, NOTIFICATION_EVENT_CHANGED,
)

TITLE_MAX = 160
THEME_MAX = 160
HOST_MAX = 120
PASSAGES_MAX = 300
URL_MAX = 500
DESCRIPTION_MAX = 4000
DURATION_MIN = 10
DURATION_MAX = 480
CITY_MAX = 120
NEIGHBORHOOD_MAX = 120
ADDRESS_MAX = 300
CAPACITY_MAX = 10000
REGION_NAME_MAX = 80
REGIONS_MAX = 40

# Regiões criadas na primeira vez (ordem fixa; Online primeiro: vale para
# todo mundo, em qualquer cidade, e é onde caem os bate-papos antigos).
DEFAULT_REGIONS = (
    ("online", "Online", True),
    ("sao-paulo", "São Paulo", False),
    ("campinas", "Campinas", False),
    ("sao-carlos", "São Carlos", False),
    ("rio-de-janeiro", "Rio de Janeiro", False),
    ("minas-gerais", "Minas Gerais", False),
)

# O botão "Entrar" fica em destaque desde 10 minutos antes até o fim.
JOIN_HIGHLIGHT_MINUTES = 10


class CommunityEventRegion(SQLModel, table=True):
    """Região da agenda (editável pelo admin). Nunca é apagada, só desativada."""

    __tablename__ = "community_event_region"
    __table_args__ = (
        UniqueConstraint("org_id", "slug", name="uq_community_event_region_slug"),
        Index("ix_community_event_region_org", "org_id", "position"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    region_uuid: str = Field(default="", index=True)
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False)
    )
    slug: str = Field(sa_column=Column(String(60), nullable=False))
    name: str = Field(sa_column=Column(String(REGION_NAME_MAX), nullable=False))
    position: int = Field(default=0, sa_column=Column(Integer, nullable=False, default=0, server_default="0"))
    is_online: bool = Field(
        default=False, sa_column=Column(Boolean, nullable=False, default=False, server_default=false())
    )
    active: bool = Field(default=True, sa_column=Column(Boolean, nullable=False, default=True, server_default=true()))
    creation_date: str = ""
    update_date: str = ""


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
    # Agenda: tipo, região, modalidade e local.
    kind: str = Field(
        default=KIND_BIBLE_TALK,
        sa_column=Column(String(20), nullable=False, default=KIND_BIBLE_TALK, server_default=KIND_BIBLE_TALK),
    )
    region_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("community_event_region.id", ondelete="SET NULL"), nullable=True),
    )
    mode: str = Field(
        default=MODE_ONLINE, sa_column=Column(String(12), nullable=False, default=MODE_ONLINE, server_default=MODE_ONLINE)
    )
    # Públicos: cidade e bairro.
    city: str = Field(default="", sa_column=Column(String(CITY_MAX), nullable=False, default="", server_default=""))
    neighborhood: str = Field(
        default="", sa_column=Column(String(NEIGHBORHOOD_MAX), nullable=False, default="", server_default="")
    )
    # Privado: endereço exato (como ``meeting_url``, só para quem vai).
    address: str = Field(default="", sa_column=Column(String(ADDRESS_MAX), nullable=False, default="", server_default=""))
    # Vagas (None = sem limite). Lotado bloqueia novos "Vou".
    capacity: Optional[int] = Field(default=None, sa_column=Column(Integer, nullable=True))
    status: str = Field(
        default=STATUS_SCHEDULED,
        sa_column=Column(String(12), nullable=False, default=STATUS_SCHEDULED, server_default=STATUS_SCHEDULED),
    )
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
    kind: str = KIND_BIBLE_TALK
    # Vazio: "Online" para eventos online; obrigatório para presenciais.
    region_uuid: Optional[str] = None
    mode: str = MODE_ONLINE
    city: str = ""
    neighborhood: str = ""
    address: str = ""
    capacity: Optional[int] = None
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
    kind: Optional[str] = None
    region_uuid: Optional[str] = None
    mode: Optional[str] = None
    city: Optional[str] = None
    neighborhood: Optional[str] = None
    address: Optional[str] = None
    # 0 tira o limite (None = não mexe).
    capacity: Optional[int] = None


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
    kind: str = KIND_BIBLE_TALK
    mode: str = MODE_ONLINE
    region: Optional["RegionRead"] = None
    city: str = ""
    neighborhood: str = ""
    # Privados: só para quem respondeu "Vou", quem criou e admins/Equipe.
    # Os outros recebem None (nem no JSON, nem no .ics, nem na prévia).
    meeting_url: Optional[str] = None
    address: Optional[str] = None
    # True quando há endereço/link guardado que esta pessoa ainda não pode ver.
    details_locked: bool = False
    host_name: str = ""
    # Nome de exibição de quem criou (organizador).
    organizer_name: str = ""
    passages: str = ""
    capacity: Optional[int] = None
    spots_left: Optional[int] = None
    is_full: bool = False
    cancelled: bool = False
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


class RegionRead(SQLModel):
    region_uuid: str
    slug: str
    name: str
    is_online: bool = False
    active: bool = True
    position: int = 0


class RegionInput(SQLModel):
    # Sem uuid = região nova.
    region_uuid: Optional[str] = None
    name: str
    active: bool = True


class AgendaSettingsRead(SQLModel):
    organizers_usergroup_uuid: Optional[str] = None
    organizers_usergroup_name: Optional[str] = None
    regions: List[RegionRead] = []


class AgendaSettingsUpdate(SQLModel):
    # "" limpa (só admins/Equipe criam); None não mexe.
    organizers_usergroup_uuid: Optional[str] = None
    # Lista completa, na ordem desejada. Regiões ausentes ficam inativas.
    regions: Optional[List[RegionInput]] = None


EventRead.model_rebuild()


class CommunityAgendaPref(SQLModel, table=True):
    """Preferências da pessoa na agenda: feed ICS pessoal e e-mail de lembrete.

    O token do feed é mostrado uma única vez; aqui fica só o SHA-256 dele.
    """

    __tablename__ = "community_agenda_pref"
    __table_args__ = (UniqueConstraint("user_id", "org_id", name="uq_community_agenda_pref_user_org"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False)
    )
    feed_token_hash: Optional[str] = Field(
        default=None, sa_column=Column(String(64), nullable=True, unique=True)
    )
    feed_created_at: str = Field(default="", sa_column=Column(String(40), nullable=False, default="", server_default=""))
    email_reminders: bool = Field(
        default=True, sa_column=Column(Boolean, nullable=False, default=True, server_default=true())
    )
    creation_date: str = ""
    update_date: str = ""


class AgendaPrefsRead(SQLModel):
    email_reminders: bool = True
    # O envio de e-mail está ligado neste servidor (DISCIPULEI_LEMBRETES_EMAIL)?
    email_available: bool = False
    feed_active: bool = False
    feed_created_at: Optional[str] = None


class AgendaPrefsUpdate(SQLModel):
    email_reminders: Optional[bool] = None


class FeedTokenRead(SQLModel):
    # Só nesta resposta: depois o servidor guarda apenas o hash.
    token: str
    path: str
