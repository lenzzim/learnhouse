// Bíblia na escrita (itens 2.1 e 2.2 do plano de 23/11/2026):
//  - citação completa x menção (lib/biblia/citacao.ts);
//  - NVI padrão para logado e recuo para a BLIVRE (lib/biblia/fontes.ts).
// Rodar (a partir de apps/web):
//   node --import ./lib/caderno/testes/registrar.mjs --test lib/caderno/citacaoBiblica.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { blocoCitacao, textoMencao, fimDaMencao, modoValido, textoDoBloco, linhaReferencia } = await import('../biblia/citacao.ts')
const fontes = await import('../biblia/fontes.ts')

test('citação completa: aberta leva o texto; licenciada grava só a referência', () => {
  const aberta = blocoCitacao({ referencia: 'João 3:16', sigla: 'BLIVRE', licenciada: false, texto: 'Porque Deus amou o mundo' })
  assert.equal(aberta.type, 'blockquote')
  assert.equal(aberta.content.length, 2)
  assert.equal(aberta.content[0].content[0].text, 'Porque Deus amou o mundo')
  assert.equal(aberta.content[1].content[0].text, '— João 3:16 (BLIVRE)')
  const nvi = blocoCitacao({ referencia: 'João 3:16', sigla: 'NVI', licenciada: true, texto: 'TEXTO LICENCIADO' })
  assert.equal(nvi.content.length, 1)
  assert.ok(!JSON.stringify(nvi).includes('TEXTO LICENCIADO'), 'o texto licenciado nunca entra na nota')
  assert.equal(nvi.content[0].content[0].text, linhaReferencia('João 3:16', 'NVI'))
})

test('menção: "Jo 3:16 (NVI)" e o fim da menção inclui a sigla', () => {
  assert.equal(textoMencao('Jo 3:16', 'NVI'), 'Jo 3:16 (NVI)')
  const t = 'Como diz Jo 3:16 (nvi), Deus amou.'
  const fimRef = t.indexOf('16') + 2
  assert.deepEqual(fimDaMencao(t, fimRef), { fim: t.indexOf(')') + 1, sigla: 'NVI' })
  assert.deepEqual(fimDaMencao('Jo 3:16 e mais', 7), { fim: 7, sigla: null })
  assert.equal(modoValido('mencao'), 'mencao')
  assert.equal(modoValido('x'), 'completa')
  assert.equal(textoDoBloco([{ numero: 16, texto: 'a' }, { numero: 17, texto: 'b' }]), '¹⁶ a ¹⁷ b')
})

/* ------------------------------------------------- recuo para a BLIVRE */

function respostaJson(corpo, status = 200) {
  return { ok: status < 400, status, json: async () => corpo }
}

const JHN = { id: 'JHN', nome: 'João', abrev: 'Jo', capitulos: [[], [], Array.from({ length: 36 }, (_, i) => `blivre ${i + 1}`)] }

function simularServidor({ ativo = true, disponiveis = ['nvi'], capitulo = { status: 200, codigo: null } } = {}) {
  const chamadas = []
  globalThis.fetch = async (url) => {
    const u = String(url)
    chamadas.push(u)
    if (u.endsWith('biblia/versoes')) return respostaJson({ ativo, versoes: disponiveis.map((id) => ({ id, disponivel: true, copyright: null })) })
    if (u.includes('/capitulo/')) {
      if (capitulo.status !== 200) return respostaJson({ codigo: capitulo.codigo }, capitulo.status)
      return respostaJson({ id: 'JHN', livro: 'JHN', capitulo: 3, versos: [{ numero: 16, texto: 'NVI 16' }], titulos: {}, copyright: 'NVI ©', fums: null })
    }
    if (u.includes('/biblia-dados/blivre/JHN.json')) return respostaJson(JHN)
    return respostaJson({}, 404)
  }
  fontes._reiniciarRecuo()
  return chamadas
}

const REF = { livroId: 'JHN', capitulo: 3, versoIni: 16 }

test('recuo: NVI lida normalmente quando o servidor libera', async () => {
  simularServidor()
  const r = await fontes.getVersesComRecuo('nvi', REF, { token: 't' })
  assert.equal(r.recuo, undefined)
  assert.equal(r.versos[0].texto, 'NVI 16')
})

for (const [nome, cenario, motivo] of [
  ['limite diário da API', { capitulo: { status: 429, codigo: 'limite_api' } }, 'limite_api'],
  ['limite do usuário', { capitulo: { status: 429, codigo: 'limite_usuario' } }, 'limite_usuario'],
  ['sem sessão', { capitulo: { status: 401, codigo: null } }, 'nao_autenticado'],
  ['chave ausente', { ativo: false }, 'chave_ausente'],
  ['versão desligada', { disponiveis: ['ara'] }, 'versao_indisponivel'],
]) {
  test(`recuo: ${nome} → BLIVRE com aviso, sem quebrar`, async () => {
    const chamadas = simularServidor(cenario)
    const r = await fontes.getVersesComRecuo('nvi', REF)
    assert.deepEqual(r.recuo, { de: 'nvi', para: 'blivre', motivo })
    assert.equal(r.capitulo.versao, 'blivre')
    assert.equal(r.versos[0].texto, 'blivre 16')
    if (motivo.startsWith('limite')) {
      // depois do limite, não insiste na NVI por um tempo (poupa a cota)
      const antes = chamadas.filter((u) => u.includes('/capitulo/')).length
      await fontes.getVersesComRecuo('nvi', { ...REF, capitulo: 4 }).catch(() => null)
      assert.equal(chamadas.filter((u) => u.includes('/capitulo/')).length, antes)
    }
  })
}

test('recuo: erro que não é de licença continua erro', async () => {
  simularServidor({ capitulo: { status: 500, codigo: 'erro' } })
  await assert.rejects(fontes.getVersesComRecuo('nvi', REF), (e) => e.codigo === 'erro')
})

test('só o capítulo: cita o capítulo inteiro, e o limite vale só para embutir intervalo de aberta', async () => {
  const { avaliarCitacao, MAX_VERSOS_EMBUTIR, lerLinhaCitacao } = await import('../biblia/citacao.ts')
  const { interpretarReferencia } = await import('../biblia/referencias.ts')
  const cap = interpretarReferencia('1Pedro 1')
  assert.deepEqual(cap, { livroId: '1PE', capitulo: 1 })
  for (const modo of ['completa', 'mencao']) {
    for (const licenciada of [false, true]) {
      const a = avaliarCitacao(cap, { modo, licenciada })
      assert.equal(a.capituloInteiro, true)
      assert.equal(a.excedeLimite, false, `${modo}/${licenciada}`)
    }
  }
  const salmo = interpretarReferencia('Sl 119:1-40')
  assert.equal(avaliarCitacao(salmo, { modo: 'completa', licenciada: false }).excedeLimite, true)
  assert.equal(avaliarCitacao(salmo, { modo: 'completa', licenciada: true }).excedeLimite, false)
  assert.equal(avaliarCitacao(salmo, { modo: 'mencao', licenciada: false }).excedeLimite, false)
  assert.equal(avaliarCitacao(interpretarReferencia(`Sl 119:1-${MAX_VERSOS_EMBUTIR}`), { modo: 'completa', licenciada: false }).excedeLimite, false)
  // a linha da citação licenciada de um capítulo é reconhecida (a citação viva mostra o capítulo)
  const lida = lerLinhaCitacao('— 1 Pedro 1 (NVI)')
  assert.equal(lida.versao.id, 'nvi')
  assert.deepEqual(lida.ref, { livroId: '1PE', capitulo: 1 })
  assert.equal(lerLinhaCitacao('— João 3:16-18 (ARA)').ref.versoFim, 18)
  assert.equal(lerLinhaCitacao('— João 3:16 (XYZ)'), null)
  assert.equal(lerLinhaCitacao('texto qualquer'), null)
})

test('getVerses: só o capítulo traz todos os versículos', async () => {
  const fontes = await import('../biblia/fontes.ts')
  const capitulo = Array.from({ length: 25 }, (_, i) => `texto ${i + 1}`)
  const original = globalThis.fetch
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ id: '1PE', nome: '1 Pedro', abrev: '1Pe', capitulos: [capitulo] }) })
  try {
    const { versos } = await fontes.getVerses('blivre', { livroId: '1PE', capitulo: 1 })
    assert.equal(versos.length, 25)
    assert.equal(versos[24].numero, 25)
  } finally {
    globalThis.fetch = original
  }
})
