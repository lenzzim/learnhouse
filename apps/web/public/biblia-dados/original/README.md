# Textos originais e léxico (STEPBible)

Dados do STEPBible.org (Tyndale House, Cambridge), CC BY 4.0.
Fonte: https://github.com/STEPBible/STEPBible-Data (TAHOT, TAGNT, TBESH, TBESG).

Os arquivos aqui foram **reformatados** (não editados) por
`apps/web/scripts/stepbible_para_json.py`:

- `original/<LIVRO USFM>/<capítulo>.json`: lista indexada pelo versículo
  (índice 0 = título dos Salmos, quando existe). Cada palavra:
  - AT: `[hebraico, transliteração, strong, morfologia, glosa em inglês]`
  - NT: `[grego, transliteração, strong, morfologia, glosa em inglês, glosa em espanhol, marca]`
- `lexico/H/<bloco>.json` e `lexico/G/<bloco>.json`: verbetes em blocos de 100
  números (`H/00.json` = H0001–H0099). `def` é a definição em inglês, com o HTML
  reduzido a `<br>`, `<b>` e `<i>` e as referências convertidas em texto ("Gn 1:1").

## Regras aplicadas

- **Versificação**: a das Bíblias em inglês (KJV), igual à da BLIVRE. No hebraico,
  a referência hebraica entre parênteses (ex.: `Psa.51.1(51.3)`) é ignorada; no grego
  usa-se a referência da KJV entre colchetes quando existe (ex.: `Mat.17.15[17.14]`).
- **Qere/ketiv**: o TAHOT já traz o Qere como texto (linhas `Q(K)`/`Q(k)`), com o
  Ketiv apenas como variante; mostramos sempre o Qere. Linhas de ketiv puro (tipo
  começando com `K`) seriam descartadas. Entram L (Leningrado), Q, R (texto
  restaurado) e X (palavras da LXX usadas pelos tradutores).
- **Variantes do grego**: entra toda palavra presente no Nestle-Aland (N) **ou**
  no Textus Receptus/KJV (K) — o texto "amalgamado" NA + TR. Palavras só de outras
  edições (`O`) ficam de fora. Palavras de um lado só levam a marca `N` (só NA) ou
  `K` (só TR), e a interface as sinaliza.
