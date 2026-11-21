"""
Router /api/v1/biblia com o provedor YouVersion (NVI). A YouVersion é sempre
simulada com httpx.MockTransport — nenhum teste faz chamada real — e o texto é
sintético (nenhum texto licenciado no repositório).
"""

import json
import logging
import time

import httpx
import pytest
from httpx import ASGITransport, AsyncClient

from src.services.biblia import apibible, youversion
from src.tests.routers.test_biblia_router import RedisFalso, _app

CHAVE_YV = "yv-chave-secreta-de-teste-fedcba9876543210"
CHAVE_AB = "apibible-chave-secreta-0123456789"
CREDITO_NVI = (
    "Bíblia Sagrada, Nova Versão Internacional®, NVI® © 1993, 2000, 2011, 2023 por Biblica, Inc. "
    "Usado com permissão. Todos os direitos reservados mundialmente."
)

HTML_JHN3 = (
    '<div><div class="s1 yv-h">Título sintético</div>'
    '<div class="p"><span class="yv-v" v="1"></span><span class="yv-vlbl">1</span>Texto sintético do um'
    '<span class="yv-n f"><span class="fr">3.1 </span><span class="ft">nota que não entra</span></span>.'
    ' <span class="yv-v" v="2"></span><span class="yv-vlbl">2</span>Texto &amp; sintético do dois.</div>'
    '<div class="q1"><span class="yv-v" v="3"></span><span class="yv-vlbl">3</span>Poesia linha um</div>'
    '<div class="q2">poesia linha dois.</div>'
    '<div class="s1 yv-h">Outra seção</div>'
    '<div class="p"><span class="yv-v" v="4-5"></span><span class="yv-vlbl">4-5</span>Combinado sintético.</div>'
    "</div>"
)


class YouVersionFalsa:
    """Responde como a YouVersion Platform; registra chamadas e cabeçalhos."""

    def __init__(self):
        self.chamadas: list[httpx.Request] = []
        self.status_passagem = 200
        self.status_meta = 200
        self.copyright = CREDITO_NVI

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.chamadas.append(request)
        caminho = request.url.path
        partes = caminho.strip("/").split("/")  # v1 bibles 129 [passages JHN.3]
        if len(partes) >= 3 and partes[1] == "bibles" and "passages" not in partes:
            if self.status_meta != 200:
                return httpx.Response(self.status_meta, json={"message": "erro", "echo": request.headers.get("x-yvp-app-key")})
            return httpx.Response(
                200,
                json={
                    "id": int(partes[2]),
                    "abbreviation": "NVI",
                    "localized_abbreviation": "NVI",
                    "title": "Nova Versão Internacional",
                    "localized_title": "Nova Versão Internacional",
                    "copyright": self.copyright,
                    "language_tag": "pt",
                },
            )
        if "passages" in partes:
            if self.status_passagem == 429:
                return httpx.Response(429, headers={"retry-after": "42"}, text="Rate limit exceeded")
            if self.status_passagem != 200:
                return httpx.Response(self.status_passagem, json={"message": "erro", "echo": request.headers.get("x-yvp-app-key")})
            return httpx.Response(200, json={"id": partes[-1], "content": HTML_JHN3, "reference": "João 3"})
        return httpx.Response(404, json={"message": "não encontrado"})


@pytest.fixture
def redis_falso(monkeypatch):
    r = RedisFalso()
    monkeypatch.setattr(apibible, "get_redis_client", lambda: r)
    from src.services.security import rate_limiting

    monkeypatch.setattr(rate_limiting, "_get_redis_pool_client", lambda: r)
    apibible.limpar_cache_memoria()
    return r


@pytest.fixture
def yv(monkeypatch):
    falsa = YouVersionFalsa()
    monkeypatch.setattr(youversion, "TRANSPORTE", httpx.MockTransport(falsa))
    # a API.Bible não pode ser chamada nestes testes
    monkeypatch.setattr(apibible, "TRANSPORTE", httpx.MockTransport(lambda r: httpx.Response(599)))
    return falsa


@pytest.fixture
def com_chave(monkeypatch):
    monkeypatch.setenv("YOUVERSION_API_KEY", CHAVE_YV)
    monkeypatch.delenv("BIBLE_API_KEY", raising=False)
    for nome in ("YOUVERSION_API_URL", "YOUVERSION_DAILY_LIMIT", "YOUVERSION_BIBLES"):
        monkeypatch.delenv(nome, raising=False)


@pytest.fixture
def sem_chaves(monkeypatch):
    for nome in ("YOUVERSION_API_KEY", "BIBLE_API_KEY", "YOUVERSION_BIBLES"):
        monkeypatch.delenv(nome, raising=False)


@pytest.fixture
async def client(db, redis_falso, yv):
    app = _app(db)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


@pytest.fixture
async def client_anonimo(db, redis_falso, yv):
    app = _app(db, autenticado=False)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


URL_CAP = "/api/v1/biblia/nvi/capitulo/JHN/3"


def _sem_chave(resposta: httpx.Response):
    assert CHAVE_YV not in resposta.text
    assert all(CHAVE_YV not in v for v in resposta.headers.values())


def _passagens(falsa: YouVersionFalsa) -> list[httpx.Request]:
    return [c for c in falsa.chamadas if "/passages/" in c.url.path]


class TestAutenticacao:
    async def test_texto_exige_sessao(self, client_anonimo, com_chave, yv):
        r = await client_anonimo.get(URL_CAP)
        assert r.status_code == 401
        assert yv.chamadas == []


class TestCapitulo:
    async def test_normaliza_html_e_separa_titulos(self, client, com_chave, yv):
        r = await client.get(URL_CAP)
        assert r.status_code == 200
        d = r.json()
        assert d["id"] == "nvi" and d["sigla"] == "NVI" and d["provedor"] == "youversion"
        assert d["livro"] == "JHN" and d["capitulo"] == 3
        assert [v["numero"] for v in d["versos"]] == [1, 2, 3, 4]
        textos = {v["numero"]: v["texto"] for v in d["versos"]}
        assert textos[1] == "Texto sintético do um."
        assert textos[2] == "Texto & sintético do dois."
        assert textos[3] == "Poesia linha um poesia linha dois."
        assert d["versos"][3]["ate"] == 5
        assert d["titulos"] == {"1": "Título sintético", "4": "Outra seção"}
        assert all("nota" not in t and "Título" not in t for t in textos.values())
        assert d["copyright"] == CREDITO_NVI
        assert d["copyright_curto"] == CREDITO_NVI
        assert d["fums"] is None
        assert r.headers["cache-control"].startswith("private")
        _sem_chave(r)

    async def test_chave_vai_so_no_cabecalho_x_yvp(self, client, com_chave, yv):
        await client.get(URL_CAP)
        req = _passagens(yv)[0]
        assert req.headers["x-yvp-app-key"] == CHAVE_YV
        assert CHAVE_YV not in str(req.url)
        assert req.url.host == "api.youversion.com"
        assert req.url.path == "/v1/bibles/129/passages/JHN.3"
        assert req.url.params["format"] == "html"
        assert req.url.params["include_headings"] == "true"
        assert req.url.params["include_notes"] == "false"
        meta = yv.chamadas[0]
        assert meta.url.path == "/v1/bibles/129"

    async def test_versiculos_recorta(self, client, com_chave):
        r = await client.get("/api/v1/biblia/nvi/versiculos/JHN/3?ini=2&fim=4")
        assert r.status_code == 200
        d = r.json()
        assert [v["numero"] for v in d["versos"]] == [2, 3, 4]
        assert d["titulos"] == {"4": "Outra seção"}

    async def test_capitulo_invalido_nao_gasta_cota(self, client, com_chave, yv):
        assert (await client.get("/api/v1/biblia/nvi/capitulo/JHN/22")).status_code == 404
        assert (await client.get("/api/v1/biblia/nvi/capitulo/XYZ/1")).status_code == 404
        assert yv.chamadas == []

    async def test_versao_opcional_desligada_por_padrao(self, client, com_chave, yv):
        r = await client.get("/api/v1/biblia/nvi2011/capitulo/JHN/3")
        assert r.status_code == 404
        assert yv.chamadas == []

    async def test_versao_opcional_ligada_por_configuracao(self, client, com_chave, yv, monkeypatch):
        monkeypatch.setenv("YOUVERSION_BIBLES", "129,4360")
        r = await client.get("/api/v1/biblia/nvi2011/capitulo/JHN/3")
        assert r.status_code == 200
        assert _passagens(yv)[0].url.path == "/v1/bibles/4360/passages/JHN.3"

    async def test_sem_atribuicao_nao_exibe_texto(self, client, com_chave, yv):
        yv.copyright = ""
        r = await client.get(URL_CAP)
        assert r.status_code == 503
        assert _passagens(yv) == []


class TestCache:
    async def test_cache_14_dias_e_sem_chave(self, client, com_chave, yv, redis_falso):
        r1 = await client.get(URL_CAP)
        r2 = await client.get(URL_CAP)
        assert r1.headers["x-biblia-cache"] == "api"
        assert r2.headers["x-biblia-cache"] == "cache"
        assert len(_passagens(yv)) == 1
        chave = "biblia:v1:yv:cap:129:JHN.3"
        assert redis_falso.ttls[chave] == 14 * 24 * 3600
        assert all(CHAVE_YV not in v for v in redis_falso.dados.values())

    async def test_cache_com_mais_de_7_dias_e_renovado(self, client, com_chave, yv, redis_falso):
        await client.get(URL_CAP)
        chave = "biblia:v1:yv:cap:129:JHN.3"
        item = json.loads(redis_falso.dados[chave])
        item["salvo_em"] = time.time() - 8 * 24 * 3600
        redis_falso.dados[chave] = json.dumps(item)
        r = await client.get(URL_CAP)
        assert r.headers["x-biblia-cache"] == "api"
        assert len(_passagens(yv)) == 2

    async def test_cache_com_mais_de_14_dias_nunca_e_servido(self, client, com_chave, yv, redis_falso):
        await client.get(URL_CAP)
        chave = "biblia:v1:yv:cap:129:JHN.3"
        item = json.loads(redis_falso.dados[chave])
        item["salvo_em"] = time.time() - 15 * 24 * 3600
        redis_falso.dados[chave] = json.dumps(item)
        yv.status_passagem = 429
        r = await client.get(URL_CAP)
        assert r.status_code == 429

    async def test_429_com_cache_valido_serve_copia(self, client, com_chave, yv, redis_falso):
        await client.get(URL_CAP)
        chave = "biblia:v1:yv:cap:129:JHN.3"
        item = json.loads(redis_falso.dados[chave])
        item["salvo_em"] = time.time() - 10 * 24 * 3600
        redis_falso.dados[chave] = json.dumps(item)
        yv.status_passagem = 429
        r = await client.get(URL_CAP)
        assert r.status_code == 200
        assert r.headers["x-biblia-cache"] == "cache-antigo"


class TestErros:
    async def test_sem_chave_503_claro(self, client, sem_chaves, yv):
        r = await client.get(URL_CAP)
        assert r.status_code == 503
        assert r.json()["codigo"] == "chave_ausente"
        assert "YOUVERSION_API_KEY" in r.json()["detail"]
        assert yv.chamadas == []

    async def test_429_texto_puro_vira_erro_amigavel(self, client, com_chave, yv):
        yv.status_passagem = 429
        r = await client.get(URL_CAP)
        assert r.status_code == 429
        assert r.json()["codigo"] == "limite_api"
        assert r.headers["retry-after"] == "42"
        _sem_chave(r)

    async def test_403_versao_nao_licenciada(self, client, com_chave, yv):
        yv.status_meta = 403
        r = await client.get(URL_CAP)
        assert r.status_code == 503
        assert r.json()["codigo"] == "versao_indisponivel"
        _sem_chave(r)  # a API falsa ecoa a chave no corpo do erro: não pode vazar

    async def test_teto_diario_separado(self, client, com_chave, yv, monkeypatch):
        monkeypatch.setenv("YOUVERSION_DAILY_LIMIT", "2")  # metadados + 1 passagem
        assert (await client.get(URL_CAP)).status_code == 200
        r = await client.get("/api/v1/biblia/nvi/capitulo/JHN/4")
        assert r.status_code == 429
        assert len(_passagens(yv)) == 1

    async def test_teto_padrao_500(self, monkeypatch):
        monkeypatch.delenv("YOUVERSION_DAILY_LIMIT", raising=False)
        assert youversion._limite_diario() == 500

    async def test_chave_nunca_aparece_nos_logs(self, client, com_chave, yv, caplog, monkeypatch):
        caplog.set_level(logging.DEBUG)
        yv.status_passagem = 500
        await client.get(URL_CAP)

        def explode(request):
            raise httpx.ConnectError(f"falhou com {request.headers.get('x-yvp-app-key')}")

        monkeypatch.setattr(youversion, "TRANSPORTE", httpx.MockTransport(explode))
        apibible.limpar_cache_memoria()
        r = await client.get("/api/v1/biblia/nvi/capitulo/JHN/5")
        assert r.status_code in (502, 503)
        _sem_chave(r)
        assert caplog.records, "esperava avisos nos logs"
        assert CHAVE_YV not in caplog.text


class TestVersoes:
    async def test_lista_nvi_com_credito(self, client, com_chave, yv):
        r = await client.get("/api/v1/biblia/versoes")
        assert r.status_code == 200
        d = r.json()
        assert d["ativo"] is True
        assert d["provedores"] == {"apibible": False, "youversion": True}
        por_id = {v["id"]: v for v in d["versoes"]}
        assert por_id["nvi"]["disponivel"] is True
        assert por_id["nvi"]["provedor"] == "youversion"
        assert por_id["nvi"]["copyright"] == CREDITO_NVI
        assert "nvi2011" not in por_id  # opcional, fora de YOUVERSION_BIBLES
        assert d["versoes"][0]["id"] == "nvi"
        assert not por_id["ara"]["disponivel"]  # sem BIBLE_API_KEY
        _sem_chave(r)

    async def test_sem_chaves_so_versoes_abertas(self, client, sem_chaves, yv):
        r = await client.get("/api/v1/biblia/versoes")
        assert r.status_code == 200
        d = r.json()
        assert d["ativo"] is False
        assert all(not v["disponivel"] for v in d["versoes"])
        assert yv.chamadas == []

    async def test_versao_nao_licenciada_some(self, client, com_chave, yv):
        yv.status_meta = 403
        r = await client.get("/api/v1/biblia/versoes")
        por_id = {v["id"]: v for v in r.json()["versoes"]}
        assert por_id["nvi"]["disponivel"] is False
        _sem_chave(r)

    async def test_ambos_provedores_ativos(self, client, com_chave, yv, monkeypatch):
        monkeypatch.setenv("BIBLE_API_KEY", CHAVE_AB)
        monkeypatch.setattr(
            apibible,
            "TRANSPORTE",
            httpx.MockTransport(lambda req: httpx.Response(200, json={"data": {"copyright": "ARA © 1993 SBB."}})),
        )
        r = await client.get("/api/v1/biblia/versoes")
        d = r.json()
        assert d["provedores"] == {"apibible": True, "youversion": True}
        por_id = {v["id"]: v for v in d["versoes"]}
        assert por_id["nvi"]["disponivel"] and por_id["ara"]["disponivel"]
        assert por_id["ara"]["provedor"] == "apibible"
        assert CHAVE_AB not in r.text and CHAVE_YV not in r.text
