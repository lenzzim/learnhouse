// Testes do conversor STEPBible (scripts/stepbible_para_json.py) e dos
// utilitários de lib/biblia/original.ts.
// Rodar (a partir de apps/web):  node --test lib/biblia/stepbible.test.mjs
// Usa o Python do sistema (variável PYTHON, senão "python"/"python3"); sem
// Python, os testes do conversor são pulados.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { caminhoLexico, partesDefinicao } from './original.ts'

const SCRIPT = fileURLToPath(new URL('../../scripts/stepbible_para_json.py', import.meta.url))
const PY = process.env.PYTHON || (process.platform === 'win32' ? 'python' : 'python3')
const temPython = spawnSync(PY, ['--version']).status === 0

function rodar(modo, linhas) {
  const r = spawnSync(PY, ['-I', SCRIPT, ...modo], { input: linhas.join('\n'), encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  return JSON.parse(r.stdout)
}
const heb = (...linhas) => rodar(['--analisar', 'heb'], linhas)
const grc = (...linhas) => rodar(['--analisar', 'grc'], linhas)
const T = '\t'

// linhas reais do TAHOT/TAGNT (colunas finais encurtadas)
const GEN_1_1 = ['Gen.1.1#01=L', 'בְּ/רֵאשִׁ֖ית', 'be./re.Shit', 'in/ beginning', 'H9003/{H7225G}', 'HR/Ncfsa', '', '', 'H7225G'].join(T)
const GEN_31_55 = ['Gen.31.55(32.1)#02=L', 'לָבָ֜ן', 'la.Van', 'Laban', '{H3837A}', 'HNpm', '', '', 'H3837A_A'].join(T)
const QERE = ['Gen.9.21#07=Q(K)', 'אָהֳלֽ/וֹ\\׃', "'o.ho.L/o", 'tent/ his', '{H0168G}/H9023\\H9016', 'HNcmsc/Sp3ms', "K= 'o.ho.Lo/h (אָהֳלֹ/ה\\׃)", 'L= אָהֳלֹֽ/ה\\׃'].join(T)
const KETIV = ['Gen.9.21#07=K', 'אָהֳלֹ/ה\\׃', "'o.ho.Lo/h", 'tent/ his', '{H0168G}/H9023', 'HNcbsc/Sp3ms'].join(T)
const TITULO = ['Psa.51.0(51.1)#01=L', 'לַ/מְנַצֵּ֗חַ', 'la/m.na.Tze.ach', 'to the/ choirmaster', 'H9005/{H5329}', 'HRd/Vprmsa'].join(T)
const SEM_CHAVES = ['Gen.1.1#06=L', 'וְ/אֵ֥ת', "ve./'Et", 'and/ <obj.>', 'H9002/H0853', 'HC/To'].join(T)

const grego = (ref, tipo, palavra, glosa, strong, extra = {}) =>
  [`${ref}=${tipo}`, palavra, glosa, strong, 'x=y', extra.edicoes || 'NA28+TR', '', '', extra.es || ''].join(T)

test('hebraico: prefixos juntos, strong principal entre chaves, glosa sem barras', { skip: !temPython }, () => {
  const [r] = heb(GEN_1_1)
  assert.deepEqual([r.livro, r.cap, r.verso], ['GEN', 1, 1])
  assert.deepEqual(r.palavra, ['בְּרֵאשִׁ֖ית', 'be.re.Shit', 'H7225G', 'HR/Ncfsa', 'in beginning'])
})

test('hebraico: sem chaves usa o último strong que não é prefixo/sufixo', { skip: !temPython }, () => {
  assert.equal(heb(SEM_CHAVES)[0].palavra[2], 'H0853')
})

test('hebraico: versificação hebraica entre parênteses é ignorada (vale a inglesa)', { skip: !temPython }, () => {
  const [r] = heb(GEN_31_55)
  assert.deepEqual([r.cap, r.verso], [31, 55])
})

test('hebraico: título de salmo fica no versículo 0', { skip: !temPython }, () => {
  const [r] = heb(TITULO)
  assert.deepEqual([r.livro, r.cap, r.verso], ['PSA', 51, 0])
})

test('hebraico: Qere entra (sem barras de prefixo/pontuação); ketiv puro é descartado', { skip: !temPython }, () => {
  const [q, k] = heb(QERE, KETIV)
  assert.deepEqual(q.palavra.slice(0, 3), ['אָהֳלֽוֹ׃', "'o.ho.Lo", 'H0168G'])
  assert.equal(q.tipo, 'Q(K)')
  assert.equal(k, null)
})

test('grego: palavra comum aos textos, com transliteração e espanhol', { skip: !temPython }, () => {
  const linha = ['Mat.1.1#01=NKO', 'Βίβλος (Biblos)', '[The] book', 'G0976=N-NSF', 'βίβλος=book',
    'NA28+NA27+Tyn+SBL+WH+Treg+TR+Byz', '', '', 'Libro', 'book', '#01', 'G0976'].join(T)
  const [r] = grc(linha)
  assert.deepEqual(r.palavra, ['Βίβλος', 'Biblos', 'G0976', 'N-NSF', '[The] book', 'Libro', ''])
})

test('grego: variantes — NA, TR, só de um lado e só de outras edições', { skip: !temPython }, () => {
  const rs = grc(
    grego('Mat.17.21#01', 'KO', 'Τοῦτο (Touto)', 'this', 'G3778=D-NSN'),
    grego('Mat.17.14#03', 'k', 'αὐτῶν (autōn)', 'they', 'G0846=P-GPM'),
    grego('Mat.17.14#11', 'N(k)O', 'αὐτὸν (auton)', '[to] Him', 'G0846=P-ASM'),
    grego('Mat.1.1#09', 'N(K)O', 'X (x)', 'x', 'G0001=N'),
    grego('Mat.1.1#10', 'no', 'Y (y)', 'y', 'G0002=N'),
    grego('Mat.1.1#11', 'O', 'Z (z)', 'z', 'G0003=N'),
    grego('Mat.1.1#12', '(k)O', 'W (w)', 'w', 'G0004=N'),
    grego('Mat.1.1#13', 'o', 'V (v)', 'v', 'G0005=N')
  )
  assert.equal(rs[0].palavra[6], 'K') // só TR (Mt 17:21)
  assert.equal(rs[1].palavra[6], 'K')
  assert.equal(rs[2].palavra[6], '') // diferença mínima no TR: está nos dois
  assert.equal(rs[3].palavra[6], 'N') // TR diverge de forma significativa
  assert.equal(rs[4].palavra[6], 'N')
  assert.deepEqual(rs.slice(5), [null, null, null]) // só outras edições
})

test('grego: versificação da KJV entre colchetes; parênteses (NA) e chaves ignorados', { skip: !temPython }, () => {
  const [a, b, c] = grc(
    grego('Mat.17.15[17.14]#01', 'NKO', 'Κύριε (Kyrie)', 'Lord', 'G2962=N-VSM'),
    grego('Mrk.12.15(12.14)#01', 'NKO', 'A (a)', 'a', 'G0001=N'),
    grego('Jhn.7.53{8.1}#01', 'KO', 'B (b)', 'b', 'G0002=N')
  )
  assert.deepEqual([a.cap, a.verso], [17, 14])
  assert.deepEqual([b.cap, b.verso], [12, 15])
  assert.deepEqual([c.cap, c.verso], [7, 53])
})

test('grego: strong com marcadores compostos fica com o último', { skip: !temPython }, () => {
  const [r] = grc(grego('Mat.1.1#06', 'NKO', 'Δαυὶδ (Dauid)', 'of David', 'H1732|G1138«G1138=N-GSM-P'))
  assert.deepEqual(r.palavra.slice(2, 4), ['G1138', 'N-GSM-P'])
})

test('definição: só <br>/<b>/<i>; refs viram texto; HTML ativo some ou é escapado', { skip: !temPython }, () => {
  const [d] = rodar(['--def'], [
    "<b>x</b> <ref='Luk.4.34.'>Luk.4:34.</ref> <a href=\"javascript:alert(1)\">y</a> <script>z</script> 1Ki.7.13 a &amp; b &lt;img&gt;<BR />",
  ])
  assert.equal(d, '<b>x</b> Lc 4:34. y z 1Rs 7:13 a &amp; b &lt;img&gt;')
})

test('caminhoLexico: blocos de 100', () => {
  assert.equal(caminhoLexico('H0001G'), '/biblia-dados/lexico/H/00.json')
  assert.equal(caminhoLexico('H7225G'), '/biblia-dados/lexico/H/72.json')
  assert.equal(caminhoLexico('G0976'), '/biblia-dados/lexico/G/09.json')
  assert.equal(caminhoLexico('G21501'), '/biblia-dados/lexico/G/215.json')
  assert.equal(caminhoLexico('../x'), null)
})

test('partesDefinicao: texto seguro, negrito/itálico, quebras e entidades', () => {
  assert.deepEqual(partesDefinicao('<b>a</b> &lt;b&gt;<br><i>c</i>'), [
    { tipo: 'texto', texto: 'a', negrito: true, italico: false },
    { tipo: 'texto', texto: ' <b>', negrito: false, italico: false },
    { tipo: 'quebra' },
    { tipo: 'texto', texto: 'c', negrito: false, italico: true },
  ])
})

test('dados gerados: alinhados com a versificação da BLIVRE', async () => {
  const { readFileSync, existsSync } = await import('node:fs')
  const base = new URL('../../public/biblia-dados/', import.meta.url)
  const indice = JSON.parse(readFileSync(new URL('blivre/index.json', base), 'utf8'))
  let conferidos = 0
  for (const l of indice.livros) {
    for (const c of [1, l.capitulos]) {
      const arq = new URL(`original/${l.id}/${c}.json`, base)
      assert.ok(existsSync(arq), `${l.id} ${c}`)
      const cap = JSON.parse(readFileSync(arq, 'utf8'))
      assert.equal(cap.length - 1, l.versos[c - 1], `${l.id} ${c}`)
      conferidos++
    }
  }
  assert.ok(conferidos >= 66)
  const lex = JSON.parse(readFileSync(new URL('lexico/H/72.json', base), 'utf8'))
  assert.equal(lex.H7225G.glosa.length > 0, true)
})
