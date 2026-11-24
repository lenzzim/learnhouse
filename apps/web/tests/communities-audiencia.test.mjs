import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparEmSecoes, audienciaDe, ehGrupoDiscipulos } from '../lib/communities/audiencia.ts'

const e = (name, audience, extra = {}) => ({ name, public: audience?.kind === 'open', audience, ...extra })
const aberto = { kind: 'open', groups: [] }
const membros = { kind: 'members', groups: [] }
const grupo = (...groups) => ({ kind: 'group', groups })
const pin = (iso) => ({ moderation_settings: { pinned_at: iso } })

test('audiência vem do servidor; sem o campo, deduz pelo public', () => {
  assert.deepEqual(audienciaDe(e('x', grupo('Discípulos'))), grupo('Discípulos'))
  assert.deepEqual(audienciaDe({ public: true }), aberto)
  assert.deepEqual(audienciaDe({ public: false }), membros)
  assert.deepEqual(audienciaDe({ public: false, audience: { kind: 'group', groups: [] } }), membros)
})

test('seções: Comunidade primeiro, depois um grupo por seção, fixados no topo de cada uma', () => {
  const lista = [
    e('Estudos Bíblicos', grupo('Discípulos')),
    e('Testemunhos', aberto),
    e('Homens', grupo('Homens')),
    e('Pedidos de oração', membros),
    e('Encontros', grupo('Discípulos'), pin('2026-11-24T10:00:00.000000+00:00')),
    e('Blog', aberto, pin('2026-11-24T09:00:00.000000+00:00')),
    e('Mulheres', grupo('Mulheres')),
  ]
  const secoes = agruparEmSecoes(lista)
  assert.deepEqual(secoes.map((s) => s.chave), ['comunidade', 'grupo:Discípulos', 'grupo:Homens', 'grupo:Mulheres'])
  assert.deepEqual(secoes[0].itens.map((c) => c.name), ['Blog', 'Testemunhos', 'Pedidos de oração'])
  assert.deepEqual(secoes[1].itens.map((c) => c.name), ['Encontros', 'Estudos Bíblicos'])
  assert.ok(ehGrupoDiscipulos(secoes[1].grupos))
  assert.ok(!ehGrupoDiscipulos(secoes[2].grupos))
})

test('quem não lê o grupo não recebe a seção (só o que a API devolveu)', () => {
  const secoes = agruparEmSecoes([e('Testemunhos', aberto), e('Pedidos', membros)])
  assert.equal(secoes.length, 1)
  assert.equal(secoes[0].chave, 'comunidade')
})

test('vários grupos viram uma seção própria', () => {
  const secoes = agruparEmSecoes([e('Equipe', grupo('Discípulos', 'Equipe'))])
  assert.deepEqual(secoes[0].grupos, ['Discípulos', 'Equipe'])
  assert.ok(!ehGrupoDiscipulos(secoes[0].grupos))
})
