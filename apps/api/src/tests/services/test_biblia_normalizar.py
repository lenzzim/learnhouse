"""Normalização do JSON da API.Bible (conteúdo sintético — nenhum texto licenciado)."""

from src.services.biblia.normalizar import normalizar_conteudo, recortar


def _verso(n, sid=None):
    attrs = {"number": str(n), "style": "v"}
    if sid:
        attrs["sid"] = sid
    return {"name": "verse", "type": "tag", "attrs": attrs, "items": [{"text": str(n), "type": "text"}]}


def _txt(texto, *ids):
    attrs = {"verseId": "-".join(ids), "verseOrgIds": list(ids)} if ids else {}
    return {"text": texto, "type": "text", "attrs": attrs}


def _para(estilo, *itens):
    return {"name": "para", "type": "tag", "attrs": {"style": estilo}, "items": list(itens)}


CONTEUDO = [
    _para("s", {"text": "Um título de seção", "type": "text"}),
    _para(
        "p",
        _verso(1, "TST 1:1"),
        _txt("Primeiro versículo ", "TST.1.1"),
        {"name": "char", "type": "tag", "attrs": {"style": "wj"}, "items": [_txt("com palavras de Jesus.", "TST.1.1")]},
        _verso(2),
        _txt("Segundo versículo.", "TST.1.2"),
        {"name": "note", "type": "tag", "attrs": {"style": "f"}, "items": [_txt("nota que não pode aparecer", "TST.1.2")]},
    ),
    _para("r", {"text": "(Mt 1.1)", "type": "text"}),
    _para("s1", {"text": "Outro título", "type": "text"}),
    _para("p", _verso(3), _txt("Terceiro, que abre um poema:", "TST.1.3")),
    _para("q", _txt("linha um", "TST.1.3")),
    _para("q2", _txt("linha dois", "TST.1.3")),
    _para("b"),
    _para("p", _verso("4-5"), _txt("Quarto e quinto juntos.", "TST.1.4", "TST.1.5")),
    _para("s", {"text": "Título órfão no fim", "type": "text"}),
]


def test_titulos_ficam_fora_do_texto_dos_versiculos():
    r = normalizar_conteudo(CONTEUDO)
    assert r["titulos"] == {"1": "Um título de seção", "3": "Outro título"}
    textos = " ".join(v["texto"] for v in r["versos"])
    assert "título" not in textos.lower()
    assert "Título órfão" not in textos


def test_versiculos_em_ordem_com_texto_limpo():
    r = normalizar_conteudo(CONTEUDO)
    assert [v["numero"] for v in r["versos"]] == [1, 2, 3, 4]
    assert r["versos"][0]["texto"] == "Primeiro versículo com palavras de Jesus."
    assert r["versos"][1]["texto"] == "Segundo versículo."


def test_notas_e_referencias_de_secao_sao_descartadas():
    r = normalizar_conteudo(CONTEUDO)
    tudo = " ".join(v["texto"] for v in r["versos"])
    assert "nota" not in tudo
    assert "Mt 1.1" not in tudo


def test_poesia_vira_um_unico_versiculo_com_espacos():
    r = normalizar_conteudo(CONTEUDO)
    v3 = next(v for v in r["versos"] if v["numero"] == 3)
    assert v3["texto"] == "Terceiro, que abre um poema: linha um linha dois"


def test_versiculos_combinados_tem_ate():
    r = normalizar_conteudo(CONTEUDO)
    v4 = next(v for v in r["versos"] if v["numero"] == 4)
    assert v4["ate"] == 5
    assert v4["texto"] == "Quarto e quinto juntos."
    assert all(v["numero"] != 5 for v in r["versos"])


def test_conteudo_vazio():
    assert normalizar_conteudo([]) == {"versos": [], "titulos": {}}


def test_recortar_inclui_combinado_que_toca_o_intervalo_e_filtra_titulos():
    r = normalizar_conteudo(CONTEUDO)
    versos, titulos = recortar(r["versos"], r["titulos"], 3, 5)
    assert [v["numero"] for v in versos] == [3, 4]
    assert titulos == {"3": "Outro título"}
    versos, _ = recortar(r["versos"], r["titulos"], 5, 5)
    assert [v["numero"] for v in versos] == [4]


# ---------------------------------------------------------------------------
# YouVersion (HTML)
# ---------------------------------------------------------------------------
from src.services.biblia.normalizar import normalizar_html_youversion  # noqa: E402


def test_youversion_versos_titulos_e_notas():
    html = (
        '<div><div class="s1 yv-h">Seção A</div><div class="p">'
        '<span class="yv-v" v="1"></span><span class="yv-vlbl">1</span>Um'
        '<span class="yv-n f"><span class="ft">nota</span></span> fim.'
        '<span class="yv-v" v="2"></span><span class="yv-vlbl">2</span>Dois<br>quebra.</div></div>'
    )
    r = normalizar_html_youversion(html)
    assert r["versos"] == [{"numero": 1, "texto": "Um fim."}, {"numero": 2, "texto": "Dois quebra."}]
    assert r["titulos"] == {"1": "Seção A"}


def test_youversion_combinado_e_titulos_seguidos():
    html = (
        '<div class="ms yv-h">Livro I</div><div class="s1 yv-h">Salmo</div><div class="d">Para o mestre</div>'
        '<div class="q1"><span class="yv-v" v="25-26"></span><span class="yv-vlbl">25-26</span>Junto.</div>'
        '<div class="r">(Mt 1.1)</div>'
    )
    r = normalizar_html_youversion(html)
    assert r["versos"] == [{"numero": 25, "ate": 26, "texto": "Junto."}]
    assert r["titulos"] == {"25": "Livro I — Salmo — Para o mestre"}


def test_youversion_html_vazio_ou_malformado():
    assert normalizar_html_youversion("") == {"versos": [], "titulos": {}}
    r = normalizar_html_youversion('<div class="p"><span class="yv-v" v="3"></span>Sem fechar <b>negrito')
    assert r["versos"] == [{"numero": 3, "texto": "Sem fechar negrito"}]
