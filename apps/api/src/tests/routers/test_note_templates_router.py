"""Caderno — modelos do usuário (/api/v1/notes/templates).

Modelos são privados ao dono, como as notas: outro membro, admin da org,
membro de outra org, visitante e token de API nunca leem nem alteram.
"""

import json

import pytest
from sqlmodel import select

from src.db.notes import NoteTemplate
from src.tests.routers.test_notes_router import env  # noqa: F401  (fixture)

BASE = "/api/v1/notes/templates"


def _doc(text="Gratidão"):
    return json.dumps({"type": "doc", "content": [
        {"type": "heading", "attrs": {"level": 3}, "content": [{"type": "text", "text": text}]},
        {"type": "paragraph"},
    ]})


async def _create(e, name="Meu TCD", **extra):
    e["as"].user = e["author"]
    body = {"org_id": 1, "name": name, "content_json": _doc(), **extra}
    res = await e["c"].post(BASE, json=body)
    assert res.status_code == 200, res.text
    return res.json()


class TestTemplatesCrud:
    @pytest.mark.asyncio
    async def test_crud_happy_path(self, env):  # noqa: F811
        e = env
        t = await _create(e, name="  Diário  ", kind="tcd")
        assert t["template_uuid"].startswith("notetpl_")
        assert t["name"] == "Diário"
        assert t["kind"] == "tcd"
        assert json.loads(t["content_json"])["type"] == "doc"
        assert set(t) == {"template_uuid", "name", "kind", "content_json", "created_at", "updated_at"}

        await _create(e, name="Ata de culto")
        lista = (await e["c"].get(f"{BASE}?org_id=1")).json()
        assert [x["name"] for x in lista] == ["Ata de culto", "Diário"]

        res = await e["c"].put(f"{BASE}/{t['template_uuid']}", json={"name": "Diário 2", "kind": None})
        assert res.status_code == 200, res.text
        assert res.json()["name"] == "Diário 2"
        assert res.json()["kind"] is None
        assert res.json()["content_json"] == t["content_json"]

        res = await e["c"].put(f"{BASE}/{t['template_uuid']}", json={"content_json": ""})
        assert res.status_code == 200
        assert res.json()["content_json"] == ""

        res = await e["c"].delete(f"{BASE}/{t['template_uuid']}")
        assert res.status_code == 200 and res.json() == {"ok": True}
        assert [x["name"] for x in (await e["c"].get(f"{BASE}?org_id=1")).json()] == ["Ata de culto"]

    @pytest.mark.asyncio
    async def test_validation(self, env):  # noqa: F811
        e = env
        e["as"].user = e["author"]
        for body in (
            {"org_id": 1, "name": "   ", "content_json": _doc()},
            {"org_id": 1, "name": "x" * 121, "content_json": _doc()},
            {"org_id": 1, "name": "ok", "content_json": "não é json"},
            {"org_id": 1, "name": "ok", "content_json": json.dumps({"type": "paragraph"})},
            {"org_id": 1, "name": "ok", "content_json": _doc(), "kind": "outro"},
            {"org_id": 1, "name": "ok", "content_json": "x" * 1_000_001},
        ):
            res = await e["c"].post(BASE, json=body)
            assert res.status_code == 422, (body.get("name"), res.text)
        t = await _create(e)
        res = await e["c"].put(f"{BASE}/{t['template_uuid']}", json={"name": ""})
        assert res.status_code == 422
        res = await e["c"].put(f"{BASE}/{t['template_uuid']}", json={"content_json": "[1]"})
        assert res.status_code == 422

    @pytest.mark.asyncio
    async def test_cap_per_user_org(self, env):  # noqa: F811
        e = env
        db = e["db"]
        for i in range(100):
            db.add(NoteTemplate(template_uuid=f"notetpl_x{i}", user_id=e["author"].id, org_id=1,
                                name=f"M{i}", content_json="", created_at="", updated_at=""))
        await db.commit()
        e["as"].user = e["author"]
        res = await e["c"].post(BASE, json={"org_id": 1, "name": "Mais um", "content_json": ""})
        assert res.status_code == 409
        # o limite é por pessoa: outro membro ainda cria
        e["as"].user = e["other"]
        res = await e["c"].post(BASE, json={"org_id": 1, "name": "Meu", "content_json": ""})
        assert res.status_code == 200


class TestTemplatesPrivacy:
    @pytest.mark.asyncio
    async def test_strangers_never_see_or_touch(self, env):  # noqa: F811
        e = env
        t = await _create(e, name="Segredo")
        uuid = t["template_uuid"]
        for user in (e["other"], e["admin"]):
            e["as"].user = user
            assert (await e["c"].get(f"{BASE}?org_id=1")).json() == []
            assert (await e["c"].put(f"{BASE}/{uuid}", json={"name": "hack"})).status_code == 404
            assert (await e["c"].delete(f"{BASE}/{uuid}")).status_code == 404
        # membro de outra org: não pode nem listar a org
        e["as"].user = e["outsider"]
        assert (await e["c"].get(f"{BASE}?org_id=1")).status_code == 403
        assert (await e["c"].post(BASE, json={"org_id": 1, "name": "x", "content_json": ""})).status_code == 403
        assert (await e["c"].put(f"{BASE}/{uuid}", json={"name": "hack"})).status_code == 404
        # visitante e token de API
        for user in (e["anon"], e["token"]):
            e["as"].user = user
            assert (await e["c"].get(f"{BASE}?org_id=1")).status_code == 403
            assert (await e["c"].post(BASE, json={"org_id": 1, "name": "x", "content_json": ""})).status_code == 403
            assert (await e["c"].put(f"{BASE}/{uuid}", json={"name": "hack"})).status_code == 403
            assert (await e["c"].delete(f"{BASE}/{uuid}")).status_code == 403
        row = (await e["db"].execute(select(NoteTemplate).where(NoteTemplate.template_uuid == uuid))).scalars().first()
        assert row.name == "Segredo"

    @pytest.mark.asyncio
    async def test_templates_scoped_by_org(self, env, other_org):  # noqa: F811
        e = env
        await _create(e, name="Org 1")
        e["as"].user = e["outsider"]
        res = await e["c"].post(BASE, json={"org_id": other_org.id, "name": "Org 2", "content_json": ""})
        assert res.status_code == 200
        assert [x["name"] for x in (await e["c"].get(f"{BASE}?org_id={other_org.id}")).json()] == ["Org 2"]
        e["as"].user = e["author"]
        assert [x["name"] for x in (await e["c"].get(f"{BASE}?org_id=1")).json()] == ["Org 1"]
