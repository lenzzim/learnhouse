"""Comunidade v5 (decisões N42, N44 e N45, 24/11/2026).

Tabelas novas, todas por organização:

- ``community_org_settings``: o que o admin configura para a org inteira:
  o **grupo de autores** (publica no blog e cria bate-papos), os grupos de
  usuários de Homens e Mulheres (só para *sugerir* ao admin, nunca para
  adicionar alguém) e os links dos grupos de WhatsApp.
- ``community_member_pref``: a escolha "Sou homem / Sou mulher" do passo do
  WhatsApp (N42). Visível só à própria pessoa e aos admins; não é usada para
  mais nada.
- ``saved_discussion``: posts salvos (lista "Salvos", privada).

As regras de cada espaço (quem pode publicar, comentários, "não
compartilhável") ficam em ``community.moderation_settings`` (JSON que já existe),
para não mexer na tabela ``community``.
"""

import os
from typing import Optional

from sqlalchemy import Boolean, Column, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlmodel import Field, SQLModel


# Grupos de WhatsApp (N42). Os links já vêm sem rastreio.
WHATSAPP_MULHERES = "mulheres"
WHATSAPP_HOMENS = "homens"
WHATSAPP_GROUPS = (WHATSAPP_MULHERES, WHATSAPP_HOMENS)

DEFAULT_WHATSAPP_MULHERES_URL = "https://chat.whatsapp.com/FPUibUgq4735upzPXl4SXr"
DEFAULT_WHATSAPP_HOMENS_URL = "https://chat.whatsapp.com/DSRhYTYm0jh6wJlqXOXSdz"
WHATSAPP_URL_PREFIX = "https://chat.whatsapp.com/"


def default_whatsapp_url(group: str) -> str:
    """Link padrão do grupo: env ``DISCIPULEI_WHATSAPP_<GRUPO>`` ou o valor fixo."""
    if group == WHATSAPP_MULHERES:
        return (os.environ.get("DISCIPULEI_WHATSAPP_MULHERES") or DEFAULT_WHATSAPP_MULHERES_URL).strip()
    return (os.environ.get("DISCIPULEI_WHATSAPP_HOMENS") or DEFAULT_WHATSAPP_HOMENS_URL).strip()


# Chaves das regras de cada espaço dentro de ``moderation_settings``.
POST_POLICY_ALL = "all"
POST_POLICY_GROUP = "group"
POST_POLICIES = (POST_POLICY_ALL, POST_POLICY_GROUP)


class CommunityOrgSettings(SQLModel, table=True):
    __tablename__ = "community_org_settings"
    __table_args__ = (UniqueConstraint("org_id", name="uq_community_org_settings_org"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False)
    )
    authors_usergroup_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("usergroup.id", ondelete="SET NULL"), nullable=True),
    )
    men_usergroup_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("usergroup.id", ondelete="SET NULL"), nullable=True),
    )
    women_usergroup_id: Optional[int] = Field(
        default=None,
        sa_column=Column(Integer, ForeignKey("usergroup.id", ondelete="SET NULL"), nullable=True),
    )
    # Vazio = usa o padrão (env ou o link fixo).
    whatsapp_men_url: str = Field(
        default="", sa_column=Column(String(300), nullable=False, default="", server_default="")
    )
    whatsapp_women_url: str = Field(
        default="", sa_column=Column(String(300), nullable=False, default="", server_default="")
    )
    creation_date: str = ""
    update_date: str = ""


class CommunityMemberPref(SQLModel, table=True):
    __tablename__ = "community_member_pref"
    __table_args__ = (UniqueConstraint("user_id", "org_id", name="uq_community_member_pref_user_org"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False)
    )
    # 'homens' | 'mulheres' | None. Só a pessoa e os admins veem.
    whatsapp_group: Optional[str] = Field(default=None, sa_column=Column(String(10), nullable=True))
    # True depois que o passo único foi mostrado (escolheu ou "Agora não").
    whatsapp_prompted: bool = Field(
        default=False, sa_column=Column(Boolean, nullable=False, default=False, server_default="false")
    )
    creation_date: str = ""
    update_date: str = ""


class SavedDiscussion(SQLModel, table=True):
    __tablename__ = "saved_discussion"
    __table_args__ = (
        UniqueConstraint("user_id", "discussion_id", name="uq_saved_discussion"),
        Index("ix_saved_discussion_user_org", "user_id", "org_id"),
    )

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(sa_column=Column(Integer, ForeignKey("user.id", ondelete="CASCADE"), nullable=False))
    discussion_id: int = Field(
        sa_column=Column(Integer, ForeignKey("discussion.id", ondelete="CASCADE"), nullable=False)
    )
    org_id: int = Field(
        sa_column=Column(Integer, ForeignKey("organization.id", ondelete="CASCADE"), nullable=False)
    )
    creation_date: str = ""


# ---------------------------------------------------------------------------
# Esquemas (nunca com e-mail; o gênero só vai para a própria pessoa e admins)
# ---------------------------------------------------------------------------


class WhatsappLinks(SQLModel):
    mulheres: str
    homens: str


class MyWhatsappRead(SQLModel):
    group: Optional[str] = None
    prompted: bool = False
    # Link do grupo escolhido (None sem escolha).
    url: Optional[str] = None
    links: WhatsappLinks


class MyWhatsappUpdate(SQLModel):
    # 'homens' | 'mulheres' | None (None + dismissed = "Agora não").
    group: Optional[str] = None
    dismissed: bool = False


class CommunityConfigRead(SQLModel):
    """O que qualquer membro precisa saber para montar a interface."""
    is_author: bool = False
    can_manage_events: bool = False
    whatsapp: WhatsappLinks


class UserGroupRef(SQLModel):
    usergroup_uuid: str
    name: str


class OrgSettingsRead(SQLModel):
    authors_usergroup: Optional[UserGroupRef] = None
    men_usergroup: Optional[UserGroupRef] = None
    women_usergroup: Optional[UserGroupRef] = None
    whatsapp_men_url: str = ""
    whatsapp_women_url: str = ""
    # Padrões efetivos (env ou fixos), para o admin ver o que vale sem override.
    default_whatsapp_men_url: str = ""
    default_whatsapp_women_url: str = ""


class OrgSettingsUpdate(SQLModel):
    # "" limpa; None mantém.
    authors_usergroup_uuid: Optional[str] = None
    men_usergroup_uuid: Optional[str] = None
    women_usergroup_uuid: Optional[str] = None
    whatsapp_men_url: Optional[str] = None
    whatsapp_women_url: Optional[str] = None


class MemberWhatsappAdminRead(SQLModel):
    """Para o admin: a escolha de cada pessoa e a sugestão de grupo (N31)."""
    user_uuid: str
    username: str
    first_name: str = ""
    last_name: str = ""
    whatsapp_group: Optional[str] = None
    # Grupo de usuários sugerido (Homens/Mulheres) quando a pessoa ainda não
    # está nele. Só sugestão: a entrada continua aprovada por um líder.
    suggested_usergroup: Optional[UserGroupRef] = None
    in_suggested_group: bool = False


class ShareToggle(SQLModel):
    enabled: bool


class SharedPostRead(SQLModel):
    """O que a página pública de um post compartilhado mostra (N44)."""
    discussion_uuid: str
    community_uuid: str
    title: str
    author_name: str
    excerpt: str
    truncated: bool = True
    label: Optional[str] = None
    creation_date: str = ""
