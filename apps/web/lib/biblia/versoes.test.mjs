// Testes de lib/biblia/versoes.ts (catálogo e links da YouVersion).
// Rodar (a partir de apps/web):  node --test lib/biblia/versoes.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  VERSOES,
  VERSAO_PADRAO,
  VERSOES_EXTERNAS,
  urlYouVersion,
  versaoPorId,
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

test('YouVersion: ids conferidos das cinco versões', () => {
  const ids = Object.fromEntries(VERSOES_EXTERNAS.map((v) => [v.sigla, v.idYouVersion]))
  assert.deepEqual(ids, { NVI: 129, ARA: 1608, ARC: 212, NTLH: 211, NAA: 1840 })
  const ara = VERSOES_EXTERNAS.find((v) => v.sigla === 'ARA')
  assert.equal(urlYouVersion({ livroId: 'GEN', capitulo: 1, versoIni: 1 }, ara), 'https://www.bible.com/pt/bible/1608/GEN.1.1.ARA')
})

test('versão padrão segue o idioma da interface', async () => {
  const { versaoPadraoDoIdioma, VERSAO_PADRAO_POR_IDIOMA } = await import('./versoes.ts')
  assert.equal(versaoPadraoDoIdioma('pt'), 'blivre')
  assert.equal(versaoPadraoDoIdioma('pt-BR'), 'blivre')
  assert.equal(versaoPadraoDoIdioma('en-US'), 'web')
  assert.equal(versaoPadraoDoIdioma('es'), 'rv1909')
  assert.equal(versaoPadraoDoIdioma('fr'), 'blivre')
  assert.equal(versaoPadraoDoIdioma(undefined), 'blivre')
  for (const [idioma, id] of Object.entries(VERSAO_PADRAO_POR_IDIOMA)) {
    assert.equal(versaoPorId(id).idioma, idioma, id)
  }
})
