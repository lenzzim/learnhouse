// Testes dos utilitários puros do Caderno.
// Rodar (a partir de apps/web):  node --test lib/caderno/conteudo.test.mjs
// .mjs pelo mesmo motivo de lib/biblia/referencias.test.mjs (TS5097).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  dataLocal,
  dataValida,
  dataBR,
  mesVizinho,
  rotuloMes,
  gradeDoMes,
  lerDoc,
  textoDoDoc,
  docVazio,
  extrairLigacoes,
  extrairTags,
  titulosDoDoc,
  modeloTcd,
  textoParaDoc,
  tituloImportado,
  arvoreColecoes,
  ehDescendente,
} from './conteudo.ts'

test('datas locais e validação', () => {
  assert.equal(dataLocal(new Date(2026, 0, 5)), '2026-01-05')
  assert.ok(dataValida('2026-02-28'))
  assert.ok(!dataValida('2026-02-30'))
  assert.ok(!dataValida('26-02-01'))
  assert.ok(!dataValida(null))
  assert.equal(dataBR('2026-11-21'), '21/11/2026')
  assert.equal(mesVizinho('2026-01', -1), '2025-12')
  assert.equal(mesVizinho('2026-12', 1), '2027-01')
})

test('cabeçalho do mês: só a primeira letra maiúscula', () => {
  assert.equal(rotuloMes('2026-11', 'pt-BR'), 'Novembro de 2026')
  assert.equal(rotuloMes('2027-01', 'pt-BR'), 'Janeiro de 2027')
  assert.equal(rotuloMes('2026-11', 'en'), 'November 2026')
})

test('grade do mês começa no domingo e completa semanas', () => {
  const g = gradeDoMes('2026-11') // 1/11/2026 é domingo
  assert.equal(g[0][0], '2026-11-01')
  assert.ok(g.every((s) => s.length === 7))
  assert.equal(g.flat().filter(Boolean).length, 30)
  const fev = gradeDoMes('2026-02') // 1/2/2026 é domingo
  assert.equal(fev[0][0], '2026-02-01')
  const dez = gradeDoMes('2026-12') // 1/12/2026 é terça
  assert.deepEqual(dez[0].slice(0, 2), [null, null])
  assert.equal(dez[0][2], '2026-12-01')
})

test('texto do documento: um bloco por linha, hardBreak vira quebra', () => {
  const doc = {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Leitura' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Jo 3:16 ' }, { type: 'text', text: 'amor', marks: [{ type: 'bold' }] }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }] },
    ],
  }
  assert.equal(textoDoDoc(doc), 'Leitura\nJo 3:16 amor\nitem\na\nb')
  assert.ok(docVazio({ type: 'doc', content: [{ type: 'paragraph' }] }))
  assert.ok(!docVazio(doc))
})

test('lerDoc aceita JSON do TipTap e texto puro antigo', () => {
  assert.equal(lerDoc('').type, 'doc')
  assert.equal(lerDoc('{"type":"doc","content":[]}').content.length, 0)
  const puro = lerDoc('linha 1\n\nlinha 2')
  assert.equal(puro.content.length, 2)
})

test('[[ligações]]: alias, repetição e títulos com espaço', () => {
  const t = 'Ver [[Graça de Deus]] e [[graça de deus|a graça]] e [[Fé]] mas não [[]] nem [[a\nb]]'
  assert.deepEqual(extrairLigacoes(t), ['Graça de Deus', 'Fé'])
})

test('#tags: acentos, sem URL/âncora, sem o que está em [[ ]]', () => {
  const t = '#oração e #perdão-diário, http://x.com/#ancora, a#b, [[#nao]] ##duplo #Oração #fim.'
  assert.deepEqual(extrairTags(t), ['oração', 'perdão-diário', 'fim'])
})

test('sumário a partir dos headings', () => {
  const doc = modeloTcd(['Leitura', 'Observação', 'Aplicação', 'Oração'])
  const ts = titulosDoDoc(doc)
  assert.deepEqual(ts.map((x) => x.texto), ['Leitura', 'Observação', 'Aplicação', 'Oração'])
  assert.equal(ts[3].indice, 3)
  assert.equal(doc.content.length, 8)
})

test('importação de .txt', () => {
  const doc = textoParaDoc('﻿Primeiro\r\nsegunda linha\r\n\r\n\r\nOutro parágrafo\n')
  assert.equal(doc.content.length, 2)
  assert.deepEqual(doc.content[0].content.map((n) => n.type), ['text', 'hardBreak', 'text'])
  assert.equal(textoParaDoc('   \n\n ').content.length, 1)
  assert.equal(tituloImportado('estudo.md', 'texto\n# Sobre o perdão\n'), 'Sobre o perdão')
  assert.equal(tituloImportado('Meu estudo.docx'), 'Meu estudo')
})

test('árvore de coleções: ordem, órfãos e ciclos', () => {
  const lista = [
    { collection_uuid: 'a', name: 'Virtudes', parent_uuid: null, position: 1 },
    { collection_uuid: 'b', name: 'Pecados', parent_uuid: null, position: 0 },
    { collection_uuid: 'c', name: 'Orgulho', parent_uuid: 'b', position: 0 },
    { collection_uuid: 'd', name: 'Órfã', parent_uuid: 'zzz', position: 5 },
    { collection_uuid: 'e', name: 'Ciclo1', parent_uuid: 'f', position: 0 },
    { collection_uuid: 'f', name: 'Ciclo2', parent_uuid: 'e', position: 0 },
  ]
  const arv = arvoreColecoes(lista)
  assert.deepEqual(arv.slice(0, 3).map((n) => n.name), ['Pecados', 'Virtudes', 'Órfã'])
  assert.equal(arv[0].filhos[0].name, 'Orgulho')
  assert.equal(arv[0].filhos[0].nivel, 1)
  assert.ok(ehDescendente(lista, 'b', 'c'))
  assert.ok(ehDescendente(lista, 'b', 'b'))
  assert.ok(!ehDescendente(lista, 'c', 'b'))
})

import { docDoModelo, pareceMarkdown, MODELOS_PRONTOS } from './conteudo.ts'

test('modelos: h3 + parágrafo por seção; gratidão vira lista de 3', () => {
  const d = docDoModelo(['Escritura', 'Observação', 'Aplicação', 'Oração'])
  assert.equal(d.content.length, 8)
  assert.equal(d.content[0].attrs.level, 3)
  const g = docDoModelo(['Três motivos de gratidão'], 'ordenada')
  assert.equal(g.content[1].type, 'orderedList')
  assert.equal(g.content[1].content.length, 3)
  assert.ok(MODELOS_PRONTOS.some((m) => m.id === 'soap'))
  assert.equal(docDoModelo([]).content.length, 1)
})

test('colar: detecta markdown, ignora texto comum', () => {
  assert.ok(pareceMarkdown('# Título\n\ntexto'))
  assert.ok(pareceMarkdown('- um\n- dois'))
  assert.ok(pareceMarkdown('isso é **forte**'))
  assert.ok(pareceMarkdown('veja [site](https://x.com)'))
  assert.ok(!pareceMarkdown('Jo 3:16 diz que Deus amou o mundo.'))
  assert.ok(!pareceMarkdown('linha um\nlinha dois'))
  assert.ok(!pareceMarkdown('#oração de hoje'))
})
