"""Caderno privado: discussions com visibility='private' só são visíveis ao autor.

Cobre todos os caminhos de leitura (lista, get, comentários, votos, reações,
busca, listagem anônima usada pelo sitemap, dossiê de auditoria) e as
transições publicar/despublicar. Admins/moderadores NÃO leem notas privadas
de outros (dado de convicção religiosa — LGPD art. 11).

``check_resource_access`` é substituído por um mock permissivo: simulamos que
todos têm leitura da comunidade, para provar que o filtro de privacidade é
independente do RBAC da comunidade.
"""

from contextlib import ExitStack, contextmanager
from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient

from src.core.events.database import get_db_session
from src.db.communities.communities import Community
from src.db.communities.discussion_comments import DiscussionComment
from src.db.communities.discussion_votes import DiscussionVote
from src.db.communities.discussions import Discussion, DiscussionUpdate
from src.db.organizations import Organization
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, APITokenUser, PublicUser, User
from src.routers.communities.discussions import router as discussions_router
from src.security.auth import get_current_user
from src.services.communities.comment_votes import upvote_comment
from src.services.communities.comments import (
    create_comment,
    get_comment_count,
    get_comments_by_discussion,
)
from src.services.communities.discussions import (
    DiscussionSortBy,
    create_discussion,
    delete_discussion,
    get_discussion,
    get_discussions_by_community,
    lock_discussion,
    pin_discussion,
    update_discussion,
)
from src.services.communities.reactions import get_reactions, toggle_reaction
from src.services.communities.visibility import (
    get_my_notebook,
    set_discussion_visibility,
)
from src.services.communities.votes import (
    get_user_votes_for_discussions,
    remove_upvote,
    upvote_discussion,
)


_COMMUNITY_MODULES = (
    "src.services.communities.discussions",
    "src.services.communities.comments",
    "src.services.communities.votes",
    "src.services.communities.comment_votes",
    "src.services.communities.reactions",
    "src.services.communities.visibility",
)


@contextmanager
def _community_env(is_admin: bool = False):
    """Todos podem ler a comunidade; webhooks/analytics/moderação silenciados."""
    with ExitStack() as stack:
        for mod in _COMMUNITY_MODULES:
            stack.enter_context(
                patch(f"{mod}.check_resource_access", new_callable=AsyncMock)
            )
        stack.enter_context(
            patch(
                "src.services.communities.discussions.authorization_verify_based_on_org_admin_status",
                new_callable=AsyncMock,
                return_value=is_admin,
            )
        )
        for target in (
            "src.services.communities.discussions.track",
            "src.services.communities.discussions.dispatch_webhooks",
            "src.services.communities.discussions.validate_discussion_content",
            "src.services.communities.discussions.enforce_posting_limits",
            "src.services.communities.comments.dispatch_webhooks",
            "src.services.communities.comments.validate_comment_content",
            "src.services.communities.votes.dispatch_webhooks",
            "src.services.communities.visibility.track",
            "src.services.communities.visibility.validate_discussion_content",
        ):
            stack.enter_context(patch(target, new_callable=AsyncMock))
        webhooks = stack.enter_context(
            patch(
                "src.services.communities.visibility.dispatch_webhooks",
                new_callable=AsyncMock,
            )
        )
        yield webhooks


async def _make_community(db, org, *, id=10, uuid="community_vis"):
    community = Community(
        id=id,
        org_id=org.id,
        name="Comunidade",
        description="Desc",
        public=True,
        thumbnail_image="",
        community_uuid=uuid,
        moderation_words=[],
        creation_date="2024-01-01",
        update_date="2024-01-01",
    )
    db.add(community)
    await db.commit()
    await db.refresh(community)
    return community


async def _make_member(db, org, user_role, *, id=3, username="outro"):
    u = User(
        id=id,
        username=username,
        first_name="Outro",
        last_name="Membro",
        email=f"{username}@test.com",
        password="hashed_password",
        user_uuid=f"user_{username}",
        creation_date=str(datetime.now()),
        update_date=str(datetime.now()),
    )
    db.add(u)
    await db.commit()
    db.add(
        UserOrganization(
            user_id=u.id,
            org_id=org.id,
            role_id=user_role.id,
            creation_date=str(datetime.now()),
            update_date=str(datetime.now()),
        )
    )
    await db.commit()
    return PublicUser(
        id=u.id,
        username=u.username,
        first_name=u.first_name,
        last_name=u.last_name,
        email=u.email,
        user_uuid=u.user_uuid,
    )


async def _make_discussion(db, community, author_id, *, uuid, visibility="public",
                           title="Nota", content="Corpo", creation_date=None,
                           is_pinned=False, org_id=None, edit_count=0):
    d = Discussion(
        title=title,
        content=content,
        label="devocional",
        community_id=community.id,
        org_id=org_id if org_id is not None else community.org_id,
        author_id=author_id,
        discussion_uuid=uuid,
        upvote_count=0,
        edit_count=edit_count,
        is_pinned=is_pinned,
        is_locked=False,
        visibility=visibility,
        creation_date=creation_date or "2024-01-01T00:00:00+00:00",
        update_date="2024-01-01T00:00:00+00:00",
    )
    db.add(d)
    await db.commit()
    await db.refresh(d)
    return d


@pytest.fixture
async def setup(db, org, admin_user, regular_user, user_role):
    """regular_user é o autor; admin_user é admin da org; `other` é membro comum."""
    community = await _make_community(db, org)
    other = await _make_member(db, org, user_role)
    private = await _make_discussion(
        db, community, regular_user.id, uuid="discussion_priv",
        visibility="private", title="Segredo devocional",
        creation_date="2024-03-01T00:00:00+00:00",
    )
    public = await _make_discussion(
        db, community, regular_user.id, uuid="discussion_pub",
        title="Devocional publico",
        creation_date="2024-02-01T00:00:00+00:00",
    )
    return {
        "community": community,
        "author": regular_user,
        "admin": admin_user,
        "other": other,
        "anon": AnonymousUser(),
        "private": private,
        "public": public,
    }


def _non_authors(s):
    token = APITokenUser(org_id=1, created_by_user_id=s["author"].id)
    return [s["other"], s["admin"], s["anon"], token]


async def _assert_404(coro):
    with pytest.raises(HTTPException) as exc:
        await coro
    assert exc.value.status_code == 404, exc.value.detail


# ---------------------------------------------------------------------------
# Modelo / criação
# ---------------------------------------------------------------------------


class TestCreateVisibility:
    @pytest.mark.asyncio
    async def test_default_public_and_private_create(self, db, setup, mock_request):
        s = setup
        with _community_env() as webhooks:
            default = await create_discussion(
                mock_request, s["community"].community_uuid, "Titulo publico",
                "c", "general", s["author"], db,
            )
            private = await create_discussion(
                mock_request, s["community"].community_uuid, "Titulo privado",
                "c", "devocional", s["author"], db, visibility="private",
            )
        assert default.visibility == "public"
        assert private.visibility == "private"
        assert private.label == "devocional"
        # Criar uma nota privada não deve disparar webhooks externos
        webhooks.assert_not_called()

    @pytest.mark.asyncio
    async def test_private_create_does_not_dispatch_webhook(self, db, setup, mock_request):
        s = setup
        with _community_env(), patch(
            "src.services.communities.discussions.dispatch_webhooks",
            new_callable=AsyncMock,
        ) as webhooks, patch(
            "src.services.communities.discussions.track", new_callable=AsyncMock
        ) as track:
            await create_discussion(
                mock_request, s["community"].community_uuid, "Titulo privado",
                "c", "devocional", s["author"], db, visibility="private",
            )
        webhooks.assert_not_called()
        track.assert_not_called()

    @pytest.mark.asyncio
    async def test_invalid_visibility_rejected(self, db, setup, mock_request):
        s = setup
        with _community_env():
            with pytest.raises(HTTPException) as exc:
                await create_discussion(
                    mock_request, s["community"].community_uuid, "Titulo x",
                    "c", "general", s["author"], db, visibility="secret",
                )
        assert exc.value.status_code == 422


# ---------------------------------------------------------------------------
# Leitura: get / lista
# ---------------------------------------------------------------------------


class TestReadPaths:
    @pytest.mark.asyncio
    async def test_author_gets_private(self, db, setup, mock_request):
        s = setup
        with _community_env():
            d = await get_discussion(mock_request, "discussion_priv", s["author"], db)
        assert d.visibility == "private"
        assert d.title == "Segredo devocional"

    @pytest.mark.asyncio
    async def test_non_authors_get_404(self, db, setup, mock_request):
        s = setup
        for user in _non_authors(s):
            with _community_env(is_admin=True):
                await _assert_404(get_discussion(mock_request, "discussion_priv", user, db))

    @pytest.mark.asyncio
    async def test_list_excludes_private_for_non_authors(self, db, setup, mock_request):
        s = setup
        # Uma privada fixada não pode "vazar" pela consulta de fixadas.
        await _make_discussion(
            db, s["community"], s["author"].id, uuid="discussion_priv_pinned",
            visibility="private", is_pinned=True,
        )
        for sort in (DiscussionSortBy.RECENT, DiscussionSortBy.UPVOTES, DiscussionSortBy.HOT):
            for user in _non_authors(s):
                with _community_env(is_admin=True):
                    items = await get_discussions_by_community(
                        mock_request, s["community"].community_uuid, user, db,
                        sort_by=sort, limit=100,
                    )
                    labelled = await get_discussions_by_community(
                        mock_request, s["community"].community_uuid, user, db,
                        sort_by=sort, limit=100, label="devocional",
                    )
                uuids = {d.discussion_uuid for d in items} | {d.discussion_uuid for d in labelled}
                assert uuids == {"discussion_pub"}, (user, uuids)
                # contagem visível = só públicas
                assert len(items) == 1

    @pytest.mark.asyncio
    async def test_list_includes_own_private_for_author(self, db, setup, mock_request):
        s = setup
        with _community_env():
            items = await get_discussions_by_community(
                mock_request, s["community"].community_uuid, s["author"], db, limit=100,
            )
        assert {d.discussion_uuid for d in items} == {"discussion_priv", "discussion_pub"}

    @pytest.mark.asyncio
    async def test_batch_votes_does_not_reveal_private(self, db, setup, mock_request):
        s = setup
        db.add(DiscussionVote(
            discussion_id=s["private"].id, user_id=s["other"].id,
            vote_uuid="vote_old", creation_date="2024-01-01",
        ))
        await db.commit()
        result = await get_user_votes_for_discussions(
            mock_request, ["discussion_priv"], s["other"], db
        )
        assert result == {"discussion_priv": False}


# ---------------------------------------------------------------------------
# Interações: comentários, votos, reações
# ---------------------------------------------------------------------------


class TestInteractions:
    @pytest.fixture
    async def old_comment(self, db, setup):
        # Comentário feito enquanto era pública e depois despublicada.
        c = DiscussionComment(
            content="Amém",
            discussion_id=setup["private"].id,
            author_id=setup["other"].id,
            comment_uuid="comment_old",
            creation_date="2024-01-02",
            update_date="2024-01-02",
        )
        db.add(c)
        await db.commit()
        return c

    @pytest.mark.asyncio
    async def test_non_authors_get_404_everywhere(self, db, setup, old_comment, mock_request):
        s = setup
        for user in _non_authors(s):
            with _community_env(is_admin=True):
                await _assert_404(get_comments_by_discussion(mock_request, "discussion_priv", user, db))
                await _assert_404(get_comment_count(mock_request, "discussion_priv", user, db))
                await _assert_404(get_reactions(mock_request, "discussion_priv", user, db))
                if user.id == 0:
                    continue  # anônimo/token já são barrados antes (403 de login)
                await _assert_404(create_comment(mock_request, "discussion_priv", "oi", user, db))
                await _assert_404(upvote_discussion(mock_request, "discussion_priv", user, db))
                await _assert_404(remove_upvote(mock_request, "discussion_priv", user, db))
                await _assert_404(toggle_reaction(mock_request, "discussion_priv", "🙏", user, db))
                await _assert_404(upvote_comment(mock_request, "comment_old", user, db))

    @pytest.mark.asyncio
    async def test_author_cannot_interact_but_can_read(self, db, setup, old_comment, mock_request):
        s = setup
        author = s["author"]
        with _community_env():
            comments = await get_comments_by_discussion(mock_request, "discussion_priv", author, db)
            count = await get_comment_count(mock_request, "discussion_priv", author, db)
            reactions = await get_reactions(mock_request, "discussion_priv", author, db)
            for coro in (
                create_comment(mock_request, "discussion_priv", "oi", author, db),
                upvote_discussion(mock_request, "discussion_priv", author, db),
                toggle_reaction(mock_request, "discussion_priv", "🙏", author, db),
                upvote_comment(mock_request, "comment_old", author, db),
            ):
                with pytest.raises(HTTPException) as exc:
                    await coro
                assert exc.value.status_code == 403
        assert [c.comment_uuid for c in comments] == ["comment_old"]
        assert count == 1
        assert reactions == []


# ---------------------------------------------------------------------------
# Moderação: admin não enxerga nem age sobre notas privadas
# ---------------------------------------------------------------------------


class TestModerationPaths:
    @pytest.mark.asyncio
    async def test_admin_cannot_update_pin_lock_delete_private(self, db, setup, mock_request):
        s = setup
        admin = s["admin"]
        with _community_env(is_admin=True):
            await _assert_404(update_discussion(
                mock_request, "discussion_priv", DiscussionUpdate(title="x" * 6), admin, db
            ))
            await _assert_404(pin_discussion(mock_request, "discussion_priv", True, admin, db))
            await _assert_404(lock_discussion(mock_request, "discussion_priv", True, admin, db))
            await _assert_404(delete_discussion(mock_request, "discussion_priv", admin, db))
        refreshed = (await db.get(Discussion, s["private"].id))
        assert refreshed is not None and refreshed.is_pinned is False

    @pytest.mark.asyncio
    async def test_author_edits_private_without_edit_limit(self, db, setup, mock_request):
        s = setup
        await _make_discussion(
            db, s["community"], s["author"].id, uuid="discussion_priv_edits",
            visibility="private", edit_count=5,
        )
        with _community_env():
            updated = await update_discussion(
                mock_request, "discussion_priv_edits",
                DiscussionUpdate(content="Novo texto"), s["author"], db,
            )
        assert updated.content == "Novo texto"
        assert updated.edit_count == 5  # notas privadas não consomem edições

    @pytest.mark.asyncio
    async def test_admin_cannot_change_visibility_via_put(self, db, setup, mock_request):
        s = setup
        with _community_env(is_admin=True):
            with pytest.raises(HTTPException) as exc:
                await update_discussion(
                    mock_request, "discussion_pub",
                    DiscussionUpdate(visibility="private"), s["admin"], db,
                )
        assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# Publicar / despublicar
# ---------------------------------------------------------------------------


class TestSetVisibility:
    @pytest.mark.asyncio
    async def test_publish_makes_it_visible(self, db, setup, mock_request):
        s = setup
        with _community_env() as webhooks:
            result = await set_discussion_visibility(
                mock_request, "discussion_priv", "public", s["author"], db
            )
        assert result.visibility == "public"
        webhooks.assert_called_once()
        with _community_env():
            seen = await get_discussion(mock_request, "discussion_priv", s["other"], db)
            listed = await get_discussions_by_community(
                mock_request, s["community"].community_uuid, s["anon"], db, limit=100,
            )
        assert seen.title == "Segredo devocional"
        assert "discussion_priv" in {d.discussion_uuid for d in listed}
        # publicar leva a nota para o topo de "recentes"
        assert listed[0].discussion_uuid == "discussion_priv"

    @pytest.mark.asyncio
    async def test_unpublish_hides_it(self, db, setup, mock_request):
        s = setup
        with _community_env() as webhooks:
            result = await set_discussion_visibility(
                mock_request, "discussion_pub", "private", s["author"], db
            )
        assert result.visibility == "private"
        webhooks.assert_not_called()
        with _community_env():
            await _assert_404(get_discussion(mock_request, "discussion_pub", s["other"], db))
            listed = await get_discussions_by_community(
                mock_request, s["community"].community_uuid, s["other"], db, limit=100,
            )
        assert listed == []

    @pytest.mark.asyncio
    async def test_only_author_can_change(self, db, setup, mock_request):
        s = setup
        for user in (s["other"], s["admin"]):
            with _community_env(is_admin=True):
                await _assert_404(set_discussion_visibility(
                    mock_request, "discussion_priv", "public", user, db
                ))
                with pytest.raises(HTTPException) as exc:
                    await set_discussion_visibility(
                        mock_request, "discussion_pub", "private", user, db
                    )
                assert exc.value.status_code == 403
        with _community_env():
            with pytest.raises(HTTPException) as exc:
                await set_discussion_visibility(
                    mock_request, "discussion_pub", "private", s["anon"], db
                )
            assert exc.value.status_code in (401, 403)

    @pytest.mark.asyncio
    async def test_invalid_value(self, db, setup, mock_request):
        s = setup
        with _community_env():
            with pytest.raises(HTTPException) as exc:
                await set_discussion_visibility(
                    mock_request, "discussion_priv", "friends", s["author"], db
                )
        assert exc.value.status_code == 422


# ---------------------------------------------------------------------------
# Meu caderno
# ---------------------------------------------------------------------------


class TestNotebook:
    @pytest.mark.asyncio
    async def test_lists_only_own_private_newest_first(self, db, org, setup, mock_request):
        s = setup
        second = await _make_community(db, org, id=11, uuid="community_vis2")
        await _make_discussion(
            db, second, s["author"].id, uuid="discussion_priv_newer",
            visibility="private", creation_date="2024-05-01T00:00:00+00:00",
        )
        await _make_discussion(
            db, second, s["other"].id, uuid="discussion_priv_other",
            visibility="private",
        )
        other_org = Organization(
            id=2, name="Outra", slug="outra", email="o@o.com", org_uuid="org_outra",
            creation_date="2024", update_date="2024",
        )
        db.add(other_org)
        await db.commit()
        foreign = await _make_community(db, other_org, id=12, uuid="community_foreign")
        await _make_discussion(
            db, foreign, s["author"].id, uuid="discussion_priv_foreign",
            visibility="private",
        )

        page1 = await get_my_notebook(mock_request, org.id, s["author"], db, page=1, limit=1)
        page2 = await get_my_notebook(mock_request, org.id, s["author"], db, page=2, limit=1)
        everything = await get_my_notebook(mock_request, org.id, s["author"], db)

        assert [d.discussion_uuid for d in everything] == [
            "discussion_priv_newer", "discussion_priv",
        ]
        assert [d.discussion_uuid for d in page1] == ["discussion_priv_newer"]
        assert [d.discussion_uuid for d in page2] == ["discussion_priv"]
        assert everything[0].community_uuid == "community_vis2"
        assert everything[0].community_name == "Comunidade"

    @pytest.mark.asyncio
    async def test_others_get_their_own_empty_notebook(self, db, org, setup, mock_request):
        s = setup
        assert await get_my_notebook(mock_request, org.id, s["other"], db) == []
        assert await get_my_notebook(mock_request, org.id, s["admin"], db) == []
        with pytest.raises(HTTPException):
            await get_my_notebook(mock_request, org.id, s["anon"], db)


# ---------------------------------------------------------------------------
# Busca
# ---------------------------------------------------------------------------


class TestSearch:
    @pytest.mark.asyncio
    async def test_search_excludes_private_for_others(self, db, setup, mock_request):
        from src.services.search.search import search_across_org

        s = setup
        for user, member in ((s["other"], True), (s["admin"], True), (s["anon"], False)):
            with patch(
                "src.services.search.search.search_courses",
                new_callable=AsyncMock, return_value=[],
            ), patch(
                "src.services.search.search.is_org_member", return_value=member,
            ):
                result = await search_across_org(
                    mock_request, user, "test-org", "devocional", db
                )
            assert [d.discussion_uuid for d in result.discussions] == ["discussion_pub"]
            assert result.total_discussions == 1

    @pytest.mark.asyncio
    async def test_search_author_sees_own_private(self, db, setup, mock_request):
        from src.services.search.search import search_across_org

        s = setup
        with patch(
            "src.services.search.search.search_courses",
            new_callable=AsyncMock, return_value=[],
        ), patch("src.services.search.search.is_org_member", return_value=True):
            result = await search_across_org(
                mock_request, s["author"], "test-org", "Segredo", db
            )
        assert [d.discussion_uuid for d in result.discussions] == ["discussion_priv"]


# ---------------------------------------------------------------------------
# Dossiê de auditoria (visão do admin)
# ---------------------------------------------------------------------------


class TestDossier:
    @pytest.mark.asyncio
    async def test_dossier_excludes_private_by_default(self, db, org, setup):
        from src.services.audit.dossier import _community

        s = setup
        db.add(DiscussionComment(
            content="Comentario antigo", discussion_id=s["private"].id,
            author_id=s["other"].id, comment_uuid="comment_on_private",
            creation_date="2024-01-02", update_date="2024-01-02",
        ))
        await db.commit()

        author_view = await _community(db, s["author"].id, org.id)
        assert [d["discussion_uuid"] for d in author_view["discussions"]] == ["discussion_pub"]
        assert author_view["discussions_count"] == 1

        # O título da nota privada não pode vazar pelo comentário de outro membro.
        other_view = await _community(db, s["other"].id, org.id)
        assert other_view["comments"] == []

    @pytest.mark.asyncio
    async def test_dossier_self_export_includes_own_private(self, db, org, setup):
        from src.services.audit.dossier import _community

        s = setup
        own = await _community(db, s["author"].id, org.id, include_private=True)
        assert {d["discussion_uuid"] for d in own["discussions"]} == {
            "discussion_priv", "discussion_pub",
        }


# ---------------------------------------------------------------------------
# Router: PATCH visibility, GET notebook, listagem anônima (sitemap)
# ---------------------------------------------------------------------------


class _UserSwitch:
    def __init__(self, user):
        self.user = user

    def __call__(self):
        return self.user


@pytest.fixture
async def router_env(db, setup):
    switch = _UserSwitch(setup["author"])
    app = FastAPI()
    app.include_router(discussions_router, prefix="/api/v1")
    app.dependency_overrides[get_db_session] = lambda: db
    app.dependency_overrides[get_current_user] = switch
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c, switch
    app.dependency_overrides.clear()


class TestRouter:
    @pytest.mark.asyncio
    async def test_create_private_via_api_and_read_schema(self, router_env, setup):
        client, _ = router_env
        with _community_env():
            res = await client.post(
                "/api/v1/communities/community_vis/discussions",
                json={"title": "Nota do caderno", "content": "x", "label": "devocional",
                      "visibility": "private"},
            )
        assert res.status_code == 200, res.text
        assert res.json()["visibility"] == "private"

    @pytest.mark.asyncio
    async def test_patch_visibility_and_notebook(self, router_env, setup):
        client, switch = router_env
        with _community_env():
            nb = await client.get("/api/v1/discussions/notebook", params={"org_id": 1})
            assert nb.status_code == 200, nb.text
            assert [d["discussion_uuid"] for d in nb.json()] == ["discussion_priv"]

            switch.user = setup["other"]
            denied = await client.patch(
                "/api/v1/discussions/discussion_priv/visibility",
                json={"visibility": "public"},
            )
            assert denied.status_code == 404

            switch.user = setup["author"]
            ok = await client.patch(
                "/api/v1/discussions/discussion_priv/visibility",
                json={"visibility": "public"},
            )
            assert ok.status_code == 200, ok.text
            assert ok.json()["visibility"] == "public"

            bad = await client.patch(
                "/api/v1/discussions/discussion_priv/visibility",
                json={"visibility": "secret"},
            )
            assert bad.status_code == 422

            nb_after = await client.get("/api/v1/discussions/notebook", params={"org_id": 1})
            assert nb_after.json() == []

    @pytest.mark.asyncio
    async def test_anonymous_listing_used_by_sitemap_excludes_private(self, router_env, setup):
        client, switch = router_env
        switch.user = AnonymousUser()
        with _community_env():
            res = await client.get(
                "/api/v1/communities/community_vis/discussions",
                params={"limit": 100, "sort_by": "recent"},
            )
            get_res = await client.get("/api/v1/discussions/discussion_priv")
            comments = await client.get("/api/v1/discussions/discussion_priv/comments")
        assert res.status_code == 200
        assert [d["discussion_uuid"] for d in res.json()] == ["discussion_pub"]
        assert get_res.status_code == 404
        assert comments.status_code == 404
