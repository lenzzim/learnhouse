#!/usr/bin/env node
// Gera a tabela compacta de livros (nome, abreviação, versículos por capítulo)
// embutida em lib/biblia/referencias.ts, a partir de
// public/biblia-dados/blivre/index.json.
//
// A tabela fica DENTRO do módulo (e não num import) para que referencias.ts
// não tenha nenhum import: assim ele roda tanto no Next quanto direto no Node
// (`node --test lib/biblia/referencias.test.mjs`) sem precisar de resolução de
// extensão nem de allowImportingTsExtensions no tsconfig.
//
// Uso (a partir de apps/web):  node scripts/biblia_gerar_tabela.mjs

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const indice = JSON.parse(
  readFileSync(join(raiz, 'public/biblia-dados/blivre/index.json'), 'utf8')
)
const alvo = join(raiz, 'lib/biblia/referencias.ts')
const fonte = readFileSync(alvo, 'utf8')

const INICIO = '// <tabela-gerada>'
const FIM = '// </tabela-gerada>'
const i = fonte.indexOf(INICIO)
const f = fonte.indexOf(FIM)
if (i < 0 || f < 0) throw new Error('marcadores da tabela não encontrados em ' + alvo)

const linhas = indice.livros.map(
  (l) =>
    `  [${JSON.stringify(l.id)}, ${JSON.stringify(l.nome)}, ${JSON.stringify(l.abrev)}, '${l.versos.join(',')}'],`
)
const bloco = [
  INICIO,
  '// Gerado por scripts/biblia_gerar_tabela.mjs a partir do index.json. Não editar à mão.',
  `export const TRADUCAO = ${JSON.stringify(indice.traducao)}`,
  `export const NOME_TRADUCAO = ${JSON.stringify(indice.nome)}`,
  `export const CREDITO = ${JSON.stringify(indice.credito)}`,
  `export const LICENCA = ${JSON.stringify(indice.licenca)}`,
  'const TABELA: [string, string, string, string][] = [',
  ...linhas,
  ']',
  '',
].join('\n')

writeFileSync(alvo, fonte.slice(0, i) + bloco + fonte.slice(f), 'utf8')
console.log(`tabela gerada: ${indice.livros.length} livros`)
