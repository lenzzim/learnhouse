// node --test lib/discipulei/convitesEstudo.test.mjs
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const armazenamento = new Map()
globalThis.window = {
  localStorage: {
    getItem: (k) => (armazenamento.has(k) ? armazenamento.get(k) : null),
    setItem: (k, v) => armazenamento.set(k, String(v)),
  },
}

const {
  podeConvidar,
  registrarExibicao,
  registrarDiaDeUso,
  dispensarConvites,
  registrarAgendamento,
} = await import('./convitesEstudo.ts')

const dia = (d, h = 10) => new Date(2026, 10, d, h, 0, 0)

beforeEach(() => armazenamento.clear())

test('no máximo 1 convite por dia, de qualquer momento', () => {
  assert.equal(podeConvidar(1, 'biblia', dia(23)), true)
  registrarExibicao(1, 'biblia', dia(23))
  assert.equal(podeConvidar(1, 'tcd', dia(23, 11)), false)
  // o mesmo convite continua na remontagem logo em seguida
  assert.equal(podeConvidar(1, 'biblia', dia(23, 10)), true)
  // mas não volta horas depois no mesmo dia
  assert.equal(podeConvidar(1, 'biblia', dia(23, 15)), false)
  assert.equal(podeConvidar(1, 'tcd', dia(24)), true)
})

test('"Agora não" esconde por 14 dias', () => {
  dispensarConvites(1, dia(1))
  assert.equal(podeConvidar(1, 'biblia', dia(14)), false)
  assert.equal(podeConvidar(1, 'biblia', dia(16)), true)
})

test('nunca para quem já agendou', () => {
  registrarAgendamento(1)
  assert.equal(podeConvidar(1, 'biblia', dia(30)), false)
})

test('estado por conta: outra pessoa no mesmo navegador não herda', () => {
  registrarAgendamento(1)
  assert.equal(podeConvidar(2, 'biblia', dia(23)), true)
})

test('tela Hoje só a cada 3 dias de uso', () => {
  registrarDiaDeUso(1, dia(1))
  assert.equal(podeConvidar(1, 'hoje', dia(1)), false)
  registrarDiaDeUso(1, dia(2))
  registrarDiaDeUso(1, dia(2, 18))
  assert.equal(podeConvidar(1, 'hoje', dia(2)), false)
  registrarDiaDeUso(1, dia(3))
  assert.equal(podeConvidar(1, 'hoje', dia(3)), true)
  registrarExibicao(1, 'hoje', dia(3))
  registrarDiaDeUso(1, dia(4))
  assert.equal(podeConvidar(1, 'hoje', dia(4)), false)
})

test('1ª nota publicada convida uma vez só', () => {
  assert.equal(podeConvidar(1, 'primeira-nota', dia(1)), true)
  registrarExibicao(1, 'primeira-nota', dia(1))
  assert.equal(podeConvidar(1, 'primeira-nota', dia(5)), false)
})
