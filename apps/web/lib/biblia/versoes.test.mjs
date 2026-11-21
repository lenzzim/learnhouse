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
  politicaCopia,
  POLITICA_ABERTA,
} from './versoes.ts'

const base = new URL('../../public/biblia-dados/', import.meta.url)
const ler = (p) => JSON.parse(readFileSync(new URL(p, base), 'utf8'))
// a NVI agora é lida no app (YouVersion Platform); o formato do link segue valendo
const NVI = { sigla: 'NVI', nome: 'Nova Versão Internacional', idYouVersion: 129 }

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

test('YouVersion: link externo só para versões sem licença no app (NAA)', () => {
  const ids = Object.fromEntries(VERSOES_EXTERNAS.map((v) => [v.sigla, v.idYouVersion]))
  assert.deepEqual(ids, { NAA: 1840 })
  const naa = VERSOES_EXTERNAS.find((v) => v.sigla === 'NAA')
  assert.equal(urlYouVersion({ livroId: 'GEN', capitulo: 1, versoIni: 1 }, naa), 'https://www.bible.com/pt/bible/1840/GEN.1.1.NAA')
})

test('licenciadas: fora do catálogo estático, mas reconhecidas por id e sigla', () => {
  assert.deepEqual(
    VERSOES_LICENCIADAS.map((v) => v.id),
    ['nvi', 'ara', 'arc', 'ntlh', 'rc69', 'nvi2011', 'nbvp', 'olivro', 'niv', 'nkjv']
  )
  // ordem do grupo "Licenciadas" (português) no seletor
  assert.deepEqual(
    VERSOES_LICENCIADAS.filter((v) => v.idioma === 'pt').slice(0, 5).map((v) => v.sigla),
    ['NVI', 'ARA', 'ARC', 'NTLH', 'RC69']
  )
  for (const v of VERSOES_LICENCIADAS) {
    assert.match(v.sigla, /^[A-Za-z0-9]{2,8}$/, `${v.sigla}: precisa caber na citação "(SIGLA)"`)
    assert.ok(v.provedor === 'apibible' || v.provedor === 'youversion', v.id)
  }
  assert.equal(versaoPorId('nvi').provedor, 'youversion')
  assert.equal(versaoPorId('ara').provedor, 'apibible')
  assert.match(versaoPorId('nvi').credito, /Nova Versão Internacional®, NVI® © 1993, 2000, 2011, 2023 por Biblica/)
  for (const v of VERSOES_LICENCIADAS) {
    assert.equal(v.fonte, 'licenciada')
    assert.ok(!VERSOES.some((a) => a.id === v.id), `${v.id} não pode estar no catálogo estático`)
  }
  assert.equal(ehLicenciada('ara'), true)
  assert.equal(ehLicenciada('blivre'), false)
  assert.equal(versaoPorId('ntlh').sigla, 'NTLH')
  assert.equal(versaoPorSigla('ara').id, 'ara')
  assert.equal(versaoPorSigla('BLIVRE').id, 'blivre')
  assert.equal(versaoPorSigla('NVI').id, 'nvi')
  assert.equal(versaoPorSigla('nvi').fonte, 'licenciada')
  assert.equal(versaoValida('arc'), 'arc')
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

test('política de cópia por versão (abertas livres; licenciadas até 25 versículos, sem imagem)', () => {
  for (const v of VERSOES) assert.deepEqual(politicaCopia(v.id), POLITICA_ABERTA, v.id)
  assert.deepEqual(politicaCopia('blivre'), { permiteCopiar: true, maxVersiculosCopia: null, permiteImagem: true, siglaObrigatoria: true })
  for (const id of ['ara', 'arc', 'ntlh', 'rc69', 'niv', 'nkjv', 'nvi']) {
    const p = politicaCopia(id)
    assert.equal(p.permiteCopiar, true, id)
    assert.equal(p.maxVersiculosCopia, 25, id)
    assert.equal(p.permiteImagem, false, id)
    assert.equal(p.siglaObrigatoria, true, id)
  }
  // desconhecida: regra mais restrita
  assert.equal(politicaCopia('xyz').permiteImagem, false)
  assert.ok(Object.isFrozen(politicaCopia('nvi')))
})
