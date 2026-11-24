"""
Cliente da YouVersion Platform API (NVI e outras versões licenciadas pela
YouVersion), no mesmo formato interno e com o mesmo cache da API.Bible.

Documentação: https://developers.youversion.com/api-usage (base
https://api.youversion.com/v1, cabeçalho X-YVP-App-Key) e
https://developers.youversion.com/api/bibles:
    GET /v1/bibles/{bible_id}                          metadados (copyright...)
    GET /v1/bibles/{bible_id}/passages/{passage_id}    passagem (JHN.3 = capítulo)
        ?format=html&include_headings=true&include_notes=false
401 = chave ausente/inválida; 403 = versão não licenciada para o app;
429 = limite (Retry-After em segundos, corpo em texto puro).

Termos (lidos de forma conservadora, já que a página de termos não pôde ser
lida automaticamente):
- A chave vem SOMENTE de YOUVERSION_API_KEY (servidor). Nunca vai para log,
  resposta, cache ou navegador.
- Cache por versão + capítulo com renovação em 7 dias e descarte obrigatório
  em 14 dias (mesma política da API.Bible). Nada é gravado em disco/banco.
- Atribuição sempre: o `copyright` dos metadados da versão (ou, na falta,
  `promotional_content`) acompanha cada capítulo e é exibido junto do texto.
- Sem TTS, sem envio a IA/LLM, sem guardar o texto em notas/posts (o front
  guarda só a referência + sigla; ver citacaoViva.ts).
- Teto diário local YOUVERSION_DAILY_LIMIT (padrão 500), separado do teto da
  API.Bible.
"""

from __future__ import annotations

import hashlib
import logging
import os
import re
import time
from typing import Any

import httpx

from src.services.biblia.apibible import (
    CACHE_FRESCO,
    CACHE_MAXIMO,
    CACHE_NEGATIVO,
    PREFIXO,
    TIMEOUT,
    ErroBiblia,
    Resultado,
    _cache_gravar,
    _cache_ler,
    _consumir_cota,
)
from src.services.biblia.normalizar import normalizar_html_youversion, recortar
from src.services.biblia.versoes import (
    VersaoLicenciada,
    id_capitulo_api,
    versao_habilitada,
    versao_por_id,
    versoes_do_provedor,
)

logger = logging.getLogger(__name__)

URL_PADRAO = "https://api.youversion.com"
LIMITE_DIARIO_PADRAO = 500
NOME_COTA = "cota-yv"

# Transporte HTTP injetável (testes usam httpx.MockTransport). Em produção: None.
TRANSPORTE: httpx.AsyncBaseTransport | None = None


def chave_configurada() -> bool:
    return bool(os.environ.get("YOUVERSION_API_KEY", "").strip())


def _chave() -> str:
    chave = os.environ.get("YOUVERSION_API_KEY", "").strip()
    if not chave:
        raise ErroBiblia(
            503,
            "chave_ausente",
            "A NVI não está configurada neste servidor (falta YOUVERSION_API_KEY).",
        )
    return chave


def _url_base() -> str:
    return (os.environ.get("YOUVERSION_API_URL") or URL_PADRAO).rstrip("/")


def _limite_diario() -> int:
    try:
        return max(1, int(os.environ.get("YOUVERSION_DAILY_LIMIT", LIMITE_DIARIO_PADRAO)))
    except ValueError:
        return LIMITE_DIARIO_PADRAO


async def _get_api(caminho: str, params: dict[str, str] | None = None) -> dict[str, Any]:
    chave = _chave()
    if not _consumir_cota(NOME_COTA, _limite_diario()):
        raise ErroBiblia(429, "limite_api", "Limite diário de leituras atingido. Tente novamente amanhã.", 3600)
    try:
        async with httpx.AsyncClient(base_url=_url_base(), timeout=TIMEOUT, transport=TRANSPORTE) as cliente:
            resp = await cliente.get(
                caminho,
                params=params,
                headers={"X-YVP-App-Key": chave, "Accept": "application/json", "User-Agent": "Discipulei/1.0"},
            )
    except httpx.HTTPError as e:
        # só o tipo do erro: a mensagem do httpx pode trazer a requisição
        logger.warning("biblia: falha de rede na YouVersion (%s)", type(e).__name__)
        raise ErroBiblia(502, "erro_api", "Não foi possível falar com o serviço da Bíblia agora.") from None

    if resp.status_code == 200:
        try:
            return resp.json()
        except ValueError:
            raise ErroBiblia(502, "erro_api", "Resposta inesperada do serviço da Bíblia.") from None
    logger.warning("biblia: YouVersion respondeu %s para %s", resp.status_code, caminho.split("?")[0])
    if resp.status_code == 429:
        try:
            espera = int(resp.headers.get("retry-after", "60"))
        except ValueError:
            espera = 60
        raise ErroBiblia(429, "limite_api", "Muitas leituras ao mesmo tempo. Tente de novo em instantes.", espera)
    if resp.status_code in (401, 403):
        raise ErroBiblia(503, "versao_indisponivel", "Esta versão não está disponível no momento.")
    if resp.status_code == 404:
        raise ErroBiblia(404, "nao_encontrado", "Capítulo não encontrado nesta versão.")
    raise ErroBiblia(502, "erro_api", "O serviço da Bíblia está instável. Tente de novo em instantes.")


def _limpar(texto: Any) -> str:
    return " ".join(str(texto or "").split())


def _corpo(resposta: dict[str, Any]) -> dict[str, Any]:
    """A doc mostra os campos no topo; aceita também um envelope {"data": {...}}."""
    interno = resposta.get("data") if isinstance(resposta, dict) else None
    return interno if isinstance(interno, dict) else (resposta if isinstance(resposta, dict) else {})


def _atribuicao(dados: dict[str, Any]) -> str:
    """Linha de crédito oficial: `copyright`; na falta, `promotional_content` (como faz o SDK oficial)."""
    return _limpar(dados.get("copyright")) or _limpar(dados.get("promotional_content"))


async def _metadados(versao: VersaoLicenciada) -> dict[str, Any]:
    chave = f"{PREFIXO}:yv:meta:{versao.api_id}"
    em_cache = _cache_ler(chave)
    if em_cache and time.time() - em_cache["salvo_em"] < CACHE_FRESCO:
        return em_cache
    try:
        dados = _corpo(await _get_api(f"/v1/bibles/{versao.api_id}"))
        meta = {
            "salvo_em": time.time(),
            "disponivel": True,
            "copyright": _atribuicao(dados) or None,
            "abreviacao": _limpar(dados.get("localized_abbreviation") or dados.get("abbreviation")) or None,
            "titulo": _limpar(dados.get("localized_title") or dados.get("title")) or None,
        }
        _cache_gravar(chave, meta, CACHE_MAXIMO)
        return meta
    except ErroBiblia as e:
        if e.codigo == "versao_indisponivel":
            meta = {"salvo_em": time.time(), "disponivel": False, "copyright": None}
            _cache_gravar(chave, meta, CACHE_NEGATIVO)
            return meta
        if em_cache:
            return em_cache
        raise


async def listar_versoes() -> list[dict[str, Any]]:
    """Versões YouVersion habilitadas (YOUVERSION_BIBLES), com copyright e disponibilidade."""
    ativo = chave_configurada()
    saida = []
    for v in versoes_do_provedor("youversion"):
        item: dict[str, Any] = {
            "id": v.id,
            "sigla": v.sigla,
            "nome": v.nome,
            "idioma": v.idioma,
            "fonte": "licenciada",
            "provedor": "youversion",
            "copyright": None,
            "copyright_curto": None,
            "disponivel": False,
        }
        if ativo:
            try:
                meta = await _metadados(v)
                item["disponivel"] = bool(meta.get("disponivel"))
                item["copyright"] = meta.get("copyright")
                item["copyright_curto"] = meta.get("copyright")
            except ErroBiblia:
                # falha passageira: mostramos a versão; o capítulo dirá se deu certo
                item["disponivel"] = True
        saida.append(item)
    return saida


def atende(versao_id: str) -> bool:
    """A versão é da YouVersion (habilitada ou não)?"""
    versao = versao_por_id(versao_id)
    return bool(versao and versao.provedor == "youversion")


def _versao_ou_erro(versao_id: str) -> VersaoLicenciada:
    versao = versao_por_id(versao_id)
    if not versao or versao.provedor != "youversion" or not versao_habilitada(versao):
        raise ErroBiblia(404, "versao_desconhecida", "Versão desconhecida.")
    return versao


async def obter_capitulo(versao_id: str, livro: str, capitulo: int) -> Resultado:
    versao = _versao_ou_erro(versao_id)
    id_cap = id_capitulo_api(livro, capitulo)  # USFM: o mesmo passage_id da YouVersion
    if not id_cap:
        raise ErroBiblia(404, "nao_encontrado", "Capítulo inexistente.")
    _chave()  # sem chave: 503 claro antes de olhar o cache

    chave = f"{PREFIXO}:yv:cap:{versao.api_id}:{id_cap}"
    em_cache = _cache_ler(chave)
    if em_cache and time.time() - em_cache["salvo_em"] < CACHE_FRESCO:
        return Resultado(em_cache["dados"], "cache")

    try:
        meta = await _metadados(versao)
        # sem atribuição não exibimos o texto (mesma regra do SDK oficial)
        if not meta.get("disponivel") or not meta.get("copyright"):
            raise ErroBiblia(503, "versao_indisponivel", "Esta versão não está disponível no momento.")
        corpo = _corpo(await _get_api(
            f"/v1/bibles/{versao.api_id}/passages/{id_cap}",
            {"format": "html", "include_headings": "true", "include_notes": "false"},
        ))
    except ErroBiblia as e:
        if em_cache and e.status in (429, 502, 503):
            return Resultado(em_cache["dados"], "cache-antigo")
        raise

    copyright_ = meta["copyright"]
    normal = normalizar_html_youversion(corpo.get("content") or "")
    dados = {
        "id": versao.id,
        "sigla": versao.sigla,
        "nome": versao.nome,
        "idioma": versao.idioma,
        "provedor": "youversion",
        "livro": id_cap.split(".")[0],
        "capitulo": capitulo,
        "referencia": corpo.get("reference"),
        "versos": normal["versos"],
        "titulos": normal["titulos"],
        "copyright": copyright_,
        "copyright_curto": copyright_,
        "fums": None,  # FUMS é só da API.Bible
    }
    _cache_gravar(chave, {"salvo_em": time.time(), "dados": dados}, CACHE_MAXIMO)
    return Resultado(dados, "api")


async def obter_versiculos(versao_id: str, livro: str, capitulo: int, ini: int, fim: int) -> Resultado:
    """Intervalo dentro de um capítulo, recortado do capítulo em cache (uma chamada por capítulo)."""
    if ini < 1 or fim < ini or fim - ini > 175:
        raise ErroBiblia(400, "intervalo_invalido", "Intervalo de versículos inválido.")
    res = await obter_capitulo(versao_id, livro, capitulo)
    versos, titulos = recortar(res.dados["versos"], res.dados["titulos"], ini, fim)
    dados = {**res.dados, "versos": versos, "titulos": titulos, "ini": ini, "fim": fim}
    return Resultado(dados, res.origem)


# ---------------------------------------------------------------------------
# Busca (GET /v1/search-verses): devolve SÓ referências, nunca texto.
# ---------------------------------------------------------------------------
CACHE_BUSCA = CACHE_FRESCO  # 7 dias; nunca passa de CACHE_MAXIMO (14 dias)
_REF_USFM = re.compile(r"^([1-3]?[A-Z]{2,3})\.(\d{1,3})\.(\d{1,3})$")


async def buscar_referencias(versao_id: str, consulta: str) -> list[str]:
    """Até 99 referências USFM ("JHN.3.16") para a consulta, na ordem da YouVersion.

    Uma chamada por consulta (page_size=99), em cache por 7 dias. O texto NÃO
    vem daqui: a doc manda resolver o texto pelo endpoint de passagens; aqui
    mostramos o texto de uma versão aberta e o clique abre a passagem na NVI.
    """
    versao = _versao_ou_erro(versao_id)
    _chave()
    q = " ".join((consulta or "").split())[:100]
    if not q:
        return []
    chave = f"{PREFIXO}:yv:busca:{versao.api_id}:{hashlib.sha256(q.lower().encode()).hexdigest()[:32]}"
    em_cache = _cache_ler(chave)
    if em_cache and time.time() - em_cache["salvo_em"] < CACHE_BUSCA:
        return list(em_cache["refs"])
    corpo = _corpo(await _get_api(
        "/v1/search-verses",
        {"query": q, "bible_id": versao.api_id, "user_intent": "text", "page_size": "99"},
    ))
    refs: list[str] = []
    for item in corpo.get("verses") or []:
        ref = str((item or {}).get("reference") or "").upper() if isinstance(item, dict) else ""
        if _REF_USFM.match(ref) and ref not in refs:
            refs.append(ref)
    _cache_gravar(chave, {"salvo_em": time.time(), "refs": refs}, CACHE_BUSCA)
    return refs
