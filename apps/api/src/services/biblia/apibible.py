"""
Cliente da API.Bible com cache (Redis; memória do processo como reserva).

Licença / termos (ver docs.api.bible):
- A chave vem SOMENTE de BIBLE_API_KEY (variável de ambiente do servidor).
  Nunca é registrada em log, devolvida em resposta ou enviada ao navegador.
- Cache por versão + capítulo (sempre < 500 versículos consecutivos).
  Renovação após CACHE_FRESCO (7 dias) e descarte obrigatório após
  CACHE_MAXIMO (14 dias) — bem abaixo do teto de 30 dias dos termos e
  dentro da recomendação da API.Bible de limpar o cache a cada 14 dias.
  Nada é gravado em disco/banco de forma permanente.
- Entre 7 e 14 dias, se a API falhar (429, 5xx, rede), servimos a cópia
  ainda válida ("stale-if-error"). Depois de 14 dias, só com a API.
- Cada resposta de texto traz o `fumsToken` (Fair Use Management System), que
  o navegador reporta com fums("trackView", token) ao exibir o texto.
- Cota mensal (Starter: 5.000 chamadas): um teto diário local
  (BIBLE_API_DAILY_LIMIT, padrão 160) impede que um pico esgote o mês.
"""

from __future__ import annotations

import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Any

import httpx

from src.core.redis import get_redis_client
from src.services.biblia.normalizar import normalizar_conteudo, recortar
from src.services.biblia.versoes import (
    VersaoLicenciada,
    id_capitulo_api,
    versao_por_id,
    versoes_do_provedor,
)

logger = logging.getLogger(__name__)

URL_PADRAO = "https://rest.api.bible"
CACHE_FRESCO = 7 * 24 * 3600
CACHE_MAXIMO = 14 * 24 * 3600  # nunca passar de 30 dias (termos da API.Bible)
CACHE_NEGATIVO = 6 * 3600  # versão sem permissão (403): tenta de novo em 6 h
LIMITE_DIARIO_PADRAO = 160
TIMEOUT = httpx.Timeout(10.0, connect=5.0)
PREFIXO = "biblia:v1"

# Transporte HTTP injetável (testes usam httpx.MockTransport). Em produção: None.
TRANSPORTE: httpx.AsyncBaseTransport | None = None


class ErroBiblia(Exception):
    """Erro com status HTTP e mensagem amigável (sem detalhes internos)."""

    def __init__(self, status: int, codigo: str, mensagem: str, retry_after: int | None = None):
        super().__init__(mensagem)
        self.status = status
        self.codigo = codigo
        self.mensagem = mensagem
        self.retry_after = retry_after


def chave_configurada() -> bool:
    return bool(os.environ.get("BIBLE_API_KEY", "").strip())


def _chave() -> str:
    chave = os.environ.get("BIBLE_API_KEY", "").strip()
    if not chave:
        raise ErroBiblia(
            503,
            "chave_ausente",
            "As versões licenciadas não estão configuradas neste servidor (falta BIBLE_API_KEY).",
        )
    return chave


def _url_base() -> str:
    return (os.environ.get("BIBLE_API_URL") or URL_PADRAO).rstrip("/")


def _limite_diario() -> int:
    try:
        return max(1, int(os.environ.get("BIBLE_API_DAILY_LIMIT", LIMITE_DIARIO_PADRAO)))
    except ValueError:
        return LIMITE_DIARIO_PADRAO


# ---------------------------------------------------------------------------
# Cache: Redis quando houver; senão um dicionário com expiração (por processo).
# ---------------------------------------------------------------------------
_memoria: dict[str, tuple[float, str]] = {}


def _cache_ler(chave: str) -> dict[str, Any] | None:
    r = get_redis_client()
    bruto: Any = None
    if r is not None:
        try:
            bruto = r.get(chave)
        except Exception:
            logger.warning("biblia: Redis indisponível na leitura do cache")
            r = None
    if r is None:
        item = _memoria.get(chave)
        if item and item[0] > time.time():
            bruto = item[1]
        elif item:
            _memoria.pop(chave, None)
    if not bruto:
        return None
    try:
        dados = json.loads(bruto)
    except (TypeError, ValueError):
        return None
    # cinto e suspensório: mesmo que o TTL do Redis falhe, nada passa de 14 dias
    if time.time() - float(dados.get("salvo_em", 0)) > CACHE_MAXIMO:
        return None
    return dados


def _cache_gravar(chave: str, valor: dict[str, Any], ttl: int) -> None:
    ttl = min(ttl, CACHE_MAXIMO)
    bruto = json.dumps(valor, ensure_ascii=False)
    r = get_redis_client()
    if r is not None:
        try:
            r.setex(chave, ttl, bruto)
            return
        except Exception:
            logger.warning("biblia: Redis indisponível na gravação do cache")
    _memoria[chave] = (time.time() + ttl, bruto)


def limpar_cache_memoria() -> None:
    _memoria.clear()


def _consumir_cota(nome: str = "cota", limite: int | None = None) -> bool:
    """
    Conta uma chamada ao provedor no dia (UTC). False se o teto diário estourou.
    `nome` separa os contadores ("cota" = API.Bible, "cota-yv" = YouVersion).
    """
    dia = time.strftime("%Y%m%d", time.gmtime())
    chave = f"{PREFIXO}:{nome}:{dia}"
    r = get_redis_client()
    try:
        if r is not None:
            n = r.incr(chave)
            if n == 1:
                r.expire(chave, 2 * 24 * 3600)
        else:
            expira, bruto = _memoria.get(chave, (time.time() + 2 * 24 * 3600, "0"))
            n = int(bruto) + 1
            _memoria[chave] = (expira, str(n))
    except Exception:
        return True  # sem contador não bloqueamos a leitura
    return n <= (limite if limite is not None else _limite_diario())


# ---------------------------------------------------------------------------
# Chamada HTTP
# ---------------------------------------------------------------------------
async def _get_api(caminho: str, params: dict[str, str] | None = None) -> dict[str, Any]:
    chave = _chave()
    if not _consumir_cota():
        raise ErroBiblia(429, "limite_api", "Limite diário de leituras atingido. Tente novamente amanhã.", 3600)
    try:
        async with httpx.AsyncClient(
            base_url=_url_base(), timeout=TIMEOUT, transport=TRANSPORTE
        ) as cliente:
            resp = await cliente.get(
                caminho,
                params=params,
                headers={"api-key": chave, "Accept": "application/json", "User-Agent": "Discipulei/1.0"},
            )
    except httpx.HTTPError as e:
        # só o tipo do erro: a mensagem do httpx pode trazer a requisição
        logger.warning("biblia: falha de rede na API.Bible (%s)", type(e).__name__)
        raise ErroBiblia(502, "erro_api", "Não foi possível falar com o serviço da Bíblia agora.") from None

    if resp.status_code == 200:
        try:
            return resp.json()
        except ValueError:
            raise ErroBiblia(502, "erro_api", "Resposta inesperada do serviço da Bíblia.") from None
    logger.warning("biblia: API.Bible respondeu %s para %s", resp.status_code, caminho.split("?")[0])
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


# ---------------------------------------------------------------------------
# Metadados das versões (copyright) e disponibilidade
# ---------------------------------------------------------------------------
async def _metadados(versao: VersaoLicenciada) -> dict[str, Any]:
    chave = f"{PREFIXO}:meta:{versao.api_id}"
    em_cache = _cache_ler(chave)
    if em_cache and time.time() - em_cache["salvo_em"] < CACHE_FRESCO:
        return em_cache
    try:
        corpo = await _get_api(f"/v1/bibles/{versao.api_id}")
        dados = corpo.get("data") or {}
        meta = {
            "salvo_em": time.time(),
            "disponivel": True,
            "copyright": " ".join((dados.get("copyright") or "").split()),
            "copyright_curto": _copyright_curto(dados.get("copyright") or "", versao.sigla),
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


def _copyright_curto(texto: str, sigla: str) -> str:
    """
    Versão compacta para espaços pequenos (popover, citação em post); o rodapé
    do leitor mostra o texto integral. A SBB põe uma frase institucional antes do aviso ("... Junte-se a nós! ARA
    © 1993 Sociedade Bíblica do Brasil."). Mantemos o aviso a partir da sigla
    ou do nome com ©; se não achar, o texto inteiro.
    """
    texto = " ".join((texto or "").split())
    for marcador in (f"{sigla} ©", f"{sigla} (c)"):
        i = texto.find(marcador)
        if i >= 0:
            return texto[i:]
    return texto


async def listar_versoes() -> list[dict[str, Any]]:
    """Versões licenciadas com copyright e disponibilidade (sem texto bíblico)."""
    ativo = chave_configurada()
    saida = []
    for v in versoes_do_provedor("apibible"):
        item: dict[str, Any] = {
            "id": v.id,
            "sigla": v.sigla,
            "nome": v.nome,
            "idioma": v.idioma,
            "fonte": "licenciada",
            "copyright": None,
            "copyright_curto": None,
            "disponivel": False,
        }
        if ativo:
            try:
                meta = await _metadados(v)
                item["disponivel"] = bool(meta.get("disponivel"))
                item["copyright"] = meta.get("copyright")
                item["copyright_curto"] = meta.get("copyright_curto")
            except ErroBiblia:
                # falha passageira: mostramos a versão; o capítulo dirá se deu certo
                item["disponivel"] = True
        saida.append(item)
    return saida


# ---------------------------------------------------------------------------
# Capítulos e intervalos
# ---------------------------------------------------------------------------
@dataclass
class Resultado:
    dados: dict[str, Any]
    origem: str  # 'cache' | 'api' | 'cache-antigo'


def _versao_ou_erro(versao_id: str) -> VersaoLicenciada:
    versao = versao_por_id(versao_id)
    if not versao or versao.provedor != "apibible":
        raise ErroBiblia(404, "versao_desconhecida", "Versão desconhecida.")
    return versao


async def obter_capitulo(versao_id: str, livro: str, capitulo: int) -> Resultado:
    versao = _versao_ou_erro(versao_id)
    id_cap = id_capitulo_api(livro, capitulo)
    if not id_cap:
        raise ErroBiblia(404, "nao_encontrado", "Capítulo inexistente.")
    _chave()  # sem chave: 503 claro antes de olhar o cache

    chave = f"{PREFIXO}:cap:{versao.api_id}:{id_cap}"
    em_cache = _cache_ler(chave)
    if em_cache and time.time() - em_cache["salvo_em"] < CACHE_FRESCO:
        return Resultado(em_cache["dados"], "cache")

    try:
        corpo = await _get_api(
            f"/v1/bibles/{versao.api_id}/chapters/{id_cap}",
            {
                "content-type": "json",
                "include-notes": "false",
                "include-titles": "true",
                "include-chapter-numbers": "false",
                "include-verse-numbers": "true",
                "include-verse-spans": "false",
            },
        )
    except ErroBiblia as e:
        if em_cache and e.status in (429, 502, 503):
            return Resultado(em_cache["dados"], "cache-antigo")
        raise

    dados_api = corpo.get("data") or {}
    meta = corpo.get("meta") or {}
    normal = normalizar_conteudo(dados_api.get("content") or [])
    dados = {
        "id": versao.id,
        "sigla": versao.sigla,
        "nome": versao.nome,
        "idioma": versao.idioma,
        "livro": id_cap.split(".")[0],
        "capitulo": capitulo,
        "referencia": dados_api.get("reference"),
        "versos": normal["versos"],
        "titulos": normal["titulos"],
        # texto integral, como a API entrega (exibido junto do texto bíblico)
        "copyright": " ".join((dados_api.get("copyright") or "").split()),
        "copyright_curto": _copyright_curto(dados_api.get("copyright") or "", versao.sigla),
        "fums": meta.get("fumsToken") or meta.get("fumsId"),
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
