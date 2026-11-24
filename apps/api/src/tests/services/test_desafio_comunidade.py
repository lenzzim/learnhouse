"""Comunidade de desafio: só quem se inscreveu no curso ligado lê e publica.

Decisão do dono (22/11/2026): um desafio é um curso nativo com uma comunidade
ligada por ``Community.course_id``. Inscrever-se = "começar curso"
(``add_course_to_trail``, que cria um ``TrailRun``). As discussões dessa
comunidade só podem ser lidas e publicadas por inscritos, admins e
mantenedores — nem ``public=True`` abre a comunidade para os demais.

Desafio separado por gênero = curso não público com o grupo "Mulheres" (ou
"Homens") vinculado em ``usergroup_resources``.

Nada de RBAC é mockado aqui: os testes rodam a regra real contra o SQLite.
Cada chamada usa um ``Request`` novo, como numa requisição HTTP de verdade (o
checker de acesso é memorizado por requisição em ``request.state``).
"""

from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from src.db.communities.communities import Community
from src.db.communities.discussions import Discussion
from src.db.courses.courses import Course
from src.db.trail_runs import TrailRun
from src.db.trails import Trail
from src.db.user_organizations import UserOrganization
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import AnonymousUser, PublicUser, User
from src.services.communities.comments import create_comment
from src.services.communities.communities import (
    get_communities_by_org,
    get_community,
    get_community_by_course,
    get_community_user_rights,
)
from src.services.communities.desafio import get_current_challenge
from src.services.communities.discussions import (
    create_discussion,
    get_discussion,
    get_discussions_by_community,
)
from src.services.communities.reactions import toggle_reaction
from src.services.communities.votes import upvote_discussion
from src.services.search.search import search_across_org
from src.services.trail.trail import add_course_to_trail


QUERY = "jejum"

D_GERAL = "discussion_geral"
D_DESAFIO = "discussion_desafio"
D_MULHERES = "discussion_mulheres"

C_GERAL = "community_geral"
C_DESAFIO = "community_desafio"
C_MULHERES = "community_mulheres"

CURSO_CONJUNTO = "course_desafio_conjunto"
CURSO_MULHERES = "course_desafio_mulheres"


def _now() -> str:
    return str(datetime.now())


def _req() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/", "headers": [], "query_string": b""})


async def _user(db, org, *, id, username, role_id):
    u = User(
        id=id, username=username, first_name=username.title(), last_name="Teste",
        email=f"{username}@test.com", password="hashed_password",
        user_uuid=f"user_{username}", creation_date=_now(), update_date=_now(),
    )
    db.add(u)
    await db.commit()
    db.add(UserOrganization(
        user_id=u.id, org_id=org.id, role_id=role_id,
        creation_date=_now(), update_date=_now(),
    ))
    await db.commit()
    return PublicUser(
        id=u.id, username=u.username, first_name=u.first_name,
        last_name=u.last_name, email=u.email, user_uuid=u.user_uuid,
    )


async def _trail(db, org, user_id, trail_id):
    db.add(Trail(
        id=trail_id, org_id=org.id, user_id=user_id, trail_uuid=f"trail_{user_id}",
        creation_date=_now(), update_date=_now(),
    ))
    await db.commit()


async def _enroll(db, org, user_id, trail_id, course_id):
    db.add(TrailRun(
        trail_id=trail_id, course_id=course_id, org_id=org.id, user_id=user_id,
        creation_date=_now(), update_date=_now(),
    ))
    await db.commit()


async def _course(db, org, *, id, uuid, name, public, published=True, created="2026-11-01 10:00:00"):
    c = Course(
        id=id, name=name, description=f"{name} {QUERY}", public=public,
        published=published, open_to_contributors=False, org_id=org.id,
        course_uuid=uuid, creation_date=created, update_date=created,
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


async def _community(db, org, *, id, uuid, name, public, course_id=None):
    c = Community(
        id=id, org_id=org.id, name=name, description=f"{name} {QUERY}",
        public=public, thumbnail_image="", community_uuid=uuid, course_id=course_id,
        moderation_words=[], creation_date=f"2026-11-0{id % 9 + 1}",
        update_date="2026-11-01",
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


async def _discussion(db, community, author_id, *, uuid):
    db.add(Discussion(
        title=f"Diário de {QUERY} {uuid}", content="Corpo", label="general",
        community_id=community.id, org_id=community.org_id, author_id=author_id,
        discussion_uuid=uuid, upvote_count=0, edit_count=0, is_pinned=False,
        is_locked=False, visibility="public",
        creation_date="2026-11-10T00:00:00+00:00",
        update_date="2026-11-10T00:00:00+00:00",
    ))
    await db.commit()


async def _group(db, org, *, id, name, resources, members):
    g = UserGroup(
        id=id, org_id=org.id, name=name, description="",
        usergroup_uuid=f"usergroup_{name.lower()}", creation_date=_now(), update_date=_now(),
    )
    db.add(g)
    await db.commit()
    for uuid in resources:
        db.add(UserGroupResource(
            usergroup_id=g.id, resource_uuid=uuid, org_id=org.id,
            creation_date=_now(), update_date=_now(),
        ))
    for user in members:
        db.add(UserGroupUser(
            usergroup_id=g.id, user_id=user.id, org_id=org.id,
            creation_date=_now(), update_date=_now(),
        ))
    await db.commit()


@pytest.fixture
async def world(db, org, admin_user, regular_user, user_role):
    """
    - ``geral``: comunidade pública comum.
    - desafio conjunto: curso não público (membros da org) + comunidade
      ``public=True`` ligada a ele (prova que a inscrição vale mais que o
      ``public``).
    - desafio das mulheres: curso não público com o grupo "Mulheres"
      vinculado + comunidade ligada (criado depois, então é o mais recente).

    ``inscrito`` começou o desafio conjunto; ``regular_user`` é membro e não se
    inscreveu; ``maria`` é do grupo Mulheres e começou o desafio delas;
    ``joao`` é do grupo Homens; ``admin_user`` é admin da org.
    """
    inscrito = await _user(db, org, id=5, username="inscrito", role_id=user_role.id)
    maria = await _user(db, org, id=6, username="maria", role_id=user_role.id)
    joao = await _user(db, org, id=7, username="joao", role_id=user_role.id)

    conjunto = await _course(
        db, org, id=20, uuid=CURSO_CONJUNTO, name="Desafio 21 dias", public=False,
        created="2026-11-01 10:00:00",
    )
    mulheres = await _course(
        db, org, id=21, uuid=CURSO_MULHERES, name="Desafio Mulheres", public=False,
        created="2026-11-05 10:00:00",
    )

    geral = await _community(db, org, id=10, uuid=C_GERAL, name="Geral", public=True)
    desafio = await _community(
        db, org, id=11, uuid=C_DESAFIO, name="Desafio 21 dias", public=True,
        course_id=conjunto.id,
    )
    c_mulheres = await _community(
        db, org, id=12, uuid=C_MULHERES, name="Desafio Mulheres", public=False,
        course_id=mulheres.id,
    )

    await _group(db, org, id=1, name="Mulheres", resources=[CURSO_MULHERES, C_MULHERES], members=[maria])
    await _group(db, org, id=2, name="Homens", resources=[], members=[joao])

    for i, u in enumerate([admin_user, regular_user, inscrito, maria, joao], start=1):
        await _trail(db, org, u.id, trail_id=100 + i)
    await _enroll(db, org, inscrito.id, 103, conjunto.id)
    await _enroll(db, org, maria.id, 104, mulheres.id)

    await _discussion(db, geral, regular_user.id, uuid=D_GERAL)
    await _discussion(db, desafio, inscrito.id, uuid=D_DESAFIO)
    await _discussion(db, c_mulheres, maria.id, uuid=D_MULHERES)

    return {
        "inscrito": inscrito,
        "membro": regular_user,
        "maria": maria,
        "joao": joao,
        "admin": admin_user,
        "anon": AnonymousUser(),
        "conjunto": conjunto,
        "mulheres": mulheres,
    }


@pytest.fixture
def sem_efeitos_externos():
    """Analytics, webhooks e auditoria viram no-op."""
    with patch("src.services.communities.discussions.track", new_callable=AsyncMock), \
         patch("src.services.communities.discussions.dispatch_webhooks", new_callable=AsyncMock), \
         patch("src.services.communities.comments.dispatch_webhooks", new_callable=AsyncMock), \
         patch("src.services.communities.votes.dispatch_webhooks", new_callable=AsyncMock), \
         patch("src.services.trail.trail.track", new_callable=AsyncMock), \
         patch("src.services.trail.trail.record_audit_event", new_callable=AsyncMock), \
         patch("src.services.trail.trail.dispatch_webhooks", new_callable=AsyncMock):
        yield


async def _negado(coro):
    with pytest.raises(HTTPException) as exc:
        await coro
    assert exc.value.status_code in (403, 404)


async def _search(db, user, query=QUERY):
    with patch(
        "src.services.search.search.search_courses",
        new_callable=AsyncMock, return_value=[],
    ):
        return await search_across_org(_req(), user, "test-org", query, db)


def _d(result):
    return sorted(d.discussion_uuid for d in result.discussions)


def _c(result):
    return sorted(c.community_uuid for c in result.communities)


# ---------------------------------------------------------------------------
# Leitura direta (URL)
# ---------------------------------------------------------------------------


class TestLeituraDireta:
    @pytest.mark.asyncio
    async def test_inscrito_le_comunidade_e_discussoes(self, db, world):
        u = world["inscrito"]
        assert (await get_community(_req(), C_DESAFIO, u, db)).community_uuid == C_DESAFIO
        assert (await get_discussion(_req(), D_DESAFIO, u, db)).discussion_uuid == D_DESAFIO
        lista = await get_discussions_by_community(_req(), C_DESAFIO, u, db)
        assert [d.discussion_uuid for d in lista] == [D_DESAFIO]

    @pytest.mark.asyncio
    async def test_membro_nao_inscrito_nao_le_nem_por_url(self, db, world):
        u = world["membro"]
        await _negado(get_community(_req(), C_DESAFIO, u, db))
        await _negado(get_discussion(_req(), D_DESAFIO, u, db))
        await _negado(get_discussions_by_community(_req(), C_DESAFIO, u, db))
        # Pela página do curso: null, como curso sem comunidade (sem 403 no console).
        assert await get_community_by_course(_req(), CURSO_CONJUNTO, u, db) is None

    @pytest.mark.asyncio
    async def test_visitante_nao_le_mesmo_com_public_true(self, db, world):
        await _negado(get_community(_req(), C_DESAFIO, world["anon"], db))
        await _negado(get_discussion(_req(), D_DESAFIO, world["anon"], db))

    @pytest.mark.asyncio
    async def test_admin_le_sem_inscricao(self, db, world):
        u = world["admin"]
        assert (await get_community(_req(), C_DESAFIO, u, db)).community_uuid == C_DESAFIO
        assert (await get_discussion(_req(), D_DESAFIO, u, db)).discussion_uuid == D_DESAFIO
        assert (await get_community(_req(), C_MULHERES, u, db)).community_uuid == C_MULHERES

    @pytest.mark.asyncio
    async def test_comunidade_comum_continua_aberta(self, db, world):
        assert (await get_community(_req(), C_GERAL, world["membro"], db)).community_uuid == C_GERAL
        assert (await get_community(_req(), C_GERAL, world["anon"], db)).community_uuid == C_GERAL


# ---------------------------------------------------------------------------
# Publicar, comentar, reagir, votar
# ---------------------------------------------------------------------------


class TestInteracoes:
    @pytest.mark.asyncio
    async def test_inscrito_publica_comenta_reage(self, db, world, sem_efeitos_externos):
        u = world["inscrito"]
        nova = await create_discussion(_req(), C_DESAFIO, "Dia 1", "Corpo", "general", u, db)
        assert nova.community_id == 11
        comentario = await create_comment(_req(), D_DESAFIO, "Amém", u, db)
        assert comentario is not None
        await toggle_reaction(_req(), D_DESAFIO, "🙏", u, db)

    @pytest.mark.asyncio
    async def test_nao_inscrito_nao_publica_comenta_reage_vota(self, db, world, sem_efeitos_externos):
        u = world["membro"]
        await _negado(create_discussion(_req(), C_DESAFIO, "Intruso", "Corpo", "general", u, db))
        await _negado(create_comment(_req(), D_DESAFIO, "Oi", u, db))
        await _negado(toggle_reaction(_req(), D_DESAFIO, "🙏", u, db))
        await _negado(upvote_discussion(_req(), D_DESAFIO, u, db))


# ---------------------------------------------------------------------------
# Busca e listagem (sem vazamento)
# ---------------------------------------------------------------------------


class TestBuscaEListagem:
    @pytest.mark.asyncio
    async def test_busca_inscrito_ve_desafio(self, db, world):
        r = await _search(db, world["inscrito"])
        assert _d(r) == sorted([D_GERAL, D_DESAFIO])
        assert _c(r) == sorted([C_GERAL, C_DESAFIO])
        assert r.total_discussions == 2

    @pytest.mark.asyncio
    async def test_busca_nao_inscrito_nao_ve_desafio(self, db, world):
        r = await _search(db, world["membro"])
        assert _d(r) == [D_GERAL]
        assert _c(r) == [C_GERAL]
        assert r.total_discussions == 1
        assert r.total_communities == 1

    @pytest.mark.asyncio
    async def test_busca_pelo_nome_do_desafio_nao_vaza(self, db, world):
        r = await _search(db, world["membro"], query="21 dias")
        assert r.communities == []
        assert r.total_communities == 0

    @pytest.mark.asyncio
    async def test_busca_visitante(self, db, world):
        r = await _search(db, world["anon"])
        assert _d(r) == [D_GERAL]
        assert _c(r) == [C_GERAL]

    @pytest.mark.asyncio
    async def test_busca_admin_ve_tudo(self, db, world):
        r = await _search(db, world["admin"])
        assert _d(r) == sorted([D_GERAL, D_DESAFIO, D_MULHERES])

    @pytest.mark.asyncio
    async def test_listagem(self, db, org, world):
        async def uuids(user):
            return sorted(c.community_uuid for c in await get_communities_by_org(_req(), org.id, user, db))

        assert await uuids(world["inscrito"]) == sorted([C_GERAL, C_DESAFIO])
        assert await uuids(world["membro"]) == [C_GERAL]
        assert await uuids(world["anon"]) == [C_GERAL]
        assert await uuids(world["maria"]) == sorted([C_GERAL, C_MULHERES])
        assert await uuids(world["admin"]) == sorted([C_GERAL, C_DESAFIO, C_MULHERES])


# ---------------------------------------------------------------------------
# Desafio separado por gênero
# ---------------------------------------------------------------------------


class TestDesafioSeparado:
    @pytest.mark.asyncio
    async def test_outro_genero_nao_ve_nem_se_inscreve(self, db, org, world, sem_efeitos_externos):
        joao = world["joao"]
        listadas = [c.community_uuid for c in await get_communities_by_org(_req(), org.id, joao, db)]
        assert C_MULHERES not in listadas
        await _negado(get_community(_req(), C_MULHERES, joao, db))
        await _negado(get_discussion(_req(), D_MULHERES, joao, db))
        assert D_MULHERES not in _d(await _search(db, joao))
        await _negado(add_course_to_trail(_req(), joao, CURSO_MULHERES, db))
        atual = await get_current_challenge(_req(), org.id, joao, db)
        assert atual is not None and atual.course_uuid == CURSO_CONJUNTO

    @pytest.mark.asyncio
    async def test_genero_certo_inscrito_le(self, db, org, world):
        maria = world["maria"]
        assert (await get_discussion(_req(), D_MULHERES, maria, db)).discussion_uuid == D_MULHERES
        atual = await get_current_challenge(_req(), org.id, maria, db)
        assert atual.course_uuid == CURSO_MULHERES
        assert atual.community_uuid == C_MULHERES
        assert atual.is_enrolled is True


# ---------------------------------------------------------------------------
# Inscrição, direitos e desafio atual
# ---------------------------------------------------------------------------


class TestInscricaoEDesafioAtual:
    @pytest.mark.asyncio
    async def test_inscrever_libera_a_comunidade(self, db, org, world, sem_efeitos_externos):
        u = world["membro"]
        await _negado(get_community(_req(), C_DESAFIO, u, db))
        await add_course_to_trail(_req(), u, CURSO_CONJUNTO, db)
        assert (await get_community(_req(), C_DESAFIO, u, db)).community_uuid == C_DESAFIO
        atual = await get_current_challenge(_req(), org.id, u, db)
        assert atual.course_uuid == CURSO_CONJUNTO and atual.is_enrolled is True

    @pytest.mark.asyncio
    async def test_direitos_mostram_inscricao_necessaria(self, db, world):
        r = await get_community_user_rights(_req(), C_DESAFIO, world["membro"], db)
        assert r["permissions"]["read"] is False
        assert r["permissions"]["create_discussion"] is False
        assert r["access"]["requires_enrollment"] is True
        assert r["access"]["is_enrolled"] is False
        assert r["access"]["course_uuid"] == CURSO_CONJUNTO

        r = await get_community_user_rights(_req(), C_DESAFIO, world["inscrito"], db)
        assert r["permissions"]["read"] is True
        assert r["access"]["is_enrolled"] is True

        r = await get_community_user_rights(_req(), C_DESAFIO, world["anon"], db)
        assert r["permissions"]["read"] is False

    @pytest.mark.asyncio
    async def test_direitos_nao_revelam_curso_restrito(self, db, world):
        r = await get_community_user_rights(_req(), C_MULHERES, world["joao"], db)
        assert r["permissions"]["read"] is False
        assert r["access"]["course_uuid"] is None

    @pytest.mark.asyncio
    async def test_desafio_atual_nao_inscrito(self, db, org, world):
        atual = await get_current_challenge(_req(), org.id, world["membro"], db)
        assert atual.course_uuid == CURSO_CONJUNTO
        assert atual.community_uuid == C_DESAFIO
        assert atual.is_enrolled is False

    @pytest.mark.asyncio
    async def test_desafio_atual_visitante_e_nenhum(self, db, org, world):
        assert await get_current_challenge(_req(), org.id, world["anon"], db) is None

    @pytest.mark.asyncio
    async def test_fechar_desafio_despublicando(self, db, org, world):
        conjunto = world["conjunto"]
        conjunto.published = False
        db.add(conjunto)
        await db.commit()
        assert await get_current_challenge(_req(), org.id, world["membro"], db) is None
        # quem participou continua com as conversas
        assert (await get_community(_req(), C_DESAFIO, world["inscrito"], db)).community_uuid == C_DESAFIO

    @pytest.mark.asyncio
    async def test_curso_sem_comunidade_nao_e_desafio(self, db, org, world):
        await _course(
            db, org, id=30, uuid="course_avulso", name="Curso avulso", public=True,
            created="2026-11-20 10:00:00",
        )
        atual = await get_current_challenge(_req(), org.id, world["membro"], db)
        assert atual.course_uuid == CURSO_CONJUNTO
