"""Converte várias traduções (USFM do ebible.org) em JSON por livro, no mesmo
formato da BLIVRE (biblia-dados/<trad>/index.json e <ID>.json).
Uso: python -I versoes_para_json.py <pasta_downloads> <pasta_saida_biblia_dados>"""
import json
import re
import sys
import zipfile
from pathlib import Path

ORDEM = ["GEN", "EXO", "LEV", "NUM", "DEU", "JOS", "JDG", "RUT", "1SA", "2SA", "1KI", "2KI", "1CH", "2CH", "EZR",
         "NEH", "EST", "JOB", "PSA", "PRO", "ECC", "SNG", "ISA", "JER", "LAM", "EZK", "DAN", "HOS", "JOL", "AMO",
         "OBA", "JON", "MIC", "NAM", "HAB", "ZEP", "HAG", "ZEC", "MAL", "MAT", "MRK", "LUK", "JHN", "ACT", "ROM",
         "1CO", "2CO", "GAL", "EPH", "PHP", "COL", "1TH", "2TH", "1TI", "2TI", "TIT", "PHM", "HEB", "JAS", "1PE",
         "2PE", "1JN", "2JN", "3JN", "JUD", "REV"]
ABREV = {
    "pt": "Gn Êx Lv Nm Dt Js Jz Rt 1Sm 2Sm 1Rs 2Rs 1Cr 2Cr Ed Ne Et Jó Sl Pv Ec Ct Is Jr Lm Ez Dn Os Jl Am Ob Jn Mq "
          "Na Hc Sf Ag Zc Ml Mt Mc Lc Jo At Rm 1Co 2Co Gl Ef Fp Cl 1Ts 2Ts 1Tm 2Tm Tt Fm Hb Tg 1Pe 2Pe 1Jo 2Jo "
          "3Jo Jd Ap",
    "en": "Gen Exod Lev Num Deut Josh Judg Ruth 1Sam 2Sam 1Kgs 2Kgs 1Chr 2Chr Ezra Neh Esth Job Ps Prov Eccl Song "
          "Isa Jer Lam Ezek Dan Hos Joel Amos Obad Jonah Mic Nah Hab Zeph Hag Zech Mal Matt Mark Luke John Acts "
          "Rom 1Cor 2Cor Gal Eph Phil Col 1Thess 2Thess 1Tim 2Tim Titus Phlm Heb Jas 1Pet 2Pet 1John 2John 3John "
          "Jude Rev",
    "es": "Gn Éx Lv Nm Dt Jos Jue Rt 1S 2S 1R 2R 1Cr 2Cr Esd Neh Est Job Sal Pr Ec Cnt Is Jer Lm Ez Dn Os Jl Am "
          "Abd Jon Mi Nah Hab Sof Hag Zac Mal Mt Mr Lc Jn Hch Ro 1Co 2Co Gá Ef Fil Col 1Ts 2Ts 1Ti 2Ti Tit Flm He "
          "Stg 1P 2P 1Jn 2Jn 3Jn Jud Ap",
}
VERSOES = [
    {"trad": "kjv", "arquivo": "eng-kjv2006_usfm.zip", "nome": "King James Version (1769)", "sigla": "KJV",
     "idioma": "en", "licenca": "Domínio público",
     "credito": "King James Version (Authorized Version), texto padronizado de 1769. Domínio público fora do Reino Unido."},
    {"trad": "web", "arquivo": "engwebp_usfm.zip", "nome": "World English Bible", "sigla": "WEB", "idioma": "en",
     "licenca": "Domínio público",
     "credito": "World English Bible. Domínio público; \"World English Bible\" é marca registrada do eBible.org."},
    {"trad": "rv1909", "arquivo": "spaRV1909_usfm.zip", "nome": "Reina-Valera 1909", "sigla": "RV1909",
     "idioma": "es", "licenca": "Domínio público", "credito": "Santa Biblia, Reina-Valera 1909. Domínio público."},
    {"trad": "vbl", "arquivo": "spavbl_usfm.zip", "nome": "Versión Biblia Libre", "sigla": "VBL", "idioma": "es",
     "licenca": "CC BY-SA 4.0",
     "credito": "Versión Biblia Libre, Copyright © 2018-2020 Jonathan Gallagher y Shelly Barrios de Avila. "
                "Licença Creative Commons Atribuição-CompartilhaIgual 4.0."},
    {"trad": "onbv", "arquivo": "poronbv_usfm.zip", "nome": "Nova Bíblia Viva (Biblica Open)", "sigla": "ONBV",
     "idioma": "pt", "licenca": "CC BY-SA 4.0",
     "credito": "Biblica® Open Nova Bíblia Viva 2007, Copyright © 2007, 2010 Biblica, Inc. "
                "Licença Creative Commons Atribuição-CompartilhaIgual 4.0."},
    {"trad": "bpm", "arquivo": "porbrbsl_usfm.zip", "nome": "Bíblia Portuguesa Mundial", "sigla": "BPM",
     "idioma": "pt", "licenca": "Domínio público",
     "credito": "Bíblia Portuguesa Mundial. Domínio público (tradução ainda em revisão pelos autores)."},
]
NAO_TEXTO = re.compile(r"\\(s\d?|ms\d?|mr|r|d|cl|cp|toc\d|h|mt\d?|ide|rem|id|sp|qa)\b")


def limpar(t):
    t = re.sub(r"\\f .*?\\f\*", "", t)
    t = re.sub(r"\\x .*?\\x\*", "", t)
    t = re.sub(r"\\\+?w ([^|\\]*)\|[^\\]*\\\+?w\*", r"\1", t)
    t = re.sub(r"\\\+?[a-z]+\d*\*?", "", t)
    t = t.replace("¶", "")                                # marca de parágrafo da KJV
    t = re.sub(r"\s+", " ", t).strip()
    return re.sub(r"\s+([,.;:!?])", r"\1", t)            # espaço antes de pontuação


def converter(zip_path, destino, meta):
    destino.mkdir(parents=True, exist_ok=True)
    abrevs = dict(zip(ORDEM, ABREV[meta["idioma"]].split()))
    z = zipfile.ZipFile(zip_path)
    livros = []
    for nome_arq in sorted(n for n in z.namelist() if n.endswith(".usfm")):
        s = z.read(nome_arq).decode("utf-8-sig")
        bid = re.search(r"^\\id (\w+)", s, re.M).group(1)
        if bid not in abrevs:
            continue
        m_nome = re.search(r"^\\h (.+)$", s, re.M) or re.search(r"^\\toc2 (.+)$", s, re.M)
        nome = m_nome.group(1).strip() if m_nome else bid
        caps, atual, verso = [], None, None
        for linha in s.splitlines():
            m = re.match(r"\\c (\d+)", linha)
            if m:
                atual = []
                caps.append(atual)
                verso = None
                continue
            if atual is None:
                continue
            for parte in re.split(r"(?=\\v \d+)", linha):
                mv = re.match(r"\\v (\d+)\S* ?(.*)", parte)
                if mv:
                    n = int(mv.group(1))
                    while len(atual) < n - 1:
                        atual.append("")
                    atual.append(limpar(mv.group(2)))
                    verso = len(atual) - 1
                elif verso is not None and not NAO_TEXTO.match(parte.strip()):
                    extra = limpar(parte)
                    if extra:
                        atual[verso] = (atual[verso] + " " + extra).strip()
        (destino / f"{bid}.json").write_text(json.dumps(
            {"id": bid, "nome": nome, "abrev": abrevs[bid], "capitulos": caps},
            ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        livros.append({"id": bid, "nome": nome, "abrev": abrevs[bid], "capitulos": len(caps),
                       "versos": [len(c) for c in caps]})
    livros.sort(key=lambda l: ORDEM.index(l["id"]))
    (destino / "index.json").write_text(json.dumps(
        {"traducao": meta["sigla"], "nome": meta["nome"], "idioma": meta["idioma"], "credito": meta["credito"],
         "licenca": meta["licenca"], "livros": livros}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    vazios = sum(v == "" for f in destino.glob("*.json") if f.name != "index.json"
                 for c in json.loads(f.read_text(encoding="utf-8"))["capitulos"] for v in c)
    return len(livros), sum(l["capitulos"] for l in livros), sum(sum(l["versos"]) for l in livros), vazios


if __name__ == "__main__":
    origem, saida = Path(sys.argv[1]), Path(sys.argv[2])
    catalogo = []
    for v in VERSOES:
        r = converter(origem / v["arquivo"], saida / v["trad"], v)
        catalogo.append({k: v[k] for k in ("trad", "sigla", "nome", "idioma", "licenca")} | {"livros": r[0]})
        print(f'{v["sigla"]:7} livros={r[0]} capítulos={r[1]} versículos={r[2]} vazios={r[3]}')
    print(json.dumps(catalogo, ensure_ascii=False))
