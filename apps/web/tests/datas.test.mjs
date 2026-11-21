import { test } from 'node:test'
import assert from 'node:assert/strict'
import { apiDateToIso } from '../lib/datas-utc.ts'

// A API devolve UTC sem fuso; sem o "Z" o navegador leria como hora local.
test('data/hora sem fuso vira ISO em UTC', () => {
  assert.equal(apiDateToIso('2026-11-21 19:05:45.732795'), '2026-11-21T19:05:45.732795Z')
  assert.equal(apiDateToIso('2026-11-21T19:05:45'), '2026-11-21T19:05:45Z')
  assert.equal(apiDateToIso('2026-11-21 19:05'), '2026-11-21T19:05Z')
})

test('instante resultante é o mesmo em qualquer fuso do navegador', () => {
  const ms = Date.parse(apiDateToIso('2026-11-21 19:05:45.732795'))
  assert.equal(ms, Date.UTC(2026, 10, 21, 19, 5, 45, 732))
})

test('strings que já têm fuso ficam intactas', () => {
  for (const s of [
    '2026-11-21T19:05:45Z',
    '2026-11-21T19:05:45.123z',
    '2026-11-21T16:05:45-03:00',
    '2026-11-21T16:05:45-0300',
    '2026-11-21 22:05:45+03',
  ]) {
    assert.equal(apiDateToIso(s), s)
  }
})

test('datas sem hora e valores que não são string passam sem mudança', () => {
  assert.equal(apiDateToIso('2026-11-21'), '2026-11-21')
  assert.equal(apiDateToIso('ontem'), 'ontem')
  assert.equal(apiDateToIso(null), null)
  assert.equal(apiDateToIso(undefined), undefined)
  assert.equal(apiDateToIso(1700000000000), 1700000000000)
  const d = new Date()
  assert.equal(apiDateToIso(d), d)
})

test('data curta em pt-BR no formato "21 de nov. de 2026"', async () => {
  const { formatarDataCurta } = await import('../lib/datas-utc.ts')
  assert.equal(formatarDataCurta('2026-11-21 12:00:00', 'pt-BR'), '21 de nov. de 2026')
  assert.equal(formatarDataCurta('2026-11-21 12:00:00', 'pt'), '21 de nov. de 2026')
  assert.equal(formatarDataCurta(null), '')
  assert.equal(formatarDataCurta('lixo'), '')
})
