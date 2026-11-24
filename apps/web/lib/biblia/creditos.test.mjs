// Rodapé único de créditos das traduções (decisão N43): lib/biblia/creditos.ts.
// Rodar (a partir de apps/web):
//   node --import ./lib/caderno/testes/registrar.mjs --test lib/biblia/creditos.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { creditoCurto, montarCreditos, chaveCreditos } = await import('./creditos.ts')
const { versaoPorId } = await import('./versoes.ts')

test('crédito curto: licenciadas com o copyright curto, abertas com a licença', () => {
  assert.equal(creditoCurto(versaoPorId('nvi')), 'NVI © Biblica, Inc.')
  assert.equal(creditoCurto(versaoPorId('ara')), 'ARA © SBB')
  assert.equal(creditoCurto(versaoPorId('blivre')), 'BLIVRE (CC BY 4.0 BR)')
  assert.equal(creditoCurto(versaoPorId('kjv'), 'public domain'), 'KJV (public domain)')
})

test('rodapé: sem repetir versões, licenciadas antes, completo vindo da API', () => {
  const linhas = montarCreditos([
    { versao: 'blivre' },
    { versao: 'ara', completo: null },
    { versao: 'nvi', completo: 'NVI COMPLETO DA API' },
    { versao: 'ara', completo: 'ARA COMPLETO DA API' },
    { versao: 'nvi', completo: 'outro' },
    { versao: 'blivre' },
    { versao: 'desconhecida' },
  ])
  assert.deepEqual(linhas.map((l) => l.versao.id), ['nvi', 'ara', 'blivre'])
  assert.equal(linhas[0].completo, 'NVI COMPLETO DA API')
  assert.equal(linhas[1].completo, 'ARA COMPLETO DA API', 'o completo da API substitui o texto de reserva')
  assert.equal(linhas[2].completo, versaoPorId('blivre').credito)
  assert.equal(linhas.map((l) => l.curto).join('; '), 'NVI © Biblica, Inc.; ARA © SBB; BLIVRE (CC BY 4.0 BR)')
  assert.equal(montarCreditos([]).length, 0)
  assert.equal(chaveCreditos(linhas), chaveCreditos(montarCreditos([{ versao: 'ara', completo: 'ARA COMPLETO DA API' }, { versao: 'nvi', completo: 'NVI COMPLETO DA API' }, { versao: 'blivre' }])))
})
