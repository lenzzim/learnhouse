"""
Proxy das versões licenciadas da Bíblia (API.Bible e YouVersion Platform).

    GET /api/v1/biblia/versoes                                   público (sem texto bíblico)
    GET /api/v1/biblia/{versao}/capitulo/{livro}/{capitulo}      só com sessão
    GET /api/v1/biblia/{versao}/versiculos/{livro}/{capitulo}?ini=&fim=   só com sessão

Por que exigir login para o texto: mantém o uso dentro do app (uso não
comercial da comunidade, como prevê a licença Starter da API.Bible), protege a
cota mensal de chamadas e evita que o endpoint vire um espelho público do
texto protegido. Tokens de API também são recusados (só pessoas, no app).
As versões abertas continuam estáticas e públicas (apps/web/public/biblia-dados).

Cada versão tem um provedor (services/biblia/versoes.py): ARA/ARC/RC69/NTLH/
NIV/NKJV vêm da API.Bible (BIBLE_API_KEY); NVI vem da YouVersion
(YOUVERSION_API_KEY, versões ligadas em YOUVERSION_BIBLES). Mesmo formato de
resposta, mesmo cache (7/14 dias), mesma exigência de login e limite por
pessoa; cada provedor tem o seu teto diário.

As chaves nunca saem do servidor.
"""

import logging

from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import JSONResponse

from src.security.api_token_utils import get_authenticated_non_api_token_user
from src.services.biblia import apibible, youversion
from src.services.biblia.apibible import ErroBiblia
from src.services.security.rate_limiting import check_rate_limit

logger = logging.getLogger(__name__)

router = APIRouter()

# Por pessoa: leitura normal fica muito abaixo disso; raspagem para.
LIMITE_POR_USUARIO = 300
JANELA_USUARIO = 3600

# O texto é licenciado e muda a cada 14 dias no máximo: nada de cache público.
CABECALHOS_TEXTO = {"Cache-Control": "private, max-age=3600", "Vary": "Cookie, Authorization"}


def _erro(e: ErroBiblia) -> JSONResponse:
    cabecalhos = {"Cache-Control": "no-store"}
    if e.retry_after:
        cabecalhos["Retry-After"] = str(e.retry_after)
    return JSONResponse(status_code=e.status, content={"detail": e.mensagem, "codigo": e.codigo}, headers=cabecalhos)


def _limitar_usuario(user) -> JSONResponse | None:
    chave_usuario = getattr(user, "user_uuid", None) or getattr(user, "id", None)
    if not chave_usuario:
        return None
    try:
        permitido, _, espera = check_rate_limit(f"biblia:{chave_usuario}", LIMITE_POR_USUARIO, JANELA_USUARIO)
    except Exception:
        return None  # sem Redis não bloqueamos
    if permitido:
        return None
    return _erro(ErroBiblia(429, "limite_usuario", "Muitas leituras em pouco tempo. Tente de novo mais tarde.", espera))


def _provedor(versao: str):
    """Cliente que atende a versão (YouVersion ou API.Bible)."""
    return youversion if youversion.atende(versao) else apibible


@router.get("/versoes")
async def listar_versoes():
    """Catálogo das versões licenciadas: sigla, nome, idioma, copyright e se está disponível."""
    yv = await youversion.listar_versoes()
    ab = await apibible.listar_versoes()
    for item in ab:
        item.setdefault("provedor", "apibible")
    provedores = {"apibible": apibible.chave_configurada(), "youversion": youversion.chave_configurada()}
    return JSONResponse(
        content={"ativo": any(provedores.values()), "provedores": provedores, "versoes": yv + ab},
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.get("/{versao}/capitulo/{livro}/{capitulo}")
async def capitulo(
    versao: str,
    livro: str,
    capitulo: int,
    request: Request,
    user=Depends(get_authenticated_non_api_token_user),
):
    bloqueio = _limitar_usuario(user)
    if bloqueio:
        return bloqueio
    try:
        res = await _provedor(versao).obter_capitulo(versao, livro, capitulo)
    except ErroBiblia as e:
        return _erro(e)
    return JSONResponse(content=res.dados, headers={**CABECALHOS_TEXTO, "X-Biblia-Cache": res.origem})


@router.get("/{versao}/versiculos/{livro}/{capitulo}")
async def versiculos(
    versao: str,
    livro: str,
    capitulo: int,
    request: Request,
    ini: int = Query(..., ge=1),
    fim: int | None = Query(None, ge=1),
    user=Depends(get_authenticated_non_api_token_user),
):
    bloqueio = _limitar_usuario(user)
    if bloqueio:
        return bloqueio
    try:
        res = await _provedor(versao).obter_versiculos(versao, livro, capitulo, ini, fim or ini)
    except ErroBiblia as e:
        return _erro(e)
    return JSONResponse(content=res.dados, headers={**CABECALHOS_TEXTO, "X-Biblia-Cache": res.origem})
