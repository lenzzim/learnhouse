"""Comunidade v5 (decisões N42, N44 e N45, 24/11/2026).

Cobre: blog só para autores (quem pode publicar por espaço, comentários
desligáveis), WhatsApp na entrada (escolha só para a pessoa e admins, sem
adicionar a grupo), Bate-papo Online (permissões, presença, lista de
confirmados, ``.ics``, link oculto para visitante e lembretes sob demanda),
reações novas, salvos, compartilhamento público e os pequenos da auditoria
(contagem de comentários em lote e ``accepted_comment_id`` fora do JSON).

Nada de RBAC é mockado: as regras reais rodam contra o SQLite.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from sqlmodel import select
from starlette.requests import Request

from src.db.communities.batepapos import EventCreate, EventUpdate
from src.db.communities.communities import Community, CommunityUpdate
from src.db.communities.discussions import Discussion
from src.db.communities.membros import MyWhatsappUpdate, OrgSettingsUpdate
from src.db.communities.social import CommunityNotification
from src.db.courses.courses import Course
from src.db.user_organizations import UserOrganization
from src.db.usergroup_resources import UserGroupResource
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import AnonymousUser, PublicUser, User
from src.services.communities import batepapos, membros, social
from src.services.communities.comments import create_comment
from src.services.communities.communities import (
    get_communities_by_org,
    get_community_user_rights,
    update_community,
)
from src.services.communities.discussions import (
    create_discussion,
    get_discussion,
    get_discussions_by_community,
)
from src.services.communities.visibility import set_discussion_visibility


C_BLOG = "community_blog"
C_GERAL = "community_geral"
C_ORACAO = "community_oracao"
C_MULHERES = "community_mulheres"
C_DESAFIO = "community_desafio"
C_FECHADA = "community_fechada"


def _now() -> str:
    return str(datetime.now())


def _req() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/", "headers": [], "query_string": b"",
                    "client": ("127.0.0.1", 1)})


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


async def _community(db, org, *, id, uuid, name, public=True, course_id=None, settings=None):
    c = Community(
        id=id, org_id=org.id, name=name, description=name, public=public,
        thumbnail_image="", community_uuid=uuid, course_id=course_id,
        moderation_words=[], moderation_settings=settings,
        creation_date="2026-11-01", update_date="2026-11-01",
    )
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return c


async def _discussion(db, community, author_id, *, uuid, label="general", content="Corpo", visibility="public"):
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


async def _group(db, org, *, id, name, resources=(), members=()):
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
    return g


@pytest.fixture(autouse=True)
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
    - ``blog``: pública, só o grupo "Autores" publica (N45);
    - ``geral``: pública e aberta; ``oracao``: pública, marcada como
      "não compartilhável"; ``mulheres``: fechada pelo grupo Mulheres;
      ``desafio``: ligada a curso; ``fechada``: ``public=False``.
    - ``autora`` é do grupo de autores; ``maria`` do grupo Mulheres.
    """
    autora = await _user(db, org, id=5, username="autora", role_id=user_role.id)
    maria = await _user(db, org, id=6, username="maria", role_id=user_role.id)
    estranho = await _user(db, None, id=9, username="estranho", role_id=user_role.id)
    db.add(UserOrganization(user_id=estranho.id, org_id=other_org.id, role_id=user_role.id,
                            creation_date=_now(), update_date=_now()))
    await db.commit()

    autores = await _group(db, org, id=1, name="Autores", members=[autora])
    mulheres_g = await _group(db, org, id=2, name="Mulheres", resources=[C_MULHERES], members=[maria])
    homens_g = await _group(db, org, id=3, name="Homens")
    outro = UserGroup(id=4, org_id=other_org.id, name="Fora", description="",
                      usergroup_uuid="usergroup_fora", creation_date=_now(), update_date=_now())
    db.add(outro)
    await db.commit()

    db.add(Course(id=20, name="Desafio", description="", public=True, published=True,
                  open_to_contributors=False, org_id=org.id, course_uuid="course_desafio",
                  creation_date=_now(), update_date=_now()))
    await db.commit()

    blog = await _community(db, org, id=10, uuid=C_BLOG, name="Blog do Discipulei",
                            settings={"post_policy": "group", "post_usergroup_uuid": "usergroup_autores"})
    geral = await _community(db, org, id=11, uuid=C_GERAL, name="Geral")
    oracao = await _community(db, org, id=12, uuid=C_ORACAO, name="Pedidos", settings={"not_shareable": True})
    mulheres = await _community(db, org, id=13, uuid=C_MULHERES, name="Mulheres", public=False)
    desafio = await _community(db, org, id=14, uuid=C_DESAFIO, name="Desafio", course_id=20)
    fechada = await _community(db, org, id=15, uuid=C_FECHADA, name="Fechada", public=False)

    await membros.update_org_settings(db, admin_user, org.id, OrgSettingsUpdate(
        authors_usergroup_uuid="usergroup_autores",
        men_usergroup_uuid="usergroup_homens",
        women_usergroup_uuid="usergroup_mulheres",
    ))

    return dict(
        admin=admin_user, membro=regular_user, autora=autora, maria=maria, estranho=estranho,
        anon=AnonymousUser(), org=org, other_org=other_org,
        blog=blog, geral=geral, oracao=oracao, mulheres=mulheres, desafio=desafio, fechada=fechada,
        autores=autores, mulheres_g=mulheres_g, homens_g=homens_g,
    )


# ---------------------------------------------------------------------------
# Blog só para autores (N45)
# ---------------------------------------------------------------------------


async def test_blog_so_autores_e_admins_publicam(db, mundo):
    m = mundo
    with pytest.raises(HTTPException) as exc:
        await create_discussion(_req(), C_BLOG, "Título", "Texto", "general", m["membro"], db)
    assert exc.value.status_code == 403
    assert exc.value.detail["code"] == "COMMUNITY_POST_RESTRICTED"

    post = await create_discussion(_req(), C_BLOG, "Da autora", "Texto", "general", m["autora"], db)
    assert post.visibility == "public"
    await create_discussion(_req(), C_BLOG, "Do admin", "Texto", "general", m["admin"], db)

    # Em espaço aberto, qualquer membro publica.
    await create_discussion(_req(), C_GERAL, "Livre", "Texto", "general", m["membro"], db)


async def test_blog_nao_publica_pelo_caderno_nem_pela_visibilidade(db, mundo):
    m = mundo
    # Nota privada do Caderno não publica nada: continua permitida.
    nota = await create_discussion(_req(), C_BLOG, "Nota", "Texto", "general", m["membro"], db,
                                   visibility="private")
    with pytest.raises(HTTPException) as exc:
        await set_discussion_visibility(_req(), nota.discussion_uuid, "public", m["membro"], db)
    assert exc.value.status_code == 403


async def test_blog_comentarios_abertos_ate_o_admin_desligar(db, mundo):
    m = mundo
    post = await create_discussion(_req(), C_BLOG, "Post", "Texto", "general", m["autora"], db)
    await create_comment(_req(), post.discussion_uuid, "Amém!", m["membro"], db)

    blog = m["blog"]
    blog.moderation_settings = {**(blog.moderation_settings or {}), "comments_disabled": True}
    db.add(blog)
    await db.commit()
    with pytest.raises(HTTPException) as exc:
        await create_comment(_req(), post.discussion_uuid, "Mais um", m["membro"], db)
    assert exc.value.status_code == 403
    await create_comment(_req(), post.discussion_uuid, "Do admin", m["admin"], db)


async def test_direitos_do_espaco_escondem_novo_post(db, mundo):
    m = mundo
    r = await get_community_user_rights(_req(), C_BLOG, m["membro"], db)
    assert r["permissions"]["read"] is True
    assert r["permissions"]["create_discussion"] is False
    assert r["permissions"]["comment"] is True
    r = await get_community_user_rights(_req(), C_BLOG, m["autora"], db)
    assert r["permissions"]["create_discussion"] is True
    r = await get_community_user_rights(_req(), C_GERAL, m["membro"], db)
    assert r["permissions"]["create_discussion"] is True


async def test_put_de_moderacao_preserva_regras_v5_e_valida_grupo(db, mundo):
    m = mundo
    # O painel de moderação manda só as chaves dele: as regras v5 ficam.
    await update_community(_req(), C_BLOG, CommunityUpdate(moderation_settings={"block_links": True}),
                           m["admin"], db)
    blog = (await db.execute(select(Community).where(Community.community_uuid == C_BLOG))).scalars().first()
    assert blog.moderation_settings["post_policy"] == "group"
    assert blog.moderation_settings["block_links"] is True

    # Grupo de outra org é recusado.
    with pytest.raises(HTTPException) as exc:
        await update_community(_req(), C_GERAL, CommunityUpdate(
            moderation_settings={"post_policy": "group", "post_usergroup_uuid": "usergroup_fora"}), m["admin"], db)
    assert exc.value.status_code == 422
    # "group" sem grupo também.
    with pytest.raises(HTTPException):
        await update_community(_req(), C_GERAL, CommunityUpdate(
            moderation_settings={"post_policy": "group"}), m["admin"], db)


# ---------------------------------------------------------------------------
# Espaços fixados no topo da lista (pinned_at)
# ---------------------------------------------------------------------------


async def _fixar(db, m, uuid, valor, quem=None):
    await update_community(_req(), uuid, CommunityUpdate(moderation_settings={"pinned_at": valor}),
                           quem or m["admin"], db)


async def _lista(db, m, quem, page=1, limit=50):
    r = await get_communities_by_org(_req(), m["org"].id, quem, db, page=page, limit=limit)
    return [c.community_uuid for c in r]


async def test_fixados_primeiro_na_ordem_em_que_foram_fixados(db, mundo):
    m = mundo
    # Sem fixados: do mais novo ao mais antigo (mesma data, desempata pelo id).
    assert await _lista(db, m, m["admin"]) == [C_FECHADA, C_DESAFIO, C_MULHERES, C_ORACAO, C_GERAL, C_BLOG]

    await _fixar(db, m, C_GERAL, "2026-11-20T10:00:00Z")
    await _fixar(db, m, C_BLOG, "2026-11-20T09:00:00-03:00")  # 12:00 UTC: fixado depois
    assert await _lista(db, m, m["admin"]) == [C_GERAL, C_BLOG, C_FECHADA, C_DESAFIO, C_MULHERES, C_ORACAO]

    # Visitante e membro veem a mesma regra, só nos espaços que podem ver.
    assert await _lista(db, m, m["anon"]) == [C_GERAL, C_BLOG, C_ORACAO]
    assert (await _lista(db, m, m["membro"]))[:2] == [C_GERAL, C_BLOG]

    # Gravado em UTC, largura fixa (a ordem do texto é a ordem do tempo).
    blog = (await db.execute(select(Community).where(Community.community_uuid == C_BLOG))).scalars().first()
    assert blog.moderation_settings["pinned_at"] == "2026-11-20T12:00:00.000000+00:00"
    assert blog.moderation_settings["post_policy"] == "group"


async def test_fixados_respeitam_a_paginacao(db, mundo):
    m = mundo
    await _fixar(db, m, C_ORACAO, "2026-11-20T10:00:00Z")
    await _fixar(db, m, C_BLOG, "2026-11-21T10:00:00Z")
    paginas = [await _lista(db, m, m["admin"], page=p, limit=2) for p in (1, 2, 3, 4)]
    assert paginas[0] == [C_ORACAO, C_BLOG]
    assert paginas[1] == [C_FECHADA, C_DESAFIO]
    assert paginas[2] == [C_MULHERES, C_GERAL]
    assert paginas[3] == []
    todos = [u for p in paginas for u in p]
    assert len(todos) == len(set(todos)) == 6


async def test_desafixar_manter_data_e_validar(db, mundo):
    m = mundo
    await _fixar(db, m, C_BLOG, "2026-11-20T10:00:00Z")
    # ``true`` mantém a data original (não pula para o fim dos fixados).
    await _fixar(db, m, C_BLOG, True)
    blog = (await db.execute(select(Community).where(Community.community_uuid == C_BLOG))).scalars().first()
    assert blog.moderation_settings["pinned_at"] == "2026-11-20T10:00:00.000000+00:00"

    # O PUT do painel de moderação (sem a chave) não desafixa.
    await update_community(_req(), C_BLOG, CommunityUpdate(moderation_settings={"block_links": True}),
                           m["admin"], db)
    assert (await _lista(db, m, m["admin"]))[0] == C_BLOG

    with pytest.raises(HTTPException) as exc:
        await _fixar(db, m, C_GERAL, "amanhã")
    assert exc.value.status_code == 422

    await _fixar(db, m, C_BLOG, None)
    assert (await _lista(db, m, m["admin"]))[-1] == C_BLOG


async def test_so_admin_fixa_espaco(db, mundo):
    m = mundo
    for quem in (m["membro"], m["autora"]):
        with pytest.raises(HTTPException) as exc:
            await _fixar(db, m, C_GERAL, "2026-11-20T10:00:00Z", quem=quem)
        assert exc.value.status_code == 403
    geral = (await db.execute(select(Community).where(Community.community_uuid == C_GERAL))).scalars().first()
    assert not (geral.moderation_settings or {}).get("pinned_at")


# ---------------------------------------------------------------------------
# WhatsApp na entrada (N42)
# ---------------------------------------------------------------------------


# Valores fictícios: nenhum link real fica no repositório (público).
LINK_H = "https://chat.whatsapp.com/FicticioHomens"
LINK_M = "https://chat.whatsapp.com/FicticioMulheres"


async def _links_no_painel(db, m, org):
    await membros.update_org_settings(db, m["admin"], org.id, OrgSettingsUpdate(
        whatsapp_men_url=LINK_H, whatsapp_women_url=LINK_M))


async def test_whatsapp_passo_unico_e_escolha(db, mundo):
    m, org = mundo, mundo["org"]
    await _links_no_painel(db, m, org)
    w = await membros.get_my_whatsapp(db, m["membro"], org.id)
    assert w.prompted is False and w.group is None and w.url is None
    assert "links" not in w.model_dump()

    # "Não informar"/"Agora não": nenhum link sai até a pessoa escolher.
    w = await membros.update_my_whatsapp(db, m["membro"], org.id, MyWhatsappUpdate(dismissed=True))
    assert w.prompted is True and w.group is None and w.url is None
    assert LINK_H not in str(w.model_dump()) and LINK_M not in str(w.model_dump())

    w = await membros.update_my_whatsapp(db, m["membro"], org.id, MyWhatsappUpdate(group="mulheres"))
    assert w.group == "mulheres" and w.configured is True
    assert w.url == LINK_M and LINK_H not in str(w.model_dump())

    w = await membros.update_my_whatsapp(db, m["membro"], org.id, MyWhatsappUpdate(group="homens"))
    assert w.url == LINK_H and LINK_M not in str(w.model_dump())

    with pytest.raises(HTTPException) as exc:
        await membros.update_my_whatsapp(db, m["membro"], org.id, MyWhatsappUpdate(group="outro"))
    assert exc.value.status_code == 422


async def test_whatsapp_sem_link_configurado_nao_tem_padrao(db, mundo, monkeypatch):
    m, org = mundo, mundo["org"]
    monkeypatch.delenv("DISCIPULEI_WHATSAPP_HOMENS", raising=False)
    monkeypatch.delenv("DISCIPULEI_WHATSAPP_MULHERES", raising=False)
    w = await membros.update_my_whatsapp(db, m["membro"], org.id, MyWhatsappUpdate(group="homens"))
    assert w.group == "homens" and w.url is None and w.configured is False
    c = await membros.get_config(db, m["membro"], org.id)
    assert c.whatsapp.homens is False and c.whatsapp.mulheres is False
    s = await membros.get_org_settings(db, m["admin"], org.id)
    assert s.whatsapp_men_missing is True and s.whatsapp_women_missing is True
    assert s.default_whatsapp_men_url == "" and s.default_whatsapp_women_url == ""


async def test_whatsapp_link_so_para_membro_logado(db, mundo):
    from src.db.users import APITokenUser

    m, org = mundo, mundo["org"]
    await _links_no_painel(db, m, org)
    token = APITokenUser(id=1, org_id=org.id, rights={"communities": {"action_read": True}})
    for quem, code in ((m["anon"], 401), (m["estranho"], 403), (token, 401)):
        for chamada in (
            membros.get_my_whatsapp(db, quem, org.id),
            membros.get_config(db, quem, org.id),
            membros.update_my_whatsapp(db, quem, org.id, MyWhatsappUpdate(group="homens")),
            membros.get_org_settings(db, quem, org.id),
        ):
            with pytest.raises(HTTPException) as exc:
                await chamada
            assert exc.value.status_code == code
    # A config de qualquer membro diz só se há link, nunca o link.
    c = await membros.get_config(db, m["membro"], org.id)
    assert c.whatsapp.homens is True and "chat.whatsapp.com" not in str(c.model_dump())


async def test_whatsapp_genero_so_para_admin_e_sem_adicionar_a_grupo(db, mundo):
    m, org = mundo, mundo["org"]
    await membros.update_my_whatsapp(db, m["membro"], org.id, MyWhatsappUpdate(group="homens"))
    await membros.update_my_whatsapp(db, m["maria"], org.id, MyWhatsappUpdate(group="mulheres"))
    antes = len((await db.execute(select(UserGroupUser))).scalars().all())

    for quem in (m["membro"], m["autora"], m["anon"], m["estranho"]):
        with pytest.raises(HTTPException):
            await membros.list_members_whatsapp(db, quem, org.id)

    lista = {p.user_uuid: p for p in await membros.list_members_whatsapp(db, m["admin"], org.id)}
    assert lista["user_regular"].whatsapp_group == "homens"
    assert lista["user_regular"].suggested_usergroup.name == "Homens"
    assert lista["user_regular"].in_suggested_group is False
    assert lista["user_maria"].in_suggested_group is True
    assert "email" not in lista["user_regular"].model_dump()

    # Só sugestão: ninguém entrou em grupo nenhum.
    assert len((await db.execute(select(UserGroupUser))).scalars().all()) == antes

    # Pessoas (outros membros) nunca recebem o gênero.
    from src.db.communities.social import ProfileUpdate

    await social.update_my_profile(db, m["membro"], org.id, ProfileUpdate(visible=True))
    pessoa = await social.get_person(db, m["autora"], org.id, "user_regular")
    assert "homens" not in str(pessoa.model_dump()).lower()


async def test_links_do_whatsapp_configuraveis_e_validados(db, mundo, monkeypatch):
    m, org = mundo, mundo["org"]
    monkeypatch.setenv("DISCIPULEI_WHATSAPP_HOMENS", "https://chat.whatsapp.com/EnvHomens")
    assert (await membros.get_config(db, m["membro"], org.id)).whatsapp.homens is True
    w = await membros.update_my_whatsapp(db, m["membro"], org.id, MyWhatsappUpdate(group="homens"))
    assert w.url == "https://chat.whatsapp.com/EnvHomens"
    s0 = await membros.get_org_settings(db, m["admin"], org.id)
    assert s0.whatsapp_men_missing is False and s0.whatsapp_women_missing is True

    with pytest.raises(HTTPException) as exc:
        await membros.update_org_settings(db, m["admin"], org.id, OrgSettingsUpdate(whatsapp_men_url="https://evil.example"))
    assert exc.value.status_code == 422
    s = await membros.update_org_settings(db, m["admin"], org.id, OrgSettingsUpdate(
        whatsapp_men_url="https://chat.whatsapp.com/Novo?utm_source=x"))
    assert s.whatsapp_men_url == "https://chat.whatsapp.com/Novo"
    with pytest.raises(HTTPException):
        await membros.update_org_settings(db, m["autora"], org.id, OrgSettingsUpdate(whatsapp_men_url=""))


async def test_config_diz_quem_e_autor(db, mundo):
    m, org = mundo, mundo["org"]
    assert (await membros.get_config(db, m["autora"], org.id)).is_author is True
    c = await membros.get_config(db, m["membro"], org.id)
    assert c.is_author is False and c.can_manage_events is False
    assert (await membros.get_config(db, m["admin"], org.id)).can_manage_events is True


# ---------------------------------------------------------------------------
# Bate-papo Online (N45)
# ---------------------------------------------------------------------------


def _em(minutos: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutos)).isoformat()


def _evento(**kw) -> EventCreate:
    base = dict(title="Bible Talk: Romanos 8", theme="Vida no Espírito", starts_at=_em(3 * 24 * 60),
                timezone="America/Sao_Paulo", duration_minutes=60,
                meeting_url="https://meet.google.com/abc-defg-hij", host_name="Pr. Lucas",
                passages="Romanos 8:1-17")
    base.update(kw)
    return EventCreate(**base)


async def test_batepapo_so_admins_e_autores_criam(db, mundo):
    m, org = mundo, mundo["org"]
    for quem, code in ((m["membro"], 403), (m["anon"], 401), (m["estranho"], 403)):
        with pytest.raises(HTTPException) as exc:
            await batepapos.create_event(_req(), db, quem, org.id, _evento())
        assert exc.value.status_code == code
    ev = await batepapos.create_event(_req(), db, m["autora"], org.id, _evento())
    assert ev.can_manage is True
    await batepapos.create_event(_req(), db, m["admin"], org.id, _evento(title="Outro"))

    with pytest.raises(HTTPException) as exc:
        await batepapos.update_event(db, m["membro"], ev.event_uuid, EventUpdate(title="X"))
    assert exc.value.status_code == 403
    with pytest.raises(HTTPException):
        await batepapos.delete_event(db, m["membro"], ev.event_uuid)

    # Link precisa ser https.
    with pytest.raises(HTTPException) as exc:
        await batepapos.create_event(_req(), db, m["admin"], org.id, _evento(meeting_url="javascript:alert(1)"))
    assert exc.value.status_code == 422


async def test_batepapo_fuso_e_horario(db, mundo):
    m, org = mundo, mundo["org"]
    ev = await batepapos.create_event(_req(), db, m["admin"], org.id,
                                      _evento(starts_at="2030-01-10T20:00:00", timezone="America/Sao_Paulo"))
    assert ev.starts_at == "2030-01-10T23:00:00+00:00"
    assert ev.ends_at == "2030-01-11T00:00:00+00:00"
    ev2 = await batepapos.create_event(_req(), db, m["admin"], org.id,
                                       _evento(starts_at="2030-01-10T20:00:00-03:00", timezone="UTC"))
    assert ev2.starts_at == "2030-01-10T23:00:00+00:00"
    with pytest.raises(HTTPException):
        await batepapos.create_event(_req(), db, m["admin"], org.id, _evento(timezone="Lua/Base"))


async def test_batepapo_link_oculto_para_visitante(db, mundo):
    m, org = mundo, mundo["org"]
    ev = await batepapos.create_event(_req(), db, m["admin"], org.id, _evento())

    for quem in (m["anon"], m["estranho"]):
        lista = await batepapos.list_events(db, quem, org.id)
        assert [e.event_uuid for e in lista] == [ev.event_uuid]
        assert lista[0].meeting_url is None
        assert (await batepapos.get_event(db, quem, ev.event_uuid)).meeting_url is None
        _nome, ics = await batepapos.event_ics(db, quem, ev.event_uuid)
        assert "meet.google.com" not in ics

    membro = await batepapos.get_event(db, m["membro"], ev.event_uuid)
    assert membro.meeting_url == "https://meet.google.com/abc-defg-hij"


async def test_batepapo_ics(db, mundo):
    m, org = mundo, mundo["org"]
    ev = await batepapos.create_event(_req(), db, m["admin"], org.id,
                                      _evento(starts_at="2030-01-10T20:00:00", title="Bate-papo; Romanos, 8"))
    nome, ics = await batepapos.event_ics(db, m["membro"], ev.event_uuid)
    assert nome.endswith(".ics")
    assert ics.startswith("BEGIN:VCALENDAR\r\n")
    assert "DTSTART:20300110T230000Z" in ics
    assert "DTEND:20300111T000000Z" in ics
    assert "SUMMARY:Bate-papo\\; Romanos\\, 8" in ics
    assert "LOCATION:https://meet.google.com/abc-defg-hij" in ics
    assert f"UID:{ev.event_uuid}@discipulei" in ics
    assert all(len(line.encode()) <= 75 for line in ics.split("\r\n"))


async def test_batepapo_presenca_e_confirmados(db, mundo):
    m, org = mundo, mundo["org"]
    ev = await batepapos.create_event(_req(), db, m["admin"], org.id, _evento())

    r = await batepapos.set_rsvp(db, m["membro"], ev.event_uuid, "vou")
    assert r.my_status == "vou" and r.going_count == 1
    r = await batepapos.set_rsvp(db, m["maria"], ev.event_uuid, "talvez")
    assert r.going_count == 1 and r.maybe_count == 1
    r = await batepapos.set_rsvp(db, m["membro"], ev.event_uuid, "talvez")
    assert r.going_count == 0 and r.maybe_count == 2
    r = await batepapos.set_rsvp(db, m["membro"], ev.event_uuid, None)
    assert r.my_status is None and r.maybe_count == 1

    for quem in (m["anon"], m["estranho"]):
        with pytest.raises(HTTPException):
            await batepapos.set_rsvp(db, quem, ev.event_uuid, "vou")
    with pytest.raises(HTTPException) as exc:
        await batepapos.set_rsvp(db, m["membro"], ev.event_uuid, "nao")
    assert exc.value.status_code == 422

    # Lista de nomes só para quem gerencia; os outros veem só a contagem.
    with pytest.raises(HTTPException) as exc:
        await batepapos.list_attendees(db, m["membro"], ev.event_uuid)
    assert exc.value.status_code == 403
    lista = await batepapos.list_attendees(db, m["autora"], ev.event_uuid)
    assert [a.user_uuid for a in lista.maybe] == ["user_maria"]
    assert "email" not in lista.model_dump()["maybe"][0]


async def test_batepapo_agenda_proximos_e_passados(db, mundo):
    m, org = mundo, mundo["org"]
    futuro = await batepapos.create_event(_req(), db, m["admin"], org.id, _evento(starts_at=_em(60)))
    agora = await batepapos.create_event(_req(), db, m["admin"], org.id, _evento(starts_at=_em(-10)))
    passado = await batepapos.create_event(_req(), db, m["admin"], org.id, _evento(starts_at=_em(-3 * 60)))
    proximos = await batepapos.list_events(db, m["membro"], org.id, "upcoming")
    assert [e.event_uuid for e in proximos] == [agora.event_uuid, futuro.event_uuid]
    assert proximos[0].status == "live"
    passados = await batepapos.list_events(db, m["membro"], org.id, "past")
    assert [e.event_uuid for e in passados] == [passado.event_uuid]
    # Outra org não vê nada.
    assert await batepapos.list_events(db, m["estranho"], m["other_org"].id) == []


async def test_batepapo_lembretes_sob_demanda(db, mundo):
    m, org = mundo, mundo["org"]
    inicio = datetime(2030, 3, 1, 23, 0, tzinfo=timezone.utc)
    ev = await batepapos.create_event(_req(), db, m["admin"], org.id, _evento(starts_at=inicio.isoformat()))
    # Confirmou com dias de antecedência.
    with patch("src.services.communities.batepapos.utcnow", return_value=inicio - timedelta(days=5)):
        await batepapos.set_rsvp(db, m["membro"], ev.event_uuid, "vou")
        await batepapos.set_rsvp(db, m["maria"], ev.event_uuid, "talvez")
    # Quem não confirmou não recebe nada.
    assert await batepapos.generate_due_reminders(db, m["autora"].id, org.id, inicio - timedelta(hours=2)) == []

    def kinds(uid):
        return sorted(n.kind for n in rows if n.user_id == uid)

    # Fora das janelas: nada.
    assert await batepapos.generate_due_reminders(db, m["membro"].id, org.id, inicio - timedelta(days=2)) == []
    novos = await batepapos.generate_due_reminders(db, m["membro"].id, org.id, inicio - timedelta(hours=20))
    assert [n.kind for n in novos] == ["event_1d"]
    # Idempotente.
    assert await batepapos.generate_due_reminders(db, m["membro"].id, org.id, inicio - timedelta(hours=19)) == []
    novos = await batepapos.generate_due_reminders(db, m["membro"].id, org.id, inicio - timedelta(minutes=10))
    assert [n.kind for n in novos] == ["event_15m"]
    novos = await batepapos.generate_due_reminders(db, m["membro"].id, org.id, inicio + timedelta(minutes=5))
    assert [n.kind for n in novos] == ["event_live"]
    assert await batepapos.generate_due_reminders(db, m["membro"].id, org.id, inicio + timedelta(minutes=30)) == []
    # Depois do fim, nada.
    assert await batepapos.generate_due_reminders(db, m["maria"].id, org.id, inicio + timedelta(hours=2)) == []

    # Janela perdida: quem abre o app já durante o encontro recebe só o "Começou!".
    novos = await batepapos.generate_due_reminders(db, m["maria"].id, org.id, inicio + timedelta(minutes=1))
    assert [n.kind for n in novos] == ["event_live"]

    rows = (await db.execute(select(CommunityNotification))).scalars().all()
    assert kinds(m["membro"].id) == ["event_15m", "event_1d", "event_live"]
    assert kinds(m["maria"].id) == ["event_live"]


async def test_batepapo_confirmou_em_cima_da_hora_sem_lembrete_de_1_dia(db, mundo):
    m, org = mundo, mundo["org"]
    inicio = datetime(2030, 3, 1, 23, 0, tzinfo=timezone.utc)
    ev = await batepapos.create_event(_req(), db, m["admin"], org.id, _evento(starts_at=inicio.isoformat()))
    with patch("src.services.communities.batepapos.utcnow", return_value=inicio - timedelta(hours=3)):
        await batepapos.set_rsvp(db, m["membro"], ev.event_uuid, "vou")
    assert await batepapos.generate_due_reminders(db, m["membro"].id, org.id, inicio - timedelta(hours=2)) == []
    novos = await batepapos.generate_due_reminders(db, m["membro"].id, org.id, inicio - timedelta(minutes=5))
    assert [n.kind for n in novos] == ["event_15m"]


async def test_batepapo_lembrete_aparece_nas_notificacoes(db, mundo):
    m, org = mundo, mundo["org"]
    ev = await batepapos.create_event(_req(), db, m["admin"], org.id, _evento(starts_at=_em(5)))
    await batepapos.set_rsvp(db, m["membro"], ev.event_uuid, "vou")
    # Abrir as notificações gera o lembrete devido.
    assert await social.unread_count(_req(), db, m["membro"], org.id) == 1
    itens = await social.list_notifications(_req(), db, m["membro"], org.id)
    assert itens[0].kind == "event_15m"
    assert itens[0].event_uuid == ev.event_uuid
    assert itens[0].event_title == ev.title
    await social.mark_notifications_read(db, m["membro"], org.id)
    assert await social.unread_count(_req(), db, m["membro"], org.id) == 0

    # Mudar o horário descarta os lembretes antigos.
    await batepapos.update_event(db, m["admin"], ev.event_uuid, EventUpdate(starts_at=_em(3 * 24 * 60)))
    assert await social.list_notifications(_req(), db, m["membro"], org.id) == []


async def test_batepapo_divulgacao_vira_post_no_espaco(db, mundo):
    m, org = mundo, mundo["org"]
    ev = await batepapos.create_event(_req(), db, m["autora"], org.id, _evento(announce_community_uuid=C_BLOG))
    assert ev.announcement_community_uuid == C_BLOG
    post = await get_discussion(_req(), ev.announcement_discussion_uuid, m["membro"], db)
    assert post.title.startswith("Bate-papo:")
    assert "meet.google.com" not in (post.content or "")
    # Autor não publica em espaço que não é dele: nada é criado.
    antes = len(await batepapos.list_events(db, m["admin"], org.id))
    blog = m["geral"]
    blog.moderation_settings = {"post_policy": "group", "post_usergroup_uuid": "usergroup_mulheres"}
    db.add(blog)
    await db.commit()
    with pytest.raises(HTTPException):
        await batepapos.create_event(_req(), db, m["autora"], org.id, _evento(announce_community_uuid=C_GERAL))
    assert len(await batepapos.list_events(db, m["admin"], org.id)) == antes


# ---------------------------------------------------------------------------
# Reações, salvos e compartilhar (N44)
# ---------------------------------------------------------------------------


async def test_reacoes_novas_com_contagem_so_para_o_autor(db, mundo):
    m = mundo
    d = await _discussion(db, m["geral"], m["autora"].id, uuid="discussion_r")
    for kind in ("obrigado", "tocou"):
        r = await social.toggle_discussion_faith_reaction(_req(), db, m["membro"], "discussion_r", kind)
        assert r["reacted"] is True
    with pytest.raises(HTTPException):
        await social.toggle_discussion_faith_reaction(_req(), db, m["membro"], "discussion_r", "coracao")
    leitor = await social.get_faith_reactions(_req(), db, m["membro"], d.discussion_uuid)
    assert leitor.discussion["tocou"].reacted is True and leitor.discussion["tocou"].count is None
    autora = await social.get_faith_reactions(_req(), db, m["autora"], d.discussion_uuid)
    assert autora.discussion["obrigado"].count == 1


async def test_salvos_privados(db, mundo):
    m, org = mundo, mundo["org"]
    await _discussion(db, m["geral"], m["autora"].id, uuid="discussion_s1")
    await _discussion(db, m["mulheres"], m["maria"].id, uuid="discussion_mulheres")
    await membros.set_saved(_req(), db, m["membro"], "discussion_s1", True)
    await membros.set_saved(_req(), db, m["membro"], "discussion_s1", True)  # idempotente
    salvos = await membros.list_saved(_req(), db, m["membro"], org.id)
    assert [s["discussion_uuid"] for s in salvos] == ["discussion_s1"]
    assert salvos[0]["community_uuid"] == C_GERAL
    assert (await social.get_faith_reactions(_req(), db, m["membro"], "discussion_s1")).saved is True
    # De outra pessoa: lista própria, vazia.
    assert await membros.list_saved(_req(), db, m["autora"], org.id) == []
    # Espaço que a pessoa não lê: não salva.
    with pytest.raises(HTTPException):
        await membros.set_saved(_req(), db, m["membro"], "discussion_mulheres", True)
    await membros.set_saved(_req(), db, m["membro"], "discussion_s1", False)
    assert await membros.list_saved(_req(), db, m["membro"], org.id) == []
    with pytest.raises(HTTPException):
        await membros.list_saved(_req(), db, m["anon"], org.id)


async def test_compartilhar_so_espacos_publicos_e_permitidos(db, mundo):
    m, org = mundo, mundo["org"]
    texto = "palavra " * 100
    await _discussion(db, m["geral"], m["autora"].id, uuid="discussion_pub", content=texto)
    nao = [
        await _discussion(db, m["oracao"], m["autora"].id, uuid="discussion_oracao"),
        await _discussion(db, m["mulheres"], m["maria"].id, uuid="discussion_mul"),
        await _discussion(db, m["desafio"], m["autora"].id, uuid="discussion_des"),
        await _discussion(db, m["fechada"], m["autora"].id, uuid="discussion_fec"),
        await _discussion(db, m["geral"], m["autora"].id, uuid="discussion_pedido", label="oracao"),
        await _discussion(db, m["geral"], m["autora"].id, uuid="discussion_priv", visibility="private"),
    ]

    p = await membros.get_shared_post(db, org.id, "pub")
    assert p.title == "Post discussion_pub"
    assert p.author_name == "Autora Teste"
    assert p.truncated is True and len(p.excerpt) <= 281
    assert "autora@test.com" not in str(p.model_dump())
    # Org errada: 404.
    with pytest.raises(HTTPException):
        await membros.get_shared_post(db, m["other_org"].id, "discussion_pub")

    for d in nao:
        with pytest.raises(HTTPException) as exc:
            await membros.get_shared_post(db, org.id, d.discussion_uuid)
        assert exc.value.status_code == 404

    estado = await social.get_faith_reactions(_req(), db, m["membro"], "discussion_oracao")
    assert estado.share.eligible is False


async def test_autor_desliga_compartilhamento(db, mundo):
    m, org = mundo, mundo["org"]
    await _discussion(db, m["geral"], m["autora"].id, uuid="discussion_pub")
    with pytest.raises(HTTPException) as exc:
        await membros.set_share_enabled(_req(), db, m["membro"], "discussion_pub", False)
    assert exc.value.status_code == 403
    r = await membros.set_share_enabled(_req(), db, m["autora"], "discussion_pub", False)
    assert r["shareable"] is False
    with pytest.raises(HTTPException):
        await membros.get_shared_post(db, org.id, "discussion_pub")
    estado = await social.get_faith_reactions(_req(), db, m["autora"], "discussion_pub")
    assert estado.share.disabled_by_author is True and estado.share.can_toggle is True
    await membros.set_share_enabled(_req(), db, m["autora"], "discussion_pub", True)
    assert (await membros.get_shared_post(db, org.id, "discussion_pub")).title


# ---------------------------------------------------------------------------
# Pequenos da auditoria v4
# ---------------------------------------------------------------------------


async def test_lista_traz_contagem_de_comentarios_e_resposta_util_por_uuid(db, mundo):
    m = mundo
    await _discussion(db, m["geral"], m["autora"].id, uuid="discussion_q", label="question")
    c = await create_comment(_req(), "discussion_q", "Resposta", m["membro"], db)
    await create_comment(_req(), "discussion_q", "Outra", m["maria"], db)
    lista = await get_discussions_by_community(_req(), C_GERAL, m["membro"], db)
    assert {d.discussion_uuid: d.comment_count for d in lista}["discussion_q"] == 2

    await social.set_accepted_answer(_req(), db, m["autora"], "discussion_q", c.comment_uuid)
    d = await get_discussion(_req(), "discussion_q", m["membro"], db)
    dump = d.model_dump()
    assert dump["accepted_comment_uuid"] == c.comment_uuid
    assert "accepted_comment_id" not in dump
