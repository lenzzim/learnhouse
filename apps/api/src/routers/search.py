from typing import Union
from fastapi import APIRouter, Depends, HTTPException, Request, Query
from sqlmodel.ext.asyncio.session import AsyncSession
from src.core.events.database import get_db_session
from src.db.users import AnonymousUser, PublicUser, APITokenUser
from src.security.auth import get_current_user, resolve_acting_user_id
from src.services.search.search import search_across_org, SearchResult
from src.services.search.passagens import PassagemResultado, buscar_por_passagem
from src.services.biblia.busca import BuscaBibliaResultado, buscar_biblia, VERSOES_ABERTAS
from src.services.security.rate_limiting import (
    check_search_rate_limit,
    check_rate_limit,
    get_client_ip,
)

router = APIRouter()

def _throttle_search(request: Request, current_user) -> None:
    """Limite por pessoa (ou por IP, para visitantes) compartilhado pelas buscas."""
    caller_id = resolve_acting_user_id(current_user)
    if caller_id and not isinstance(current_user, AnonymousUser):
        is_allowed, retry_after = check_search_rate_limit(caller_id)
    else:
        # Anonymous (and id-less) callers have no stable user id, so they must
        # be throttled by client IP. Otherwise unauthenticated clients bypass
        # the search throttle entirely and can hammer the full-text indexes,
        # driving unbounded DB load (DoS).
        ip = get_client_ip(request)
        is_allowed, _count, retry_after = check_rate_limit(
            key=f"search_anon:{ip}",
            max_attempts=30,
            window_seconds=60,
        )
    if not is_allowed:
        raise HTTPException(
            status_code=429,
            detail="Too many search queries. Please slow down.",
            headers={"Retry-After": str(retry_after)},
        )


@router.get(
    "/org_slug/{org_slug}",
    response_model=SearchResult,
    summary="Search within an organization",
    description="Performs a paginated search across courses, folders, and users within the given organization. Query length and page size are capped to prevent data dumping. Requires authentication.",
    responses={
        200: {"description": "Search results grouped by resource type", "model": SearchResult},
        401: {"description": "Authentication required"},
        403: {"description": "User is not permitted to search this organization"},
        404: {"description": "Organization not found"},
    },
)
async def api_search_across_org(
    request: Request,
    org_slug: str,
    query: str = Query(..., min_length=3, max_length=200, description="Search query"),
    page: int = Query(default=1, ge=1, description="Page number"),
    limit: int = Query(default=10, ge=1, le=50, description="Items per page (max 50)"),
    db_session: AsyncSession = Depends(get_db_session),
    current_user: Union[PublicUser, APITokenUser] = Depends(get_current_user),
) -> SearchResult:
    """
    Search across courses, folders and users within an organization.

    SECURITY:
    - Maximum limit is 50 to prevent data dumping attacks
    - Query length is limited to 200 characters
    - Requires authentication (no anonymous access to user search)
    """
    # Per-user throttle: search touches full-text indexes and one session can
    # drive significant DB load without a cap. ``detail`` is a plain string
    # so the frontend's generic error path renders it as-is. Resolve API tokens
    # to their creator so token-driven searches don't bypass the throttle.
    _throttle_search(request, current_user)

    return await search_across_org(
        request=request,
        current_user=current_user,
        org_slug=org_slug,
        search_query=query,
        db_session=db_session,
        page=page,
        limit=limit
    )


@router.get(
    "/org_slug/{org_slug}/passage",
    response_model=PassagemResultado,
    summary="Posts que citam uma passagem bíblica",
    description=(
        "Interpreta a consulta como referência ('Salmos', '1Pe 1', 'Mt 28:18-20', "
        "'Mt 28:19') e devolve as discussões que citam a passagem, mais novas "
        "primeiro, com o trecho citado. Mesmas regras de leitura da busca geral; "
        "notas privadas nunca entram. Consulta que não é referência: passagem nula."
    ),
)
async def api_search_passage(
    request: Request,
    org_slug: str,
    query: str = Query(..., min_length=2, max_length=60, description="Referência bíblica"),
    page: int = Query(default=1, ge=1),
    limit: int = Query(default=10, ge=1, le=50),
    db_session: AsyncSession = Depends(get_db_session),
    current_user: Union[PublicUser, APITokenUser] = Depends(get_current_user),
) -> PassagemResultado:
    _throttle_search(request, current_user)
    return await buscar_por_passagem(
        request, current_user, org_slug, query, db_session, page=page, limit=limit
    )


@router.get(
    "/biblia",
    response_model=BuscaBibliaResultado,
    summary="Busca por palavras na Bíblia",
    description=(
        "Versões abertas: full-text no banco (sem acento, stemming, frase entre "
        "aspas, -exclusão, prefixo*). Licenciadas: só com sessão; API.Bible pela "
        "busca do provedor (cache de 7 dias, cota diária); NVI pela busca da "
        "YouVersion (só referências; texto da BLIVRE). Sem acesso ou com erro, "
        "recua para a versão aberta do idioma. Consulta que é referência devolve "
        "só `referencia` (abrir no leitor)."
    ),
)
async def api_search_bible(
    request: Request,
    query: str = Query(..., min_length=2, max_length=200),
    versao: str = Query(default="blivre", max_length=12),
    testamento: str | None = Query(default=None, pattern="^(AT|NT)$"),
    livro: str | None = Query(default=None, max_length=3),
    ordem: str = Query(default="relevancia", pattern="^(relevancia|canonica)$"),
    page: int = Query(default=1, ge=1, le=200),
    limit: int = Query(default=20, ge=1, le=50),
    db_session: AsyncSession = Depends(get_db_session),
    current_user: Union[PublicUser, APITokenUser] = Depends(get_current_user),
) -> BuscaBibliaResultado:
    _throttle_search(request, current_user)
    versao = versao.lower()
    pedida = versao
    # Texto licenciado só para pessoas com sessão (como o leitor): visitante e
    # token de API buscam na versão aberta do idioma.
    if versao not in VERSOES_ABERTAS and not (
        isinstance(current_user, PublicUser) and getattr(current_user, "id", 0)
    ):
        from src.services.biblia.busca import ABERTA_DO_IDIOMA
        from src.services.biblia.versoes import versao_por_id

        lic = versao_por_id(versao)
        versao = ABERTA_DO_IDIOMA.get(lic.idioma if lic else "pt", "blivre")
    res = await buscar_biblia(
        db_session, query, versao, testamento=testamento, livro=livro,
        page=page, limit=limit, ordem=ordem,
    )
    if versao != pedida:
        res.versao = pedida
        res.recuo = True
    return res
