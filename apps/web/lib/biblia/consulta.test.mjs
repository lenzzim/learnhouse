// Consulta de busca que é uma referência (página Buscar e busca da Bíblia).
// Rodar (a partir de apps/web):
//   node --import ./lib/caderno/testes/registrar.mjs --test lib/biblia/consulta.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { interpretarConsulta, rotuloPassagem, codigoLeitor, partesDestacadas, livrosDoTestamento } = await import('./consulta.ts')

const casos = [
  ['1 Pe', '1PE', 'livro'],
  ['1Pe', '1PE', 'livro'],
  ['1pedro', '1PE', 'livro'],
  ['Pedro', '1PE', 'livro'],
  ['Sl', 'PSA', 'livro'],
  ['Salmo', 'PSA', 'livro'],
  ['salmos', 'PSA', 'livro'],
  ['Gênesis', 'GEN', 'livro'],
  ['genesis', 'GEN', 'livro'],
  ['1Pe 1', '1PE.1', 'capitulo'],
  ['1 pe 1', '1PE.1', 'capitulo'],
  ['1Pedro 1', '1PE.1', 'capitulo'],
  ['Sl 23', 'PSA.23', 'capitulo'],
  ['Mt 28:18-20', 'MAT.28.18-20', 'intervalo'],
  ['Mt 28:19', 'MAT.28.19', 'versiculo'],
  ['joao 3:16', 'JHN.3.16', 'versiculo'],
]

for (const [consulta, codigo, tipo] of casos) {
  test(`interpreta "${consulta}"`, () => {
    const p = interpretarConsulta(consulta)
    assert.ok(p, consulta)
    assert.equal(p.tipo, tipo)
    const esperado = tipo === 'livro' ? `${codigo}.1` : codigo
    assert.equal(codigoLeitor(p), esperado)
  })
}

test('não é referência', () => {
  for (const c of ['amor de Deus', 'oração', 'mal', 'sal', 'os', 'Jo 3:16 e Mt 1:1', '', 'Sl 23x']) {
    assert.equal(interpretarConsulta(c), null, c)
  }
})

test('rótulo do chip', () => {
  assert.equal(rotuloPassagem(interpretarConsulta('1Pe 1')), '1 Pedro 1')
  assert.equal(rotuloPassagem(interpretarConsulta('Salmos')), 'Salmos')
  assert.equal(rotuloPassagem(interpretarConsulta('Mt 28:18-20')), 'Mateus 28:18-20')
  assert.equal(rotuloPassagem(interpretarConsulta('Mt 28:19')), 'Mateus 28:19')
})

test('partes destacadas a partir dos intervalos do servidor', () => {
  assert.deepEqual(partesDestacadas('Como diz 1 Pe 1:3, bendito', [[9, 17]]), [
    { texto: 'Como diz ', marcado: false },
    { texto: '1 Pe 1:3', marcado: true },
    { texto: ', bendito', marcado: false },
  ])
  // sobrepostos, fora de ordem e fora do texto são tolerados
  assert.deepEqual(partesDestacadas('abcdef', [[4, 99], [0, 2], [1, 3]]), [
    { texto: 'ab', marcado: true },
    { texto: 'c', marcado: true },
    { texto: 'd', marcado: false },
    { texto: 'ef', marcado: true },
  ])
  assert.deepEqual(partesDestacadas('abc', []), [{ texto: 'abc', marcado: false }])
})

test('livros por testamento', () => {
  assert.equal(livrosDoTestamento('').length, 66)
  assert.equal(livrosDoTestamento('AT').length, 39)
  assert.equal(livrosDoTestamento('NT')[0].id, 'MAT')
})
