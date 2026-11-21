// Testes de lib/biblia/versoes.ts (catálogo e links da YouVersion).
// Rodar (a partir de apps/web):  node --test lib/biblia/versoes.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  VERSOES,
  VERSAO_PADRAO,
  VERSOES_EXTERNAS,
  VERSOES_LICENCIADAS,
  ehLicenciada,
  urlYouVersion,
  versaoPorId,
  versaoPorSigla,
  versaoValida,
} from './versoes.ts'

const base = new URL('../../public/biblia-dados/', import.meta.url)
const ler = (p) => JSON.parse(readFileSync(new URL(p, base), 'utf8'))
const NVI = VERSOES_EXTERNAS.find((v) => v.sigla === 'NVI')

test('VERSOES espelha catalogo.json e os index.json de cada versão', () => {
  const catalogo = ler('catalogo.json')
  assert.equal(catalogo.padrao, VERSAO_PADRAO)
  assert.deepEqual(VERSOES, catalogo.versoes)
  for (const v of VERSOES) {
    const indice = ler(`${v.id}/index.json`)
    assert.equal(indice.credito, v.credito, v.id)
    assert.equal(indice.livros.length, 66, v.id)
  }
})

test('versaoValida cai no padrão para ids desconhecidos', () => {
  assert.equal(versaoValida('kjv'), 'kjv')
  assert.equal(versaoValida('xyz'), 'blivre')
  assert.equal(versaoValida(null), 'blivre')
  assert.equal(versaoPorId('rv1909').idioma, 'es')
})

test('YouVersion: versículo, intervalo e capítulo', () => {
  assert.equal(urlYouVersion({ livroId: 'JHN', capitulo: 3, versoIni: 16 }, NVI), 'https://www.bible.com/pt/bible/129/JHN.3.16.NVI')
  assert.equal(
    urlYouVersion({ livroId: 'JHN', capitulo: 3, versoIni: 16, versoFim: 18 }, NVI),
    'https://www.bible.com/pt/bible/129/JHN.3.16-18.NVI'
  )
  assert.equal(urlYouVersion({ livroId: 'PSA', capitulo: 23 }, NVI), 'https://www.bible.com/pt/bible/129/PSA.23.NVI')
  assert.equal(urlYouVersion({ livroId: '1CO', capitulo: 13, versoIni: 4 }, NVI), 'https://www.bible.com/pt/bible/129/1CO.13.4.NVI')
})

test('YouVersion: só as versões sem licença no app (NVI e NAA)', () => {
  const ids = Object.fromEntries(VERSOES_EXTERNAS.map((v) => [v.sigla, v.idYouVersion]))
  assert.deepEqual(ids, { NVI: 129, NAA: 1840 })
  const naa = VERSOES_EXTERNAS.find((v) => v.sigla === 'NAA')
  assert.equal(urlYouVersion({ livroId: 'GEN', capitulo: 1, versoIni: 1 }, naa), 'https://www.bible.com/pt/bible/1840/GEN.1.1.NAA')
})

test('licenciadas: fora do catálogo estático, mas reconhecidas por id e sigla', () => {
  assert.deepEqual(
    VERSOES_LICENCIADAS.map((v) => v.id),
    ['ara', 'arc', 'rc69', 'ntlh', 'niv', 'nkjv']
  )
  for (const v of VERSOES_LICENCIADAS) {
    assert.equal(v.fonte, 'licenciada')
    assert.ok(!VERSOES.some((a) => a.id === v.id), `${v.id} não pode estar no catálogo estático`)
  }
  assert.equal(ehLicenciada('ara'), true)
  assert.equal(ehLicenciada('blivre'), false)
  assert.equal(versaoPorId('ntlh').sigla, 'NTLH')
  assert.equal(versaoPorSigla('ara').id, 'ara')
  assert.equal(versaoPorSigla('BLIVRE').id, 'blivre')
  assert.equal(versaoPorSigla('NVI'), undefined)
  assert.equal(versaoValida('arc'), 'arc')
})
