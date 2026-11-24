// node --test lib/discipulei/cantoInferior.test.mjs
import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'

const { pedirCanto, soltarCanto, donoDoCanto, ouvirCanto, _zerarCanto } = await import('./cantoInferior.ts')

beforeEach(() => _zerarCanto())

test('um aviso sozinho fica com o canto', () => {
  assert.equal(pedirCanto('estudo'), true)
  assert.equal(donoDoCanto(), 'estudo')
})

test('quem chegou primeiro fica; o outro espera e entra quando o canto é solto', () => {
  pedirCanto('estudo')
  assert.equal(pedirCanto('instalar'), false, 'instalar espera o convite de estudo')
  assert.equal(donoDoCanto(), 'estudo')
  soltarCanto('estudo')
  assert.equal(donoDoCanto(), 'instalar')
  soltarCanto('instalar')
  assert.equal(donoDoCanto(), null)
})

test('instalar visível: o convite de estudo espera', () => {
  pedirCanto('instalar')
  assert.equal(pedirCanto('estudo'), false)
  soltarCanto('instalar')
  assert.equal(donoDoCanto(), 'estudo')
})

test('desistir de esperar não mexe em quem está no canto', () => {
  pedirCanto('instalar')
  pedirCanto('estudo')
  soltarCanto('estudo')
  assert.equal(donoDoCanto(), 'instalar')
  soltarCanto('instalar')
  assert.equal(donoDoCanto(), null)
})

test('nunca há dois donos e os ouvintes são avisados a cada troca', () => {
  const trocas = []
  ouvirCanto(() => trocas.push(donoDoCanto()))
  pedirCanto('estudo')
  pedirCanto('instalar')
  soltarCanto('estudo')
  soltarCanto('instalar')
  assert.deepEqual(trocas, ['estudo', 'instalar', null])
})

test('seleção de versículos toma o canto do convite e devolve depois', () => {
  pedirCanto('instalar')
  assert.equal(donoDoCanto(), 'instalar')
  assert.equal(pedirCanto('selecao'), true)
  assert.equal(donoDoCanto(), 'selecao')
  soltarCanto('selecao')
  assert.equal(donoDoCanto(), 'instalar')
  soltarCanto('instalar')
  assert.equal(donoDoCanto(), null)
})
