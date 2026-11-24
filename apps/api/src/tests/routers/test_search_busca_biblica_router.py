"""Rotas novas da busca: /search/org_slug/{slug}/passage e /search/biblia."""

from unittest.mock import AsyncMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.core.events.database import get_db_session
from src.db.users import AnonymousUser
from src.routers.search import router
from src.security.auth import get_current_user


def _app(db, user):
    app = FastAPI()
    app.include_router(router, prefix="/api/v1/search")
    app.dependency_overrides[get_db_session] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return app


@pytest.fixture(autouse=True)
def _sem_limite():
    with patch("src.routers.search.check_search_rate_limit", return_value=(True, 0)), \
         patch("src.routers.search.check_rate_limit", return_value=(True, 0, 0)):
        yield


async def _get(app, url, **params):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        return await c.get(url, params=params)


@pytest.mark.asyncio
async def test_passagem_devolve_chip_e_lista(db, org, admin_user):
    r = await _get(_app(db, admin_user), "/api/v1/search/org_slug/test-org/passage", query="1Pe 1")
    assert r.status_code == 200
    body = r.json()
    assert body["passagem"]["rotulo"] == "1 Pedro 1"
    assert body["passagem"]["codigo"] == "1PE.1"
    assert body["discussions"] == [] and body["total"] == 0


@pytest.mark.asyncio
async def test_biblia_referencia_e_validacao(db, admin_user):
    app = _app(db, admin_user)
    r = await _get(app, "/api/v1/search/biblia", query="Jo 3:16")
    assert r.status_code == 200 and r.json()["referencia"] == "JHN.3.16"
    assert (await _get(app, "/api/v1/search/biblia", query="amor", testamento="XX")).status_code == 422


@pytest.mark.asyncio
async def test_visitante_nao_usa_licenciada(db):
    """Visitante pedindo NVI/ARA busca na aberta do idioma, sem tocar no provedor."""
    with patch("src.services.biblia.apibible.buscar", new_callable=AsyncMock) as ab, \
         patch("src.services.biblia.youversion.buscar_referencias", new_callable=AsyncMock) as yv:
        app = _app(db, AnonymousUser())
        for versao in ("nvi", "ara"):
            r = await _get(app, "/api/v1/search/biblia", query="amor", versao=versao)
            assert r.status_code == 200
            body = r.json()
            assert body["versao"] == versao and body["versao_texto"] == "blivre" and body["recuo"] is True
    ab.assert_not_awaited()
    yv.assert_not_awaited()
