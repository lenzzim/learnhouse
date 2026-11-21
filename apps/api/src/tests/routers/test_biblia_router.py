"""
Router /api/v1/biblia (proxy da API.Bible). A API é sempre simulada com
httpx.MockTransport — nenhum teste faz chamada real — e o conteúdo é
sintético (nenhum texto licenciado no repositório).
"""

import json
import logging
import time
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from src.core.events.database import get_db_session
from src.routers import biblia as biblia_router
from src.security.api_token_utils import get_authenticated_non_api_token_user
from src.services.biblia import apibible

CHAVE_FALSA = "chave-secreta-de-teste-0123456789abcdef"
ARA = "afc24de218ef6e38-01"
NIV = "78a9f6124f344018-01"


class RedisFalso:
    """O mínimo de redis.Redis que o código usa, guardando os TTLs."""

    def __init__(self):
        self.dados: dict[str, str] = {}
        self.ttls: dict[str, int] = {}

    def get(self, k):
        return self.dados.get(k)

    def setex(self, k, ttl, v):
        self.dados[k] = v
        self.ttls[k] = int(ttl)

    def incr(self, k):
        self.dados[k] = str(int(self.dados.get(k, "0")) + 1)
        return int(self.dados[k])

    def expire(self, k, ttl):
        self.ttls[k] = int(ttl)

    def ttl(self, k):
        return self.ttls.get(k, -2)


def _capitulo_json(token="fums-token-1"):
    return {
        "data": {
            "id": "JHN.3",
            "bibleId": ARA,
            "number": "3",
            "bookId": "JHN",
            "reference": "João 3",
            "copyright": "Frase institucional.  ARA © 1993 Sociedade Bíblica do Brasil.",
            "content": [
                {"name": "para", "type": "tag", "attrs": {"style": "s"}, "items": [{"text": "A missão do Filho", "type": "text"}]},
                {
                    "name": "para",
                    "type": "tag",
                    "attrs": {"style": "p"},
                    "items": [
                        {"name": "verse", "type": "tag", "attrs": {"number": "16", "style": "v"}, "items": [{"text": "16", "type": "text"}]},
                        {"text": "Texto sintético do dezesseis.", "type": "text", "attrs": {"verseId": "JHN.3.16", "verseOrgIds": ["JHN.3.16"]}},
                        {"name": "verse", "type": "tag", "attrs": {"number": "17", "style": "v"}, "items": [{"text": "17", "type": "text"}]},
                        {"text": "Texto sintético do dezessete.", "type": "text", "attrs": {"verseId": "JHN.3.17", "verseOrgIds": ["JHN.3.17"]}},
                    ],
                },
                {"name": "para", "type": "tag", "attrs": {"style": "s1"}, "items": [{"text": "Outra seção", "type": "text"}]},
                {
                    "name": "para",
                    "type": "tag",
                    "attrs": {"style": "p"},
                    "items": [
                        {"name": "verse", "type": "tag", "attrs": {"number": "18", "style": "v"}, "items": [{"text": "18", "type": "text"}]},
                        {"text": "Texto sintético do dezoito.", "type": "text", "attrs": {"verseId": "JHN.3.18", "verseOrgIds": ["JHN.3.18"]}},
                    ],
                },
            ],
        },
        "meta": {"fumsToken": token},
    }


class ApiFalsa:
    """Responde como a API.Bible; registra chamadas e cabeçalhos."""

    def __init__(self):
        self.chamadas: list[httpx.Request] = []
        self.status_capitulo = 200
        self.status_por_biblia: dict[str, int] = {}

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.chamadas.append(request)
        caminho = request.url.path
        biblia = caminho.split("/")[3] if caminho.count("/") >= 3 else ""
        if biblia in self.status_por_biblia:
            return httpx.Response(self.status_por_biblia[biblia], json={"message": "erro", "echo": request.headers.get("api-key")})
        if "/chapters/" in caminho:
            if self.status_capitulo != 200:
                return httpx.Response(self.status_capitulo, headers={"retry-after": "30"}, json={"message": "erro"})
            return httpx.Response(200, json=_capitulo_json())
        return httpx.Response(200, json={"data": {"id": biblia, "copyright": f"Aviso. {biblia} © 2000 Editora."}})


@pytest.fixture
def redis_falso(monkeypatch):
    r = RedisFalso()
    monkeypatch.setattr(apibible, "get_redis_client", lambda: r)
    # o limitador por usuário usa o mesmo Redis falso
    from src.services.security import rate_limiting

    monkeypatch.setattr(rate_limiting, "_get_redis_pool_client", lambda: r)
    apibible.limpar_cache_memoria()
    return r


@pytest.fixture
def api_falsa(monkeypatch):
    falsa = ApiFalsa()
    monkeypatch.setattr(apibible, "TRANSPORTE", httpx.MockTransport(falsa))
    return falsa


@pytest.fixture
def com_chave(monkeypatch):
    monkeypatch.setenv("BIBLE_API_KEY", CHAVE_FALSA)
    monkeypatch.delenv("BIBLE_API_URL", raising=False)
    monkeypatch.delenv("BIBLE_API_DAILY_LIMIT", raising=False)


def _app(db, autenticado=True):
    app = FastAPI()
    app.include_router(biblia_router.router, prefix="/api/v1/biblia")
    app.dependency_overrides[get_db_session] = lambda: db
    if autenticado:
        app.dependency_overrides[get_authenticated_non_api_token_user] = lambda: SimpleNamespace(user_uuid="user_teste", id=1)
    return app


@pytest.fixture
async def client(db, redis_falso, api_falsa):
    app = _app(db)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
async def client_anonimo(db, redis_falso, api_falsa):
    app = _app(db, autenticado=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


URL_CAP = "/api/v1/biblia/ara/capitulo/JHN/3"


def _sem_chave(resposta: httpx.Response):
    assert CHAVE_FALSA not in resposta.text
    assert all(CHAVE_FALSA not in v for v in resposta.headers.values())


class TestAutenticacao:
    async def test_texto_exige_sessao(self, client_anonimo, com_chave, api_falsa):
        r = await client_anonimo.get(URL_CAP)
        assert r.status_code == 401
        assert api_falsa.chamadas == []

    async def test_versoes_e_publico(self, client_anonimo, com_chave):
        r = await client_anonimo.get("/api/v1/biblia/versoes")
        assert r.status_code == 200
        _sem_chave(r)


class TestCapitulo:
    async def test_normaliza_e_separa_titulos(self, client, com_chave, api_falsa):
        r = await client.get(URL_CAP)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == "ara" and d["sigla"] == "ARA" and d["capitulo"] == 3 and d["livro"] == "JHN"
        assert [v["numero"] for v in d["versos"]] == [16, 17, 18]
        assert d["titulos"] == {"16": "A missão do Filho", "18": "Outra seção"}
        assert all("missão" not in v["texto"] for v in d["versos"])
        assert d["fums"] == "fums-token-1"
        assert d["copyright"] == "Frase institucional. ARA © 1993 Sociedade Bíblica do Brasil."
        assert d["copyright_curto"] == "ARA © 1993 Sociedade Bíblica do Brasil."
        assert r.headers["cache-control"].startswith("private")
        _sem_chave(r)

    async def test_chave_vai_so_no_cabecalho_da_api(self, client, com_chave, api_falsa):
        await client.get(URL_CAP)
        req = api_falsa.chamadas[0]
        assert req.headers["api-key"] == CHAVE_FALSA
        assert CHAVE_FALSA not in str(req.url)
        assert req.url.path == f"/v1/bibles/{ARA}/chapters/JHN.3"
        assert req.url.params["content-type"] == "json"
        assert req.url.params["include-titles"] == "true"

    async def test_livro_ou_capitulo_invalido_nao_gasta_cota(self, client, com_chave, api_falsa):
        assert (await client.get("/api/v1/biblia/ara/capitulo/XYZ/1")).status_code == 404
        assert (await client.get("/api/v1/biblia/ara/capitulo/JHN/22")).status_code == 404
        assert (await client.get("/api/v1/biblia/naoexiste/capitulo/JHN/3")).status_code == 404
        assert api_falsa.chamadas == []

    async def test_versiculos_recorta_o_intervalo(self, client, com_chave):
        r = await client.get("/api/v1/biblia/ara/versiculos/JHN/3?ini=17&fim=18")
        assert r.status_code == 200
        d = r.json()
        assert [v["numero"] for v in d["versos"]] == [17, 18]
        assert d["titulos"] == {"18": "Outra seção"}
        assert d["ini"] == 17 and d["fim"] == 18

    async def test_versiculos_intervalo_invalido(self, client, com_chave):
        r = await client.get("/api/v1/biblia/ara/versiculos/JHN/3?ini=18&fim=16")
        assert r.status_code == 400


class TestCache:
    async def test_segunda_leitura_vem_do_cache_com_ttl_de_14_dias(self, client, com_chave, api_falsa, redis_falso):
        r1 = await client.get(URL_CAP)
        r2 = await client.get(URL_CAP)
        assert r1.headers["x-biblia-cache"] == "api"
        assert r2.headers["x-biblia-cache"] == "cache"
        assert r1.json() == r2.json()
        assert len([c for c in api_falsa.chamadas if "/chapters/" in c.url.path]) == 1
        chave = f"biblia:v1:cap:{ARA}:JHN.3"
        assert redis_falso.ttls[chave] == 14 * 24 * 3600
        assert redis_falso.ttls[chave] <= 30 * 24 * 3600
        # a chave da API não vai para o cache
        assert CHAVE_FALSA not in redis_falso.dados[chave]

    async def test_intervalo_reaproveita_o_capitulo_em_cache(self, client, com_chave, api_falsa):
        await client.get(URL_CAP)
        await client.get("/api/v1/biblia/ara/versiculos/JHN/3?ini=16")
        assert len(api_falsa.chamadas) == 1

    async def test_cache_com_mais_de_7_dias_e_renovado(self, client, com_chave, api_falsa, redis_falso):
        await client.get(URL_CAP)
        chave = f"biblia:v1:cap:{ARA}:JHN.3"
        item = json.loads(redis_falso.dados[chave])
        item["salvo_em"] = time.time() - 8 * 24 * 3600
        redis_falso.dados[chave] = json.dumps(item)
        r = await client.get(URL_CAP)
        assert r.headers["x-biblia-cache"] == "api"
        assert len(api_falsa.chamadas) == 2

    async def test_cache_com_mais_de_14_dias_nunca_e_servido(self, client, com_chave, api_falsa, redis_falso):
        await client.get(URL_CAP)
        chave = f"biblia:v1:cap:{ARA}:JHN.3"
        item = json.loads(redis_falso.dados[chave])
        item["salvo_em"] = time.time() - 15 * 24 * 3600
        redis_falso.dados[chave] = json.dumps(item)
        api_falsa.status_capitulo = 429
        r = await client.get(URL_CAP)
        assert r.status_code == 429  # nada de cópia vencida

    async def test_sem_redis_usa_memoria(self, db, api_falsa, com_chave, monkeypatch):
        monkeypatch.setattr(apibible, "get_redis_client", lambda: None)
        apibible.limpar_cache_memoria()
        app = _app(db)
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            assert (await c.get(URL_CAP)).headers["x-biblia-cache"] == "api"
            assert (await c.get(URL_CAP)).headers["x-biblia-cache"] == "cache"
        apibible.limpar_cache_memoria()


class TestErros:
    async def test_sem_chave_responde_503_claro(self, client, api_falsa, monkeypatch):
        monkeypatch.delenv("BIBLE_API_KEY", raising=False)
        r = await client.get(URL_CAP)
        assert r.status_code == 503
        assert r.json()["codigo"] == "chave_ausente"
        assert "BIBLE_API_KEY" in r.json()["detail"]
        assert api_falsa.chamadas == []

    async def test_429_sem_cache_da_erro_amigavel(self, client, com_chave, api_falsa):
        api_falsa.status_capitulo = 429
        r = await client.get(URL_CAP)
        assert r.status_code == 429
        assert r.json()["codigo"] == "limite_api"
        assert r.headers["retry-after"] == "30"
        _sem_chave(r)

    async def test_429_com_cache_ainda_valido_serve_copia(self, client, com_chave, api_falsa, redis_falso):
        await client.get(URL_CAP)
        chave = f"biblia:v1:cap:{ARA}:JHN.3"
        item = json.loads(redis_falso.dados[chave])
        item["salvo_em"] = time.time() - 10 * 24 * 3600  # velho, mas dentro dos 14 dias
        redis_falso.dados[chave] = json.dumps(item)
        api_falsa.status_capitulo = 429
        r = await client.get(URL_CAP)
        assert r.status_code == 200
        assert r.headers["x-biblia-cache"] == "cache-antigo"
        assert [v["numero"] for v in r.json()["versos"]] == [16, 17, 18]

    async def test_versao_sem_permissao_vira_503(self, client, com_chave, api_falsa):
        api_falsa.status_por_biblia[ARA] = 403
        r = await client.get(URL_CAP)
        assert r.status_code == 503
        assert r.json()["codigo"] == "versao_indisponivel"
        _sem_chave(r)  # a API falsa ecoa a chave no corpo do erro: não pode vazar

    async def test_erro_de_rede_vira_502(self, client, com_chave, monkeypatch):
        def explode(request):
            raise httpx.ConnectError(f"falhou com {request.headers.get('api-key')}")

        monkeypatch.setattr(apibible, "TRANSPORTE", httpx.MockTransport(explode))
        r = await client.get(URL_CAP)
        assert r.status_code == 502
        _sem_chave(r)

    async def test_teto_diario_local_protege_a_cota(self, client, com_chave, api_falsa, monkeypatch):
        monkeypatch.setenv("BIBLE_API_DAILY_LIMIT", "1")
        assert (await client.get(URL_CAP)).status_code == 200
        r = await client.get("/api/v1/biblia/ara/capitulo/JHN/4")
        assert r.status_code == 429
        assert len(api_falsa.chamadas) == 1

    async def test_limite_por_usuario(self, client, com_chave, monkeypatch):
        monkeypatch.setattr(biblia_router, "LIMITE_POR_USUARIO", 2)
        assert (await client.get(URL_CAP)).status_code == 200
        assert (await client.get(URL_CAP)).status_code == 200
        r = await client.get(URL_CAP)
        assert r.status_code == 429
        assert r.json()["codigo"] == "limite_usuario"

    async def test_chave_nunca_aparece_nos_logs(self, client, com_chave, api_falsa, caplog, monkeypatch):
        caplog.set_level(logging.DEBUG)
        api_falsa.status_por_biblia[ARA] = 403
        await client.get(URL_CAP)
        api_falsa.status_por_biblia.clear()
        api_falsa.status_capitulo = 500
        await client.get("/api/v1/biblia/ara/capitulo/JHN/5")

        def explode(request):
            raise httpx.ConnectError(f"falhou com {request.headers.get('api-key')}")

        monkeypatch.setattr(apibible, "TRANSPORTE", httpx.MockTransport(explode))
        await client.get("/api/v1/biblia/ara/capitulo/JHN/6")
        assert caplog.records, "esperava avisos nos logs"
        assert CHAVE_FALSA not in caplog.text


class TestVersoes:
    async def test_lista_com_disponibilidade_e_copyright(self, client, com_chave, api_falsa):
        api_falsa.status_por_biblia[NIV] = 403
        r = await client.get("/api/v1/biblia/versoes")
        assert r.status_code == 200
        d = r.json()
        assert d["ativo"] is True
        por_id = {v["id"]: v for v in d["versoes"]}
        assert {"ara", "arc", "rc69", "ntlh", "niv", "nkjv"} <= set(por_id)
        assert por_id["ara"]["disponivel"] is True
        assert por_id["ara"]["copyright"] == f"Aviso. {ARA} © 2000 Editora."
        assert por_id["niv"]["disponivel"] is False
        assert por_id["ara"]["idioma"] == "pt" and por_id["niv"]["idioma"] == "en"
        _sem_chave(r)

    async def test_metadados_ficam_em_cache(self, client, com_chave, api_falsa):
        await client.get("/api/v1/biblia/versoes")
        n = len(api_falsa.chamadas)
        await client.get("/api/v1/biblia/versoes")
        assert len(api_falsa.chamadas) == n

    async def test_sem_chave_lista_tudo_indisponivel_sem_chamar_api(self, client, api_falsa, monkeypatch):
        monkeypatch.delenv("BIBLE_API_KEY", raising=False)
        r = await client.get("/api/v1/biblia/versoes")
        assert r.status_code == 200
        assert r.json()["ativo"] is False
        assert all(not v["disponivel"] for v in r.json()["versoes"])
        assert api_falsa.chamadas == []
