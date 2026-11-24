// "Anotar" do leitor → Caderno: entrega das citações (lib/caderno/citacaoPendente.ts).
// Rodar (a partir de apps/web):
//   node --import ./lib/caderno/testes/registrar.mjs --test lib/caderno/citacaoPendente.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { guardarCitacaoPendente, consumirCitacaoPendente, VALIDADE_CITACAO_MS, CHAVE_CITACAO_PENDENTE } = await import('./citacaoPendente.ts')

function memoria() {
  const m = new Map()
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m }
}

const bloco = { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: '— João 3:16 (NVI)' }] }] }

test('nota nova: entrega só para uma nota vazia, e uma vez', () => {
  const a = memoria()
  assert.equal(guardarCitacaoPendente(a, { destino: { tipo: 'nota' }, blocos: [bloco], titulo: 'João 3:16' }, 1000), true)
  assert.equal(consumirCitacaoPendente(a, { kind: 'note', vazia: false }, 2000), null, 'nota com conteúdo não recebe')
  assert.equal(consumirCitacaoPendente(a, { kind: 'tcd', tcd_date: '2026-11-24', vazia: true }, 2000), null)
  const c = consumirCitacaoPendente(a, { kind: 'note', vazia: true }, 2000)
  assert.deepEqual(c.blocos, [bloco])
  assert.equal(c.titulo, 'João 3:16')
  assert.equal(consumirCitacaoPendente(a, { kind: 'note', vazia: true }, 2000), null, 'consumida')
})

test('TCD: só o da data pedida; expira', () => {
  const a = memoria()
  guardarCitacaoPendente(a, { destino: { tipo: 'tcd', data: '2026-11-24' }, blocos: [bloco], titulo: 'x' }, 0)
  assert.equal(consumirCitacaoPendente(a, { kind: 'tcd', tcd_date: '2026-11-23', vazia: true }, 10), null)
  assert.ok(consumirCitacaoPendente(a, { kind: 'tcd', tcd_date: '2026-11-24', vazia: false }, 10))
  guardarCitacaoPendente(a, { destino: { tipo: 'tcd', data: '2026-11-24' }, blocos: [bloco], titulo: 'x' }, 0)
  assert.equal(consumirCitacaoPendente(a, { kind: 'tcd', tcd_date: '2026-11-24', vazia: true }, VALIDADE_CITACAO_MS + 1), null)
  assert.equal(a.m.has(CHAVE_CITACAO_PENDENTE), false, 'a expirada é apagada')
})

test('sem armazenamento, lixo ou nada a entregar: não quebra', () => {
  assert.equal(guardarCitacaoPendente(null, { destino: { tipo: 'nota' }, blocos: [bloco], titulo: '' }), false)
  assert.equal(guardarCitacaoPendente(memoria(), { destino: { tipo: 'nota' }, blocos: [], titulo: '' }), false)
  const a = memoria()
  a.setItem(CHAVE_CITACAO_PENDENTE, '{não é json')
  assert.equal(consumirCitacaoPendente(a, { kind: 'note', vazia: true }), null)
  const quebrado = { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('x') }, removeItem: () => {} }
  assert.equal(consumirCitacaoPendente(quebrado, { kind: 'note', vazia: true }), null)
  assert.equal(guardarCitacaoPendente(quebrado, { destino: { tipo: 'nota' }, blocos: [bloco], titulo: '' }), false)
})
