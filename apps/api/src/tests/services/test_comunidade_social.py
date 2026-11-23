"""Privacidade do "social contido" (decisão N39, 23/11/2026).

Cobre: perfil desligado por padrão, grupos restritos de gênero (N31), filtro
por autor sem vazar comunidade restrita nem desafio, menções que só notificam
quem pode ler o espaço, seguir sem ganhar acesso, contagens só para o dono
(N22), "Amém/Orando" e resposta útil.

Nada de RBAC é mockado: as regras reais rodam contra o SQLite. Cada chamada
usa um ``Request`` novo (o checker é memorizado por requisição).
"""

from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from sqlmodel import select
from starlette.requests import Request

from src.db.communities.communities import Community
from src.db.communities.discussion_comments import DiscussionComment
from src.db.communities.discussions import Discussion
from src.db.communities.social import CommunityNotification, ProfileUpdate
from src.db.courses.courses import Course
from src.db.trail_runs import TrailRun
from src.db.trails import Trail
from src.db.user_organizations import UserOrganization
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import AnonymousUser, PublicUser, User
from src.services.communities import social
from src.services.communities.comments import create_comment, delete_comment
from src.services.communities.discussions import (
    create_discussion,
    get_discussion,
    get_discussions_by_community,
)


C_GERAL = "community_geral"
C_DESAFIO = "community_desafio"
C_MULHERES = "community_mulheres"
C_HOMENS = "community_homens"


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
    if org is not None:
        db.add(UserOrganization(user_id=u.id, org_id=org.id, role_id=role_id,
                                creation_date=_now(), update_date=_now()))
        await db.commit()
    return PublicUser(id=u.id, username=u.username, first_name=u.first_name,
                      last_name=u.last_name, email=u.email, user_uuid=u.user_uuid)


async def _community(db, org, *, id, uuid, name, public, course_id=None):
    c = Community(
        id=id, org_id=org.id, name=name, description=name, public=public,
        thumbnail_image="", community_uuid=uuid, course_id=course_id,
        moderation_words=[], creation_date="2026-11-01", update_date="2026-11-01",
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


async def _discussion(db, community, author_id, *, uuid, visibility="public", label="general", content="Corpo"):
    d = Discussion(
        title=f"Post {uuid}", content=content, label=label,
        community_id=community.id, org_id=community.org_id, author_id=author_id,
        discussion_uuid=uuid, upvote_count=0, edit_count=0, is_pinned=False,
        is_locked=False, visibility=visibility,
        creation_date="2026-11-10T00:00:00+00:00", update_date="2026-11-10T00:00:00+00:00",
    )
    db.add(d)
    await db.commit()
    await db.refresh(d)
    return d


async def _group(db, org, *, id, name, resources, members):
    g = UserGroup(id=id, org_id=org.id, name=name, description="",
                  usergroup_uuid=f"usergroup_{name.lower()}", creation_date=_now(), update_date=_now())
    db.add(g)
    await db.commit()
    for uuid in resources:
        db.add(UserGroupResource(usergroup_id=g.id, resource_uuid=uuid, org_id=org.id,
                                 creation_date=_now(), update_date=_now()))
    for user in members:
        db.add(UserGroupUser(usergroup_id=g.id, user_id=user.id, org_id=org.id,
                             creation_date=_now(), update_date=_now()))
    await db.commit()


@pytest.fixture
def sem_efeitos_externos():
    with patch("src.services.communities.discussions.track", new_callable=AsyncMock), \
         patch("src.services.communities.discussions.dispatch_webhooks", new_callable=AsyncMock), \
         patch("src.services.communities.comments.dispatch_webhooks", new_callable=AsyncMock), \
         patch("src.services.communities.visibility.track", new_callable=AsyncMock), \
         patch("src.services.communities.visibility.dispatch_webhooks", new_callable=AsyncMock):
        yield


@pytest.fixture
async def mundo(db, org, other_org, admin_user, regular_user, user_role):
    """
    - ``geral``: pública; ``desafio``: ligada a curso (só inscritos);
      ``mulheres``/``homens``: fechadas pelos grupos de mesmo nome.
    - ``inscrito`` começou o desafio; ``regular_user`` não.
    - ``maria`` e ``ana`` são do grupo Mulheres; ``joao`` do grupo Homens.
    - ``estranho`` é de outra org.
    """
    inscrito = await _user(db, org, id=5, username="inscrito", role_id=user_role.id)
    maria = await _user(db, org, id=6, username="maria", role_id=user_role.id)
    ana = await _user(db, org, id=7, username="ana", role_id=user_role.id)
    joao = await _user(db, org, id=8, username="joao", role_id=user_role.id)
    estranho = await _user(db, None, id=9, username="estranho", role_id=user_role.id)
    db.add(UserOrganization(user_id=estranho.id, org_id=other_org.id, role_id=user_role.id,
                            creation_date=_now(), update_date=_now()))
    await db.commit()

    curso = Course(id=20, name="Desafio", description="", public=False, published=True,
                   open_to_contributors=False, org_id=org.id, course_uuid="course_desafio",
                   creation_date=_now(), update_date=_now())
    db.add(curso)
    await db.commit()

    geral = await _community(db, org, id=10, uuid=C_GERAL, name="Geral", public=True)
    desafio = await _community(db, org, id=11, uuid=C_DESAFIO, name="Desafio", public=True, course_id=20)
    mulheres = await _community(db, org, id=12, uuid=C_MULHERES, name="Mulheres", public=False)
    homens = await _community(db, org, id=13, uuid=C_HOMENS, name="Homens", public=False)

    await _group(db, org, id=1, name="Mulheres", resources=[C_MULHERES], members=[maria, ana])
    await _group(db, org, id=2, name="Homens", resources=[C_HOMENS], members=[joao])

    db.add(Trail(id=100, org_id=org.id, user_id=inscrito.id, trail_uuid="trail_inscrito",
                 creation_date=_now(), update_date=_now()))
    await db.commit()
    db.add(TrailRun(trail_id=100, course_id=20, org_id=org.id, user_id=inscrito.id,
                    creation_date=_now(), update_date=_now()))
    await db.commit()

    d_geral = await _discussion(db, geral, inscrito.id, uuid="discussion_geral_inscrito")
    d_desafio = await _discussion(db, desafio, inscrito.id, uuid="discussion_desafio_inscrito")
    d_mulheres = await _discussion(db, mulheres, maria.id, uuid="discussion_mulheres_maria")
    d_privada = await _discussion(db, geral, maria.id, uuid="discussion_privada_maria", visibility="private")
    d_geral_maria = await _discussion(db, geral, maria.id, uuid="discussion_geral_maria")

    return dict(
        admin=admin_user, membro=regular_user, inscrito=inscrito, maria=maria, ana=ana,
        joao=joao, estranho=estranho, anon=AnonymousUser(), org=org,
        geral=geral, desafio=desafio, mulheres=mulheres, homens=homens,
        d_geral=d_geral, d_desafio=d_desafio, d_mulheres=d_mulheres,
        d_privada=d_privada, d_geral_maria=d_geral_maria,
    )


async def _ligar(db, user, org, bio=""):
    await social.update_my_profile(db, user, org.id, ProfileUpdate(visible=True, bio=bio))


def _uuids(people):
    return sorted(p.user_uuid for p in people)


# ---------------------------------------------------------------------------
# Página Pessoas
# ---------------------------------------------------------------------------


async def test_perfil_desligado_por_padrao_nao_aparece(db, mundo):
    m, org = mundo, mundo["org"]
    perfil = await social.get_my_profile(db, m["inscrito"], org.id)
    assert perfil.visible is False

    assert await social.list_people(db, m["membro"], org.id) == []
    with pytest.raises(HTTPException) as exc:
        await social.get_person(db, m["membro"], org.id, "user_inscrito")
    assert exc.value.status_code == 404

    await _ligar(db, m["inscrito"], org, "Servo")
    assert _uuids(await social.list_people(db, m["membro"], org.id)) == ["user_inscrito"]

    # Desligar some de novo.
    await social.update_my_profile(db, m["inscrito"], org.id, ProfileUpdate(visible=False))
    assert await social.list_people(db, m["membro"], org.id) == []


async def test_pessoas_nunca_expoe_email(db, mundo):
    m, org = mundo, mundo["org"]
    await _ligar(db, m["inscrito"], org)
    pessoa = await social.get_person(db, m["membro"], org.id, "user_inscrito")
    dump = pessoa.model_dump()
    assert "email" not in dump
    assert "inscrito@test.com" not in str(dump)


async def test_pessoas_so_para_membros_logados(db, mundo):
    m, org = mundo, mundo["org"]
    await _ligar(db, m["inscrito"], org)
    for quem in (m["anon"], m["estranho"]):
        with pytest.raises(HTTPException) as exc:
            await social.list_people(db, quem, org.id)
        assert exc.value.status_code in (401, 403)


async def test_grupos_restritos_de_genero_nao_aparecem_para_quem_nao_e_do_grupo(db, mundo):
    m, org = mundo, mundo["org"]
    for u in (m["maria"], m["joao"], m["inscrito"]):
        await _ligar(db, u, org)

    # Membro sem grupo: só vê quem não é de grupo restrito.
    assert _uuids(await social.list_people(db, m["membro"], org.id)) == ["user_inscrito"]
    # Ana (Mulheres) vê Maria, não vê João.
    assert _uuids(await social.list_people(db, m["ana"], org.id)) == ["user_inscrito", "user_maria"]
    # João não vê Maria nem pelo perfil direto, nem consegue segui-la.
    with pytest.raises(HTTPException) as exc:
        await social.get_person(db, m["joao"], org.id, "user_maria")
    assert exc.value.status_code == 404
    with pytest.raises(HTTPException):
        await social.follow_person(db, m["joao"], org.id, "user_maria")


# ---------------------------------------------------------------------------
# Filtro por autor
# ---------------------------------------------------------------------------


async def test_posts_do_perfil_nao_vazam_desafio_nem_privada(db, mundo):
    m, org = mundo, mundo["org"]
    await _ligar(db, m["inscrito"], org)
    await _ligar(db, m["maria"], org)

    de_inscrito = await social.get_person_discussions(_req(), db, m["membro"], org.id, "user_inscrito")
    assert [d["discussion_uuid"] for d in de_inscrito] == ["discussion_geral_inscrito"]

    # O próprio inscrito vê os dois.
    proprios = await social.get_person_discussions(_req(), db, m["inscrito"], org.id, "user_inscrito")
    assert sorted(d["discussion_uuid"] for d in proprios) == [
        "discussion_desafio_inscrito", "discussion_geral_inscrito",
    ]

    # Ana (Mulheres) vê o post de Maria no espaço restrito, mas nunca a nota privada.
    de_maria = await social.get_person_discussions(_req(), db, m["ana"], org.id, "user_maria")
    assert sorted(d["discussion_uuid"] for d in de_maria) == [
        "discussion_geral_maria", "discussion_mulheres_maria",
    ]
    for d in de_maria:
        assert "email" not in (d.get("author") or {})


async def test_filtro_por_autor_no_espaco_respeita_leitura(db, mundo):
    m = mundo
    # Desafio: quem não se inscreveu não lê nem filtrando por autor.
    with pytest.raises(HTTPException):
        await get_discussions_by_community(
            _req(), C_DESAFIO, m["membro"], db, author_uuid="user_inscrito"
        )
    # Espaço público: o filtro devolve só o autor pedido e nunca a privada alheia.
    lista = await get_discussions_by_community(_req(), C_GERAL, m["membro"], db, author_uuid="user_maria")
    assert [d.discussion_uuid for d in lista] == ["discussion_geral_maria"]
    # "Meus posts" de Maria inclui a privada só para ela.
    meus = await get_discussions_by_community(_req(), C_GERAL, m["maria"], db, author_uuid="user_maria")
    assert sorted(d.discussion_uuid for d in meus) == ["discussion_geral_maria", "discussion_privada_maria"]
    # Autor inexistente: lista vazia.
    assert await get_discussions_by_community(_req(), C_GERAL, m["membro"], db, author_uuid="user_x") == []


# ---------------------------------------------------------------------------
# Menções
# ---------------------------------------------------------------------------


async def _notificados(db):
    rows = (await db.execute(select(CommunityNotification.user_id))).scalars().all()
    return sorted(rows)


async def test_mencao_nao_notifica_quem_nao_pode_ler(db, mundo, sem_efeitos_externos):
    m = mundo
    # No desafio: @regular não se inscreveu; @admin pode ler.
    await create_discussion(
        _req(), C_DESAFIO, "Dia 1 do desafio", "Bora @regular e @admin!", "general", m["inscrito"], db
    )
    assert await _notificados(db) == [m["admin"].id]

    # No espaço das mulheres: @joao (Homens) não; @ana sim.
    await create_comment(_req(), "discussion_mulheres_maria", "Orem comigo @joao @ana", m["maria"], db)
    assert await _notificados(db) == sorted([m["admin"].id, m["ana"].id])


async def test_mencao_em_nota_privada_nao_notifica(db, mundo, sem_efeitos_externos):
    m = mundo
    await create_discussion(
        _req(), C_GERAL, "Minha nota", "Lembrar de @ana", "general", m["maria"], db, visibility="private"
    )
    assert await _notificados(db) == []


async def test_mencao_nao_duplica_e_ignora_autor(db, mundo, sem_efeitos_externos):
    m = mundo
    await create_comment(_req(), "discussion_geral_inscrito", "@maria @maria @inscrito", m["inscrito"], db)
    assert await _notificados(db) == [m["maria"].id]
    notas = await social.list_notifications(_req(), db, m["maria"], m["org"].id)
    assert len(notas) == 1 and notas[0].actor.username == "inscrito"
    assert "email" not in notas[0].model_dump()["actor"]
    assert await social.unread_count(_req(), db, m["maria"], m["org"].id) == 1
    await social.mark_notifications_read(db, m["maria"], m["org"].id)
    assert await social.unread_count(_req(), db, m["maria"], m["org"].id) == 0


async def test_candidatos_a_mencao_so_quem_le_o_espaco(db, mundo):
    m, org = mundo, mundo["org"]
    for u in (m["membro"], m["inscrito"], m["ana"], m["joao"]):
        await _ligar(db, u, org)
    # No desafio, inscrito só pode mencionar quem lê o desafio (admin não tem
    # perfil ligado; regular não se inscreveu).
    cand = await social.mention_candidates(_req(), db, m["inscrito"], C_DESAFIO, "")
    assert cand == []
    # Maria, no espaço das mulheres: Ana sim, João e o membro sem grupo não.
    cand = await social.mention_candidates(_req(), db, m["maria"], C_MULHERES, "")
    assert [c.username for c in cand] == ["ana"]


# ---------------------------------------------------------------------------
# Seguir
# ---------------------------------------------------------------------------


async def test_seguir_nao_da_acesso(db, mundo):
    m, org = mundo, mundo["org"]
    await _ligar(db, m["inscrito"], org)
    await social.follow_person(db, m["membro"], org.id, "user_inscrito")

    feed = await social.get_following_feed(_req(), db, m["membro"], org.id)
    assert [d["discussion_uuid"] for d in feed] == ["discussion_geral_inscrito"]
    with pytest.raises(HTTPException):
        await get_discussion(_req(), "discussion_desafio_inscrito", m["membro"], db)

    # Perfil desligado: some do feed (e não dá para seguir de novo).
    await social.update_my_profile(db, m["inscrito"], org.id, ProfileUpdate(visible=False))
    assert await social.get_following_feed(_req(), db, m["membro"], org.id) == []


async def test_so_segue_perfil_visivel_e_contagem_so_para_o_dono(db, mundo):
    m, org = mundo, mundo["org"]
    with pytest.raises(HTTPException) as exc:
        await social.follow_person(db, m["membro"], org.id, "user_inscrito")
    assert exc.value.status_code == 404

    await _ligar(db, m["inscrito"], org)
    await social.follow_person(db, m["membro"], org.id, "user_inscrito")
    visto_por_outro = await social.get_person(db, m["membro"], org.id, "user_inscrito")
    assert visto_por_outro.is_following is True
    assert visto_por_outro.follower_count is None
    proprio = await social.get_person(db, m["inscrito"], org.id, "user_inscrito")
    assert proprio.follower_count == 1
    assert (await social.get_my_profile(db, m["inscrito"], org.id)).follower_count == 1

    await social.unfollow_person(db, m["membro"], org.id, "user_inscrito")
    assert (await social.get_my_profile(db, m["inscrito"], org.id)).follower_count == 0


# ---------------------------------------------------------------------------
# Amém / Orando e resposta útil
# ---------------------------------------------------------------------------


async def test_amem_orando_contagem_so_para_o_autor(db, mundo):
    m = mundo
    await social.toggle_discussion_faith_reaction(_req(), db, m["membro"], "discussion_geral_inscrito", "amem")
    await social.toggle_discussion_faith_reaction(_req(), db, m["maria"], "discussion_geral_inscrito", "amem")

    visto_por_membro = await social.get_faith_reactions(_req(), db, m["membro"], "discussion_geral_inscrito")
    assert visto_por_membro.discussion["amem"].reacted is True
    assert visto_por_membro.discussion["amem"].count is None
    visto_pelo_autor = await social.get_faith_reactions(_req(), db, m["inscrito"], "discussion_geral_inscrito")
    assert visto_pelo_autor.discussion["amem"].count == 2
    assert visto_pelo_autor.discussion["orando"].count == 0

    with pytest.raises(HTTPException):
        await social.toggle_discussion_faith_reaction(_req(), db, m["membro"], "discussion_geral_inscrito", "curtir")
    # Desafio: quem não se inscreveu não reage.
    with pytest.raises(HTTPException):
        await social.toggle_discussion_faith_reaction(_req(), db, m["membro"], "discussion_desafio_inscrito", "orando")


async def test_reacao_em_comentario(db, mundo, sem_efeitos_externos):
    m = mundo
    c = await create_comment(_req(), "discussion_geral_inscrito", "Amém, irmão", m["maria"], db)
    await social.toggle_comment_faith_reaction(_req(), db, m["membro"], c.comment_uuid, "orando")
    vis = await social.get_faith_reactions(_req(), db, m["maria"], "discussion_geral_inscrito")
    assert vis.comments[c.comment_uuid]["orando"].count == 1
    vis = await social.get_faith_reactions(_req(), db, m["membro"], "discussion_geral_inscrito")
    assert vis.comments[c.comment_uuid]["orando"].reacted is True
    assert vis.comments[c.comment_uuid]["orando"].count is None


async def test_resposta_util_so_em_pergunta_e_pelo_autor_ou_admin(db, mundo, sem_efeitos_externos):
    m = mundo
    pergunta = await _discussion(db, m["geral"], m["inscrito"].id, uuid="discussion_pergunta", label="question")
    c = await create_comment(_req(), "discussion_pergunta", "Leia João 3", m["maria"], db)

    with pytest.raises(HTTPException) as exc:
        await social.set_accepted_answer(_req(), db, m["membro"], "discussion_pergunta", c.comment_uuid)
    assert exc.value.status_code == 403

    r = await social.set_accepted_answer(_req(), db, m["inscrito"], "discussion_pergunta", c.comment_uuid)
    assert r["accepted_comment_id"] == c.id
    r = await social.set_accepted_answer(_req(), db, m["admin"], "discussion_pergunta", None)
    assert r["accepted_comment_id"] is None

    with pytest.raises(HTTPException) as exc:
        await social.set_accepted_answer(_req(), db, m["inscrito"], "discussion_geral_inscrito", None)
    assert exc.value.status_code == 422

    # Apagar o comentário marcado limpa a resposta útil.
    await social.set_accepted_answer(_req(), db, m["inscrito"], "discussion_pergunta", c.comment_uuid)
    await delete_comment(_req(), c.comment_uuid, m["maria"], db)
    await db.refresh(pergunta)
    assert pergunta.accepted_comment_id is None
    assert (await db.execute(select(DiscussionComment))).scalars().all() == []
