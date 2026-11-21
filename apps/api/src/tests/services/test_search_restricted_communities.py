"""Busca e listagens não podem vazar comunidades restritas por grupo.

Comunidades com ``public=False`` + grupo(s) vinculado(s) (ex.: "Homens |
Exclusivo") só podem ser lidas por membros desses grupos (ou admins/superadmins,
conforme ``ResourceAccessChecker``). ``public=False`` sem grupo = membros da org.
Antes desta correção a busca da org devolvia discussions (e a própria
comunidade) de comunidades restritas para qualquer membro da org.

Nada de RBAC é mockado aqui: os testes rodam a regra real contra o SQLite.
"""

from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest

from src.db.communities.communities import Community
from src.db.communities.discussions import Discussion
from src.db.user_organizations import UserOrganization
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import AnonymousUser, APITokenUser, PublicUser, User
from src.services.communities.communities import get_communities_by_org
from src.services.search.search import search_across_org


QUERY = "oracao"

PUBLIC_D = "discussion_geral"
RESTRICTED_D = "discussion_homens"
USERS_ONLY_D = "discussion_membros"
PRIVATE_NOTE_D = "discussion_homens_nota"


def _now() -> str:
    return str(datetime.now())


async def _user(db, *, id, username, org=None, role_id=None, superadmin=False):
    u = User(
        id=id,
        username=username,
        first_name=username.title(),
        last_name="Teste",
        email=f"{username}@test.com",
        password="hashed_password",
        user_uuid=f"user_{username}",
        is_superadmin=superadmin,
        creation_date=_now(),
        update_date=_now(),
    )
    db.add(u)
    await db.commit()
    if org is not None:
        db.add(UserOrganization(
            user_id=u.id, org_id=org.id, role_id=role_id,
            creation_date=_now(), update_date=_now(),
        ))
        await db.commit()
    return PublicUser(
        id=u.id, username=u.username, first_name=u.first_name,
        last_name=u.last_name, email=u.email, user_uuid=u.user_uuid,
        is_superadmin=superadmin,
    )


async def _community(db, org, *, id, uuid, name, public):
    c = Community(
        id=id, org_id=org.id, name=name, description=f"{name} {QUERY}",
        public=public, thumbnail_image="", community_uuid=uuid,
        moderation_words=[], creation_date=f"2024-01-0{id % 9 + 1}",
        update_date="2024-01-01",
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


async def _discussion(db, community, author_id, *, uuid, visibility="public"):
    d = Discussion(
        title=f"Pedido de {QUERY} {uuid}", content="Corpo", label="general",
        community_id=community.id, org_id=community.org_id, author_id=author_id,
        discussion_uuid=uuid, upvote_count=0, edit_count=0, is_pinned=False,
        is_locked=False, visibility=visibility,
        creation_date="2024-02-01T00:00:00+00:00",
        update_date="2024-02-01T00:00:00+00:00",
    )
    db.add(d)
    await db.commit()
    return d


@pytest.fixture
async def world(db, org, other_org, admin_user, regular_user, user_role):
    """
    - ``geral``: pública.
    - ``homens``: public=False + grupo "Homens" vinculado (restrita).
    - ``membros``: public=False sem grupo (só membros da org).

    ``irmao`` está no grupo; ``regular_user`` é membro comum (fora do grupo);
    ``estranho`` é membro de OUTRA org; ``admin_user`` é admin da org.
    """
    irmao = await _user(db, id=5, username="irmao", org=org, role_id=user_role.id)
    estranho = await _user(db, id=6, username="estranho", org=other_org, role_id=user_role.id)
    superadmin = await _user(db, id=7, username="root", superadmin=True)

    geral = await _community(db, org, id=10, uuid="community_geral", name="Geral", public=True)
    homens = await _community(
        db, org, id=11, uuid="community_homens", name="Homens | Exclusivo", public=False,
    )
    membros = await _community(
        db, org, id=12, uuid="community_membros", name="Membros", public=False,
    )

    group = UserGroup(
        id=1, org_id=org.id, name="Homens", description="",
        usergroup_uuid="usergroup_homens", creation_date=_now(), update_date=_now(),
    )
    db.add(group)
    await db.commit()
    db.add(UserGroupResource(
        usergroup_id=group.id, resource_uuid=homens.community_uuid, org_id=org.id,
        creation_date=_now(), update_date=_now(),
    ))
    db.add(UserGroupUser(
        usergroup_id=group.id, user_id=irmao.id, org_id=org.id,
        creation_date=_now(), update_date=_now(),
    ))
    await db.commit()

    await _discussion(db, geral, regular_user.id, uuid=PUBLIC_D)
    await _discussion(db, homens, irmao.id, uuid=RESTRICTED_D)
    await _discussion(db, membros, regular_user.id, uuid=USERS_ONLY_D)
    await _discussion(db, homens, irmao.id, uuid=PRIVATE_NOTE_D, visibility="private")

    return {
        "irmao": irmao,
        "member": regular_user,
        "estranho": estranho,
        "admin": admin_user,
        "superadmin": superadmin,
        "anon": AnonymousUser(),
    }


async def _search(request, db, user, query=QUERY, **kw):
    with patch(
        "src.services.search.search.search_courses",
        new_callable=AsyncMock, return_value=[],
    ):
        return await search_across_org(request, user, "test-org", query, db, **kw)


def _d_uuids(result):
    return sorted(d.discussion_uuid for d in result.discussions)


def _c_uuids(result):
    return sorted(c.community_uuid for c in result.communities)


class TestSearchDiscussionsRespectCommunityAccess:
    @pytest.mark.asyncio
    async def test_group_member_sees_restricted(self, db, world, mock_request):
        result = await _search(mock_request, db, world["irmao"])
        # inclui a própria nota privada do autor (regra do caderno mantida)
        assert _d_uuids(result) == sorted(
            [PUBLIC_D, RESTRICTED_D, USERS_ONLY_D, PRIVATE_NOTE_D]
        )
        assert result.total_discussions == 4
        assert _c_uuids(result) == ["community_geral", "community_homens", "community_membros"]
        assert result.total_communities == 3

    @pytest.mark.asyncio
    async def test_org_member_outside_group_does_not_see_restricted(
        self, db, world, mock_request
    ):
        result = await _search(mock_request, db, world["member"])
        assert _d_uuids(result) == sorted([PUBLIC_D, USERS_ONLY_D])
        assert result.total_discussions == 2
        assert _c_uuids(result) == ["community_geral", "community_membros"]
        assert result.total_communities == 2

    @pytest.mark.asyncio
    async def test_restricted_community_name_not_searchable_by_outsider(
        self, db, world, mock_request
    ):
        result = await _search(mock_request, db, world["member"], query="Exclusivo")
        assert result.communities == []
        assert result.total_communities == 0

    @pytest.mark.asyncio
    async def test_anonymous_sees_only_public_communities(self, db, world, mock_request):
        result = await _search(mock_request, db, world["anon"])
        assert _d_uuids(result) == [PUBLIC_D]
        assert result.total_discussions == 1
        assert _c_uuids(result) == ["community_geral"]
        assert result.total_communities == 1

    @pytest.mark.asyncio
    async def test_signed_in_non_member_sees_only_public(self, db, world, mock_request):
        result = await _search(mock_request, db, world["estranho"])
        assert _d_uuids(result) == [PUBLIC_D]
        assert result.total_discussions == 1
        assert _c_uuids(result) == ["community_geral"]

    @pytest.mark.asyncio
    async def test_admin_sees_restricted_but_not_private_notes(
        self, db, world, mock_request
    ):
        result = await _search(mock_request, db, world["admin"])
        assert _d_uuids(result) == sorted([PUBLIC_D, RESTRICTED_D, USERS_ONLY_D])
        assert result.total_discussions == 3
        assert result.total_communities == 3

    @pytest.mark.asyncio
    async def test_superadmin_sees_restricted_but_not_private_notes(
        self, db, world, mock_request
    ):
        result = await _search(mock_request, db, world["superadmin"])
        assert _d_uuids(result) == sorted([PUBLIC_D, RESTRICTED_D, USERS_ONLY_D])
        assert result.total_discussions == 3

    @pytest.mark.asyncio
    async def test_pagination_totals_exclude_restricted(self, db, world, mock_request):
        seen = []
        for page in (1, 2, 3):
            result = await _search(mock_request, db, world["member"], page=page, limit=1)
            assert result.total_discussions == 2
            seen += [d.discussion_uuid for d in result.discussions]
        assert sorted(seen) == sorted([PUBLIC_D, USERS_ONLY_D])

    @pytest.mark.asyncio
    async def test_api_token_without_community_read_sees_no_community_content(
        self, db, world, mock_request
    ):
        token = APITokenUser(
            org_id=1, created_by_user_id=world["irmao"].id,
            rights={"search": {"action_read": True}},
        )
        result = await _search(mock_request, db, token)
        assert result.discussions == []
        assert result.total_discussions == 0
        assert result.communities == []

    @pytest.mark.asyncio
    async def test_api_token_with_community_read_follows_rbac(
        self, db, world, mock_request
    ):
        token = APITokenUser(
            org_id=1, created_by_user_id=world["member"].id,
            rights={
                "search": {"action_read": True},
                "communities": {"action_read": True},
            },
        )
        result = await _search(mock_request, db, token)
        # RBAC concede leitura de qualquer comunidade da org ao token com o
        # direito; notas privadas continuam fora (tokens nunca leem o caderno).
        assert _d_uuids(result) == sorted([PUBLIC_D, RESTRICTED_D, USERS_ONLY_D])


class TestCommunityListingRespectsOrgMembership:
    @pytest.mark.asyncio
    async def test_member_outside_group(self, db, org, world, mock_request):
        result = await get_communities_by_org(mock_request, org.id, world["member"], db)
        assert sorted(c.community_uuid for c in result) == [
            "community_geral", "community_membros",
        ]

    @pytest.mark.asyncio
    async def test_group_member(self, db, org, world, mock_request):
        result = await get_communities_by_org(mock_request, org.id, world["irmao"], db)
        assert sorted(c.community_uuid for c in result) == [
            "community_geral", "community_homens", "community_membros",
        ]

    @pytest.mark.asyncio
    async def test_signed_in_non_member_does_not_see_users_only(
        self, db, org, world, mock_request
    ):
        result = await get_communities_by_org(mock_request, org.id, world["estranho"], db)
        assert [c.community_uuid for c in result] == ["community_geral"]
