"""Converte a Bíblia Livre (BLIVRE 2018, USFM, CC BY 4.0 BR) em JSON por livro.
Uso: python -I blivre_para_json.py <zip_usfm> <pasta_saida>
Saída: index.json (livros, abreviações, nº de capítulos e versículos, crédito) e
<ID>.json com {"id","nome","abrev","capitulos":[[verso1, verso2, ...], ...]}."""
import json
import re
import sys
import zipfile
from pathlib import Path

ABREV = {"GEN": "Gn", "EXO": "Êx", "LEV": "Lv", "NUM": "Nm", "DEU": "Dt", "JOS": "Js", "JDG": "Jz", "RUT": "Rt",
         "1SA": "1Sm", "2SA": "2Sm", "1KI": "1Rs", "2KI": "2Rs", "1CH": "1Cr", "2CH": "2Cr", "EZR": "Ed", "NEH": "Ne",
         "EST": "Et", "JOB": "Jó", "PSA": "Sl", "PRO": "Pv", "ECC": "Ec", "SNG": "Ct", "ISA": "Is", "JER": "Jr",
         "LAM": "Lm", "EZK": "Ez", "DAN": "Dn", "HOS": "Os", "JOL": "Jl", "AMO": "Am", "OBA": "Ob", "JON": "Jn",
         "MIC": "Mq", "NAM": "Na", "HAB": "Hc", "ZEP": "Sf", "HAG": "Ag", "ZEC": "Zc", "MAL": "Ml", "MAT": "Mt",
         "MRK": "Mc", "LUK": "Lc", "JHN": "Jo", "ACT": "At", "ROM": "Rm", "1CO": "1Co", "2CO": "2Co", "GAL": "Gl",
         "EPH": "Ef", "PHP": "Fp", "COL": "Cl", "1TH": "1Ts", "2TH": "2Ts", "1TI": "1Tm", "2TI": "2Tm", "TIT": "Tt",
         "PHM": "Fm", "HEB": "Hb", "JAS": "Tg", "1PE": "1Pe", "2PE": "2Pe", "1JN": "1Jo", "2JN": "2Jo", "3JN": "3Jo",
         "JUD": "Jd", "REV": "Ap"}
CREDITO = ("Bíblia Livre (BLIVRE), Copyright © Diego Santos, Mario Sérgio e Marco Teles, "
           "http://sites.google.com/site/biblialivre/ — Licença Creative Commons Atribuição 4.0 Brasil.")

# Marcadores de parágrafo/título que não fazem parte do texto do versículo.
NAO_TEXTO = re.compile(r"\\(s\d?|ms\d?|mr|r|d|cl|cp|toc\d|h|mt\d?|ide|rem|id)\b")


def limpar(t):
    t = re.sub(r"\\f .*?\\f\*", "", t)                   # notas de rodapé
    t = re.sub(r"\\x .*?\\x\*", "", t)                   # referências cruzadas
    t = re.sub(r"\\\+?w ([^|\\]*)\|[^\\]*\\\+?w\*", r"\1", t)  # palavras com atributos
    t = re.sub(r"\\\+?[a-z]+\d*\*?", "", t)              # demais marcadores (\add, \nd, \wj, \p, \q1...)
    return re.sub(r"\s+", " ", t).strip()


def converter(origem, destino):
    destino.mkdir(parents=True, exist_ok=True)
    z = zipfile.ZipFile(origem)
    livros = []
    for nome_arq in sorted(n for n in z.namelist() if n.endswith(".usfm")):
        s = z.read(nome_arq).decode("utf-8-sig")
        bid = re.search(r"^\\id (\w+)", s, re.M).group(1)
        if bid not in ABREV:
            continue
        m_nome = re.search(r"^\\h (.+)$", s, re.M) or re.search(r"^\\toc2 (.+)$", s, re.M)
        nome = m_nome.group(1).strip()
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
                        atual.append("")                     # versículo ausente na fonte
                    atual.append(limpar(mv.group(2)))
                    verso = len(atual) - 1
                elif verso is not None and not NAO_TEXTO.match(parte.strip()):
                    extra = limpar(parte)
                    if extra:
                        atual[verso] = (atual[verso] + " " + extra).strip()
        livro = {"id": bid, "nome": nome, "abrev": ABREV[bid], "capitulos": caps}
        (destino / f"{bid}.json").write_text(json.dumps(livro, ensure_ascii=False, separators=(",", ":")),
                                             encoding="utf-8")
        livros.append({"id": bid, "nome": nome, "abrev": ABREV[bid], "capitulos": len(caps),
                       "versos": [len(c) for c in caps]})
    ordem = list(ABREV)
    livros.sort(key=lambda l: ordem.index(l["id"]))
    indice = {"traducao": "BLIVRE", "nome": "Bíblia Livre", "credito": CREDITO, "licenca": "CC BY 4.0 BR",
              "livros": livros}
    (destino / "index.json").write_text(json.dumps(indice, ensure_ascii=False, separators=(",", ":")),
                                        encoding="utf-8")
    return livros


if __name__ == "__main__":
    resultado = converter(sys.argv[1], Path(sys.argv[2]))
    print(len(resultado), "livros;", sum(l["capitulos"] for l in resultado), "capítulos;",
          sum(sum(l["versos"]) for l in resultado), "versículos")
