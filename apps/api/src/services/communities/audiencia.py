"""Etiqueta de público do espaço, derivada do acesso real.

A mesma regra de leitura de ``check_resource_access``/``community_read_clause_for_user``:

- ``public`` → ``open`` ("Aberto a todos": visitantes leem);
- privado sem grupo ligado (``UserGroupResource``) → ``members`` ("Só membros");
- privado com grupo(s) → ``group`` com os nomes dos grupos ("Só Discípulos").

Nunca é configurável à mão: para mudar a etiqueta muda-se a visibilidade ou
os grupos do espaço. Só é calculada para espaços que a pessoa já pode ler
(quem chama filtra antes), então nenhum nome de grupo vaza para quem não lê.
Espaços públicos nunca expõem grupos.
"""

from __future__ import annotations

from typing import Dict, Iterable, List, Sequence

from sqlmodel import select
from sqlmodel.ext.asyncio.session import AsyncSession

from src.db.communities.communities import Community, CommunityAudience, CommunityRead
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroups import UserGroup

AUDIENCE_OPEN = "open"
AUDIENCE_MEMBERS = "members"
AUDIENCE_GROUP = "group"


async def _linked_groups(db: AsyncSession, communities: Sequence[Community]) -> Dict[str, List[str]]:
    """Nomes dos grupos ligados a cada espaço privado (mesma org do espaço)."""
    privados = {c.community_uuid: c.org_id for c in communities if not c.public}
    if not privados:
        return {}
    rows = (await db.execute(
        select(UserGroupResource.resource_uuid, UserGroup.name, UserGroup.org_id)
        .join(UserGroup, UserGroup.id == UserGroupResource.usergroup_id)
        .where(UserGroupResource.resource_uuid.in_(list(privados)))  # type: ignore[union-attr]
    )).all()
    out: Dict[str, set] = {}
    for uuid, name, org_id in rows:
        if org_id == privados.get(uuid) and name:
            out.setdefault(uuid, set()).add(name)
    return {uuid: sorted(names, key=str.casefold) for uuid, names in out.items()}


def derive_audience(community: Community, groups: Iterable[str] = ()) -> CommunityAudience:
    if community.public:
        return CommunityAudience(kind=AUDIENCE_OPEN, groups=[])
    names = list(groups)
    if names:
        return CommunityAudience(kind=AUDIENCE_GROUP, groups=names)
    return CommunityAudience(kind=AUDIENCE_MEMBERS, groups=[])


async def with_audience(db: AsyncSession, communities: Sequence[Community]) -> List[CommunityRead]:
    """``CommunityRead`` com ``audience``, numa consulta só para a lista toda."""
    grupos = await _linked_groups(db, communities)
    out = []
    for c in communities:
        read = CommunityRead.model_validate(c.model_dump())
        read.audience = derive_audience(c, grupos.get(c.community_uuid, ()))
        out.append(read)
    return out


async def read_with_audience(db: AsyncSession, community: Community) -> CommunityRead:
    return (await with_audience(db, [community]))[0]
