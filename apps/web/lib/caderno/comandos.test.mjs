// Testes da busca do menu de comandos "/".
// Rodar (a partir de apps/web):
//   node --import ./lib/caderno/testes/registrar.mjs --test lib/caderno/comandos.test.mjs
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COMANDOS, filtrarComandos, normalizar } from './comandos.ts'

const ROTULOS = {
  texto: 'Texto',
  titulo1: 'Título 1',
  titulo2: 'Título 2',
  titulo3: 'Título 3',
  titulo4: 'Título 4',
  marca_texto: 'Marca-texto',
  cor_texto: 'Cor do texto',
  lista: 'Lista',
  lista_numerada: 'Lista numerada',
  tarefas: 'Lista de tarefas',
  citacao: 'Citação',
  destaque: 'Destaque',
  divisor: 'Divisor',
  codigo: 'Código',
  tabela: 'Tabela',
  imagem: 'Imagem',
  video: 'Vídeo',
  versiculo: 'Versículo',
  ligacao: 'Ligação [[ ]]',
  tag: 'Tag',
  data_hoje: 'Data de hoje',
  modelo: 'Modelo',
  propriedade: 'Propriedade',
  guia: 'Guia de Markdown',
}
const rotulo = (c) => ROTULOS[c.id]
const ids = (q) => filtrarComandos(COMANDOS, q, rotulo).map((c) => c.id)

test('todos os comandos pedidos existem, sem repetição', () => {
  const lista = COMANDOS.map((c) => c.id)
  assert.equal(new Set(lista).size, lista.length)
  assert.deepEqual([...lista].sort(), Object.keys(ROTULOS).sort())
})

test('normalizar tira acento e caixa', () => {
  assert.equal(normalizar('  Título  1 '), 'titulo 1')
  assert.equal(normalizar('Citação'), 'citacao')
})

test('busca sem acento e por prefixo', () => {
  assert.deepEqual(ids('titulo').slice(0, 3), ['titulo1', 'titulo2', 'titulo3'])
  assert.equal(ids('citacao')[0], 'citacao')
  assert.equal(ids('CITAÇÃO')[0], 'citacao')
  assert.equal(ids('versic')[0], 'versiculo')
  assert.equal(ids('video')[0], 'video')
  assert.equal(ids('cod')[0], 'codigo')
})

test('palavras de busca em outros idiomas e sinônimos', () => {
  assert.ok(ids('todo').includes('tarefas'))
  assert.ok(ids('checkbox').includes('tarefas'))
  assert.ok(ids('youtube').includes('video'))
  assert.ok(ids('callout').includes('destaque'))
  assert.ok(ids('hoje').includes('data_hoje'))
  assert.ok(ids('foto').includes('imagem'))
  assert.ok(ids('markdown').includes('guia'))
})

test('rótulo vence palavra de busca; ordem estável; nada encontrado', () => {
  // "lista" casa com 3 rótulos; a ordem original é mantida
  assert.deepEqual(ids('lista'), ['lista', 'lista_numerada', 'tarefas'])
  assert.deepEqual(ids('xyzw'), [])
  assert.equal(ids('').length, COMANDOS.length)
})
