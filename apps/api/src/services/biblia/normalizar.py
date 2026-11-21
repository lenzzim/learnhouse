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


# ---------------------------------------------------------------------------
# YouVersion Platform: passagem em HTML (format=html, include_headings=true)
#
#   <div class="s1 yv-h">Título</div>
#   <div class="p"><span class="yv-v" v="16"></span><span class="yv-vlbl">16</span>Texto…</div>
#   <span class="yv-n f">…nota…</span>            (descartada)
#
# O marcador `yv-v` é vazio: o texto que vem depois pertence ao versículo até
# o próximo marcador. `yv-vlbl` é só o número exibido (descartado). Títulos
# (yv-h ou estilos de título USFM) vão para `titulos`, nunca para o texto.
# ---------------------------------------------------------------------------
from html.parser import HTMLParser  # noqa: E402

_VAZIOS = {"br", "hr", "img", "wbr", "meta", "link", "input"}
_CLASSES_DESCARTAR_HTML = ESTILOS_DESCARTAR | {"yv-n", "yv-vlbl", "note", "f", "x"}


def _intervalo_yv(valor: str) -> tuple[int, int] | None:
    """v="16" -> (16, 16); "25-26" ou "25,26" (combinados) -> (25, 26)."""
    numeros = [int(n) for n in re.findall(r"\d+", valor or "")]
    if not numeros:
        return None
    return (min(numeros), max(numeros))


class _LeitorPassagemYV(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        # pilha: (tag, descartar, titulo)
        self.pilha: list[tuple[str, bool, bool]] = []
        self.versos: dict[int, dict[str, Any]] = {}
        self.ordem: list[int] = []
        self.titulos: dict[str, str] = {}
        self.pendentes: list[str] = []
        self.titulo_atual: list[str] = []
        self.atual: int | None = None

    def _descartando(self) -> bool:
        return any(d for _, d, _ in self.pilha)

    def _em_titulo(self) -> bool:
        return any(t for _, _, t in self.pilha)

    def _abrir_verso(self, ini: int, fim: int) -> None:
        if ini not in self.versos:
            self.versos[ini] = {"numero": ini, "partes": []}
            self.ordem.append(ini)
        if fim > ini:
            self.versos[ini]["ate"] = max(fim, self.versos[ini].get("ate", fim))
        self.atual = ini
        if self.pendentes:
            titulo = " — ".join(self.pendentes)
            chave = str(ini)
            self.titulos[chave] = f"{self.titulos[chave]} — {titulo}" if chave in self.titulos else titulo
            self.pendentes.clear()

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        a = {k: (v or "") for k, v in attrs}
        classes = set(a.get("class", "").split())
        if "yv-v" in classes and not self._descartando():
            intervalo = _intervalo_yv(a.get("v", ""))
            if intervalo:
                self._abrir_verso(*intervalo)
        if tag in _VAZIOS:
            if tag == "br" and self.atual is not None and not self._em_titulo():
                self.versos[self.atual]["partes"].append(" ")
            return
        descartar = bool(classes & _CLASSES_DESCARTAR_HTML) or tag in ("script", "style")
        titulo = not descartar and ("yv-h" in classes or bool(classes & ESTILOS_TITULO))
        if tag in ("div", "p") and self.atual is not None and not self._em_titulo():
            # parágrafo novo (inclusive poesia q1/q2): separa com espaço
            self.versos[self.atual]["partes"].append(" ")
        self.pilha.append((tag, descartar, titulo))

    def handle_startendtag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        self.handle_starttag(tag, attrs)
        if tag not in _VAZIOS and self.pilha and self.pilha[-1][0] == tag:
            self.handle_endtag(tag)

    def handle_endtag(self, tag: str) -> None:
        if tag in _VAZIOS:
            return
        # fecha até a tag correspondente (HTML malformado não quebra a pilha)
        for i in range(len(self.pilha) - 1, -1, -1):
            if self.pilha[i][0] == tag:
                fechadas = self.pilha[i:]
                del self.pilha[i:]
                if any(t for _, _, t in fechadas) and not self._em_titulo():
                    titulo = _limpar("".join(self.titulo_atual))
                    self.titulo_atual.clear()
                    if titulo:
                        self.pendentes.append(titulo)
                return

    def handle_data(self, data: str) -> None:
        if self._descartando():
            return
        if self._em_titulo():
            self.titulo_atual.append(data)
            return
        if self.atual is None:
            return  # texto solto antes do 1º versículo (rótulo de capítulo etc.)
        self.versos[self.atual]["partes"].append(data)


def normalizar_html_youversion(html: str) -> dict[str, Any]:
    """HTML de passagem da YouVersion -> {"versos": [...], "titulos": {...}} (mesmo formato da API.Bible)."""
    leitor = _LeitorPassagemYV()
    leitor.feed(html or "")
    leitor.close()
    saida = []
    for numero in sorted(leitor.ordem):
        item = leitor.versos[numero]
        texto = _limpar("".join(item["partes"]))
        if not texto:
            continue
        verso: dict[str, Any] = {"numero": numero, "texto": texto}
        if item.get("ate"):
            verso["ate"] = item["ate"]
        saida.append(verso)
    return {"versos": saida, "titulos": leitor.titulos}
