"""Converte os dados do STEPBible (Tyndale House, CC BY 4.0) em JSON compacto
para o estudo dos originais no leitor da Bíblia.

Entrada (TSV do https://github.com/STEPBible/STEPBible-Data):
  TAHOT_*.txt  hebraico do AT (palavra por linha)
  TAGNT_*.txt  grego do NT (palavra por linha)
  TBESH_-.txt  léxico breve hebraico     TBESG_-.txt  léxico breve grego

Saída (dentro de <pasta_biblia_dados>):
  original/<ID USFM>/<cap>.json  lista indexada pelo versículo (índice 0 = título
      dos Salmos, "v.0" do STEPBible; vazio quando não há). Cada versículo é uma
      lista de palavras:
        AT: [original, transliteração, strong, morfologia, glosa_en]
        NT: [original, transliteração, strong, morfologia, glosa_en, glosa_es, marca]
      marca: "" = palavra no texto crítico (NA) e no Textus Receptus (TR);
             "N" = só no NA; "K" = só no TR/KJV.
  lexico/H/<bloco>.json, lexico/G/<bloco>.json  blocos de 100 números
      (bloco = número // 100 com 2 dígitos: H/00.json = H0001-H0099, G/215.json
      = G21500-G21599). {dStrong: {lema, translit, morf, glosa, def}} — só os
      verbetes usados no texto; `def` só contém <br>, <b>, <i> (o resto escapado).

REGRAS (documentadas também no README gerado):
  Versificação: a das Bíblias em inglês (KJV), que é a da BLIVRE e das demais
    traduções do leitor. Hebraico: a referência principal (inglesa); a hebraica
    entre parênteses é ignorada. Grego: a da KJV entre colchetes quando houver,
    senão a principal (NRSV); parênteses (NA) e chaves (outras) são ignorados.
  Qere/ketiv: o TAHOT já traz o Qere como texto (linhas "Q(K)"/"Q(k)") e guarda o
    Ketiv só como variante dentro da linha, então mostramos sempre o Qere. Linhas
    cujo tipo comece com "K" (ketiv puro) seriam descartadas (defensivo: não
    ocorrem nos arquivos atuais). L, Q, R (restaurado) e X (LXX) entram.
  Variantes do grego: entra toda palavra cujo tipo, fora dos parênteses, tenha
    N (Nestle-Aland) ou K (TR/KJV), maiúsculo ou minúsculo — ou seja, o texto
    "amalgamado" NA + TR. Palavras só de outras edições ("O", "o", "(k)O") ficam
    de fora. Palavras de um só lado recebem a marca "N" ou "K".

Uso:
  python -I stepbible_para_json.py <pasta_stepbible> <pasta_biblia_dados>
  python -I stepbible_para_json.py --analisar heb|grc   (linhas TSV no stdin,
      JSON no stdout; usado pelos testes em lib/biblia/stepbible.test.mjs)
"""
import html
import json
import re
import sys
from pathlib import Path

STEP_PARA_USFM = {
    "Gen": "GEN", "Exo": "EXO", "Lev": "LEV", "Num": "NUM", "Deu": "DEU", "Jos": "JOS", "Jdg": "JDG",
    "Rut": "RUT", "1Sa": "1SA", "2Sa": "2SA", "1Ki": "1KI", "2Ki": "2KI", "1Ch": "1CH", "2Ch": "2CH",
    "Ezr": "EZR", "Neh": "NEH", "Est": "EST", "Job": "JOB", "Psa": "PSA", "Pro": "PRO", "Ecc": "ECC",
    "Sng": "SNG", "Isa": "ISA", "Jer": "JER", "Lam": "LAM", "Ezk": "EZK", "Dan": "DAN", "Hos": "HOS",
    "Jol": "JOL", "Amo": "AMO", "Oba": "OBA", "Jon": "JON", "Mic": "MIC", "Nam": "NAM", "Hab": "HAB",
    "Zep": "ZEP", "Hag": "HAG", "Zec": "ZEC", "Mal": "MAL", "Mat": "MAT", "Mrk": "MRK", "Luk": "LUK",
    "Jhn": "JHN", "Act": "ACT", "Rom": "ROM", "1Co": "1CO", "2Co": "2CO", "Gal": "GAL", "Eph": "EPH",
    "Php": "PHP", "Col": "COL", "1Th": "1TH", "2Th": "2TH", "1Ti": "1TI", "2Ti": "2TI", "Tit": "TIT",
    "Phm": "PHM", "Heb": "HEB", "Jas": "JAS", "1Pe": "1PE", "2Pe": "2PE", "1Jn": "1JN", "2Jn": "2JN",
    "3Jn": "3JN", "Jud": "JUD", "Rev": "REV",
}
ABREV_PT = dict(zip(
    STEP_PARA_USFM.values(),
    "Gn Êx Lv Nm Dt Js Jz Rt 1Sm 2Sm 1Rs 2Rs 1Cr 2Cr Ed Ne Et Jó Sl Pv Ec Ct Is Jr Lm Ez Dn Os Jl Am Ob Jn Mq "
    "Na Hc Sf Ag Zc Ml Mt Mc Lc Jo At Rm 1Co 2Co Gl Ef Fp Cl 1Ts 2Ts 1Tm 2Tm Tt Fm Hb Tg 1Pe 2Pe 1Jo 2Jo "
    "3Jo Jd Ap".split(),
))

REF = re.compile(r"^([1-3]?[A-Z][a-z]{1,2})\.(\d+)\.(\d+)([^#]*)#(\d+)=(\S*)$")
KJV = re.compile(r"\[(\d+)\.(\d+)\]")


def analisar_ref(campo, usar_kjv):
    """'Gen.31.55(32.1)#01=L' -> (livro, cap, verso, palavra, tipo) ou None."""
    m = REF.match(campo.strip())
    if not m:
        return None
    livro = STEP_PARA_USFM.get(m.group(1))
    if not livro:
        return None
    cap, verso = int(m.group(2)), int(m.group(3))
    if usar_kjv:
        k = KJV.search(m.group(4))
        if k:
            cap, verso = int(k.group(1)), int(k.group(2))
    return livro, cap, verso, m.group(5), m.group(6)


def strong_principal_heb(dstrongs):
    """'H9003/{H7225G}' -> 'H7225G'; sem chaves, o último que não é prefixo/sufixo (H9xxx)."""
    m = re.search(r"\{([^}]+)\}", dstrongs)
    if m:
        return m.group(1).replace("+", "").strip()
    tags = [t.replace("+", "").strip() for t in re.split(r"[/\\]", dstrongs) if t.strip()]
    principais = [t for t in tags if not re.match(r"^H9\d{3}", t)]
    return (principais or tags or [""])[-1]


def analisar_linha_heb(linha):
    cols = linha.rstrip("\r\n").split("\t")
    if len(cols) < 6:
        return None
    ref = analisar_ref(cols[0], usar_kjv=False)
    if not ref:
        return None
    livro, cap, verso, _palavra, tipo = ref
    if tipo.upper().startswith("K"):
        return None  # ketiv puro: nunca é o texto lido (ver regra no topo)
    original = cols[1].replace("/", "").replace("\\", "").strip()
    translit = cols[2].replace("/", "").strip()
    glosa = re.sub(r"\s*/\s*", " ", cols[3]).strip()
    return {"livro": livro, "cap": cap, "verso": verso, "tipo": tipo,
            "palavra": [original, translit, strong_principal_heb(cols[4]), cols[5].strip(), glosa]}


def analisar_linha_grc(linha):
    cols = linha.rstrip("\r\n").split("\t")
    if len(cols) < 5:
        return None
    ref = analisar_ref(cols[0], usar_kjv=True)
    if not ref:
        return None
    livro, cap, verso, _palavra, tipo = ref
    fora = re.sub(r"\([^)]*\)", "", tipo).lower()
    tem_n, tem_k = "n" in fora, "k" in fora
    if not (tem_n or tem_k):
        return None  # só em outras edições
    marca = "N" if tem_n and not tem_k else ("K" if tem_k and not tem_n else "")
    m = re.match(r"^(.*?)\s*\(([^)]*)\)\s*$", cols[1])
    original, translit = (m.group(1), m.group(2)) if m else (cols[1], "")
    original = original.replace("¶", "").strip()
    strong, _, morf = cols[3].partition("=")
    strong = re.split(r"[«|]", strong)[-1].strip()
    es = cols[8].strip() if len(cols) > 8 else ""
    return {"livro": livro, "cap": cap, "verso": verso, "tipo": tipo,
            "palavra": [original, translit.strip(), strong, morf.strip(), cols[2].strip(), es, marca]}


# --------------------------------------------------------------------- léxico
REF_TEXTO = re.compile(r"\b([1-3]?[A-Z][a-z]{1,2})\.(\d+)[.:](\d+)")


def refs_para_texto(s):
    def troca(m):
        livro = STEP_PARA_USFM.get(m.group(1))
        return f"{ABREV_PT[livro]} {m.group(2)}:{m.group(3)}" if livro else m.group(0)
    return REF_TEXTO.sub(troca, s)


def sanitizar_def(s):
    """Só <br>, <b>, <i> sobrevivem; outras tags somem (fica o texto); o resto é escapado."""
    s = re.sub(r"<ref=[^>]*>(.*?)</ref>", r"\1", s, flags=re.I | re.S)
    s = re.sub(r"<br\s*/?>", "\x01", s, flags=re.I)
    s = re.sub(r"<(/?)([bi])>", lambda m: "\x02" + m.group(1) + m.group(2).lower() + "\x03", s, flags=re.I)
    s = re.sub(r"<[^>]*>", "", s)
    s = html.unescape(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    s = s.replace("\x01", "<br>")
    s = re.sub("\x02(/?)([bi])\x03", r"<\1\2>", s)
    s = refs_para_texto(s)
    s = re.sub(r"[ \t]+", " ", s)
    s = re.sub(r"^(\s*<br>)+|(<br>\s*)+$", "", s.strip())
    return s.strip()


def ler_lexico(caminho):
    lex = {}
    for linha in Path(caminho).read_text(encoding="utf-8").splitlines():
        cols = linha.split("\t")
        if len(cols) < 8 or not re.match(r"^[HG]\d+", cols[0]):
            continue
        chave = cols[1].split("=")[0].strip() or cols[0].strip()
        if chave in lex:
            continue
        lex[chave] = {"lema": cols[3].strip(), "translit": cols[4].strip(), "morf": cols[5].strip(),
                      "glosa": cols[6].strip(), "def": sanitizar_def(cols[7])}
    return lex


_cache_strong = {}


def normalizar_strong(s, chaves):
    k = (s, id(chaves))
    if k not in _cache_strong:
        _cache_strong[k] = _normalizar_strong(s, chaves)
    return _cache_strong[k]


def _normalizar_strong(s, chaves):
    """Ajusta o dStrong do texto para uma chave existente no léxico."""
    if s in chaves or not s:
        return s
    base = re.sub(r"[A-Za-z]+$", "", s[1:])
    base = s[0] + base
    for c in (base, base + "G", base + "A"):
        if c in chaves:
            return c
    for c in sorted(chaves):
        if c.startswith(base) and re.fullmatch(r"[A-Z]?", c[len(base):]):
            return c
    return s


def bloco(strong):
    return str(int(re.sub(r"\D", "", strong)) // 100).zfill(2)


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))


def converter(pasta_step, pasta_saida):
    pasta_step, pasta_saida = Path(pasta_step), Path(pasta_saida)
    lex = {"H": ler_lexico(pasta_step / "TBESH_-.txt"), "G": ler_lexico(pasta_step / "TBESG_-.txt")}
    capitulos = {}  # (livro, cap) -> {verso: [palavras]}
    usados = {"H": set(), "G": set()}
    faltando = set()
    for padrao, analisar, letra in (("TAHOT_*.txt", analisar_linha_heb, "H"), ("TAGNT_*.txt", analisar_linha_grc, "G")):
        for arq in sorted(pasta_step.glob(padrao)):
            for linha in arq.read_text(encoding="utf-8").splitlines():
                r = analisar(linha)
                if not r:
                    continue
                p = r["palavra"]
                p[2] = normalizar_strong(p[2], lex[letra])
                if p[2] in lex[letra]:
                    usados[letra].add(p[2])
                elif p[2]:
                    faltando.add(p[2])
                capitulos.setdefault((r["livro"], r["cap"]), {}).setdefault(r["verso"], []).append(p)

    total = 0
    for (livro, cap), versos in capitulos.items():
        lista = [versos.get(v, []) for v in range(0, max(versos) + 1)]
        destino = pasta_saida / "original" / livro / f"{cap}.json"
        destino.parent.mkdir(parents=True, exist_ok=True)
        destino.write_text(dump(lista), encoding="utf-8")
        total += sum(len(v) for v in lista)

    for letra in ("H", "G"):
        blocos = {}
        for chave in usados[letra]:
            blocos.setdefault(bloco(chave), {})[chave] = lex[letra][chave]
        for b, conteudo in blocos.items():
            destino = pasta_saida / "lexico" / letra / f"{b}.json"
            destino.parent.mkdir(parents=True, exist_ok=True)
            destino.write_text(dump(dict(sorted(conteudo.items()))), encoding="utf-8")

    print(f"capítulos: {len(capitulos)}  palavras: {total}  verbetes H: {len(usados['H'])}  G: {len(usados['G'])}")
    print(f"strongs sem verbete: {len(faltando)} {sorted(faltando)[:20]}")


def main():
    for f in (sys.stdin, sys.stdout):
        f.reconfigure(encoding="utf-8")
    if len(sys.argv) == 3 and sys.argv[1] == "--analisar":
        analisar = analisar_linha_heb if sys.argv[2] == "heb" else analisar_linha_grc
        print(dump([analisar(l) for l in sys.stdin.read().splitlines() if l.strip()]))
        return
    if len(sys.argv) >= 2 and sys.argv[1] == "--def":
        print(dump([sanitizar_def(l) for l in sys.stdin.read().splitlines()]))
        return
    if len(sys.argv) != 3:
        sys.exit(__doc__)
    converter(sys.argv[1], sys.argv[2])


if __name__ == "__main__":
    main()
