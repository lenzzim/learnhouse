// Testes das propriedades e do frontmatter YAML (importação .md).
// Rodar (a partir de apps/web):
//   node --import ./lib/caderno/testes/registrar.mjs --test lib/caderno/propriedades.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  definirPropriedade,
  gerarFrontmatter,
  lerFrontmatter,
  mesmasPropriedades,
  normalizarPropriedades,
  valorDe,
} from './propriedades.ts'

test('normalizar: inválidas, repetidas, tamanhos', () => {
  const out = normalizarPropriedades([
    { key: 'tipo', value: ' Culto ' },
    { key: 'Tipo', value: 'outro' },
    { key: '', value: 'x' },
    { key: 'a:b', value: 'x' },
    { key: 'tema', value: 'x'.repeat(300) },
  ])
  assert.deepEqual(out.map((p) => p.key), ['tipo', 'tema'])
  assert.equal(out[0].value, 'Culto')
  assert.equal(out[1].value.length, 200)
})

test('comparar, ler e definir', () => {
  const a = [{ key: 'tipo', value: 'Culto' }]
  assert.ok(mesmasPropriedades(a, [{ key: 'tipo', value: 'Culto' }]))
  assert.ok(!mesmasPropriedades(a, []))
  assert.equal(valorDe(a, 'TIPO'), 'Culto')
  assert.deepEqual(definirPropriedade(a, 'livro', 'João'), [...a, { key: 'livro', value: 'João' }])
  assert.deepEqual(definirPropriedade(a, 'Tipo', 'Estudo'), [{ key: 'tipo', value: 'Estudo' }])
})

test('frontmatter do Obsidian vira propriedades', () => {
  const md = [
    '---',
    'tipo: Culto',
    'livro: "1 Coríntios"',
    "tags: [fé, 'graça']",
    'aliases:',
    '  - Um',
    '  - "Dois"',
    'data: 2026-11-22 # comentário',
    'aninhado:',
    '  a: 1',
    '---',
    '# Título',
    'corpo',
  ].join('\n')
  const { propriedades, corpo } = lerFrontmatter(md)
  assert.deepEqual(propriedades, [
    { key: 'tipo', value: 'Culto' },
    { key: 'livro', value: '1 Coríntios' },
    { key: 'tags', value: 'fé, graça' },
    { key: 'aliases', value: 'Um, Dois' },
    { key: 'data', value: '2026-11-22' },
    { key: 'aninhado', value: '' },
  ])
  assert.equal(corpo, '# Título\ncorpo')
})

test('sem frontmatter: texto intacto (inclusive "---" no meio)', () => {
  assert.deepEqual(lerFrontmatter('# A\n\n---\n\nB'), { propriedades: [], corpo: '# A\n\n---\n\nB' })
})

test('ida e volta com o mesmo formato do servidor', () => {
  const props = [
    { key: 'tipo', value: 'Sermão' },
    { key: 'livro', value: '1 Coríntios' },
    { key: 'data', value: '2026-11-22' },
    { key: 'tema', value: 'amor: o maior' },
    { key: 'status', value: 'true' },
    { key: 'autor', value: 'Pr. "João"' },
    { key: 'n', value: '42' },
    { key: 'vazio', value: '' },
  ]
  const fm = gerarFrontmatter(props)
  // mesmo texto que apps/api (test_export_frontmatter_and_import_roundtrip)
  assert.ok(
    fm.startsWith('---\ntipo: Sermão\nlivro: 1 Coríntios\ndata: 2026-11-22\ntema: "amor: o maior"\nstatus: "true"\n')
  )
  assert.ok(fm.includes('autor: Pr. "João"\nn: "42"\nvazio: ""\n---\n'))
  // aspas no começo exigem aspas e escape
  assert.equal(gerarFrontmatter([{ key: 'a', value: '"x"' }]), '---\na: "\\"x\\""\n---\n')
  assert.deepEqual(lerFrontmatter('---\na: "\\"x\\""\n---\n').propriedades, [{ key: 'a', value: '"x"' }])
  assert.deepEqual(lerFrontmatter(fm + '\n# T').propriedades, props)
  assert.equal(gerarFrontmatter([]), '')
})
