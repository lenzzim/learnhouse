"""Busca por palavras na Bíblia (índice das versões abertas + licenciadas).

No SQLite dos testes a busca cai no LIKE (sem stemming/unaccent, que são do
PostgreSQL); aqui se testa o que é comum aos dois caminhos: interpretação da
consulta, E entre palavras, frase, exclusão, variações (sinônimos), filtros,
paginação, destaque, referência direta, indexação idempotente e o recuo das
licenciadas (NVI sem chave -> BLIVRE, clique na NVI; YouVersion só dá
referências e o texto exibido é o da BLIVRE).
"""

import json
from unittest.mock import AsyncMock, patch

import pytest

from src.services.biblia import busca
from src.services.biblia.busca import (
    buscar_aberta,
    buscar_biblia,
    destacar,
    indexar_versao,
    interpretar,
)


def _livro(pasta, versao, usfm, capitulos):
    d = pasta / versao
    d.mkdir(parents=True, exist_ok=True)
    (d / f"{usfm}.json").write_text(json.dumps({"id": usfm, "capitulos": capitulos}, ensure_ascii=False), encoding="utf-8")


@pytest.fixture
async def biblia(db, tmp_path):
    _livro(tmp_path, "blivre", "GEN", [["No princípio criou Deus os céus e a terra.", "A terra estava sem forma."]])
    _livro(tmp_path, "blivre", "JHN", [
        ["No princípio era a Palavra."],
        [""],
        ["x"] * 15 + ["Porque Deus amou o mundo de tal maneira que deu seu Filho.", "Deus enviou o Filho."],
    ])
    _livro(tmp_path, "blivre", "1CO", [[""]] * 12 + [[""] * 3 + ["A caridade é paciente."]])
    _livro(tmp_path, "blivre", "LUK", [[""]] * 14 + [["o filho pródigo voltou para casa do pai"]])
    _livro(tmp_path, "kjv", "JHN", [["In the beginning was the Word."]])
    n = await indexar_versao(db, str(tmp_path), "blivre")
    await indexar_versao(db, str(tmp_path), "kjv")
    return n


def _codigos(res):
    return [v.codigo for v in res.versiculos]


class TestConsulta:
    def test_frase_exclusao_prefixo_variacoes(self):
        c = interpretar('"filho pródigo" -irmão perd* Amor coração')
        assert c.frases == ["filho pródigo"]
        assert c.excluir == ["irmao"]
        assert [(t.palavra, t.prefixo) for t in c.termos] == [("perd", True), ("amor", False), ("coracao", False)]
        assert c.termos[1].variacoes == ["amar", "caridade"]

    def test_destaque_sem_acento_e_plural(self):
        c = interpretar("coracao pecados")
        texto = "Meu coração confessa o pecado"
        spans = destacar(texto, c)
        assert [texto[a:b] for a, b in spans] == ["coração", "pecado"]

    def test_consulta_vazia(self):
        assert interpretar('  " " - ').vazia


class TestBuscaAberta:
    @pytest.mark.asyncio
    async def test_indexacao_idempotente(self, db, biblia, tmp_path):
        assert biblia == 2 + 1 + 17 + 1 + 1  # versículos vazios ficam de fora
        assert await indexar_versao(db, str(tmp_path), "blivre") == biblia
        res = await buscar_aberta(db, "princípio", "blivre")
        assert res.total == 2

    @pytest.mark.asyncio
    async def test_todas_as_palavras(self, db, biblia):
        res = await buscar_aberta(db, "Deus filho", "blivre")
        assert _codigos(res) == ["JHN.3.16", "JHN.3.17"]
        a, b = res.versiculos[0].destaques[0]
        assert res.versiculos[0].texto[a:b] == "Deus"
        assert res.versiculos[0].referencia == "João 3:16"

    @pytest.mark.asyncio
    async def test_frase_e_exclusao(self, db, biblia):
        assert _codigos(await buscar_aberta(db, '"filho pródigo"', "blivre")) == ["LUK.15.1"]
        assert _codigos(await buscar_aberta(db, "Deus -enviou filho", "blivre")) == ["JHN.3.16"]

    @pytest.mark.asyncio
    async def test_sinonimos(self, db, biblia):
        # "amor" também acha "caridade" (1Co 13:4) — o stemmer não junta os dois
        assert "1CO.13.4" in _codigos(await buscar_aberta(db, "amor", "blivre"))

    @pytest.mark.asyncio
    async def test_filtros_testamento_e_livro(self, db, biblia):
        assert _codigos(await buscar_aberta(db, "princípio", "blivre", testamento="AT")) == ["GEN.1.1"]
        assert _codigos(await buscar_aberta(db, "princípio", "blivre", testamento="NT")) == ["JHN.1.1"]
        assert _codigos(await buscar_aberta(db, "princípio", "blivre", livro="JHN")) == ["JHN.1.1"]

    @pytest.mark.asyncio
    async def test_paginacao_e_versao(self, db, biblia):
        p1 = await buscar_aberta(db, "Deus", "blivre", limit=2, page=1)
        p2 = await buscar_aberta(db, "Deus", "blivre", limit=2, page=2)
        assert p1.total == p2.total == 3
        assert len(p1.versiculos) == 2 and len(p2.versiculos) == 1
        assert _codigos(await buscar_aberta(db, "beginning", "kjv")) == ["JHN.1.1"]
        assert (await buscar_aberta(db, "beginning", "blivre")).total == 0


class TestEntradaUnica:
    @pytest.mark.asyncio
    async def test_referencia_vai_direto_ao_leitor(self, db, biblia):
        assert (await buscar_biblia(db, "Jo 3:16", "blivre")).referencia == "JHN.3.16"
        assert (await buscar_biblia(db, "1Pe 1", "nvi")).referencia == "1PE.1"
        assert (await buscar_biblia(db, "Salmos", "blivre")).referencia == "PSA.1"

    @pytest.mark.asyncio
    async def test_nvi_sem_chave_recua_para_blivre(self, db, biblia, monkeypatch):
        monkeypatch.delenv("YOUVERSION_API_KEY", raising=False)
        res = await buscar_biblia(db, "princípio", "nvi")
        assert res.recuo is True
        assert res.versao == "nvi"  # o clique abre na NVI
        assert res.versao_texto == "blivre"
        assert _codigos(res) == ["GEN.1.1", "JHN.1.1"]

    @pytest.mark.asyncio
    async def test_nvi_com_youversion_mostra_texto_da_blivre(self, db, biblia):
        with patch.object(
            busca, "_filtrar_refs", wraps=busca._filtrar_refs
        ), patch(
            "src.services.biblia.youversion.buscar_referencias",
            new_callable=AsyncMock, return_value=["JHN.3.16", "GEN.1.1", "MAT.1.1"],
        ):
            res = await buscar_biblia(db, "mundo", "nvi", testamento="NT")
        assert res.provedor == "youversion" and res.recuo is True
        assert res.versao_texto == "blivre"
        assert _codigos(res) == ["JHN.3.16", "MAT.1.1"]
        assert res.versiculos[0].texto.startswith("Porque Deus amou")
        assert res.versiculos[1].texto == ""  # sem texto aberto: só a referência

    @pytest.mark.asyncio
    async def test_apibible_usa_a_busca_do_provedor(self, db, biblia):
        dados = {"total": 1, "versos": [{"livro": "JHN", "capitulo": 3, "verso": 16, "texto": "Porque Deus amou o mundo"}],
                 "fums": "tok", "copyright": "ARA © SBB"}
        with patch("src.services.biblia.apibible.buscar", new_callable=AsyncMock, return_value=dados) as m:
            res = await buscar_biblia(db, "amou mundo", "ara", page=2, limit=10)
        assert m.await_args.kwargs["offset"] == 10
        assert res.provedor == "apibible" and res.recuo is False
        assert res.fums == "tok" and res.copyright == "ARA © SBB"
        assert _codigos(res) == ["JHN.3.16"]

    @pytest.mark.asyncio
    async def test_apibible_sem_chave_recua(self, db, biblia, monkeypatch):
        monkeypatch.delenv("BIBLE_API_KEY", raising=False)
        res = await buscar_biblia(db, "princípio", "ara")
        assert res.recuo and res.versao == "ara" and res.versao_texto == "blivre"


class TestClientesLicenciados:
    @pytest.mark.asyncio
    async def test_apibible_buscar_parametros_e_cache(self, monkeypatch):
        import httpx
        from src.services.biblia import apibible

        monkeypatch.setenv("BIBLE_API_KEY", "k")
        apibible.limpar_cache_memoria()
        chamadas = []

        def responder(req: httpx.Request):
            chamadas.append(req)
            if req.url.path.endswith("/search"):
                return httpx.Response(200, json={
                    "data": {"total": 1, "verses": [
                        {"id": "JHN.3.16", "text": "<span>Porque Deus amou</span> o mundo", "reference": "João 3:16"},
                    ]},
                    "meta": {"fumsToken": "f1"},
                })
            return httpx.Response(200, json={"data": {"copyright": "ARA © 1993 SBB"}})

        monkeypatch.setattr(apibible, "TRANSPORTE", httpx.MockTransport(responder))
        with patch("src.services.biblia.apibible.get_redis_client", return_value=None):
            r1 = await apibible.buscar("ara", "amou", testamento="NT", limit=5)
            r2 = await apibible.buscar("ara", "amou", testamento="NT", limit=5)
        assert r1 == r2
        busca_reqs = [c for c in chamadas if c.url.path.endswith("/search")]
        assert len(busca_reqs) == 1  # a segunda veio do cache
        assert busca_reqs[0].url.params["range"] == "MAT-REV"
        assert busca_reqs[0].url.params["limit"] == "5"
        assert r1["versos"] == [{"livro": "JHN", "capitulo": 3, "verso": 16, "texto": "Porque Deus amou o mundo"}]
        assert r1["fums"] == "f1"
        apibible.limpar_cache_memoria()

    @pytest.mark.asyncio
    async def test_youversion_so_referencias(self, monkeypatch):
        import httpx
        from src.services.biblia import apibible, youversion

        monkeypatch.setenv("YOUVERSION_API_KEY", "k")
        apibible.limpar_cache_memoria()

        def responder(req: httpx.Request):
            assert req.url.path == "/v1/search-verses"
            assert req.url.params["bible_id"] == "129"
            assert req.url.params["user_intent"] == "text"
            return httpx.Response(200, json={"verses": [{"reference": "JHN.3.16"}, {"reference": "x"}, {"reference": "1JN.4.8"}]})

        monkeypatch.setattr(youversion, "TRANSPORTE", httpx.MockTransport(responder))
        with patch("src.services.biblia.apibible.get_redis_client", return_value=None):
            assert await youversion.buscar_referencias("nvi", "amor") == ["JHN.3.16", "1JN.4.8"]
        apibible.limpar_cache_memoria()
