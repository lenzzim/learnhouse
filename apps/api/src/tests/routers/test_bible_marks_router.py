"""Leitor bíblico — destaques e favoritos (/api/v1/biblia/marcas).

As marcas são da própria pessoa: outro membro, admin, membro de outra org,
visitante e token de API nunca leem nem alteram. São por livro, capítulo e
versículo (independentes da versão) e não guardam texto bíblico.
"""

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlmodel import select

from src.core.events.database import get_db_session
from src.db.bible_marks import MARKS_PER_REQUEST, BibleVerseMark
from src.db.users import AnonymousUser, APITokenUser
from src.routers.bible_marks import router as marks_router
from src.security.auth import get_current_user
from src.tests.routers.test_notes_router import _make_user, _Switch

BASE = "/api/v1/biblia/marcas"


@pytest.fixture
async def env(db, org, other_org, admin_user, regular_user, user_role):
    other = await _make_user(db, id=3, username="outro", org_id=org.id, role_id=user_role.id)
    outsider = await _make_user(db, id=4, username="estranho", org_id=other_org.id, role_id=user_role.id)
    switch = _Switch(regular_user)
    app = FastAPI()
    app.include_router(marks_router, prefix=BASE)
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


async def _put(e, **body):
    base = {"book": "JHN", "chapter": 3}
    base.update(body)
    return await e["c"].put(BASE, json=base)


def _resumo(marcas):
    return [(m["verse"], m["color"], m["favorite"]) for m in marcas]


class TestMarks:
    @pytest.mark.asyncio
    async def test_highlight_favorite_and_clear(self, env):
        e = env
        res = await _put(e, verses=[17, 16, 16], color="verde")
        assert res.status_code == 200, res.text
        marcas = res.json()
        assert _resumo(marcas) == [(16, "verde", False), (17, "verde", False)]
        assert set(marcas[0]) == {"book", "chapter", "verse", "color", "favorite", "updated_at"}

        # favorito num versículo destacado e noutro sem destaque; a cor não muda
        res = await _put(e, verses=[16, 20], favorite=True)
        assert _resumo(res.json()) == [(16, "verde", True), (17, "verde", False), (20, None, True)]

        # trocar o tom; depois tirar o destaque (o favorito fica)
        await _put(e, verses=[16, 17], color="azul")
        res = await _put(e, verses=[16, 17], color="")
        assert _resumo(res.json()) == [(16, None, True), (20, None, True)]

        # sem cor e sem favorito a linha some
        res = await _put(e, verses=[16, 20, 21], favorite=False)
        assert res.json() == []
        assert (await e["db"].execute(select(BibleVerseMark))).scalars().all() == []

    @pytest.mark.asyncio
    async def test_chapter_and_list(self, env):
        e = env
        await _put(e, verses=[16], color="rosa")
        await _put(e, book="1PE", chapter=1, verses=[3], favorite=True)
        await _put(e, book="PSA", chapter=23, verses=[1, 2], color="grafite")

        cap = (await e["c"].get(f"{BASE}?livro=jhn&capitulo=3")).json()
        assert [(m["book"], m["verse"]) for m in cap] == [("JHN", 16)]
        assert (await e["c"].get(f"{BASE}?livro=JHN&capitulo=4")).json() == []

        tudo = (await e["c"].get(f"{BASE}/lista")).json()
        assert tudo["total"] == 4
        assert {m["book"] for m in tudo["items"]} == {"JHN", "1PE", "PSA"}
        destaques = (await e["c"].get(f"{BASE}/lista?tipo=highlight")).json()
        assert destaques["total"] == 3
        favoritos = (await e["c"].get(f"{BASE}/lista?tipo=favorite")).json()
        assert [(m["book"], m["verse"]) for m in favoritos["items"]] == [("1PE", 3)]
        pagina = (await e["c"].get(f"{BASE}/lista?limit=1&page=2")).json()
        assert len(pagina["items"]) == 1 and pagina["page"] == 2
        assert (await e["c"].get(f"{BASE}/lista?tipo=outro")).status_code == 422

    @pytest.mark.asyncio
    async def test_validation(self, env):
        e = env
        for body in (
            {"verses": [16], "color": "dourado"},
            {"verses": [16]},
            {"verses": [0], "color": "verde"},
            {"verses": [201], "color": "verde"},
            {"verses": [], "color": "verde"},
            {"verses": list(range(1, MARKS_PER_REQUEST + 2)), "color": "verde"},
            {"book": "ZZZ", "verses": [1], "color": "verde"},
            {"chapter": 22, "verses": [1], "color": "verde"},
            {"chapter": 0, "verses": [1], "color": "verde"},
        ):
            res = await _put(e, **body)
            assert res.status_code == 422, (body, res.text)
        assert (await e["c"].get(f"{BASE}?livro=ZZZ&capitulo=1")).status_code == 422
        assert (await e["c"].get(f"{BASE}?livro=JHN&capitulo=99")).status_code == 422


class TestOwnership:
    @pytest.mark.asyncio
    async def test_strangers_never_see_or_change(self, env):
        e = env
        await _put(e, verses=[16], color="verde", favorite=True)
        for estranho in (e["other"], e["admin"], e["outsider"]):
            e["as"].user = estranho
            assert (await e["c"].get(f"{BASE}?livro=JHN&capitulo=3")).json() == []
            assert (await e["c"].get(f"{BASE}/lista")).json()["total"] == 0
            # mexer no "mesmo" versículo só cria ou limpa as marcas da própria pessoa
            res = await _put(e, verses=[16], color="", favorite=False)
            assert res.status_code == 200 and res.json() == []
            res = await _put(e, verses=[16], color="rosa")
            assert [m["color"] for m in res.json()] == ["rosa"]
        e["as"].user = e["author"]
        minhas = (await e["c"].get(f"{BASE}?livro=JHN&capitulo=3")).json()
        assert [(m["color"], m["favorite"]) for m in minhas] == [("verde", True)]

    @pytest.mark.asyncio
    async def test_anon_and_api_token_forbidden(self, env):
        e = env
        for quem in (e["anon"], e["token"]):
            e["as"].user = quem
            assert (await e["c"].get(f"{BASE}?livro=JHN&capitulo=3")).status_code in (401, 403)
            assert (await e["c"].get(f"{BASE}/lista")).status_code in (401, 403)
            assert (await _put(e, verses=[16], color="verde")).status_code in (401, 403)
