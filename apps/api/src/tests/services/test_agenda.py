"""Agenda de eventos (evolução do Bate-papo Online, 24/11/2026).

Cobre as regras de privacidade no servidor (endereço e link só para quem
respondeu "Vou", quem criou e admins/Equipe), quem pode criar (grupo de
organizadores "Discípulos"), vagas, cancelamento e avisos, filtro por
região/tipo/intervalo, ``.ics``, feed pessoal com token, preferências de
e-mail, painel do admin e o alias ``/batepapos`` da API.

Nada de RBAC é mockado: as regras reais rodam contra o SQLite.
"""

from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import HTTPException
from sqlmodel import select

from src.db.communities.batepapos import (
    AgendaPrefsUpdate,
    AgendaSettingsUpdate,
    CommunityAgendaPref,
    EventCreate,
    EventUpdate,
    RegionInput,
)
from src.db.communities.membros import OrgSettingsUpdate
from src.db.communities.social import CommunityNotification
from src.db.user_organizations import UserOrganization
from src.db.usergroup_user import UserGroupUser
from src.db.usergroups import UserGroup
from src.db.users import AnonymousUser, PublicUser, User
from src.services.communities import agenda, batepapos, membros
from starlette.requests import Request


def _now() -> str:
    return str(datetime.now())


def _req() -> Request:
    return Request({"type": "http", "method": "GET", "path": "/", "headers": [], "query_string": b"",
                    "client": ("127.0.0.1", 1)})


def _em(minutos: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutos)).isoformat()


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


async def _group(db, org, *, id, name, members=()):
    g = UserGroup(id=id, org_id=org.id, name=name, description="",
                  usergroup_uuid=f"usergroup_{id}", creation_date=_now(), update_date=_now())
    db.add(g)
    await db.commit()
    for user in members:
        db.add(UserGroupUser(usergroup_id=g.id, user_id=user.id, org_id=org.id,
                             creation_date=_now(), update_date=_now()))
    await db.commit()
    return g


@pytest.fixture(autouse=True)
def sem_efeitos_externos():
    with patch("src.services.communities.discussions.track", new_callable=AsyncMock), \
         patch("src.services.communities.discussions.dispatch_webhooks", new_callable=AsyncMock):
        yield


@pytest.fixture
async def mundo(db, org, other_org, admin_user, regular_user, user_role):
    """``disc`` está no grupo "Discípulos" (organizador padrão, sem config);
    ``equipe`` no grupo de autores; ``membro`` e ``ana`` são membros comuns;
    ``estranho`` é de outra org."""
    disc = await _user(db, org, id=5, username="disc", role_id=user_role.id)
    equipe = await _user(db, org, id=6, username="equipe", role_id=user_role.id)
    ana = await _user(db, org, id=7, username="ana", role_id=user_role.id)
    disc2 = await _user(db, org, id=8, username="disc2", role_id=user_role.id)
    estranho = await _user(db, None, id=9, username="estranho", role_id=user_role.id)
    db.add(UserOrganization(user_id=estranho.id, org_id=other_org.id, role_id=user_role.id,
                            creation_date=_now(), update_date=_now()))
    await db.commit()
    await _group(db, org, id=1, name="Equipe", members=[equipe])
    await _group(db, org, id=2, name="Discípulos", members=[disc, disc2])
    await _group(db, org, id=3, name="Homens")
    await membros.update_org_settings(db, admin_user, org.id, OrgSettingsUpdate(authors_usergroup_uuid="usergroup_1"))
    return dict(admin=admin_user, membro=regular_user, disc=disc, disc2=disc2, equipe=equipe, ana=ana,
                estranho=estranho, anon=AnonymousUser(), org=org, other_org=other_org)


def _presencial(**kw) -> EventCreate:
    base = dict(title="Roda de conversa: Salmo 23", kind="bible_talk", mode="in_person",
                region_uuid="campinas", city="Campinas", neighborhood="Cambuí",
                address="Rua Secreta, 123, apto 4", starts_at=_em(3 * 24 * 60),
                timezone="America/Sao_Paulo", duration_minutes=90, description="Venha!")
    base.update(kw)
    return EventCreate(**base)


def _online(**kw) -> EventCreate:
    base = dict(title="Bible Talk online", mode="online", starts_at=_em(2 * 24 * 60),
                meeting_url="https://meet.google.com/abc-defg-hij")
    base.update(kw)
    return EventCreate(**base)


SEGREDOS = ("Rua Secreta", "meet.google.com")


def _sem_segredo(obj) -> None:
    texto = obj if isinstance(obj, str) else obj.model_dump_json()
    for s in SEGREDOS:
        assert s not in texto, s


# ---------------------------------------------------------------------------
# Quem cria
# ---------------------------------------------------------------------------


async def test_quem_pode_criar(db, mundo):
    m, org = mundo, mundo["org"]
    for quem, code in ((m["membro"], 403), (m["ana"], 403), (m["anon"], 401), (m["estranho"], 403)):
        with pytest.raises(HTTPException) as exc:
            await batepapos.create_event(_req(), db, quem, org.id, _presencial())
        assert exc.value.status_code == code
    # Discípulos (padrão por nome), Equipe e admin criam.
    for quem in (m["disc"], m["equipe"], m["admin"]):
        ev = await batepapos.create_event(_req(), db, quem, org.id, _presencial())
        assert ev.can_manage is True
        assert ev.organizer_name
    # O "Novo evento" aparece para o Discípulo.
    assert (await membros.get_config(db, m["disc"], org.id)).can_manage_events is True
    assert (await membros.get_config(db, m["membro"], org.id)).can_manage_events is False


async def test_organizador_so_edita_os_proprios(db, mundo):
    m, org = mundo, mundo["org"]
    ev = await batepapos.create_event(_req(), db, m["disc"], org.id, _presencial())
    # Outro Discípulo não edita, não cancela, não vê nomes.
    for fn in (
        lambda: batepapos.update_event(db, m["disc2"], ev.event_uuid, EventUpdate(title="X")),
        lambda: batepapos.cancel_event(db, m["disc2"], ev.event_uuid),
        lambda: batepapos.delete_event(db, m["disc2"], ev.event_uuid),
        lambda: batepapos.list_attendees(db, m["disc2"], ev.event_uuid),
    ):
        with pytest.raises(HTTPException) as exc:
            await fn()
        assert exc.value.status_code == 403
    assert (await batepapos.get_event(db, m["disc2"], ev.event_uuid)).can_manage is False
    # Quem criou, a Equipe e o admin editam.
    await batepapos.update_event(db, m["disc"], ev.event_uuid, EventUpdate(title="Novo título"))
    await batepapos.update_event(db, m["equipe"], ev.event_uuid, EventUpdate(neighborhood="Centro"))
    out = await batepapos.update_event(db, m["admin"], ev.event_uuid, EventUpdate(capacity=10))
    assert out.title == "Novo título" and out.neighborhood == "Centro" and out.capacity == 10


async def test_grupo_de_organizadores_configuravel(db, mundo):
    m, org = mundo, mundo["org"]
    # Admin troca para "Homens": Discípulos deixam de criar.
    cfg = await agenda.update_settings(db, m["admin"], org.id,
                                       AgendaSettingsUpdate(organizers_usergroup_uuid="usergroup_3"))
    assert cfg.organizers_usergroup_name == "Homens"
    with pytest.raises(HTTPException):
        await batepapos.create_event(_req(), db, m["disc"], org.id, _presencial())
    # "" limpa: só admins e Equipe (não volta para o padrão por nome).
    cfg = await agenda.update_settings(db, m["admin"], org.id, AgendaSettingsUpdate(organizers_usergroup_uuid=""))
    assert cfg.organizers_usergroup_uuid is None
    assert await agenda.can_create_events(db, m["disc"].id, org.id) is False
    assert await agenda.can_create_events(db, m["equipe"].id, org.id) is True
    with pytest.raises(HTTPException) as exc:
        await agenda.update_settings(db, m["disc"], org.id, AgendaSettingsUpdate(organizers_usergroup_uuid=""))
    assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# Privacidade
# ---------------------------------------------------------------------------


async def test_endereco_e_link_so_para_quem_vai(db, mundo):
    m, org = mundo, mundo["org"]
    pres = await batepapos.create_event(_req(), db, m["disc"], org.id, _presencial())
    onl = await batepapos.create_event(_req(), db, m["disc"], org.id, _online())

    # Visitante e outra org: veem o público, nunca endereço/link.
    for quem in (m["anon"], m["estranho"]):
        lista = await batepapos.list_events(db, quem, org.id)
        assert {e.event_uuid for e in lista} == {pres.event_uuid, onl.event_uuid}
        for e in lista:
            _sem_segredo(e)
            assert e.address is None and e.meeting_url is None and e.details_locked is True
        um = await batepapos.get_event(db, quem, pres.event_uuid)
        _sem_segredo(um)
        assert um.city == "Campinas" and um.neighborhood == "Cambuí" and um.region.name == "Campinas"
        assert um.description == "Venha!"
        _n, ics = await batepapos.event_ics(db, quem, pres.event_uuid)
        _sem_segredo(ics)
        assert "LOCATION:Cambuí\\, Campinas" in ics

    # Membro sem resposta e com "Talvez": não vê.
    _sem_segredo(await batepapos.get_event(db, m["membro"], pres.event_uuid))
    talvez = await batepapos.set_rsvp(db, m["membro"], pres.event_uuid, "talvez")
    _sem_segredo(talvez)
    _n, ics = await batepapos.event_ics(db, m["membro"], pres.event_uuid)
    _sem_segredo(ics)

    # Com "Vou": vê endereço (e link no online), também no .ics.
    vou = await batepapos.set_rsvp(db, m["membro"], pres.event_uuid, "vou")
    assert vou.address == "Rua Secreta, 123, apto 4" and vou.details_locked is False
    _n, ics = await batepapos.event_ics(db, m["membro"], pres.event_uuid)
    assert "Rua Secreta" in ics
    vou = await batepapos.set_rsvp(db, m["membro"], onl.event_uuid, "vou")
    assert vou.meeting_url == "https://meet.google.com/abc-defg-hij"
    # Cancelou a presença: some de novo.
    _sem_segredo(await batepapos.set_rsvp(db, m["membro"], pres.event_uuid, None))

    # Organizador (quem criou), Equipe e admin sempre veem.
    for quem in (m["disc"], m["equipe"], m["admin"]):
        e = await batepapos.get_event(db, quem, pres.event_uuid)
        assert e.address == "Rua Secreta, 123, apto 4"
        assert (await batepapos.get_event(db, quem, onl.event_uuid)).meeting_url
    # Outro Discípulo (não criou) é um membro comum aqui.
    _sem_segredo(await batepapos.get_event(db, m["disc2"], pres.event_uuid))


async def test_notificacoes_e_divulgacao_sem_endereco(db, mundo):
    m, org = mundo, mundo["org"]
    from src.services.communities import social

    ev = await batepapos.create_event(_req(), db, m["disc"], org.id, _presencial(starts_at=_em(5)))
    await batepapos.set_rsvp(db, m["ana"], ev.event_uuid, "talvez")
    await batepapos.update_event(db, m["disc"], ev.event_uuid, EventUpdate(address="Rua Secreta, 999"))
    notifs = await social.list_notifications(_req(), db, m["ana"], org.id)
    assert {n.kind for n in notifs} >= {"event_changed", "event_15m"}
    for n in notifs:
        _sem_segredo(n.model_dump_json())
    # Post de divulgação: só cidade/bairro.
    content = batepapos._announcement_content(
        (await batepapos._event_or_404(db, ev.event_uuid)), "/agenda/x"
    )
    _sem_segredo(content)
    assert "Cambuí" in content


# ---------------------------------------------------------------------------
# Vagas, cancelamento e avisos
# ---------------------------------------------------------------------------


async def test_vagas_lotado_bloqueia_vou(db, mundo):
    m, org = mundo, mundo["org"]
    ev = await batepapos.create_event(_req(), db, m["disc"], org.id, _presencial(capacity=2))
    assert ev.spots_left == 2 and ev.is_full is False
    await batepapos.set_rsvp(db, m["membro"], ev.event_uuid, "vou")
    r = await batepapos.set_rsvp(db, m["ana"], ev.event_uuid, "vou")
    assert r.is_full is True and r.spots_left == 0
    with pytest.raises(HTTPException) as exc:
        await batepapos.set_rsvp(db, m["disc2"], ev.event_uuid, "vou")
    assert exc.value.status_code == 409
    # "Talvez" continua liberado e não ocupa vaga; repetir "Vou" não conta duas vezes.
    r = await batepapos.set_rsvp(db, m["disc2"], ev.event_uuid, "talvez")
    assert r.going_count == 2 and r.maybe_count == 1
    await batepapos.set_rsvp(db, m["ana"], ev.event_uuid, "vou")
    # Libera uma vaga.
    await batepapos.set_rsvp(db, m["ana"], ev.event_uuid, None)
    r = await batepapos.set_rsvp(db, m["disc2"], ev.event_uuid, "vou")
    assert r.my_status == "vou" and r.is_full is True
    # Sem limite (0).
    r = await batepapos.update_event(db, m["disc"], ev.event_uuid, EventUpdate(capacity=0))
    assert r.capacity is None and r.is_full is False


async def test_cancelar_avisa_inscritos_uma_vez(db, mundo):
    m, org = mundo, mundo["org"]
    ev = await batepapos.create_event(_req(), db, m["disc"], org.id, _presencial())
    await batepapos.set_rsvp(db, m["membro"], ev.event_uuid, "vou")
    await batepapos.set_rsvp(db, m["ana"], ev.event_uuid, "talvez")
    out = await batepapos.cancel_event(db, m["disc"], ev.event_uuid)
    assert out.cancelled is True
    await batepapos.cancel_event(db, m["disc"], ev.event_uuid)  # idempotente
    rows = (await db.execute(
        select(CommunityNotification).where(CommunityNotification.kind == "event_cancelled")
    )).scalars().all()
    assert sorted(n.user_id for n in rows) == sorted([m["membro"].id, m["ana"].id])
    # Cancelado: sem presença nova, continua na agenda, .ics marcado.
    with pytest.raises(HTTPException):
        await batepapos.set_rsvp(db, m["disc2"], ev.event_uuid, "vou")
    assert ev.event_uuid in {e.event_uuid for e in await batepapos.list_events(db, m["anon"], org.id)}
    _n, ics = await batepapos.event_ics(db, m["membro"], ev.event_uuid)
    assert "STATUS:CANCELLED" in ics
    # Sem lembretes para evento cancelado.
    assert await batepapos.generate_due_reminders(db, m["membro"].id, org.id) == []


async def test_mudanca_de_horario_avisa_sem_duplicar(db, mundo):
    m, org = mundo, mundo["org"]
    ev = await batepapos.create_event(_req(), db, m["disc"], org.id, _presencial())
    await batepapos.set_rsvp(db, m["membro"], ev.event_uuid, "vou")
    # Título não avisa; horário avisa; segunda mudança troca o aviso.
    await batepapos.update_event(db, m["disc"], ev.event_uuid, EventUpdate(title="Outro"))
    await batepapos.update_event(db, m["disc"], ev.event_uuid, EventUpdate(starts_at=_em(4 * 24 * 60)))
    await batepapos.update_event(db, m["disc"], ev.event_uuid, EventUpdate(starts_at=_em(5 * 24 * 60)))
    rows = (await db.execute(
        select(CommunityNotification).where(CommunityNotification.kind == "event_changed")
    )).scalars().all()
    assert [n.user_id for n in rows] == [m["membro"].id]


async def test_lembrete_24h_antes(db, mundo):
    m, org = mundo, mundo["org"]
    inicio = datetime.now(timezone.utc).replace(microsecond=0) + timedelta(days=10)
    ev = await batepapos.create_event(_req(), db, m["disc"], org.id, _presencial(starts_at=inicio.isoformat()))
    with patch("src.services.communities.batepapos.utcnow", return_value=inicio - timedelta(days=5)):
        await batepapos.set_rsvp(db, m["membro"], ev.event_uuid, "vou")
    novos = await batepapos.generate_due_reminders(db, m["membro"].id, org.id, inicio - timedelta(hours=23))
    assert [n.kind for n in novos] == ["event_1d"]
    assert await batepapos.generate_due_reminders(db, m["membro"].id, org.id, inicio - timedelta(hours=22)) == []


# ---------------------------------------------------------------------------
# Filtros, regiões, validação
# ---------------------------------------------------------------------------


async def test_filtro_por_regiao_tipo_e_intervalo(db, mundo):
    m, org = mundo, mundo["org"]
    camp = await batepapos.create_event(_req(), db, m["disc"], org.id, _presencial())
    sp = await batepapos.create_event(_req(), db, m["disc"], org.id,
                                      _presencial(region_uuid="sao-paulo", city="São Paulo", kind="worship"))
    onl = await batepapos.create_event(_req(), db, m["disc"], org.id, _online())
    assert onl.region.slug == "online" and onl.kind == "bible_talk"

    regioes = await batepapos.list_regions(db, org.id)
    assert [r.name for r in regioes] == ["Online", "São Paulo", "Campinas", "São Carlos", "Rio de Janeiro", "Minas Gerais"]
    uuid_sp = next(r.region_uuid for r in regioes if r.slug == "sao-paulo")

    async def ids(**kw):
        return {e.event_uuid for e in await batepapos.list_events(db, m["anon"], org.id, **kw)}

    assert await ids(region_uuid=uuid_sp) == {sp.event_uuid}
    assert await ids(region_uuid="campinas") == {camp.event_uuid}
    assert await ids(region_uuid="online") == {onl.event_uuid}
    assert await ids(kind="worship") == {sp.event_uuid}
    # Intervalo (calendário): só o que começa dentro.
    assert await ids(start=_em(2 * 24 * 60 - 60), end=_em(2 * 24 * 60 + 60)) == {onl.event_uuid}
    assert await ids(start=_em(0), end=_em(10 * 24 * 60)) == {camp.event_uuid, sp.event_uuid, onl.event_uuid}
    with pytest.raises(HTTPException):
        await batepapos.list_events(db, m["anon"], org.id, kind="festa")


async def test_validacao_de_lugar(db, mundo):
    m, org = mundo, mundo["org"]
    # Presencial sem região, ou na região Online: 422.
    for kw in (dict(region_uuid=None), dict(region_uuid="online")):
        with pytest.raises(HTTPException) as exc:
            await batepapos.create_event(_req(), db, m["disc"], org.id, _presencial(**kw))
        assert exc.value.status_code == 422
    # Online não guarda endereço.
    ev = await batepapos.create_event(_req(), db, m["disc"], org.id, _online(address="Rua Secreta, 1"))
    assert ev.address is None
    # Passar de presencial para online volta para a região Online e apaga o endereço.
    pres = await batepapos.create_event(_req(), db, m["disc"], org.id, _presencial())
    out = await batepapos.update_event(db, m["disc"], pres.event_uuid, EventUpdate(mode="online"))
    assert out.region.slug == "online" and out.address is None


async def test_painel_de_regioes(db, mundo):
    m, org = mundo, mundo["org"]
    atual = await agenda.get_settings(db, m["admin"], org.id)
    assert atual.organizers_usergroup_name == "Discípulos"  # padrão por nome
    regs = atual.regions
    # Reordena, renomeia, desativa uma (ausente) e cria outra.
    nova = [RegionInput(region_uuid=r.region_uuid, name=r.name) for r in regs if r.slug != "minas-gerais"]
    nova[1].name = "Grande São Paulo"
    nova.append(RegionInput(name="Belo Horizonte"))
    out = await agenda.update_settings(db, m["admin"], org.id, AgendaSettingsUpdate(regions=nova))
    ativas = [r.name for r in out.regions if r.active]
    assert ativas == ["Online", "Grande São Paulo", "Campinas", "São Carlos", "Rio de Janeiro", "Belo Horizonte"]
    assert [r.name for r in await batepapos.list_regions(db, org.id)] == ativas
    assert any(r.slug == "minas-gerais" and not r.active for r in out.regions)
    with pytest.raises(HTTPException) as exc:
        await agenda.get_settings(db, m["membro"], org.id)
    assert exc.value.status_code == 403


# ---------------------------------------------------------------------------
# Feed pessoal e preferências
# ---------------------------------------------------------------------------


async def test_feed_pessoal(db, mundo):
    m, org = mundo, mundo["org"]
    vou = await batepapos.create_event(_req(), db, m["disc"], org.id, _presencial(title="Vou neste"))
    talvez = await batepapos.create_event(_req(), db, m["disc"], org.id, _online(title="Talvez neste"))
    outro = await batepapos.create_event(_req(), db, m["disc"], org.id, _online(title="Nao respondi"))
    cancel = await batepapos.create_event(_req(), db, m["disc"], org.id, _online(title="Vai cancelar"))
    await batepapos.set_rsvp(db, m["membro"], vou.event_uuid, "vou")
    await batepapos.set_rsvp(db, m["membro"], talvez.event_uuid, "talvez")
    await batepapos.set_rsvp(db, m["membro"], cancel.event_uuid, "vou")
    await batepapos.set_rsvp(db, m["ana"], outro.event_uuid, "vou")
    await batepapos.cancel_event(db, m["disc"], cancel.event_uuid)

    with pytest.raises(HTTPException) as exc:
        await agenda.rotate_feed(db, m["anon"], org.id)
    assert exc.value.status_code == 401

    tok = await agenda.rotate_feed(db, m["membro"], org.id)
    assert tok.path == f"agenda/feed/{tok.token}.ics" and len(tok.token) >= 40
    row = await agenda.get_pref_row(db, m["membro"].id, org.id)
    assert row.feed_token_hash and tok.token not in row.feed_token_hash  # só o hash

    ics = await batepapos.feed_ics(db, tok.token, "https://exemplo.test")
    assert "Vou neste" in ics and "Rua Secreta" in ics  # inscrito vê o endereço
    assert "Talvez neste" not in ics and "Nao respondi" not in ics
    assert "STATUS:CANCELLED" in ics and "Vai cancelar" in ics
    assert "https://exemplo.test/agenda/" in ics
    assert "ana" not in ics.lower()

    for errado in ("x" * 43, tok.token + "a", ""):
        with pytest.raises(HTTPException) as exc:
            await batepapos.feed_ics(db, errado)
        assert exc.value.status_code == 404
    # Gerar novo link: o antigo dá 404.
    novo = await agenda.rotate_feed(db, m["membro"], org.id)
    with pytest.raises(HTTPException):
        await batepapos.feed_ics(db, tok.token)
    assert "Vou neste" in await batepapos.feed_ics(db, novo.token)
    # Revogado: 404.
    prefs = await agenda.revoke_feed(db, m["membro"], org.id)
    assert prefs.feed_active is False
    with pytest.raises(HTTPException) as exc:
        await batepapos.feed_ics(db, novo.token)
    assert exc.value.status_code == 404


async def test_preferencia_de_email(db, mundo, monkeypatch):
    m, org = mundo, mundo["org"]
    p = await agenda.get_prefs(db, m["membro"], org.id)
    assert p.email_reminders is True and p.email_available is False
    p = await agenda.update_prefs(db, m["membro"], org.id, AgendaPrefsUpdate(email_reminders=False))
    assert p.email_reminders is False
    assert await agenda.email_opted_out(db, m["membro"].id, org.id) is True
    assert await agenda.email_opted_out(db, m["ana"].id, org.id) is False

    # Com a flag ligada, o cancelamento manda e-mail só para quem não desligou.
    monkeypatch.setenv("DISCIPULEI_LEMBRETES_EMAIL", "1")
    ev = await batepapos.create_event(_req(), db, m["disc"], org.id, _presencial())
    await batepapos.set_rsvp(db, m["membro"], ev.event_uuid, "vou")
    await batepapos.set_rsvp(db, m["ana"], ev.event_uuid, "vou")
    with patch("src.services.communities.batepapos_scheduler.send_cancellation") as envio:
        await batepapos.cancel_event(db, m["disc"], ev.event_uuid)
    assert [c.args[0] for c in envio.call_args_list] == ["ana@test.com"]
    assert (await db.execute(select(CommunityAgendaPref))).scalars().first() is not None


# ---------------------------------------------------------------------------
# Migração de dados antigos e alias /batepapos
# ---------------------------------------------------------------------------


async def test_evento_antigo_sem_regiao_continua_valendo(db, mundo):
    """Bate-papo criado antes da Agenda (sem region_id): aparece, sem quebrar."""
    from src.db.communities.batepapos import CommunityEvent

    m, org = mundo, mundo["org"]
    db.add(CommunityEvent(event_uuid="event_antigo", org_id=org.id, title="Antigo", starts_at=batepapos.fmt_utc(
        datetime.now(timezone.utc) + timedelta(days=1)), meeting_url="https://meet.google.com/abc-defg-hij",
        creation_date=_now(), update_date=_now()))
    await db.commit()
    e = await batepapos.get_event(db, m["anon"], "event_antigo")
    assert e.kind == "bible_talk" and e.mode == "online" and e.meeting_url is None


def test_api_em_agenda_e_alias_batepapos():
    """As rotas respondem em /agenda e, para clientes antigos, em /batepapos."""
    from src.router import v1_router

    def caminhos(nome, **params):
        out = set()
        for r in v1_router.routes:
            try:
                out.add(str(r.url_path_for(nome, **params)))
            except Exception:
                continue
        return out

    assert caminhos("api_list_events") == {"/api/v1/agenda", "/api/v1/batepapos"}
    assert caminhos("api_get_event", event_uuid="x") == {"/api/v1/agenda/x", "/api/v1/batepapos/x"}
    assert caminhos("api_ics", event_uuid="x") == {"/api/v1/agenda/x/ics", "/api/v1/batepapos/x/ics"}
    assert "/api/v1/agenda/feed/t.ics" in caminhos("api_feed", token="t")
    assert "/api/v1/agenda/regioes" in caminhos("api_regions")


def test_web_redireciona_batepapos_para_agenda():
    """A página antiga /batepapos (e /batepapos/<id>) redireciona para /agenda."""
    from pathlib import Path

    web = Path(__file__).resolve().parents[5] / "apps" / "web" / "app" / "orgs" / "[orgslug]" / "(withmenu)"
    if not web.exists():
        pytest.skip("apps/web não está ao lado da API")
    lista = (web / "batepapos" / "page.tsx").read_text(encoding="utf-8")
    um = (web / "batepapos" / "[eventuuid]" / "page.tsx").read_text(encoding="utf-8")
    assert "redirect('/agenda')" in lista
    assert "redirect(`/agenda/${" in um
    assert (web / "agenda" / "page.tsx").exists() and (web / "agenda" / "[eventuuid]" / "page.tsx").exists()
