"""Caderno Bíblico — imagens das notas e propriedades (metadados).

Imagens: privadas por padrão (fé é dado sensível, LGPD art. 11), fora da
pasta de conteúdo pública, servidas só ao dono, ao link privado válido (e só
as citadas pela nota) e, depois de publicar, como cópia com a regra de
leitura da discussion.

Propriedades: salvar, filtrar a lista, exportar e importar o frontmatter.
"""

import io
import json
import os
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI, HTTPException
from httpx import ASGITransport, AsyncClient
from PIL import Image
from sqlmodel import select

from src.core.events.database import get_db_session
from src.db.communities.communities import Community
from src.db.communities.discussions import Discussion
from src.db.notes import NoteAttachment
from src.db.user_organizations import UserOrganization
from src.db.users import AnonymousUser, PublicUser, User
from src.routers.notes import router as notes_router
from src.security.auth import get_current_user
from src.services.notes import attachments as att_svc
from src.services.notes.properties import (
    frontmatter_to_properties,
    normalize_properties,
    properties_to_frontmatter,
)

API = "/api/v1/notes"


def _doc(*nodes):
    return json.dumps({"type": "doc", "content": list(nodes)})


def _p(text):
    return {"type": "paragraph", "content": [{"type": "text", "text": text}]}


def _img(uuid, alt="foto"):
    return {"type": "image", "attrs": {"anexo": uuid, "src": None, "alt": alt}}


def _png(size=(64, 48), noise=False, color=(200, 30, 30)):
    img = Image.new("RGB", size, color)
    if noise:
        img = Image.frombytes("RGB", size, os.urandom(size[0] * size[1] * 3))
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def _jpeg_with_gps():
    img = Image.new("RGB", (40, 30), (10, 120, 200))
    exif = Image.Exif()
    exif[0x010F] = "CameraMaker"  # Make
    exif[0x0112] = 1  # Orientation
    gps = {1: "S", 2: (23.0, 33.0, 1.0), 3: "W", 4: (46.0, 38.0, 1.0)}
    exif[0x8825] = gps  # GPSInfo
    buf = io.BytesIO()
    img.save(buf, format="JPEG", exif=exif.tobytes())
    return buf.getvalue()


async def _make_user(db, *, id, username, org_id, role_id):
    u = User(
        id=id, username=username, first_name=username.capitalize(), last_name="X",
        email=f"{username}@test.com", password="hashed", user_uuid=f"user_{username}",
        creation_date=str(datetime.now()), update_date=str(datetime.now()),
    )
    db.add(u)
    await db.commit()
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
async def env(db, org, other_org, admin_user, regular_user, user_role, tmp_path, monkeypatch):
    monkeypatch.setenv("LEARNHOUSE_NOTE_MEDIA_DIR", str(tmp_path / "note_media"))
    other = await _make_user(db, id=3, username="outro", org_id=org.id, role_id=user_role.id)
    switch = _Switch(regular_user)
    app = FastAPI()
    app.include_router(notes_router, prefix=API)
    app.dependency_overrides[get_db_session] = lambda: db
    app.dependency_overrides[get_current_user] = switch
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield {
            "c": client, "as": switch, "author": regular_user, "admin": admin_user,
            "other": other, "anon": AnonymousUser(), "db": db, "root": tmp_path / "note_media",
        }
    app.dependency_overrides.clear()


async def _note(e, title="Nota", content=None, **extra):
    e["as"].user = e["author"]
    body = {"org_id": 1, "title": title, "content_json": content or _doc(_p("corpo")), **extra}
    r = await e["c"].post(API, json=body)
    assert r.status_code == 200, r.text
    return r.json()


async def _upload(e, note_uuid, data, name="foto.png", mime="image/png"):
    return await e["c"].post(f"{API}/{note_uuid}/attachments", files={"file": (name, data, mime)})


def _stored_files(root):
    if not root.exists():
        return []
    return [p for p in root.rglob("*") if p.is_file()]


# ---------------------------------------------------------------------------
# Envio
# ---------------------------------------------------------------------------


class TestUpload:
    @pytest.mark.asyncio
    async def test_upload_and_owner_read(self, env):
        e = env
        n = await _note(e)
        r = await _upload(e, n["note_uuid"], _png())
        assert r.status_code == 200, r.text
        att = r.json()
        assert att["attachment_uuid"].startswith("noteatt_")
        assert att["mime"] == "image/png" and att["width"] == 64 and att["height"] == 48

        got = await e["c"].get(f"{API}/attachments/{att['attachment_uuid']}")
        assert got.status_code == 200
        assert got.headers["content-type"] == "image/png"
        assert got.headers["x-content-type-options"] == "nosniff"
        assert got.headers["cache-control"].startswith("private")
        assert Image.open(io.BytesIO(got.content)).format == "PNG"

        # fora da pasta de conteúdo pública, com nome gerado pelo servidor
        files = _stored_files(e["root"])
        assert len(files) == 1
        assert "foto" not in files[0].name and "content" not in str(files[0].relative_to(e["root"]))

    @pytest.mark.asyncio
    async def test_invalid_type_by_content_not_extension(self, env):
        e = env
        n = await _note(e)
        # texto com nome e mime de imagem
        r = await _upload(e, n["note_uuid"], b"<svg onload=alert(1)>", name="x.png")
        assert r.status_code == 415
        # svg de verdade também fica de fora
        r = await _upload(e, n["note_uuid"], b'<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>',
                          name="x.svg", mime="image/svg+xml")
        assert r.status_code == 415
        # PNG com cabeçalho falso de JPEG
        r = await _upload(e, n["note_uuid"], b"\xff\xd8\xff" + _png()[3:], name="x.jpg", mime="image/jpeg")
        assert r.status_code == 415
        assert _stored_files(e["root"]) == []

    @pytest.mark.asyncio
    async def test_size_limit(self, env):
        e = env
        n = await _note(e)
        big = _png() + b"\0" * (att_svc.MAX_FILE_BYTES + 10)
        r = await _upload(e, n["note_uuid"], big)
        assert r.status_code == 413

    @pytest.mark.asyncio
    async def test_quota(self, env, monkeypatch):
        e = env
        n = await _note(e)
        data = _png((120, 120), noise=True)
        monkeypatch.setattr(att_svc, "quota_bytes", lambda: int(len(data) * 1.5))
        assert (await _upload(e, n["note_uuid"], data)).status_code == 200
        r = await _upload(e, n["note_uuid"], data)
        assert r.status_code == 413
        assert r.json()["detail"]["code"] == "NOTE_MEDIA_QUOTA"
        usage = (await e["c"].get(f"{API}/attachments/usage")).json()
        assert usage["used"] > 0 and usage["max_file"] == att_svc.MAX_FILE_BYTES

    @pytest.mark.asyncio
    async def test_exif_and_gps_removed(self, env):
        e = env
        n = await _note(e)
        raw = _jpeg_with_gps()
        assert Image.open(io.BytesIO(raw)).getexif().get(0x8825)
        att = (await _upload(e, n["note_uuid"], raw, name="f.jpg", mime="image/jpeg")).json()
        got = await e["c"].get(f"{API}/attachments/{att['attachment_uuid']}")
        img = Image.open(io.BytesIO(got.content))
        assert img.format == "JPEG"
        assert not img.getexif()
        assert b"CameraMaker" not in got.content

    @pytest.mark.asyncio
    async def test_strangers_cannot_upload_or_read(self, env):
        e = env
        n = await _note(e)
        att = (await _upload(e, n["note_uuid"], _png())).json()
        for who in (e["other"], e["admin"]):
            e["as"].user = who
            assert (await e["c"].get(f"{API}/attachments/{att['attachment_uuid']}")).status_code == 404
            assert (await _upload(e, n["note_uuid"], _png())).status_code == 404
        e["as"].user = e["anon"]
        assert (await e["c"].get(f"{API}/attachments/{att['attachment_uuid']}")).status_code in (401, 403)
        # uuid malformado
        e["as"].user = e["author"]
        assert (await e["c"].get(f"{API}/attachments/..%2F..%2Fetc")).status_code == 404

    @pytest.mark.asyncio
    async def test_trashed_note_does_not_accept_upload(self, env):
        e = env
        n = await _note(e)
        await e["c"].delete(f"{API}/{n['note_uuid']}")
        assert (await _upload(e, n["note_uuid"], _png())).status_code == 404


# ---------------------------------------------------------------------------
# Link privado /n/<token>
# ---------------------------------------------------------------------------


class TestSharedLink:
    @pytest.mark.asyncio
    async def test_token_serves_only_referenced_images_and_revocation(self, env):
        e = env
        n = await _note(e)
        a1 = (await _upload(e, n["note_uuid"], _png())).json()["attachment_uuid"]
        a2 = (await _upload(e, n["note_uuid"], _png(color=(0, 0, 0)))).json()["attachment_uuid"]
        await e["c"].put(f"{API}/{n['note_uuid']}", json={"content_json": _doc(_p("x"), _img(a1))})
        share = (await e["c"].post(f"{API}/{n['note_uuid']}/shares", json={"scope": "anyone_with_link"})).json()

        e["as"].user = e["anon"]
        ok = await e["c"].get(f"{API}/shared/{share['token']}/attachments/{a1}")
        assert ok.status_code == 200
        assert ok.headers["cache-control"] == "no-store"
        assert ok.headers["x-content-type-options"] == "nosniff"
        # imagem da pessoa, mas não citada pela nota compartilhada
        assert (await e["c"].get(f"{API}/shared/{share['token']}/attachments/{a2}")).status_code == 404
        # token errado
        assert (await e["c"].get(f"{API}/shared/xxxx/attachments/{a1}")).status_code == 404

        e["as"].user = e["author"]
        await e["c"].delete(f"{API}/{n['note_uuid']}/shares/{share['share_uuid']}")
        e["as"].user = e["anon"]
        assert (await e["c"].get(f"{API}/shared/{share['token']}/attachments/{a1}")).status_code == 404

    @pytest.mark.asyncio
    async def test_members_scope_requires_login(self, env):
        e = env
        n = await _note(e)
        a1 = (await _upload(e, n["note_uuid"], _png())).json()["attachment_uuid"]
        await e["c"].put(f"{API}/{n['note_uuid']}", json={"content_json": _doc(_img(a1))})
        share = (await e["c"].post(f"{API}/{n['note_uuid']}/shares", json={"scope": "members"})).json()
        e["as"].user = e["anon"]
        assert (await e["c"].get(f"{API}/shared/{share['token']}/attachments/{a1}")).status_code == 401
        e["as"].user = e["other"]
        assert (await e["c"].get(f"{API}/shared/{share['token']}/attachments/{a1}")).status_code == 200


# ---------------------------------------------------------------------------
# Publicar na comunidade
# ---------------------------------------------------------------------------


def _patches(check=None):
    return [
        patch("src.services.communities.discussions.check_resource_access", check or AsyncMock()),
        patch("src.services.communities.discussions.validate_discussion_content", new_callable=AsyncMock),
        patch("src.services.communities.discussions.enforce_posting_limits", new_callable=AsyncMock),
        patch("src.services.communities.discussions.track", new_callable=AsyncMock),
        patch("src.services.communities.discussions.dispatch_webhooks", new_callable=AsyncMock),
    ]


class TestPublish:
    @pytest.mark.asyncio
    async def test_publish_copies_images_with_discussion_access(self, env):
        e = env
        db = e["db"]
        db.add(Community(id=10, org_id=1, name="Devocionais", description="d", public=True,
                         thumbnail_image="", community_uuid="community_dev", moderation_words=[],
                         creation_date="2024-01-01", update_date="2024-01-01"))
        await db.commit()
        n = await _note(e)
        a1 = (await _upload(e, n["note_uuid"], _png())).json()["attachment_uuid"]
        await e["c"].put(f"{API}/{n['note_uuid']}", json={
            "content_json": _doc(_p("Deus é fiel"), _img(a1), _img("noteatt_00000000-0000-0000-0000-000000000000")),
        })
        ps = _patches()
        for pt in ps:
            pt.start()
        try:
            r = await e["c"].post(f"{API}/{n['note_uuid']}/publish", json={"community_uuid": "community_dev"})
            assert r.status_code == 200, r.text
            d = (await db.execute(select(Discussion).where(
                Discussion.discussion_uuid == r.json()["discussion_uuid"]))).scalars().first()
            images = [c for c in json.loads(d.content)["content"] if c["type"] == "image"]
            # a imagem de terceiros/inexistente sai; a da pessoa vira cópia nova
            assert len(images) == 1
            copy_uuid = images[0]["attrs"]["anexo"]
            assert copy_uuid != a1 and copy_uuid.startswith("noteatt_")
            copy = (await db.execute(select(NoteAttachment).where(
                NoteAttachment.attachment_uuid == copy_uuid))).scalars().first()
            assert copy.scope == "discussion" and copy.discussion_id == d.id
            assert len(_stored_files(e["root"])) == 2

            # quem lê a discussion vê a imagem (outro membro, visitante)
            for who in (e["other"], e["anon"]):
                e["as"].user = who
                got = await e["c"].get(f"{API}/discussion-attachments/{copy_uuid}")
                assert got.status_code == 200, got.text
                assert got.headers["x-content-type-options"] == "nosniff"
                # o anexo privado original continua fechado
                assert (await e["c"].get(f"{API}/attachments/{a1}")).status_code in (401, 403, 404)
                # e a cópia não abre pela rota do dono
                assert (await e["c"].get(f"{API}/attachments/{copy_uuid}")).status_code in (401, 403, 404)
        finally:
            for pt in ps:
                pt.stop()

        # sem acesso à comunidade: negado como a própria discussion
        deny = AsyncMock(side_effect=HTTPException(status_code=403, detail="no"))
        with patch("src.services.communities.discussions.check_resource_access", deny):
            e["as"].user = e["other"]
            assert (await e["c"].get(f"{API}/discussion-attachments/{copy_uuid}")).status_code == 403

        # apagar a nota de vez não quebra a discussion publicada
        e["as"].user = e["author"]
        await e["c"].delete(f"{API}/{n['note_uuid']}")
        assert (await e["c"].delete(f"{API}/{n['note_uuid']}/permanent")).status_code == 200
        assert (await db.execute(select(NoteAttachment).where(
            NoteAttachment.attachment_uuid == a1))).scalars().first() is None
        with patch("src.services.communities.discussions.check_resource_access", AsyncMock()):
            assert (await e["c"].get(f"{API}/discussion-attachments/{copy_uuid}")).status_code == 200
        assert len(_stored_files(e["root"])) == 1

    @pytest.mark.asyncio
    async def test_private_discussion_copy_is_author_only(self, env):
        e = env
        db = e["db"]
        db.add(Community(id=12, org_id=1, name="C", description="d", public=True, thumbnail_image="",
                         community_uuid="community_c", moderation_words=[],
                         creation_date="2024-01-01", update_date="2024-01-01"))
        db.add(Discussion(id=77, title="t", content="{}", label="general", community_id=12, org_id=1,
                          author_id=e["author"].id, discussion_uuid="discussion_priv", upvote_count=0,
                          edit_count=0, is_pinned=False, is_locked=False, visibility="private",
                          creation_date="2024-03-01", update_date="2024-03-01"))
        db.add(NoteAttachment(attachment_uuid="noteatt_11111111-1111-1111-1111-111111111111",
                              user_id=e["author"].id, org_id=1, scope="discussion", discussion_id=77,
                              storage_key="1/2/" + "a" * 32 + ".png", mime="image/png", size=10,
                              created_at="2026-01-01"))
        await db.commit()
        with patch("src.services.communities.discussions.check_resource_access", AsyncMock()):
            e["as"].user = e["other"]
            r = await e["c"].get(f"{API}/discussion-attachments/noteatt_11111111-1111-1111-1111-111111111111")
            assert r.status_code == 404


# ---------------------------------------------------------------------------
# Lixeira e exclusão
# ---------------------------------------------------------------------------


class TestLifecycle:
    @pytest.mark.asyncio
    async def test_permanent_delete_removes_unreferenced_but_keeps_shared_ones(self, env):
        e = env
        db = e["db"]
        a = await _note(e, title="A")
        b = await _note(e, title="B")
        x = (await _upload(e, a["note_uuid"], _png())).json()["attachment_uuid"]
        y = (await _upload(e, a["note_uuid"], _png(color=(1, 2, 3)))).json()["attachment_uuid"]
        await e["c"].put(f"{API}/{a['note_uuid']}", json={"content_json": _doc(_img(x), _img(y))})
        # a imagem y foi copiada para a nota B (copiar e colar)
        await e["c"].put(f"{API}/{b['note_uuid']}", json={"content_json": _doc(_img(y))})
        assert len(_stored_files(e["root"])) == 2

        # na lixeira a imagem continua (restaurar precisa dela)
        await e["c"].delete(f"{API}/{a['note_uuid']}")
        assert (await e["c"].get(f"{API}/attachments/{x}")).status_code == 200

        assert (await e["c"].delete(f"{API}/{a['note_uuid']}/permanent")).status_code == 200
        assert (await e["c"].get(f"{API}/attachments/{x}")).status_code == 404
        assert (await e["c"].get(f"{API}/attachments/{y}")).status_code == 200
        assert len(_stored_files(e["root"])) == 1
        assert (await db.execute(select(NoteAttachment))).scalars().all()[0].attachment_uuid == y

    @pytest.mark.asyncio
    async def test_unreferenced_after_grace_collected_when_trash_listed(self, env):
        e = env
        db = e["db"]
        n = await _note(e)
        x = (await _upload(e, n["note_uuid"], _png())).json()["attachment_uuid"]
        fresh = (await _upload(e, n["note_uuid"], _png(color=(9, 9, 9)))).json()["attachment_uuid"]
        # x saiu do texto há dois dias; `fresh` acabou de subir (ainda sem salvar)
        row = (await db.execute(select(NoteAttachment).where(NoteAttachment.attachment_uuid == x))).scalars().first()
        row.created_at = (datetime.now(timezone.utc) - timedelta(days=2)).isoformat()
        db.add(row)
        await db.commit()
        await e["c"].get(API, params={"org_id": 1, "trash": True})
        assert (await e["c"].get(f"{API}/attachments/{x}")).status_code == 404
        assert (await e["c"].get(f"{API}/attachments/{fresh}")).status_code == 200

    @pytest.mark.asyncio
    async def test_expired_trash_purge_removes_images(self, env):
        e = env
        db = e["db"]
        n = await _note(e)
        x = (await _upload(e, n["note_uuid"], _png())).json()["attachment_uuid"]
        await e["c"].put(f"{API}/{n['note_uuid']}", json={"content_json": _doc(_img(x))})
        await e["c"].delete(f"{API}/{n['note_uuid']}")
        from src.db.notes import Note

        note = (await db.execute(select(Note).where(Note.note_uuid == n["note_uuid"]))).scalars().first()
        note.deleted_at = (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()
        db.add(note)
        await db.commit()
        await e["c"].get(API, params={"org_id": 1, "trash": True})
        assert (await db.execute(select(NoteAttachment))).scalars().all() == []
        assert _stored_files(e["root"]) == []


# ---------------------------------------------------------------------------
# Propriedades
# ---------------------------------------------------------------------------


class TestProperties:
    @pytest.mark.asyncio
    async def test_save_read_and_filter(self, env):
        e = env
        a = await _note(e, title="Culto domingo", properties=[
            {"key": "tipo", "value": "Culto"}, {"key": "livro", "value": "João"},
            {"key": "tema", "value": "graça, fé"},
        ])
        assert a["properties"][0] == {"key": "tipo", "value": "Culto"}
        b = await _note(e, title="Estudo", properties=[{"key": "tipo", "value": "Estudo"},
                                                       {"key": "livro", "value": "Romanos"}])
        await _note(e, title="Sem nada")
        # atualizar (ordem preservada, chave repetida ignorada)
        r = await e["c"].put(f"{API}/{b['note_uuid']}", json={"properties": [
            {"key": "livro", "value": "João"}, {"key": "tipo", "value": "Estudo"}, {"key": "Tipo", "value": "x"},
        ]})
        assert [p["key"] for p in r.json()["properties"]] == ["livro", "tipo"]

        def titles(params):
            return e["c"].get(API, params={"org_id": 1, **params})

        res = (await titles({"prop": "tipo:culto"})).json()
        assert [i["title"] for i in res["items"]] == ["Culto domingo"]
        assert res["items"][0]["properties"][1]["value"] == "João"
        res = (await titles({"prop": "livro:joão"})).json()
        assert sorted(i["title"] for i in res["items"]) == ["Culto domingo", "Estudo"]
        res = (await titles({"prop": ["livro:João", "tipo:Estudo"]})).json()
        assert [i["title"] for i in res["items"]] == ["Estudo"]
        # valores separados por vírgula filtram um a um
        res = (await titles({"prop": "tema:fé"})).json()
        assert [i["title"] for i in res["items"]] == ["Culto domingo"]
        assert (await titles({"prop": "semdoispontos"})).status_code == 422

        vals = (await e["c"].get(f"{API}/properties", params={"org_id": 1})).json()
        livro = next(k for k in vals if k["key"] == "livro")
        assert livro["values"][0] == {"value": "João", "count": 2}

        # outra pessoa não enxerga nada
        e["as"].user = e["other"]
        assert (await titles({"prop": "tipo:culto"})).json()["items"] == []
        assert (await e["c"].get(f"{API}/properties", params={"org_id": 1})).json() == []

    @pytest.mark.asyncio
    async def test_validation(self, env):
        e = env
        n = await _note(e)
        bad = [{"key": "", "value": "x"}, {"key": "a" * 41, "value": "x"}, {"key": "a:b", "value": "x"}]
        for item in bad:
            r = await e["c"].put(f"{API}/{n['note_uuid']}", json={"properties": [item]})
            assert r.status_code == 422, item
        r = await e["c"].put(f"{API}/{n['note_uuid']}", json={"properties": [{"key": "tema", "value": "x" * 201}]})
        assert r.status_code == 422
        many = [{"key": f"k{i}", "value": "v"} for i in range(31)]
        assert (await e["c"].put(f"{API}/{n['note_uuid']}", json={"properties": many})).status_code == 422
        # omitir properties mantém as atuais; lista vazia limpa
        await e["c"].put(f"{API}/{n['note_uuid']}", json={"properties": [{"key": "tipo", "value": "Oração"}]})
        r = await e["c"].put(f"{API}/{n['note_uuid']}", json={"title": "Outro"})
        assert r.json()["properties"] == [{"key": "tipo", "value": "Oração"}]
        r = await e["c"].put(f"{API}/{n['note_uuid']}", json={"properties": []})
        assert r.json()["properties"] == []

    @pytest.mark.asyncio
    async def test_export_frontmatter_and_import_roundtrip(self, env):
        e = env
        props = [
            {"key": "tipo", "value": "Sermão"}, {"key": "livro", "value": "1 Coríntios"},
            {"key": "data", "value": "2026-11-22"}, {"key": "tema", "value": "amor: o maior"},
            {"key": "status", "value": "true"}, {"key": "autor", "value": 'Pr. "João"'},
        ]
        n = await _note(e, title="Amor", content=_doc(_p("O amor é paciente")), properties=props)
        r = await e["c"].get(f"{API}/{n['note_uuid']}/export")
        text = r.text
        assert text.startswith("---\ntipo: Sermão\nlivro: 1 Coríntios\ndata: 2026-11-22\n")
        assert 'tema: "amor: o maior"' in text and 'status: "true"' in text
        assert text.endswith("---\n\n# Amor\n\nO amor é paciente\n")
        parsed, body = frontmatter_to_properties(text)
        assert parsed == props
        assert body.startswith("\n# Amor")

    @pytest.mark.asyncio
    async def test_export_without_properties_is_unchanged(self, env):
        e = env
        n = await _note(e, title="Simples", content=_doc(_p("texto")))
        assert (await e["c"].get(f"{API}/{n['note_uuid']}/export")).text == "# Simples\n\ntexto\n"

    @pytest.mark.asyncio
    async def test_shared_read_and_templates_carry_properties(self, env):
        e = env
        n = await _note(e, properties=[{"key": "tipo", "value": "TCD"}])
        share = (await e["c"].post(f"{API}/{n['note_uuid']}/shares", json={"scope": "anyone_with_link"})).json()
        e["as"].user = e["anon"]
        assert (await e["c"].get(f"{API}/shared/{share['token']}")).json()["properties"] == [
            {"key": "tipo", "value": "TCD"}]
        e["as"].user = e["author"]
        t = await e["c"].post(f"{API}/templates", json={
            "org_id": 1, "name": "Culto", "properties": [{"key": "tipo", "value": "Culto"}]})
        assert t.status_code == 200, t.text
        assert t.json()["properties"] == [{"key": "tipo", "value": "Culto"}]


class TestFrontmatterParser:
    def test_obsidian_shapes(self):
        md = (
            "---\n"
            "tipo: Culto\n"
            "tags: [fé, 'graça']\n"
            "aliases:\n"
            "  - Um\n"
            "  - \"Dois\"\n"
            "nested:\n"
            "  a: 1\n"
            "data: 2026-01-02 # comentário\n"
            "chave inválida: x\n"
            "x:y: z\n"
            "---\n"
            "corpo"
        )
        props, body = frontmatter_to_properties(md)
        assert props[0] == {"key": "tipo", "value": "Culto"}
        assert {"key": "tags", "value": "fé, graça"} in props
        assert {"key": "aliases", "value": "Um, Dois"} in props
        assert {"key": "data", "value": "2026-01-02"} in props
        assert {"key": "chave inválida", "value": "x"} in props
        assert body == "corpo"

    def test_no_frontmatter(self):
        assert frontmatter_to_properties("# Título\n---\n") == ([], "# Título\n---\n")

    def test_emit_escapes(self):
        out = properties_to_frontmatter(normalize_properties([
            {"key": "tema", "value": "- lista?"}, {"key": "n", "value": "42"}, {"key": "vazio", "value": ""},
        ]))
        assert out == '---\ntema: "- lista?"\nn: "42"\nvazio: ""\n---\n'
        assert frontmatter_to_properties(out + "x")[0][1] == {"key": "n", "value": "42"}
