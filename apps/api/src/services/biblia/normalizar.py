"""
Normaliza o conteúdo JSON da API.Bible (content-type=json) para o formato
interno do Discipulei:

    {
      "versos":  [{"numero": 16, "texto": "..."}, {"numero": 25, "ate": 26, "texto": "..."}],
      "titulos": {"1": "Nicodemos visita a Jesus"},
    }

Regras:
- Títulos de seção (para s, s1, s2, ms, mr, d...) NUNCA viram texto de
  versículo: vão para `titulos`, indexados pelo número do versículo que vem
  logo depois deles.
- Referências cruzadas de seção (r, sr, mr) e notas (f, x) são descartadas.
- Versículos combinados ("25-26", verseOrgIds com dois ids) ficam num único
  item com `ate`.
- Espaços são normalizados; quebras de poesia viram um espaço.
"""

import re
from typing import Any

# Estilos USFM de parágrafo que são títulos/cabeçalhos.
ESTILOS_TITULO = {"s", "s1", "s2", "s3", "s4", "ms", "ms1", "ms2", "ms3", "d", "sp", "qa"}
# Parágrafos/caracteres descartados (referências de seção, notas, numeração).
ESTILOS_DESCARTAR = {"r", "sr", "mr", "f", "fe", "x", "fr", "ft", "fq", "xo", "xt", "cl", "cp", "ca", "va", "vp"}

_ESPACOS = re.compile(r"\s+")
_ID_VERSO = re.compile(r"\.(\d+)$")


def _limpar(texto: str) -> str:
    return _ESPACOS.sub(" ", texto).strip()


def _numero_do_id(verse_id: str) -> int | None:
    m = _ID_VERSO.search(verse_id or "")
    return int(m.group(1)) if m else None


def _intervalo_do_marcador(numero: str) -> tuple[int, int] | None:
    """'16' -> (16, 16); '25-26' -> (25, 26); lixo -> None."""
    m = re.fullmatch(r"\s*(\d+)\s*(?:[-–]\s*(\d+))?\s*[a-z]?\s*", numero or "")
    if not m:
        return None
    ini = int(m.group(1))
    fim = int(m.group(2)) if m.group(2) else ini
    return (ini, max(ini, fim))


def _texto_plano(nos: list[dict[str, Any]]) -> str:
    partes: list[str] = []
    for no in nos or []:
        if no.get("type") == "text":
            partes.append(no.get("text", ""))
        elif no.get("type") == "tag":
            estilo = (no.get("attrs") or {}).get("style")
            if no.get("name") == "note" or estilo in ESTILOS_DESCARTAR:
                continue
            partes.append(_texto_plano(no.get("items") or []))
    return "".join(partes)


def normalizar_conteudo(conteudo: list[dict[str, Any]]) -> dict[str, Any]:
    versos: dict[int, dict[str, Any]] = {}
    ordem: list[int] = []
    titulos: dict[str, str] = {}
    titulos_pendentes: list[str] = []
    atual: list[int | None] = [None]  # versículo corrente (lista para mutar no closure)

    def garantir(numero: int, ate: int | None = None) -> dict[str, Any]:
        if numero not in versos:
            versos[numero] = {"numero": numero, "partes": []}
            ordem.append(numero)
        if ate and ate > numero:
            versos[numero]["ate"] = max(ate, versos[numero].get("ate", ate))
        return versos[numero]

    def abrir_verso(ini: int, fim: int) -> None:
        garantir(ini, fim if fim > ini else None)
        atual[0] = ini
        if titulos_pendentes:
            titulo = " — ".join(titulos_pendentes)
            chave = str(ini)
            titulos[chave] = f"{titulos[chave]} — {titulo}" if chave in titulos else titulo
            titulos_pendentes.clear()

    def visitar(nos: list[dict[str, Any]]) -> None:
        for no in nos or []:
            tipo = no.get("type")
            attrs = no.get("attrs") or {}
            if tipo == "tag":
                nome = no.get("name")
                estilo = attrs.get("style")
                if nome == "note" or estilo in ESTILOS_DESCARTAR:
                    continue
                if nome == "verse":
                    intervalo = _intervalo_do_marcador(str(attrs.get("number", "")))
                    if intervalo:
                        abrir_verso(*intervalo)
                    continue  # o filho é só o número
                if nome == "para" and estilo in ESTILOS_TITULO:
                    titulo = _limpar(_texto_plano(no.get("items") or []))
                    if titulo:
                        titulos_pendentes.append(titulo)
                    continue
                if nome == "para" and atual[0] is not None:
                    # parágrafo novo (inclusive poesia q/q2): separa com espaço
                    versos[atual[0]]["partes"].append(" ")
                visitar(no.get("items") or [])
            elif tipo == "text":
                texto = no.get("text", "")
                org_ids = attrs.get("verseOrgIds") or []
                numero: int | None = None
                if org_ids:
                    numero = _numero_do_id(org_ids[0])
                    fim = _numero_do_id(org_ids[-1]) if len(org_ids) > 1 else None
                elif attrs.get("verseId"):
                    numero = _numero_do_id(str(attrs["verseId"]).split("-")[0])
                    fim = None
                else:
                    fim = None
                if numero is None:
                    numero = atual[0]
                if numero is None:
                    continue  # texto solto antes do 1º versículo (ex.: rótulo)
                if numero != atual[0] and numero not in versos:
                    abrir_verso(numero, fim or numero)
                garantir(numero, fim)["partes"].append(texto)

    visitar(conteudo)

    saida = []
    for numero in sorted(ordem):
        item = versos[numero]
        texto = _limpar("".join(item["partes"]))
        if not texto:
            continue
        verso: dict[str, Any] = {"numero": numero, "texto": texto}
        if item.get("ate"):
            verso["ate"] = item["ate"]
        saida.append(verso)
    return {"versos": saida, "titulos": titulos}


def recortar(versos: list[dict[str, Any]], titulos: dict[str, str], ini: int, fim: int) -> tuple[list, dict]:
    """Versículos que tocam [ini, fim] (um combinado 25-26 entra se tocar)."""
    escolhidos = [v for v in versos if v["numero"] <= fim and v.get("ate", v["numero"]) >= ini]
    numeros = {str(v["numero"]) for v in escolhidos}
    return escolhidos, {k: t for k, t in titulos.items() if k in numeros}
