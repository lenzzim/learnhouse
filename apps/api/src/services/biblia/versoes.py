"""
Catálogo das versões licenciadas (API.Bible e YouVersion) e dos livros aceitos.

As versões abertas (BLIVRE, KJV...) NÃO passam por aqui: são JSON estáticos
servidos pelo front (apps/web/public/biblia-dados). Este módulo só conhece as
versões protegidas, cujo texto vem da API.Bible sob a licença da chave
configurada em BIBLE_API_KEY.

O `id` é o id interno usado nas URLs do app (?v=ara); `api_id` é o id da
Bíblia no provedor (API.Bible: "afc24de218ef6e38-01"; YouVersion: "129").
`provedor` diz qual cliente atende a versão (apibible.py ou youversion.py).
A disponibilidade real depende da chave: se o provedor responder 401/403 para
uma versão, ela some da lista.

YouVersion: só as versões listadas em YOUVERSION_BIBLES (ids numéricos
separados por vírgula; padrão "129" = NVI) ficam ativas; as demais da tabela
existem só para poderem ser ligadas por configuração, sem mudar código.
"""

import os

from dataclasses import dataclass


@dataclass(frozen=True)
class VersaoLicenciada:
    id: str
    api_id: str
    sigla: str
    nome: str
    idioma: str  # 'pt' | 'en' | 'es'
    provedor: str = "apibible"  # 'apibible' | 'youversion'


VERSOES_LICENCIADAS: tuple[VersaoLicenciada, ...] = (
    # YouVersion Platform (X-YVP-App-Key). Ordem = ordem de exibição.
    VersaoLicenciada("nvi", "129", "NVI", "Nova Versão Internacional", "pt", "youversion"),
    VersaoLicenciada("ara", "afc24de218ef6e38-01", "ARA", "Almeida Revista e Atualizada", "pt"),
    VersaoLicenciada("arc", "3129f41d6c0103b0-01", "ARC", "Almeida Revista e Corrigida", "pt"),
    VersaoLicenciada("rc69", "a45adb20f641ce8d-01", "RC69", "Almeida Revista e Corrigida 1969", "pt"),
    VersaoLicenciada("ntlh", "acef2bc597c450a1-01", "NTLH", "Nova Tradução na Linguagem de Hoje", "pt"),
    VersaoLicenciada("niv", "78a9f6124f344018-01", "NIV", "New International Version", "en"),
    VersaoLicenciada("nkjv", "63097d2a0a2f7db3-01", "NKJV", "New King James Version", "en"),
    # YouVersion opcionais: desligadas até entrarem em YOUVERSION_BIBLES.
    VersaoLicenciada("nvi2011", "4360", "NVI2011", "Nova Versão Internacional (2011)", "pt", "youversion"),
    VersaoLicenciada("nbvp", "1966", "NBVP", "Nova Bíblia Viva (Portugal)", "pt", "youversion"),
    VersaoLicenciada("olivro", "1967", "OL", "O Livro", "pt", "youversion"),
)

YOUVERSION_PADRAO = "129"


def youversion_habilitadas() -> set[str]:
    """Ids YouVersion ligados por YOUVERSION_BIBLES (padrão: só a NVI, 129)."""
    bruto = os.environ.get("YOUVERSION_BIBLES", YOUVERSION_PADRAO)
    return {p.strip() for p in bruto.split(",") if p.strip().isdigit()}


def versao_habilitada(versao: "VersaoLicenciada") -> bool:
    if versao.provedor != "youversion":
        return True
    return versao.api_id in youversion_habilitadas()


def versoes_do_provedor(provedor: str) -> list["VersaoLicenciada"]:
    return [v for v in VERSOES_LICENCIADAS if v.provedor == provedor and versao_habilitada(v)]

_POR_ID = {v.id: v for v in VERSOES_LICENCIADAS}


def versao_por_id(versao_id: str) -> VersaoLicenciada | None:
    return _POR_ID.get((versao_id or "").lower())


# Livros no padrão USFM (o mesmo de apps/web/lib/biblia/referencias.ts) com o
# número de capítulos. A API.Bible usa os mesmos códigos (JHN.3), então o
# mapeamento é identidade — a tabela serve para validar a entrada antes de
# gastar uma chamada da cota mensal.
CAPITULOS_POR_LIVRO: dict[str, int] = {
    "GEN": 50, "EXO": 40, "LEV": 27, "NUM": 36, "DEU": 34, "JOS": 24, "JDG": 21,
    "RUT": 4, "1SA": 31, "2SA": 24, "1KI": 22, "2KI": 25, "1CH": 29, "2CH": 36,
    "EZR": 10, "NEH": 13, "EST": 10, "JOB": 42, "PSA": 150, "PRO": 31, "ECC": 12,
    "SNG": 8, "ISA": 66, "JER": 52, "LAM": 5, "EZK": 48, "DAN": 12, "HOS": 14,
    "JOL": 3, "AMO": 9, "OBA": 1, "JON": 4, "MIC": 7, "NAM": 3, "HAB": 3,
    "ZEP": 3, "HAG": 2, "ZEC": 14, "MAL": 4, "MAT": 28, "MRK": 16, "LUK": 24,
    "JHN": 21, "ACT": 28, "ROM": 16, "1CO": 16, "2CO": 13, "GAL": 6, "EPH": 6,
    "PHP": 4, "COL": 4, "1TH": 5, "2TH": 3, "1TI": 6, "2TI": 4, "TIT": 3,
    "PHM": 1, "HEB": 13, "JAS": 5, "1PE": 5, "2PE": 3, "1JN": 5, "2JN": 1,
    "3JN": 1, "JUD": 1, "REV": 22,
}


def id_capitulo_api(livro: str, capitulo: int) -> str | None:
    """'JHN', 3 -> 'JHN.3' (formato da API.Bible); None se inválido."""
    livro = (livro or "").upper()
    maximo = CAPITULOS_POR_LIVRO.get(livro)
    if not maximo or not isinstance(capitulo, int) or capitulo < 1 or capitulo > maximo:
        return None
    return f"{livro}.{capitulo}"
