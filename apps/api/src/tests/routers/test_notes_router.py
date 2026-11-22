"""Caderno Bíblico — API de notas (/api/v1/notes).

O requisito central é privacidade (fé é dado sensível, LGPD art. 11): toda
rota devolve só as notas da própria pessoa; admin da org, moderadores, outros
membros, visitantes e tokens de API recebem 404/401/403 e nunca o conteúdo.
Notas compartilhadas só são lidas com um token válido (hash SHA-256, revogação
imediata) ou, no escopo "members", por membros logados da org.
"""

import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlmodel import select

from src.core.events.database import get_db_session
from src.db.communities.communities import Community
from src.db.communities.discussions import Discussion
from src.db.notes import Note, NoteShare
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, APITokenUser, PublicUser, User
from src.routers.notes import router as notes_router
from src.security.auth import get_current_user
from src.services.notes.notes import purge_expired_trash


def _doc(text):
    return json.dumps({"type": "doc", "content": [
        {"type": "paragraph", "content": [{"type": "text", "text": text}]}
    ]})


async def _make_user(db, *, id, username, org_id, role_id):
    u = User(
        id=id, username=username, first_name=username.capitalize(), last_name="X",
        email=f"{username}@test.com", password="hashed", user_uuid=f"user_{username}",
        creation_date=str(datetime.now()), update_date=str(datetime.now()),
    )
    db.add(u)
    await db.commit()
    if org_id is not None:
        db.add(UserOrganization(
            user_id=id, org_id=org_id, role_id=role_id,
            creation_date=str(datetime.now()), update_date=str(datetime.now()),
        ))
        await db.commit()
    return PublicUser(id=u.id, username=u.username, first_name=u.first_name, last_name=u.last_name,
                      email=u.email, user_uuid=u.user_uuid)


class _Switch:
    def __init__(self, user):
        self.user = user

    def __call__(self):
        return self.user


@pytest.fixture
async def env(db, org, other_org, admin_user, regular_user, user_role):
    other = await _make_user(db, id=3, username="outro", org_id=org.id, role_id=user_role.id)
    outsider = await _make_user(db, id=4, username="estranho", org_id=other_org.id, role_id=user_role.id)
    switch = _Switch(regular_user)
    app = FastAPI()
    app.include_router(notes_router, prefix="/api/v1/notes")
    app.dependency_overrides[get_db_session] = lambda: db
    app.dependency_overrides[get_current_user] = switch
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield {
            "c": client,
            "as": switch,
            "author": regular_user,
            "admin": admin_user,
            "other": other,
            "outsider": outsider,
            "anon": AnonymousUser(),
            "token": APITokenUser(id=99, org_id=org.id, created_by_user_id=regular_user.id),
            "db": db,
        }
    app.dependency_overrides.clear()


async def _create(e, title="Graça", text="corpo", **extra):
    e["as"].user = e["author"]
    res = await e["c"].post("/api/v1/notes", json={"org_id": 1, "title": title, "content_json": _doc(text), **extra})
    assert res.status_code == 200, res.text
    return res.json()


def _strangers(e):
    return [e["other"], e["admin"], e["outsider"]]


# ---------------------------------------------------------------------------
# CRUD + parse-on-save
# ---------------------------------------------------------------------------


class TestCrud:
    @pytest.mark.asyncio
    async def test_create_read_update_parse(self, env):
        e = env
        n = await _create(e, title="Estudo", text="Ver [[Graça]] e #oração, #Fé")
        assert n["note_uuid"].startswith("note_")
        assert n["visibility"] == "private"
        assert n["kind"] == "note"
        assert sorted(n["tags"]) == ["Fé", "oração"]
        assert n["links"] == [{"target_title": "Graça", "target_note_uuid": None}]

        target = await _create(e, title="graça", text="alvo")
        got = (await e["c"].get(f"/api/v1/notes/{n['note_uuid']}")).json()
        # link pendente resolvido quando a nota-alvo nasce
        assert got["links"][0]["target_note_uuid"] == target["note_uuid"]

        res = await e["c"].put(f"/api/v1/notes/{n['note_uuid']}", json={
            "title": "Estudo 2", "content_json": _doc("Só #paz"),
            "bible_refs": [{"book": "JHN", "chapter": 3, "verse_start": 16}, {"book": "ZZZ", "chapter": 1}],
        })
        assert res.status_code == 200, res.text
        body = res.json()
        assert body["title"] == "Estudo 2"
        assert body["tags"] == ["paz"]
        assert body["links"] == []
        assert body["bible_refs"] == [{"book": "JHN", "chapter": 3, "verse_start": 16, "verse_end": None}]

        # bible_refs omitido: mantém
        res = await e["c"].put(f"/api/v1/notes/{n['note_uuid']}", json={"title": "Estudo 3"})
        assert len(res.json()["bible_refs"]) == 1

    @pytest.mark.asyncio
    async def test_limits_and_kind(self, env):
        e = env
        r = await e["c"].post("/api/v1/notes", json={"org_id": 1, "title": "x" * 301})
        assert r.status_code == 422
        r = await e["c"].post("/api/v1/notes", json={"org_id": 1, "content_json": "x" * 1_000_001})
        assert r.status_code == 422
        r = await e["c"].post("/api/v1/notes", json={"org_id": 1, "kind": "tcd"})
        assert r.status_code == 422

    @pytest.mark.asyncio
    async def test_org_membership_required(self, env):
        e = env
        e["as"].user = e["outsider"]
        r = await e["c"].post("/api/v1/notes", json={"org_id": 1, "title": "x"})
        assert r.status_code == 403
        r = await e["c"].get("/api/v1/notes", params={"org_id": 1})
        assert r.status_code == 403

    @pytest.mark.asyncio
    async def test_list_filters_and_search(self, env):
        e = env
        col = (await e["c"].post("/api/v1/notes/collections", json={"org_id": 1, "name": "Virtudes"})).json()
        a = await _create(e, title="Paciência", text="esperar em Deus #virtude", collection_uuid=col["collection_uuid"])
        await _create(e, title="Outra", text="nada aqui")
        r = (await e["c"].get("/api/v1/notes", params={"org_id": 1})).json()
        assert r["total"] == 2 and r["page"] == 1 and r["limit"] == 50
        r = (await e["c"].get("/api/v1/notes", params={"org_id": 1, "collection_uuid": col["collection_uuid"]})).json()
        assert [i["note_uuid"] for i in r["items"]] == [a["note_uuid"]]
        r = (await e["c"].get("/api/v1/notes", params={"org_id": 1, "collection_uuid": "none"})).json()
        assert [i["title"] for i in r["items"]] == ["Outra"]
        r = (await e["c"].get("/api/v1/notes", params={"org_id": 1, "tag": "VIRTUDE"})).json()
        assert [i["title"] for i in r["items"]] == ["Paciência"]
        r = (await e["c"].get("/api/v1/notes", params={"org_id": 1, "q": "ESPERAR deus"})).json()
        assert [i["title"] for i in r["items"]] == ["Paciência"]
        assert r["items"][0]["excerpt"].startswith("esperar")
        r = (await e["c"].get("/api/v1/notes", params={"org_id": 1, "kind": "tcd"})).json()
        assert r["total"] == 0
        r = (await e["c"].get("/api/v1/notes", params={"org_id": 1, "limit": 1, "page": 2})).json()
        assert r["total"] == 2 and len(r["items"]) == 1

    @pytest.mark.asyncio
    async def test_resolve(self, env):
        e = env
        n = await _create(e, title="Santificação")
        r = await e["c"].get("/api/v1/notes/resolve", params={"org_id": 1, "title": "santificação"})
        assert r.status_code == 200 and r.json()["note_uuid"] == n["note_uuid"]
        r = await e["c"].get("/api/v1/notes/resolve", params={"org_id": 1, "title": "nope"})
        assert r.status_code == 404
        e["as"].user = e["other"]
        r = await e["c"].get("/api/v1/notes/resolve", params={"org_id": 1, "title": "santificação"})
        assert r.status_code == 404


# ---------------------------------------------------------------------------
# Privacidade: ninguém além do dono
# ---------------------------------------------------------------------------


class TestPrivacy:
    @pytest.mark.asyncio
    async def test_strangers_get_404_on_every_note_path(self, env):
        e = env
        n = await _create(e, title="Segredo", text="confissão #pessoal")
        u = n["note_uuid"]
        for user in _strangers(e):
            e["as"].user = user
            calls = [
                e["c"].get(f"/api/v1/notes/{u}"),
                e["c"].put(f"/api/v1/notes/{u}", json={"title": "hack"}),
                e["c"].delete(f"/api/v1/notes/{u}"),
                e["c"].post(f"/api/v1/notes/{u}/restore"),
                e["c"].delete(f"/api/v1/notes/{u}/permanent"),
                e["c"].get(f"/api/v1/notes/{u}/backlinks"),
                e["c"].get(f"/api/v1/notes/{u}/export"),
                e["c"].get(f"/api/v1/notes/{u}/shares"),
                e["c"].post(f"/api/v1/notes/{u}/shares", json={"scope": "anyone_with_link"}),
                e["c"].post(f"/api/v1/notes/{u}/publish", json={"community_uuid": "community_x"}),
            ]
            for coro in calls:
                r = await coro
                assert r.status_code == 404, (user.username, r.request.url, r.status_code)
                assert "confiss" not in r.text
        e["as"].user = e["author"]
        assert (await e["c"].get(f"/api/v1/notes/{u}")).json()["title"] == "Segredo"

    @pytest.mark.asyncio
    async def test_anon_and_api_token_rejected(self, env):
        e = env
        n = await _create(e)
        for user, codes in ((e["anon"], {401, 403}), (e["token"], {403})):
            e["as"].user = user
            for coro in (
                e["c"].get("/api/v1/notes", params={"org_id": 1}),
                e["c"].get(f"/api/v1/notes/{n['note_uuid']}"),
                e["c"].post("/api/v1/notes", json={"org_id": 1}),
                e["c"].get("/api/v1/notes/collections", params={"org_id": 1}),
                e["c"].get("/api/v1/notes/tags", params={"org_id": 1}),
                e["c"].post("/api/v1/notes/tcd", json={"org_id": 1, "date": "2026-11-21"}),
            ):
                r = await coro
                assert r.status_code in codes, (user, r.request.url, r.status_code)

    @pytest.mark.asyncio
    async def test_lists_tags_collections_scoped_per_user(self, env):
        e = env
        await _create(e, title="Minha", text="#segredo")
        await e["c"].post("/api/v1/notes/collections", json={"org_id": 1, "name": "Pecados"})
        for user in (e["other"], e["admin"]):
            e["as"].user = user
            assert (await e["c"].get("/api/v1/notes", params={"org_id": 1})).json()["total"] == 0
            assert (await e["c"].get("/api/v1/notes", params={"org_id": 1, "q": "Minha"})).json()["total"] == 0
            assert (await e["c"].get("/api/v1/notes/tags", params={"org_id": 1})).json() == []
            assert (await e["c"].get("/api/v1/notes/collections", params={"org_id": 1})).json() == []
            tags = (await e["c"].get("/api/v1/notes/tags", params={"org_id": 1})).json()
            assert tags == []
        # tag/coleção de outra pessoa: 404
        e["as"].user = e["author"]
        tag = (await e["c"].get("/api/v1/notes/tags", params={"org_id": 1})).json()[0]
        col = (await e["c"].get("/api/v1/notes/collections", params={"org_id": 1})).json()[0]
        e["as"].user = e["other"]
        assert (await e["c"].put(f"/api/v1/notes/tags/{tag['tag_uuid']}", json={"name": "x"})).status_code == 404
        assert (await e["c"].put(f"/api/v1/notes/collections/{col['collection_uuid']}", json={"name": "x"})).status_code == 404
        assert (await e["c"].delete(f"/api/v1/notes/collections/{col['collection_uuid']}")).status_code == 404
        # nem usar a coleção alheia numa nota própria
        r = await e["c"].post("/api/v1/notes", json={"org_id": 1, "collection_uuid": col["collection_uuid"]})
        assert r.status_code == 404

    @pytest.mark.asyncio
    async def test_backlinks_do_not_leak_other_users(self, env):
        e = env
        target = await _create(e, title="Fé")
        src = await _create(e, title="Fonte", text="ligo [[Fé]]")
        # outra pessoa também tem uma nota que liga [[Fé]]
        e["as"].user = e["other"]
        r = await e["c"].post("/api/v1/notes", json={"org_id": 1, "title": "Dela", "content_json": _doc("[[Fé]]")})
        assert r.status_code == 200
        e["as"].user = e["author"]
        back = (await e["c"].get(f"/api/v1/notes/{target['note_uuid']}/backlinks")).json()
        assert [b["note_uuid"] for b in back] == [src["note_uuid"]]


# ---------------------------------------------------------------------------
# TCD
# ---------------------------------------------------------------------------


class TestTcd:
    @pytest.mark.asyncio
    async def test_get_or_create_idempotent(self, env):
        e = env
        r1 = await e["c"].post("/api/v1/notes/tcd", json={"org_id": 1, "date": "2026-11-20"})
        assert r1.status_code == 200, r1.text
        r2 = await e["c"].post("/api/v1/notes/tcd", json={"org_id": 1, "date": "2026-11-20"})
        assert r1.json()["note_uuid"] == r2.json()["note_uuid"]
        assert r1.json()["kind"] == "tcd" and r1.json()["tcd_date"] == "2026-11-20"
        assert r1.json()["title"] == "TCD — 20/11/2026"
        got = await e["c"].get("/api/v1/notes/tcd/2026-11-20", params={"org_id": 1})
        assert got.status_code == 200
        assert (await e["c"].get("/api/v1/notes/tcd/2026-11-19", params={"org_id": 1})).status_code == 404
        # outra pessoa tem o próprio TCD do mesmo dia
        e["as"].user = e["other"]
        assert (await e["c"].get("/api/v1/notes/tcd/2026-11-20", params={"org_id": 1})).status_code == 404
        r3 = await e["c"].post("/api/v1/notes/tcd", json={"org_id": 1, "date": "2026-11-20"})
        assert r3.json()["note_uuid"] != r1.json()["note_uuid"]

    @pytest.mark.asyncio
    async def test_trashed_tcd_is_restored(self, env):
        e = env
        r1 = (await e["c"].post("/api/v1/notes/tcd", json={"org_id": 1, "date": "2026-11-18"})).json()
        await e["c"].delete(f"/api/v1/notes/{r1['note_uuid']}")
        r2 = (await e["c"].post("/api/v1/notes/tcd", json={"org_id": 1, "date": "2026-11-18"})).json()
        assert r2["note_uuid"] == r1["note_uuid"] and r2["deleted_at"] is None

    @pytest.mark.asyncio
    async def test_invalid_dates(self, env):
        e = env
        future = (datetime.now(timezone.utc) + timedelta(days=3)).strftime("%Y-%m-%d")
        for d in ("2026-13-01", "ontem", future):
            r = await e["c"].post("/api/v1/notes/tcd", json={"org_id": 1, "date": d})
            assert r.status_code == 422, d

    @pytest.mark.asyncio
    async def test_calendar_and_streak(self, env):
        e = env
        for d in ("2026-11-21", "2026-11-20", "2026-11-19", "2026-11-15", "2026-10-31"):
            t = (await e["c"].post("/api/v1/notes/tcd", json={"org_id": 1, "date": d})).json()
            await e["c"].put(f"/api/v1/notes/{t['note_uuid']}", json={"content_json": _doc("Sl 23")})
        r = (await e["c"].get("/api/v1/notes/tcd-calendar",
                              params={"org_id": 1, "month": "2026-11", "today": "2026-11-21"})).json()
        assert r["dates"] == ["2026-11-15", "2026-11-19", "2026-11-20", "2026-11-21"]
        assert r["streak"] == 3
        # streak ainda vale se hoje não foi escrito (termina ontem)
        r = (await e["c"].get("/api/v1/notes/tcd-calendar",
                              params={"org_id": 1, "month": "2026-11", "today": "2026-11-22"})).json()
        assert r["streak"] == 3
        r = (await e["c"].get("/api/v1/notes/tcd-calendar",
                              params={"org_id": 1, "month": "2026-11", "today": "2026-11-24"})).json()
        assert r["streak"] == 0
        assert (await e["c"].get("/api/v1/notes/tcd-calendar",
                                 params={"org_id": 1, "month": "2026-1"})).status_code == 422

    @pytest.mark.asyncio
    async def test_empty_tcd_does_not_count(self, env):
        e = env
        # dia 2 com texto, dia 3 criado mas vazio, dia 4 só com espaços: só o 2 conta
        t2 = (await e["c"].post("/api/v1/notes/tcd", json={"org_id": 1, "date": "2026-11-02"})).json()
        await e["c"].put(f"/api/v1/notes/{t2['note_uuid']}", json={"content_json": _doc("Leitura do dia")})
        await e["c"].post("/api/v1/notes/tcd", json={"org_id": 1, "date": "2026-11-03"})
        t4 = (await e["c"].post("/api/v1/notes/tcd", json={"org_id": 1, "date": "2026-11-04"})).json()
        await e["c"].put(f"/api/v1/notes/{t4['note_uuid']}", json={"content_json": _doc("   ")})
        r = (await e["c"].get("/api/v1/notes/tcd-calendar",
                              params={"org_id": 1, "month": "2026-11", "today": "2026-11-03"})).json()
        assert r["dates"] == ["2026-11-02"]
        assert r["streak"] == 1
        r = (await e["c"].get("/api/v1/notes/tcd-calendar",
                              params={"org_id": 1, "month": "2026-11", "today": "2026-11-04"})).json()
        assert r["streak"] == 0
        # escrever no dia vazio passa a contar
        t3 = (await e["c"].get("/api/v1/notes/tcd/2026-11-03", params={"org_id": 1})).json()
        await e["c"].put(f"/api/v1/notes/{t3['note_uuid']}", json={"content_json": _doc("Jo 1")})
        r = (await e["c"].get("/api/v1/notes/tcd-calendar",
                              params={"org_id": 1, "month": "2026-11", "today": "2026-11-03"})).json()
        assert r["dates"] == ["2026-11-02", "2026-11-03"] and r["streak"] == 2


# ---------------------------------------------------------------------------
# Coleções e tags
# ---------------------------------------------------------------------------


class TestCollectionsTags:
    @pytest.mark.asyncio
    async def test_nested_collections(self, env):
        e = env
        a = (await e["c"].post("/api/v1/notes/collections", json={"org_id": 1, "name": "Estudos"})).json()
        b = (await e["c"].post("/api/v1/notes/collections",
                               json={"org_id": 1, "name": "Pecados", "parent_uuid": a["collection_uuid"]})).json()
        assert b["parent_uuid"] == a["collection_uuid"]
        # ciclo
        r = await e["c"].put(f"/api/v1/notes/collections/{a['collection_uuid']}", json={"parent_uuid": b["collection_uuid"]})
        assert r.status_code == 422
        r = await e["c"].put(f"/api/v1/notes/collections/{b['collection_uuid']}", json={"name": "Pecado", "parent_uuid": ""})
        assert r.json()["parent_uuid"] is None and r.json()["name"] == "Pecado"
        await e["c"].put(f"/api/v1/notes/collections/{b['collection_uuid']}", json={"parent_uuid": a["collection_uuid"]})
        n = await _create(e, title="Em A", collection_uuid=a["collection_uuid"])
        cols = {c["name"]: c for c in (await e["c"].get("/api/v1/notes/collections", params={"org_id": 1})).json()}
        assert cols["Estudos"]["note_count"] == 1
        # mover nota para fora
        r = await e["c"].put(f"/api/v1/notes/{n['note_uuid']}", json={"collection_uuid": None})
        assert r.json()["collection_uuid"] is None
        await e["c"].put(f"/api/v1/notes/{n['note_uuid']}", json={"collection_uuid": a["collection_uuid"]})
        # apagar A: filhos sobem para a raiz, notas ficam sem coleção
        assert (await e["c"].delete(f"/api/v1/notes/collections/{a['collection_uuid']}")).status_code == 200
        cols = (await e["c"].get("/api/v1/notes/collections", params={"org_id": 1})).json()
        assert [(c["name"], c["parent_uuid"]) for c in cols] == [("Pecado", None)]
        assert (await e["c"].get(f"/api/v1/notes/{n['note_uuid']}")).json()["collection_uuid"] is None

    @pytest.mark.asyncio
    async def test_tags_list_and_rename_rewrites_content(self, env):
        e = env
        n1 = await _create(e, title="Um", text="sobre #graca hoje")
        await _create(e, title="Dois", text="#graca e #graça")
        tags = {t["name"]: t for t in (await e["c"].get("/api/v1/notes/tags", params={"org_id": 1})).json()}
        assert tags["graca"]["count"] == 2 and tags["graça"]["count"] == 1
        r = await e["c"].put(f"/api/v1/notes/tags/{tags['graca']['tag_uuid']}", json={"name": "graça"})
        assert r.status_code == 200, r.text
        tags = (await e["c"].get("/api/v1/notes/tags", params={"org_id": 1})).json()
        assert [(t["name"], t["count"]) for t in tags] == [("graça", 2)]
        body = (await e["c"].get(f"/api/v1/notes/{n1['note_uuid']}")).json()
        assert "#graça hoje" in body["content_json"]
        assert body["tags"] == ["graça"]


# ---------------------------------------------------------------------------
# Lixeira
# ---------------------------------------------------------------------------


class TestTrash:
    @pytest.mark.asyncio
    async def test_trash_restore_purge(self, env):
        e = env
        n = await _create(e, title="Velha")
        assert (await e["c"].delete(f"/api/v1/notes/{n['note_uuid']}")).json() == {"ok": True}
        assert (await e["c"].get("/api/v1/notes", params={"org_id": 1})).json()["total"] == 0
        trash = (await e["c"].get("/api/v1/notes", params={"org_id": 1, "trash": True})).json()
        assert [i["note_uuid"] for i in trash["items"]] == [n["note_uuid"]]
        # dono ainda lê da lixeira
        assert (await e["c"].get(f"/api/v1/notes/{n['note_uuid']}")).json()["deleted_at"]
        r = await e["c"].post(f"/api/v1/notes/{n['note_uuid']}/restore")
        assert r.status_code == 200 and r.json()["deleted_at"] is None
        # apagar de vez só a partir da lixeira
        assert (await e["c"].delete(f"/api/v1/notes/{n['note_uuid']}/permanent")).status_code == 409
        await e["c"].delete(f"/api/v1/notes/{n['note_uuid']}")
        assert (await e["c"].delete(f"/api/v1/notes/{n['note_uuid']}/permanent")).status_code == 200
        assert (await e["c"].get(f"/api/v1/notes/{n['note_uuid']}")).status_code == 404

    @pytest.mark.asyncio
    async def test_restore_after_30_days_fails_and_purge(self, env):
        e = env
        db = e["db"]
        old = await _create(e, title="Antiga")
        recent = await _create(e, title="Recente")
        await e["c"].delete(f"/api/v1/notes/{old['note_uuid']}")
        await e["c"].delete(f"/api/v1/notes/{recent['note_uuid']}")
        row = (await db.execute(select(Note).where(Note.note_uuid == old["note_uuid"]))).scalars().first()
        row.deleted_at = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()
        db.add(row)
        await db.commit()
        assert (await e["c"].post(f"/api/v1/notes/{old['note_uuid']}/restore")).status_code == 410
        purged = await purge_expired_trash(db)
        assert purged == 1
        assert (await e["c"].get(f"/api/v1/notes/{old['note_uuid']}")).status_code == 404
        assert (await e["c"].get(f"/api/v1/notes/{recent['note_uuid']}")).status_code == 200


# ---------------------------------------------------------------------------
# Compartilhamento por link
# ---------------------------------------------------------------------------


class TestShares:
    @pytest.mark.asyncio
    async def test_anyone_with_link_flow(self, env):
        e = env
        n = await _create(e, title="Devocional", text="texto compartilhado")
        r = await e["c"].post(f"/api/v1/notes/{n['note_uuid']}/shares", json={"scope": "anyone_with_link"})
        assert r.status_code == 200, r.text
        share = r.json()
        token = share["token"]
        assert len(token) >= 20 and share["share_uuid"].startswith("noteshare_")
        # token nunca é guardado em claro
        rows = (await e["db"].execute(select(NoteShare))).scalars().all()
        assert all(row.token_hash != token and len(row.token_hash) == 64 for row in rows)
        listed = (await e["c"].get(f"/api/v1/notes/{n['note_uuid']}/shares")).json()
        assert listed and "token" not in listed[0] and "token_hash" not in listed[0]
        assert (await e["c"].get(f"/api/v1/notes/{n['note_uuid']}")).json()["visibility"] == "link"

        e["as"].user = e["anon"]
        pub = await e["c"].get(f"/api/v1/notes/shared/{token}")
        assert pub.status_code == 200
        assert pub.json()["title"] == "Devocional" and pub.json()["author_name"] == "Regular"
        assert "note_uuid" not in pub.json()
        assert pub.headers["cache-control"] == "no-store"
        assert "noindex" in pub.headers["x-robots-tag"]
        assert pub.headers["referrer-policy"] == "no-referrer"
        assert (await e["c"].get(f"/api/v1/notes/shared/{token}x")).status_code == 404
        assert (await e["c"].get("/api/v1/notes/shared/abc")).status_code == 404

        e["as"].user = e["author"]
        rv = await e["c"].delete(f"/api/v1/notes/{n['note_uuid']}/shares/{share['share_uuid']}")
        assert rv.status_code == 200
        e["as"].user = e["anon"]
        assert (await e["c"].get(f"/api/v1/notes/shared/{token}")).status_code == 404
        e["as"].user = e["author"]
        assert (await e["c"].get(f"/api/v1/notes/{n['note_uuid']}")).json()["visibility"] == "private"
        assert (await e["c"].get(f"/api/v1/notes/{n['note_uuid']}/shares")).json() == []

    @pytest.mark.asyncio
    async def test_expired_and_trashed(self, env):
        e = env
        n = await _create(e)
        token = (await e["c"].post(f"/api/v1/notes/{n['note_uuid']}/shares",
                                   json={"scope": "anyone_with_link", "expires_in_days": 1})).json()["token"]
        row = (await e["db"].execute(select(NoteShare))).scalars().first()
        row.expires_at = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
        e["db"].add(row)
        await e["db"].commit()
        e["as"].user = e["anon"]
        assert (await e["c"].get(f"/api/v1/notes/shared/{token}")).status_code == 404

        e["as"].user = e["author"]
        token2 = (await e["c"].post(f"/api/v1/notes/{n['note_uuid']}/shares",
                                    json={"scope": "anyone_with_link"})).json()["token"]
        await e["c"].delete(f"/api/v1/notes/{n['note_uuid']}")
        e["as"].user = e["anon"]
        assert (await e["c"].get(f"/api/v1/notes/shared/{token2}")).status_code == 404

    @pytest.mark.asyncio
    async def test_members_scope(self, env):
        e = env
        n = await _create(e)
        token = (await e["c"].post(f"/api/v1/notes/{n['note_uuid']}/shares",
                                   json={"scope": "members"})).json()["token"]
        e["as"].user = e["anon"]
        r = await e["c"].get(f"/api/v1/notes/shared/{token}")
        assert r.status_code == 401 and "SHARE_REQUIRES_LOGIN" in r.text
        e["as"].user = e["outsider"]
        assert (await e["c"].get(f"/api/v1/notes/shared/{token}")).status_code == 404
        e["as"].user = e["token"]
        assert (await e["c"].get(f"/api/v1/notes/shared/{token}")).status_code in (401, 404)
        e["as"].user = e["other"]
        assert (await e["c"].get(f"/api/v1/notes/shared/{token}")).status_code == 200

    @pytest.mark.asyncio
    async def test_invalid_scope_and_expiry(self, env):
        e = env
        n = await _create(e)
        assert (await e["c"].post(f"/api/v1/notes/{n['note_uuid']}/shares", json={"scope": "all"})).status_code == 422
        assert (await e["c"].post(f"/api/v1/notes/{n['note_uuid']}/shares",
                                  json={"scope": "members", "expires_in_days": 400})).status_code == 422


# ---------------------------------------------------------------------------
# Exportação, publicação, migração do caderno antigo
# ---------------------------------------------------------------------------


class TestExportPublishMigrate:
    @pytest.mark.asyncio
    async def test_export_markdown(self, env):
        e = env
        n = await _create(e, title="Oração da manhã", text="Senhor, obrigado")
        r = await e["c"].get(f"/api/v1/notes/{n['note_uuid']}/export")
        assert r.status_code == 200
        assert r.headers["content-type"].startswith("text/markdown")
        assert "oracao-da-manha.md" in r.headers["content-disposition"]
        assert r.text == "# Oração da manhã\n\nSenhor, obrigado\n"

    @pytest.mark.asyncio
    async def test_publish_reuses_discussion_service(self, env):
        e = env
        db = e["db"]
        db.add(Community(id=10, org_id=1, name="Devocionais", description="d", public=True,
                         thumbnail_image="", community_uuid="community_dev", moderation_words=[],
                         creation_date="2024-01-01", update_date="2024-01-01"))
        await db.commit()
        n = (await e["c"].post("/api/v1/notes/tcd", json={"org_id": 1, "date": "2026-11-21"})).json()
        await e["c"].put(f"/api/v1/notes/{n['note_uuid']}", json={"content_json": _doc("Deus é fiel")})
        with patch("src.services.communities.discussions.check_resource_access", new_callable=AsyncMock), \
             patch("src.services.communities.discussions.validate_discussion_content", new_callable=AsyncMock), \
             patch("src.services.communities.discussions.enforce_posting_limits", new_callable=AsyncMock), \
             patch("src.services.communities.discussions.track", new_callable=AsyncMock), \
             patch("src.services.communities.discussions.dispatch_webhooks", new_callable=AsyncMock):
            r = await e["c"].post(f"/api/v1/notes/{n['note_uuid']}/publish", json={"community_uuid": "community_dev"})
        assert r.status_code == 200, r.text
        out = r.json()
        assert out["community_uuid"] == "community_dev"
        d = (await db.execute(select(Discussion).where(Discussion.discussion_uuid == out["discussion_uuid"]))).scalars().first()
        assert d.visibility == "public" and d.label == "devocional"
        assert "Deus é fiel" in json.dumps(json.loads(d.content), ensure_ascii=False)
        got = (await e["c"].get(f"/api/v1/notes/{n['note_uuid']}")).json()
        assert got["visibility"] == "community"
        assert got["published_discussion_uuid"] == out["discussion_uuid"]
        assert got["published_community_uuid"] == "community_dev"

    @pytest.mark.asyncio
    async def test_migrate_legacy_copies_only_own_private(self, env):
        e = env
        db = e["db"]
        db.add(Community(id=11, org_id=1, name="C", description="d", public=True, thumbnail_image="",
                         community_uuid="community_c", moderation_words=[],
                         creation_date="2024-01-01", update_date="2024-01-01"))
        await db.commit()

        def disc(uuid, author, vis, content):
            return Discussion(title=f"T {uuid}", content=content, label="devocional", community_id=11, org_id=1,
                              author_id=author, discussion_uuid=uuid, upvote_count=0, edit_count=0,
                              is_pinned=False, is_locked=False, visibility=vis,
                              creation_date="2024-03-01T00:00:00", update_date="2024-03-01T00:00:00")

        db.add_all([
            disc("d1", 2, "private", _doc("minha nota #antiga")),
            disc("d2", 2, "private", "texto puro"),
            disc("d3", 2, "public", _doc("publica")),
            disc("d4", 3, "private", _doc("de outro")),
        ])
        await db.commit()
        r = await e["c"].post("/api/v1/notes/migrate-legacy", params={"org_id": 1})
        assert r.status_code == 200 and r.json() == {"copied": 2}
        assert (await e["c"].post("/api/v1/notes/migrate-legacy", params={"org_id": 1})).json() == {"copied": 0}
        items = (await e["c"].get("/api/v1/notes", params={"org_id": 1})).json()["items"]
        assert sorted(i["title"] for i in items) == ["T d1", "T d2"]
        plain = next(i for i in items if i["title"] == "T d2")
        body = (await e["c"].get(f"/api/v1/notes/{plain['note_uuid']}")).json()
        assert json.loads(body["content_json"])["type"] == "doc"
        assert body["created_at"].startswith("2024-03-01")
        # originais intactos
        d1 = (await db.execute(select(Discussion).where(Discussion.discussion_uuid == "d1"))).scalars().first()
        assert d1.visibility == "private"
