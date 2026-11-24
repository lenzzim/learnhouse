import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixadoEm, ordenarComFixados } from '../lib/communities/fixados.ts'

const espaco = (nome, criado, pinned_at = null) => ({
  name: nome,
  creation_date: criado,
  moderation_settings: pinned_at === undefined ? null : { pinned_at },
})
const nomes = (lista) => lista.map((c) => c.name)
const recentes = (a, b) => new Date(b.creation_date) - new Date(a.creation_date)
const porNome = (a, b) => a.name.localeCompare(b.name)

const lista = [
  espaco('Novo', '2026-11-20'),
  espaco('Blog | Discipulei', '2025-01-02', '2026-11-24T12:00:00.000000+00:00'),
  espaco('Antigo', '2025-06-01', undefined),
  espaco('Tempos com Deus | Público', '2025-01-01', '2026-11-24T10:00:00.000000+00:00'),
]

test('fixados primeiro, na ordem em que foram fixados (Mais recentes)', () => {
  assert.deepEqual(nomes(ordenarComFixados(lista, recentes)), [
    'Tempos com Deus | Público', 'Blog | Discipulei', 'Novo', 'Antigo',
  ])
})

test('fixados primeiro também em Nome (A–Z)', () => {
  assert.deepEqual(nomes(ordenarComFixados(lista, porNome)), [
    'Tempos com Deus | Público', 'Blog | Discipulei', 'Antigo', 'Novo',
  ])
})

test('não altera a lista original e entende "sem configuração"', () => {
  const copia = [...lista]
  ordenarComFixados(lista, porNome)
  assert.deepEqual(lista, copia)
  assert.equal(fixadoEm(espaco('x', '2026-01-01', undefined)), null)
  assert.equal(fixadoEm(espaco('x', '2026-01-01', null)), null)
  assert.equal(fixadoEm(espaco('x', '2026-01-01', '')), null)
})
