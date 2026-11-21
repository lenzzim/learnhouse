// Testes do parser de referências bíblicas.
// Rodar (a partir de apps/web):  node --test lib/biblia/referencias.test.mjs
//
// É .mjs (e não .ts) de propósito, como os demais testes de apps/web/tests:
// o tsconfig inclui **/*.ts e o `next build` checaria este arquivo, mas o
// import com extensão ".ts" (exigido pelo Node) é erro de tipo (TS5097) sem
// allowImportingTsExtensions.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LIVROS,
  CREDITO,
  encontrarReferencias,
  interpretarReferencia,
  codigoReferencia,
  lerCodigoReferencia,
  formatarReferencia,
  capituloVizinho,
  intervaloVersos,
} from './referencias.ts'

/** só os campos normalizados, para comparar */
function refs(texto, opcoes) {
  return encontrarReferencias(texto, opcoes).map((r) => {
    const o = { livroId: r.livroId, capitulo: r.capitulo }
    if (r.versoIni !== undefined) o.versoIni = r.versoIni
    if (r.versoFim !== undefined) o.versoFim = r.versoFim
    return o
  })
}
const um = (texto, opcoes) => refs(texto, opcoes)[0] ?? null

test('tabela embutida bate com o index.json', async () => {
  const { readFileSync } = await import('node:fs')
  const indice = JSON.parse(readFileSync(new URL('../../public/biblia-dados/blivre/index.json', import.meta.url), 'utf8'))
  assert.equal(LIVROS.length, 66)
  assert.equal(CREDITO, indice.credito)
  for (const [i, l] of indice.livros.entries()) {
    assert.equal(LIVROS[i].id, l.id)
    assert.deepEqual(LIVROS[i].versos, l.versos)
    assert.equal(LIVROS[i].versos.length, l.capitulos)
  }
  assert.equal(LIVROS[38].testamento, 'AT')
  assert.equal(LIVROS[39].testamento, 'NT')
})

test('abreviação com ":" e com "."', () => {
  assert.deepEqual(um('Jo 3:16'), { livroId: 'JHN', capitulo: 3, versoIni: 16 })
  assert.deepEqual(um('Jo 3.16'), { livroId: 'JHN', capitulo: 3, versoIni: 16 })
  assert.deepEqual(um('Jo3:16'), { livroId: 'JHN', capitulo: 3, versoIni: 16 })
})

test('intervalo de versículos (hífen e meia-risca)', () => {
  assert.deepEqual(um('Jo 3:16-18'), { livroId: 'JHN', capitulo: 3, versoIni: 16, versoFim: 18 })
  assert.deepEqual(um('Rm 8:28–30'), { livroId: 'ROM', capitulo: 8, versoIni: 28, versoFim: 30 })
})

test('capítulo inteiro', () => {
  assert.deepEqual(um('Sl 23'), { livroId: 'PSA', capitulo: 23 })
  assert.deepEqual(um('Salmo 91'), { livroId: 'PSA', capitulo: 91 })
  assert.deepEqual(um('Salmos 119'), { livroId: 'PSA', capitulo: 119 })
})

test('nomes completos, com e sem acento', () => {
  assert.equal(um('João 1:1').livroId, 'JHN')
  assert.equal(um('Joao 1:1').livroId, 'JHN')
  assert.equal(um('Gênesis 1:1').livroId, 'GEN')
  assert.equal(um('Genesis 1:1').livroId, 'GEN')
  assert.equal(um('Êxodo 20').livroId, 'EXO')
  assert.equal(um('Exodo 20').livroId, 'EXO')
  assert.equal(um('Apocalipse 21:4').livroId, 'REV')
  assert.equal(um('Cantares 8:6').livroId, 'SNG')
  assert.equal(um('Cântico dos Cânticos 2:1').livroId, 'SNG')
  assert.equal(um('Cantico dos Canticos 2:1').livroId, 'SNG')
  assert.equal(um('Atos dos Apóstolos 2:38').livroId, 'ACT')
  assert.equal(um('Oséias 6:6').livroId, 'HOS')
})

test('maiúsculas/minúsculas não importam para nomes próprios', () => {
  assert.equal(um('JOÃO 3:16').livroId, 'JHN')
  assert.equal(um('joão 3:16').livroId, 'JHN')
  assert.equal(um('gn 1:1').livroId, 'GEN')
})

test('Jó (com acento) é Jó; Jo (sem acento) é João', () => {
  assert.equal(um('Jó 1:21').livroId, 'JOB')
  assert.equal(um('Jo 1:21').livroId, 'JHN')
})

test('livros numerados: 1 Co, 1Co, I Coríntios, 1ª Coríntios, Primeira', () => {
  for (const t of ['1 Coríntios 13:4', '1Co 13:4', '1 Co 13:4', 'I Coríntios 13:4', '1ª Coríntios 13:4', '1º Coríntios 13:4', '1 Corintios 13:4', 'Primeira Coríntios 13:4', '1Cor 13:4']) {
    assert.deepEqual(um(t), { livroId: '1CO', capitulo: 13, versoIni: 4 }, t)
  }
  assert.equal(um('II Coríntios 5:17').livroId, '2CO')
  assert.equal(um('2Rs 2:11').livroId, '2KI')
  assert.equal(um('1Jo 4:8').livroId, '1JN')
  assert.equal(um('3 João 1:4').livroId, '3JN')
  assert.equal(um('III Jo 1:4').livroId, '3JN')
  assert.equal(um('1 Sm 17').livroId, '1SA')
})

test('número solto antes de livro não numerado é ignorado', () => {
  const [r] = encontrarReferencias('versículo 2 Gn 1:1')
  assert.equal(r.livroId, 'GEN')
  assert.equal(r.texto, 'Gn 1:1')
})

test('exige capítulo: nome sozinho não casa', () => {
  assert.deepEqual(refs('Jo foi ao mercado'), [])
  assert.deepEqual(refs('O livro de João é lindo'), [])
  assert.deepEqual(refs('Jonas e Joel'), [])
})

test('não casa dentro de palavras nem colado em letras', () => {
  assert.deepEqual(refs('Projo 3:16'), [])
  assert.deepEqual(refs('Sl 23ª'), [])
  assert.deepEqual(refs('ABC Jo 3x'), [])
  assert.deepEqual(refs('4Jo 1:1'), [])
})

test('valida capítulo e versículo contra a contagem real', () => {
  assert.deepEqual(refs('Jo 22:1'), []) // João tem 21 capítulos
  assert.deepEqual(refs('Jo 3:37'), []) // João 3 tem 36 versículos
  assert.deepEqual(refs('Sl 151'), [])
  assert.deepEqual(refs('Jd 2'), []) // Judas tem 1 capítulo
  assert.deepEqual(um('Jo 3:36'), { livroId: 'JHN', capitulo: 3, versoIni: 36 })
})

test('intervalo inválido mantém só o primeiro versículo', () => {
  const [a] = encontrarReferencias('Jo 3:18-16')
  assert.deepEqual([a.versoIni, a.versoFim, a.texto], [18, undefined, 'Jo 3:18'])
  const [b] = encontrarReferencias('Jo 3:35-40')
  assert.deepEqual([b.versoIni, b.versoFim, b.texto], [35, undefined, 'Jo 3:35'])
  const [c] = encontrarReferencias('Jo 3:16-4:2')
  assert.deepEqual([c.versoIni, c.versoFim, c.texto], [16, undefined, 'Jo 3:16'])
})

test('abreviações ambíguas exigem maiúscula e versículo', () => {
  assert.deepEqual(refs('os 3 meninos'), [])
  assert.deepEqual(refs('Os 3 meninos'), [])
  assert.deepEqual(refs('na 2 rodada'), [])
  assert.deepEqual(refs('ap 12, bloco B'), [])
  assert.equal(um('Os 6:6').livroId, 'HOS')
  assert.equal(um('Ap 21:4').livroId, 'REV')
  assert.equal(um('Ag 2:9').livroId, 'HAG')
})

test('nomes que são substantivos comuns exigem maiúscula', () => {
  assert.deepEqual(refs('os números 3 e 4'), [])
  assert.deepEqual(refs('vários atos 2 vezes'), [])
  assert.deepEqual(refs('os 2 reis 3 vezes'), [])
  assert.equal(um('Números 6:24-26').livroId, 'NUM')
  assert.equal(um('Atos 2:38').livroId, 'ACT')
  assert.equal(um('2 Reis 2:11').livroId, '2KI')
})

test('modo não estrito aceita as formas ambíguas', () => {
  assert.equal(um('os 6:6', { estrito: false }).livroId, 'HOS')
  assert.equal(um('números 6:24', { estrito: false }).livroId, 'NUM')
})

test('várias referências com offsets corretos', () => {
  const texto = 'Leia Jo 3:16, depois (Rm 8:28-30) e Sl 23.'
  const achados = encontrarReferencias(texto)
  assert.deepEqual(achados.map((a) => a.texto), ['Jo 3:16', 'Rm 8:28-30', 'Sl 23'])
  for (const a of achados) assert.equal(texto.slice(a.inicio, a.fim), a.texto)
})

test('ponto final depois do capítulo não vira versículo', () => {
  const [a] = encontrarReferencias('Leia Sl 23. Depois ore.')
  assert.equal(a.texto, 'Sl 23')
  assert.equal(a.versoIni, undefined)
})

test('meio versículo "16a" conta como o versículo 16', () => {
  const [a] = encontrarReferencias('Jo 3:16a')
  assert.equal(a.texto, 'Jo 3:16')
})

test('interpretarReferencia: texto que é só a referência', () => {
  assert.deepEqual(interpretarReferencia('  Jo 3:16-18 '), { livroId: 'JHN', capitulo: 3, versoIni: 16, versoFim: 18 })
  assert.deepEqual(interpretarReferencia('os 6:6'), { livroId: 'HOS', capitulo: 6, versoIni: 6 })
  assert.deepEqual(interpretarReferencia('JHN.3.16'), { livroId: 'JHN', capitulo: 3, versoIni: 16 })
  assert.equal(interpretarReferencia('veja Jo 3:16'), null)
  assert.equal(interpretarReferencia('Jo'), null)
  assert.equal(interpretarReferencia(''), null)
})

test('código da URL: ida e volta', () => {
  const r = { livroId: 'JHN', capitulo: 3, versoIni: 16, versoFim: 18 }
  assert.equal(codigoReferencia(r), 'JHN.3.16-18')
  assert.deepEqual(lerCodigoReferencia('JHN.3.16-18'), r)
  assert.deepEqual(lerCodigoReferencia('jhn.3'), { livroId: 'JHN', capitulo: 3 })
  assert.deepEqual(lerCodigoReferencia('1CO.13.4'), { livroId: '1CO', capitulo: 13, versoIni: 4 })
  assert.equal(lerCodigoReferencia('XXX.1'), null)
  assert.equal(lerCodigoReferencia('JHN.22'), null)
  assert.equal(lerCodigoReferencia('<script>'), null)
  assert.equal(lerCodigoReferencia(null), null)
})

test('formatarReferencia', () => {
  assert.equal(formatarReferencia({ livroId: 'JHN', capitulo: 3, versoIni: 16, versoFim: 18 }), 'João 3:16-18')
  assert.equal(formatarReferencia({ livroId: '1CO', capitulo: 13 }, true), '1Co 13')
})

test('capituloVizinho atravessa livros e para nas pontas', () => {
  assert.deepEqual(capituloVizinho('JHN', 3, 1), { livroId: 'JHN', capitulo: 4 })
  assert.deepEqual(capituloVizinho('MAL', 4, 1), { livroId: 'MAT', capitulo: 1 })
  assert.deepEqual(capituloVizinho('MAT', 1, -1), { livroId: 'MAL', capitulo: 4 })
  assert.equal(capituloVizinho('GEN', 1, -1), null)
  assert.equal(capituloVizinho('REV', 22, 1), null)
})

test('intervaloVersos', () => {
  assert.deepEqual(intervaloVersos({ livroId: 'PSA', capitulo: 23 }), [1, 6])
  assert.deepEqual(intervaloVersos({ livroId: 'JHN', capitulo: 3, versoIni: 16 }), [16, 16])
  assert.deepEqual(intervaloVersos({ livroId: 'JHN', capitulo: 3, versoIni: 16, versoFim: 18 }), [16, 18])
})

// ---------------------------------------------------------------------------
// Inglês e espanhol
// ---------------------------------------------------------------------------

test('inglês: nomes e abreviações comuns', () => {
  assert.deepEqual(um('John 3:16'), { livroId: 'JHN', capitulo: 3, versoIni: 16 })
  assert.deepEqual(um('Psalm 23'), { livroId: 'PSA', capitulo: 23 })
  assert.deepEqual(um('Psalms 119:105'), { livroId: 'PSA', capitulo: 119, versoIni: 105 })
  assert.deepEqual(um('Ps 23'), { livroId: 'PSA', capitulo: 23 })
  assert.equal(um('Genesis 1:1').livroId, 'GEN')
  assert.equal(um('Gen. 1:1').livroId, 'GEN')
  assert.equal(um('Exodus 20').livroId, 'EXO')
  assert.equal(um('Deuteronomy 6:4').livroId, 'DEU')
  assert.equal(um('Proverbs 3:5-6').livroId, 'PRO')
  assert.equal(um('Isaiah 53').livroId, 'ISA')
  assert.equal(um('Song of Songs 2:1').livroId, 'SNG')
  assert.equal(um('Matthew 5:3').livroId, 'MAT')
  assert.equal(um('Matt 5:3').livroId, 'MAT')
  assert.equal(um('Mark 4:3').livroId, 'MRK')
  assert.equal(um('Luke 15:11').livroId, 'LUK')
  assert.equal(um('Acts 2:38').livroId, 'ACT')
  assert.equal(um('Romans 8:28').livroId, 'ROM')
  assert.equal(um('Phil 4:13').livroId, 'PHP')
  assert.equal(um('James 1:5').livroId, 'JAS')
  assert.equal(um('Revelation 21:4').livroId, 'REV')
  assert.equal(um('Job 1:21').livroId, 'JOB')
})

test('inglês: livros numerados', () => {
  assert.deepEqual(um('1 Corinthians 13:4-7'), { livroId: '1CO', capitulo: 13, versoIni: 4, versoFim: 7 })
  assert.equal(um('1 Cor 13').livroId, '1CO')
  assert.equal(um('2 Kings 2:11').livroId, '2KI')
  assert.equal(um('1 John 4:8').livroId, '1JN')
  assert.equal(um('1 Jn 4:8').livroId, '1JN')
  assert.equal(um('1st John 4:8').livroId, '1JN')
  assert.equal(um('First Peter 5:7').livroId, '1PE')
  assert.equal(um('2 Tim 3:16').livroId, '2TI')
  assert.equal(um('1 Thess 5:17').livroId, '1TH')
})

test('espanhol: nomes e abreviações comuns', () => {
  assert.deepEqual(um('Juan 3:16'), { livroId: 'JHN', capitulo: 3, versoIni: 16 })
  assert.deepEqual(um('Gén 1:1'), { livroId: 'GEN', capitulo: 1, versoIni: 1 })
  assert.equal(um('Génesis 1:1').livroId, 'GEN')
  assert.equal(um('Éxodo 20').livroId, 'EXO')
  assert.deepEqual(um('Salmos 23'), { livroId: 'PSA', capitulo: 23 })
  assert.deepEqual(um('Sal 23:1'), { livroId: 'PSA', capitulo: 23, versoIni: 1 })
  assert.equal(um('Proverbios 3:5').livroId, 'PRO')
  assert.equal(um('Eclesiastés 3:1').livroId, 'ECC')
  assert.equal(um('Jeremías 29:11').livroId, 'JER')
  assert.equal(um('Oseas 6:6').livroId, 'HOS')
  assert.equal(um('Miqueas 6:8').livroId, 'MIC')
  assert.equal(um('Mateo 5:3').livroId, 'MAT')
  assert.equal(um('Hechos 2:38').livroId, 'ACT')
  assert.equal(um('Hch 2:38').livroId, 'ACT')
  assert.equal(um('Efesios 2:8').livroId, 'EPH')
  assert.equal(um('Hebreos 11:1').livroId, 'HEB')
  assert.equal(um('Santiago 1:5').livroId, 'JAS')
  assert.equal(um('Apocalipsis 21:4').livroId, 'REV')
})

test('espanhol: livros numerados', () => {
  assert.deepEqual(um('1 Corintios 13:4-7'), { livroId: '1CO', capitulo: 13, versoIni: 4, versoFim: 7 })
  assert.equal(um('2 Reyes 2:11').livroId, '2KI')
  assert.equal(um('1 Juan 4:8').livroId, '1JN')
  assert.equal(um('2 Timoteo 3:16').livroId, '2TI')
  assert.equal(um('Primera Corintios 13:4').livroId, '1CO')
  assert.equal(um('1 Pedro 5:7').livroId, '1PE')
})

test('"Jn": Jonas em português, João em inglês/espanhol; capítulo inválido decide', () => {
  assert.equal(um('Jn 1:1').livroId, 'JON') // padrão pt
  assert.equal(um('Jn 1:1', { idioma: 'en' }).livroId, 'JHN')
  assert.equal(um('Jn 1:1', { idioma: 'es' }).livroId, 'JHN')
  // Jonas 3 tem 10 versículos: "Jn 3:16" só pode ser João, em qualquer idioma
  assert.equal(um('Jn 3:16').livroId, 'JHN')
  assert.equal(um('Jn 3:16', { idioma: 'pt' }).livroId, 'JHN')
  assert.deepEqual(refs('Jn 22:1'), [])
  assert.equal(interpretarReferencia('Jn 3:16', 'en').livroId, 'JHN')
})

test('inglês/espanhol não trazem falsos positivos novos', () => {
  assert.deepEqual(refs('this is 3 times better'), [])
  assert.deepEqual(refs('a job 2 days ago'), [])
  assert.deepEqual(refs('the acts 2 and 3'), [])
  assert.deepEqual(refs('mark 4 boxes'), [])
  assert.deepEqual(refs('two kings 3 queens'), [])
  assert.deepEqual(refs('mi 3 hijos'), [])
  assert.deepEqual(refs('Mi 3 hijos'), []) // ambígua: precisa de versículo
  assert.deepEqual(refs('los hechos 2 y 3'), [])
  assert.deepEqual(refs('le dan 3 vueltas'), [])
  assert.deepEqual(refs('uma pitada de sal 2 vezes'), [])
  assert.deepEqual(refs('foi mal 3 vezes'), [])
  assert.deepEqual(refs('num 3 dias'), [])
  assert.deepEqual(refs('Santiago 3 graus'), [])
  assert.deepEqual(refs('page 2 p 3'), [])
  assert.equal(um('Mi 6:8').livroId, 'MIC')
  assert.equal(um('Is 53').livroId, 'ISA') // "Is" com maiúscula continua valendo
  assert.equal(um('Mal 3:10').livroId, 'MAL')
})

test('formatarReferencia com os nomes de uma versão', async () => {
  const { readFileSync } = await import('node:fs')
  const nomesDe = (v) => {
    const indice = JSON.parse(readFileSync(new URL(`../../public/biblia-dados/${v}/index.json`, import.meta.url), 'utf8'))
    return Object.fromEntries(indice.livros.map((l) => [l.id, { nome: l.nome, abrev: l.abrev }]))
  }
  const r = { livroId: 'JHN', capitulo: 3, versoIni: 16, versoFim: 18 }
  assert.equal(formatarReferencia(r, false, nomesDe('web')), 'John 3:16-18')
  assert.equal(formatarReferencia(r, false, nomesDe('rv1909')), 'Juan 3:16-18')
  assert.equal(formatarReferencia(r, false, null), 'João 3:16-18')
  // o que o formatador produz, o parser reconhece de volta
  for (const v of ['blivre', 'web', 'kjv', 'rv1909', 'vbl']) {
    const nomes = nomesDe(v)
    for (const id of Object.keys(nomes)) {
      const texto = formatarReferencia({ livroId: id, capitulo: 1, versoIni: 1 }, false, nomes)
      assert.equal(interpretarReferencia(texto, 'pt')?.livroId, id, `${v}: ${texto}`)
    }
  }
})

test('espanhol: "San Mateo", "San Juan" (títulos da RV1909)', () => {
  assert.equal(um('San Mateo 5:3').livroId, 'MAT')
  assert.equal(um('San Juan 3:16').livroId, 'JHN')
  assert.equal(um('San Lucas 15').livroId, 'LUK')
})
