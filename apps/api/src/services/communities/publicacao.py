"""Regras de cada espaço na v5 (N44 e N45, 24/11/2026).

Ficam em ``community.moderation_settings`` (JSON que já existe), ao lado das
regras de moderação:

- ``post_policy``: ``"all"`` (todos os membros com leitura publicam, padrão)
  ou ``"group"`` (só um grupo de usuários publica). Admins e mantenedores
  sempre publicam. É o que faz o "Blog do Discipulei" ser lido por todos e
  escrito só pelo grupo de autores.
- ``post_usergroup_uuid``: o grupo de ``post_policy="group"``.
- ``comments_disabled``: desliga comentários de quem não é admin/mantenedor.
- ``not_shareable``: o espaço nunca gera link público (ex.: "Pedidos de
  oração"). Marcado por configuração, nunca pelo nome do espaço.

E o **compartilhamento** de um post (N44): só posts públicos de espaços
públicos, que não são desafio (``course_id``), não são fechados por grupo de
usuários (áreas de Homens e Mulheres e outros restritos), não estão marcados
como "não compartilhável", não são pedidos de oração e cujo autor não
desligou o compartilhamento.
"""

from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.communities.communities import Community
from src.db.communities.discussions import DISCUSSION_VISIBILITY_PUBLIC, Discussion
from src.db.communities.membros import POST_POLICIES, POST_POLICY_ALL, POST_POLICY_GROUP
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup


# Chaves das regras do espaço guardadas em ``moderation_settings``.
SPACE_SETTING_KEYS = ("post_policy", "post_usergroup_uuid", "comments_disabled", "not_shareable")

# Pedidos de oração nunca saem da comunidade, em nenhum espaço.
NEVER_SHARE_LABELS = frozenset({"oracao"})


def _settings(community: Optional[Community]) -> dict:
    return dict((community.moderation_settings if community else None) or {})


def post_policy(community: Community) -> str:
    value = _settings(community).get("post_policy") or POST_POLICY_ALL
    return value if value in POST_POLICIES else POST_POLICY_ALL


def post_usergroup_uuid(community: Community) -> Optional[str]:
    value = _settings(community).get("post_usergroup_uuid")
    return str(value) if value else None


def comments_disabled(community: Community) -> bool:
    return bool(_settings(community).get("comments_disabled"))


def not_shareable(community: Community) -> bool:
    return bool(_settings(community).get("not_shareable"))


async def _is_org_admin(db: AsyncSession, user_id: int, org_id: int) -> bool:
    if not user_id:
        return False
    from src.security.org_auth import is_org_admin

    return await is_org_admin(user_id, org_id, db)


async def is_in_usergroup(db: AsyncSession, user_id: int, org_id: int, usergroup_uuid: Optional[str]) -> bool:
    if not user_id or not usergroup_uuid:
        return False
    row = (await db.execute(
        select(UserGroupUser.id)
        .join(UserGroup, UserGroup.id == UserGroupUser.usergroup_id)
        .where(
            UserGroup.usergroup_uuid == usergroup_uuid,
            UserGroup.org_id == org_id,
            UserGroupUser.user_id == user_id,
        )
    )).first()
    return row is not None


async def can_post(db: AsyncSession, user_id: int, community: Community) -> bool:
    """Pode publicar neste espaço (sem contar a leitura, checada à parte)?"""
    if not user_id:
        return False
    if post_policy(community) != POST_POLICY_GROUP:
        return True
    if await _is_org_admin(db, user_id, community.org_id):
        return True
    return await is_in_usergroup(db, user_id, community.org_id, post_usergroup_uuid(community))


async def ensure_can_post(db: AsyncSession, user_id: int, community: Community) -> None:
    if not await can_post(db, user_id, community):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "COMMUNITY_POST_RESTRICTED",
                "message": "Only the authors of this space can publish here.",
            },
        )


async def can_comment(db: AsyncSession, user_id: int, community: Community) -> bool:
    if not user_id:
        return False
    if not comments_disabled(community):
        return True
    return await _is_org_admin(db, user_id, community.org_id)


async def ensure_can_comment(db: AsyncSession, user_id: int, community: Community) -> None:
    if not await can_comment(db, user_id, community):
        raise HTTPException(
            status_code=403,
            detail={
                "code": "COMMUNITY_COMMENTS_DISABLED",
                "message": "Comments are turned off in this space.",
            },
        )


def validate_space_settings(settings: Optional[dict]) -> Optional[dict]:
    """Normaliza as chaves v5 que chegam pelo PUT da comunidade."""
    if settings is None:
        return None
    out = dict(settings)
    if "post_policy" in out:
        if out["post_policy"] not in (None, *POST_POLICIES):
            raise HTTPException(status_code=422, detail="post_policy must be 'all' or 'group'")
    for key in ("comments_disabled", "not_shareable"):
        if key in out and out[key] is not None:
            out[key] = bool(out[key])
    if out.get("post_policy") == POST_POLICY_GROUP and not out.get("post_usergroup_uuid"):
        raise HTTPException(status_code=422, detail="Choose the user group that can publish in this space")
    return out


async def validate_space_usergroup(db: AsyncSession, org_id: int, settings: Optional[dict]) -> None:
    """O grupo de quem publica precisa ser desta org."""
    uuid = (settings or {}).get("post_usergroup_uuid")
    if not uuid:
        return
    group = (await db.execute(
        select(UserGroup).where(UserGroup.usergroup_uuid == uuid, UserGroup.org_id == org_id)
    )).scalars().first()
    if not group:
        raise HTTPException(status_code=422, detail="User group not found in this organization")


# ---------------------------------------------------------------------------
# Compartilhar (N44)
# ---------------------------------------------------------------------------


async def community_is_shareable(db: AsyncSession, community: Community) -> bool:
    if not community.public or community.course_id is not None:
        return False
    if not_shareable(community):
        return False
    restricted = (await db.execute(
        select(UserGroupResource.id).where(UserGroupResource.resource_uuid == community.community_uuid)
    )).first()
    return restricted is None


async def discussion_share_eligible(db: AsyncSession, discussion: Discussion, community: Community) -> bool:
    """O post pode ganhar link público, sem contar a escolha do autor."""
    if (discussion.visibility or DISCUSSION_VISIBILITY_PUBLIC) != DISCUSSION_VISIBILITY_PUBLIC:
        return False
    if (discussion.label or "") in NEVER_SHARE_LABELS:
        return False
    return await community_is_shareable(db, community)


async def discussion_is_shareable(db: AsyncSession, discussion: Discussion, community: Community) -> bool:
    if discussion.share_disabled:
        return False
    return await discussion_share_eligible(db, discussion, community)
