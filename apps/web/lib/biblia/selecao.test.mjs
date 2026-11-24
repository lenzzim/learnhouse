// Seleção de versículos no leitor e o texto da cópia (lib/biblia/selecao.ts).
// Rodar (a partir de apps/web):
//   node --import ./lib/caderno/testes/registrar.mjs --test lib/biblia/selecao.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'

const s = await import('./selecao.ts')
const { lerLimiteCopia, LIMITE_COPIA_PADRAO } = await import('./versoes.ts')

test('liga e desliga versículos, inclusive fora de sequência', () => {
  let sel = []
  sel = s.alternarVerso(sel, 19)
  sel = s.alternarVerso(sel, 16)
  sel = s.alternarVerso(sel, 17)
  assert.deepEqual(sel, [16, 17, 19])
  assert.deepEqual(s.alternarVerso(sel, 17), [16, 19])
})

test('Shift+clique estende da âncora até o versículo, pulando os ausentes', () => {
  assert.deepEqual(s.estenderSelecao([2], 2, 5), [2, 3, 4, 5])
  assert.deepEqual(s.estenderSelecao([9], 9, 6, (v) => v !== 7), [6, 8, 9])
  assert.deepEqual(s.estenderSelecao([], null, 4), [4])
})

test('rótulo, trechos e link da seleção', () => {
  assert.deepEqual(s.trechos([19, 16, 17]), [[16, 17], [19, 19]])
  assert.equal(s.rotuloSelecao('JHN', 3, [16, 17, 19]), 'João 3:16-17, 19')
  assert.equal(s.rotuloSelecao('JHN', 3, [16], null, true), 'Jo 3:16')
  assert.equal(s.rotuloSelecao('JHN', 3, [16, 17], { JHN: { nome: 'John', abrev: 'Jn' } }), 'John 3:16-17')
  assert.equal(s.codigoSelecao('JHN', 3, [19, 16]), 'JHN.3.16-19')
  assert.equal(s.codigoSelecao('JHN', 3, [16]), 'JHN.3.16')
  assert.deepEqual(s.referenciasDosTrechos('JHN', 3, [16, 17, 19]), [
    { livroId: 'JHN', capitulo: 3, versoIni: 16, versoFim: 17 },
    { livroId: 'JHN', capitulo: 3, versoIni: 19 },
  ])
})

test('texto da cópia: números, referência, sigla e link', () => {
  const link = 'https://ex.org/biblia?ref=JHN.3.16-17&v=nvi'
  assert.equal(
    s.textoCopia({ versos: [{ numero: 16, texto: 'Porque Deus amou… ' }, { numero: 17, texto: 'Pois Deus enviou…' }], referencia: 'João 3:16-17', sigla: 'NVI', link }),
    `"16 Porque Deus amou… 17 Pois Deus enviou…" — João 3:16-17 (NVI)\n${link}`
  )
  assert.equal(
    s.textoCopia({ versos: [{ numero: 16, texto: 'Porque Deus amou' }], referencia: 'João 3:16', sigla: 'BLIVRE', link }),
    `"Porque Deus amou" — João 3:16 (BLIVRE)\n${link}`
  )
  assert.ok(s.textoCopia({ versos: [{ numero: 25, rotulo: '25-26', texto: 'x' }, { numero: 27, texto: 'y' }], referencia: 'R', sigla: 'ARA', link }).startsWith('"25-26 x 27 y"'))
})

test('limite de cópia: abertas livres, licenciadas limitadas e configurável', () => {
  assert.equal(s.limiteCopia('blivre'), null)
  assert.equal(s.copiaPermitida('blivre', 1000), true)
  assert.equal(s.limiteCopia('nvi'), LIMITE_COPIA_PADRAO)
  assert.equal(s.copiaPermitida('nvi', LIMITE_COPIA_PADRAO), true)
  assert.equal(s.copiaPermitida('ara', LIMITE_COPIA_PADRAO + 1), false)
  assert.equal(s.copiaPermitida('desconhecida', LIMITE_COPIA_PADRAO + 1), false)
  assert.equal(lerLimiteCopia('40'), 40)
  for (const ruim of [undefined, '', 'abc', '0', '501', '2.5']) assert.equal(lerLimiteCopia(ruim), LIMITE_COPIA_PADRAO)
})
