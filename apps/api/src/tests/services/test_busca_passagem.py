"""Busca de posts por passagem bíblica (pedido do dono de 24/11/2026).

- abreviações com e sem espaço e acento ("1 Pe", "1Pe", "1pedro", "Sl", "Salmo");
- os quatro casos: livro, capítulo, intervalo (exato) e versículo (contido);
- indexação ao criar/editar/publicar, com as regras de detecção do Caderno
  (citação "— João 3:16 (NVI)" e menção "Jo 3:16 (NVI)");
- vazamento: comunidade restrita por grupo, desafio só para inscritos e nota
  privada (nem para o próprio autor).

Nada de RBAC é mockado: as regras reais rodam contra o SQLite.
"""

from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest
from sqlalchemy import text
from sqlmodel import select
from starlette.requests import Request

from src.db.busca_biblica import DiscussionBibleRef
from src.db.communities.communities import Community
from src.db.communities.discussions import Discussion, DiscussionUpdate
from src.db.courses.courses import Course
from src.db.trail_runs import TrailRun
from src.db.trails import Trail
from src.db.user_organizations import UserOrganization
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import AnonymousUser, PublicUser, User
from src.services.biblia.referencias import encontrar_referencias, interpretar_consulta
from src.services.search.passagens import (
    buscar_por_passagem,
    extrair_referencias,
    indexar_discussao,
    reindexar_todas,
)


def _now() -> str:
    return str(datetime.now())


def _req() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/", "headers": [], "query_string": b""})


# ---------------------------------------------------------------------------
# Parser (puro)
# ---------------------------------------------------------------------------


@pytest.mark.parametrize("consulta,codigo,tipo", [
    ("1 Pe", "1PE", "livro"),
    ("1Pe", "1PE", "livro"),
    ("1pedro", "1PE", "livro"),
    ("1 Pedro", "1PE", "livro"),
    ("Sl", "PSA", "livro"),
    ("Salmo", "PSA", "livro"),
    ("Salmos", "PSA", "livro"),
    ("salmos", "PSA", "livro"),
    ("Gênesis", "GEN", "livro"),
    ("genesis", "GEN", "livro"),
    ("1Pe 1", "1PE.1", "capitulo"),
    ("1 pe 1", "1PE.1", "capitulo"),
    ("1Pedro 1", "1PE.1", "capitulo"),
    ("1 Pedro 1", "1PE.1", "capitulo"),
    ("Sl 23", "PSA.23", "capitulo"),
    ("Salmo 23", "PSA.23", "capitulo"),
    ("Mt 28:18-20", "MAT.28.18-20", "intervalo"),
    ("Mt 28.18-20", "MAT.28.18-20", "intervalo"),
    ("Mt 28:19", "MAT.28.19", "versiculo"),
    ("mateus 28:19", "MAT.28.19", "versiculo"),
    ("Joao 3:16", "JHN.3.16", "versiculo"),
    ("JHN.3.16", "JHN.3.16", "versiculo"),
])
def test_interpreta_abreviacoes(consulta, codigo, tipo):
    ref = interpretar_consulta(consulta)
    assert ref is not None, consulta
    assert (ref.codigo(), ref.tipo) == (codigo, tipo)


@pytest.mark.parametrize("consulta", ["amor de Deus", "oração", "mal", "sal", "os", "Jo 3:16 e Mt 1:1", ""])
def test_nao_referencia(consulta):
    assert interpretar_consulta(consulta) is None


def test_extracao_usa_regras_do_caderno():
    conteudo = (
        '{"type":"doc","content":['
        '{"type":"paragraph","content":[{"type":"text","text":"Como diz Jo 3:16 (NVI), Deus amou."}]},'
        '{"type":"blockquote","content":['
        '{"type":"paragraph","content":[{"type":"text","text":"Porque Deus amou o mundo"}]},'
        '{"type":"paragraph","content":[{"type":"text","text":"— João 3:16-18 (BLIVRE)"}]}]},'
        '{"type":"paragraph","content":[{"type":"text","text":"os 3 meninos leram números 3 e Sl 23"}]}]}'
    )
    refs = extrair_referencias("Voltando ao FOCO | 1Pedro 1 (TCD)", conteudo)
    chaves = [(r["book"], r["chapter"], r["verse_start"], r["verse_end"]) for r in refs]
    assert chaves == [
        ("1PE", 1, None, None),  # título, capítulo inteiro
        ("JHN", 3, 16, 16),  # menção: versículo = início e fim iguais
        ("JHN", 3, 16, 18),  # citação completa
        ("PSA", 23, None, None),
    ]  # "os 3" e "números 3" (minúsculas) não viram Oseias/Números
    assert refs[0]["trecho"] == "1Pedro 1"


def test_parser_igual_ao_front_nos_casos_do_front():
    achados = encontrar_referencias("Leia I Coríntios 13:4-7, Psalm 23 e Juan 3:16.")
    assert [a.codigo() for a in achados] == ["1CO.13.4-7", "PSA.23", "JHN.3.16"]


# ---------------------------------------------------------------------------
# Mundo: comunidades, desafio, grupo, posts
# ---------------------------------------------------------------------------


async def _user(db, org, *, id, username, role_id):
    u = User(
        id=id, username=username, first_name=username.title(), last_name="Teste",
        email=f"{username}@test.com", password="hashed_password",
        user_uuid=f"user_{username}", creation_date=_now(), update_date=_now(),
    )
    db.add(u)
    await db.commit()
    db.add(UserOrganization(
        user_id=u.id, org_id=org.id, role_id=role_id, creation_date=_now(), update_date=_now(),
    ))
    await db.commit()
    return PublicUser(
        id=u.id, username=u.username, first_name=u.first_name,
        last_name=u.last_name, email=u.email, user_uuid=u.user_uuid,
    )


async def _community(db, org, *, id, uuid, public, course_id=None):
    c = Community(
        id=id, org_id=org.id, name=uuid, description="", public=public, thumbnail_image="",
        community_uuid=uuid, course_id=course_id, moderation_words=[],
        creation_date="2026-11-01", update_date="2026-11-01",
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


_N = {"n": 0}


async def _post(db, community, author_id, *, uuid, texto, title="Post", visibility="public", data=None):
    _N["n"] += 1
    data = data or f"2026-11-{10 + _N['n'] % 15:02d}T00:00:00"
    d = Discussion(
        title=title, content=texto, label="general",
        community_id=community.id, org_id=community.org_id, author_id=author_id,
        discussion_uuid=uuid, upvote_count=0, edit_count=0, is_pinned=False,
        is_locked=False, visibility=visibility, creation_date=data, update_date=data,
    )
    db.add(d)
    await db.commit()
    await db.refresh(d)
    await indexar_discussao(db, d)
    await db.commit()
    return d


@pytest.fixture
async def mundo(db, org, admin_user, regular_user, user_role):
    irmao = await _user(db, org, id=5, username="irmao", role_id=user_role.id)
    inscrito = await _user(db, org, id=6, username="inscrito", role_id=user_role.id)

    geral = await _community(db, org, id=10, uuid="community_geral", public=True)
    homens = await _community(db, org, id=11, uuid="community_homens", public=False)
    curso = Course(
        id=20, name="Desafio", description="", public=False, published=True,
        open_to_contributors=False, org_id=org.id, course_uuid="course_desafio",
        creation_date="2026-11-01", update_date="2026-11-01",
    )
    db.add(curso)
    await db.commit()
    desafio = await _community(db, org, id=12, uuid="community_desafio", public=True, course_id=20)

    g = UserGroup(
        id=1, org_id=org.id, name="Homens", description="", usergroup_uuid="usergroup_homens",
        creation_date=_now(), update_date=_now(),
    )
    db.add(g)
    await db.commit()
    db.add(UserGroupResource(
        usergroup_id=1, resource_uuid="community_homens", org_id=org.id,
        creation_date=_now(), update_date=_now(),
    ))
    db.add(UserGroupUser(usergroup_id=1, user_id=irmao.id, org_id=org.id, creation_date=_now(), update_date=_now()))
    db.add(Trail(id=100, org_id=org.id, user_id=inscrito.id, trail_uuid="trail_6", creation_date=_now(), update_date=_now()))
    await db.commit()
    db.add(TrailRun(trail_id=100, course_id=20, org_id=org.id, user_id=inscrito.id, creation_date=_now(), update_date=_now()))
    await db.commit()

    m = regular_user.id
    await _post(db, geral, m, uuid="d_cap", title="Voltando ao FOCO | 1Pedro 1 (TCD)", texto="Reflexão do dia.",
                data="2026-11-01T00:00:00")
    await _post(db, geral, m, uuid="d_1pe_v3", texto="Bendito seja Deus, como em 1 Pe 1:3.", data="2026-11-02T00:00:00")
    await _post(db, geral, m, uuid="d_1pe2", texto="Já 1 Pedro 2:9 fala do sacerdócio.", data="2026-11-03T00:00:00")
    await _post(db, geral, m, uuid="d_mt_int", texto="A grande comissão — Mateus 28:18-20 (NVI)", data="2026-11-04T00:00:00")
    await _post(db, geral, m, uuid="d_mt_v19", texto="Ide e fazei discípulos (Mt 28:19).", data="2026-11-05T00:00:00")
    await _post(db, geral, m, uuid="d_mt_outro", texto="Mt 28:16-20 inteiro.", data="2026-11-06T00:00:00")
    await _post(db, geral, m, uuid="d_mt_cap", texto="Estudo de Mateus 28.", data="2026-11-07T00:00:00")
    await _post(db, geral, m, uuid="d_sl23", texto="O Senhor é meu pastor, Sl 23:1.", data="2026-11-08T00:00:00")
    await _post(db, geral, m, uuid="d_sl91", texto="Salmos 91 protege.", data="2026-11-09T00:00:00")
    # restritos
    await _post(db, homens, irmao.id, uuid="d_homens", texto="Salmo 23 para os homens.", data="2026-11-10T00:00:00")
    await _post(db, desafio, inscrito.id, uuid="d_desafio", texto="Dia 1: Salmos 1.", data="2026-11-11T00:00:00")
    await _post(db, geral, m, uuid="d_privada", texto="Minha nota sobre Sl 23.", visibility="private",
                data="2026-11-12T00:00:00")
    return {"membro": regular_user, "irmao": irmao, "inscrito": inscrito, "admin": admin_user, "anon": AnonymousUser()}


async def _busca(db, user, consulta, **kw):
    return await buscar_por_passagem(_req(), user, "test-org", consulta, db, **kw)


def _uuids(res):
    return [d.discussion_uuid for d in res.discussions]


# ---------------------------------------------------------------------------
# Os quatro casos
# ---------------------------------------------------------------------------


class TestQuatroCasos:
    @pytest.mark.asyncio
    async def test_livro_todos_os_posts_do_livro(self, db, mundo):
        res = await _busca(db, mundo["membro"], "Salmos")
        assert res.passagem.tipo == "livro"
        assert res.passagem.rotulo == "Salmos"
        assert _uuids(res) == ["d_sl91", "d_sl23"]  # mais novos primeiro
        assert res.total == 2

    @pytest.mark.asyncio
    async def test_capitulo_inclui_versiculos_soltos(self, db, mundo):
        for consulta in ("1Pe 1", "1 Pe 1", "1pedro 1", "1 Pedro 1"):
            res = await _busca(db, mundo["membro"], consulta)
            assert res.passagem.rotulo == "1 Pedro 1"
            assert _uuids(res) == ["d_1pe_v3", "d_cap"], consulta

    @pytest.mark.asyncio
    async def test_intervalo_so_exato(self, db, mundo):
        res = await _busca(db, mundo["membro"], "Mt 28:18-20")
        assert res.passagem.tipo == "intervalo"
        assert _uuids(res) == ["d_mt_int"]

    @pytest.mark.asyncio
    async def test_versiculo_inclui_intervalos_e_capitulo_que_o_contem(self, db, mundo):
        res = await _busca(db, mundo["membro"], "Mt 28:19")
        assert res.passagem.tipo == "versiculo"
        assert _uuids(res) == ["d_mt_cap", "d_mt_outro", "d_mt_v19", "d_mt_int"]
        # versículo fora de qualquer citação
        res = await _busca(db, mundo["membro"], "Mt 28:1")
        assert _uuids(res) == ["d_mt_cap"]

    @pytest.mark.asyncio
    async def test_trecho_destacado_e_citacoes(self, db, mundo):
        res = await _busca(db, mundo["membro"], "1Pe 1")
        d = res.discussions[0]
        assert d.citacoes == ["1 Pedro 1:3"]
        a, b = d.destaques[0]
        assert d.trecho[a:b] == "1 Pe 1:3"

    @pytest.mark.asyncio
    async def test_paginacao(self, db, mundo):
        vistos = []
        for page in (1, 2, 3, 4):
            res = await _busca(db, mundo["membro"], "Mt 28:19", page=page, limit=1)
            assert res.total == 4
            vistos += _uuids(res)
        assert vistos == ["d_mt_cap", "d_mt_outro", "d_mt_v19", "d_mt_int"]

    @pytest.mark.asyncio
    async def test_consulta_que_nao_e_referencia(self, db, mundo):
        res = await _busca(db, mundo["membro"], "pastor")
        assert res.passagem is None and res.discussions == []


# ---------------------------------------------------------------------------
# Vazamento
# ---------------------------------------------------------------------------


class TestSemVazamento:
    @pytest.mark.asyncio
    async def test_espaco_restrito_so_para_o_grupo(self, db, mundo):
        assert "d_homens" not in _uuids(await _busca(db, mundo["membro"], "Sl 23"))
        assert "d_homens" in _uuids(await _busca(db, mundo["irmao"], "Sl 23"))
        assert "d_homens" not in _uuids(await _busca(db, mundo["anon"], "Sl 23"))

    @pytest.mark.asyncio
    async def test_desafio_so_para_inscritos(self, db, mundo):
        assert "d_desafio" not in _uuids(await _busca(db, mundo["membro"], "Salmos"))
        assert "d_desafio" not in _uuids(await _busca(db, mundo["anon"], "Salmos"))
        assert "d_desafio" in _uuids(await _busca(db, mundo["inscrito"], "Salmos"))
        assert "d_desafio" in _uuids(await _busca(db, mundo["admin"], "Salmos"))

    @pytest.mark.asyncio
    async def test_nota_privada_nunca_aparece_nem_para_o_autor(self, db, mundo):
        for user in ("membro", "admin", "irmao"):
            assert "d_privada" not in _uuids(await _busca(db, mundo[user], "Sl 23"))
        # e nem é indexada
        privada = (await db.execute(select(Discussion).where(Discussion.discussion_uuid == "d_privada"))).scalar_one()
        refs = (await db.execute(
            select(DiscussionBibleRef).where(DiscussionBibleRef.discussion_id == privada.id)
        )).scalars().all()
        assert refs == []

    @pytest.mark.asyncio
    async def test_outra_org_nao_ve_nada(self, db, mundo, other_org):
        res = await buscar_por_passagem(_req(), mundo["membro"], other_org.slug, "Salmos", db)
        assert res.discussions == []


# ---------------------------------------------------------------------------
# Indexação nos fluxos reais
# ---------------------------------------------------------------------------


@pytest.fixture
def sem_efeitos():
    with patch("src.services.communities.discussions.track", new_callable=AsyncMock), \
         patch("src.services.communities.discussions.dispatch_webhooks", new_callable=AsyncMock), \
         patch("src.services.communities.visibility.track", new_callable=AsyncMock), \
         patch("src.services.communities.visibility.dispatch_webhooks", new_callable=AsyncMock), \
         patch("src.services.communities.social.notify_mentions", new_callable=AsyncMock), \
         patch("src.services.communities.discussions.enforce_posting_limits", new_callable=AsyncMock):
        yield


class TestIndexacaoNosFluxos:
    @pytest.mark.asyncio
    async def test_criar_editar_publicar(self, db, org, regular_user, sem_efeitos):
        from src.services.communities.discussions import create_discussion, update_discussion
        from src.services.communities.visibility import set_discussion_visibility

        await _community(db, org, id=30, uuid="community_aberta", public=True)
        criado = await create_discussion(
            _req(), "community_aberta", "Estudo", "Leitura de Rm 8:28 hoje", "general", regular_user, db,
        )
        assert _uuids(await _busca(db, regular_user, "Rm 8:28")) == [criado.discussion_uuid]

        await update_discussion(
            _req(), criado.discussion_uuid, DiscussionUpdate(content="Agora Ef 2:8"), regular_user, db,
        )
        assert _uuids(await _busca(db, regular_user, "Rm 8:28")) == []
        assert _uuids(await _busca(db, regular_user, "Ef 2:8")) == [criado.discussion_uuid]

        nota = await create_discussion(
            _req(), "community_aberta", "Nota", "Fp 4:13", "general", regular_user, db, visibility="private",
        )
        assert _uuids(await _busca(db, regular_user, "Fp 4:13")) == []
        await set_discussion_visibility(_req(), nota.discussion_uuid, "public", regular_user, db)
        assert _uuids(await _busca(db, regular_user, "Fp 4:13")) == [nota.discussion_uuid]
        await set_discussion_visibility(_req(), nota.discussion_uuid, "private", regular_user, db)
        assert _uuids(await _busca(db, regular_user, "Fp 4:13")) == []

    @pytest.mark.asyncio
    async def test_backfill_idempotente(self, db, mundo):
        await db.execute(DiscussionBibleRef.__table__.delete())
        await db.commit()
        lidas, gravadas = await reindexar_todas(db)
        lidas2, gravadas2 = await reindexar_todas(db)
        assert (lidas, gravadas) == (lidas2, gravadas2)
        assert lidas == 12 and gravadas == 11  # a nota privada fica de fora
        assert _uuids(await _busca(db, mundo["membro"], "Salmos")) == ["d_sl91", "d_sl23"]


# ---------------------------------------------------------------------------
# Desempenho: o plano usa o índice de passagem
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_plano_usa_indice_de_passagem(db, mundo):
    plano = (await db.execute(text(
        "EXPLAIN QUERY PLAN SELECT discussion_id FROM discussion_bible_ref "
        "WHERE book = '1PE' AND chapter = 1"
    ))).all()
    assert "ix_discussion_bible_ref_passagem" in " ".join(str(r) for r in plano)
