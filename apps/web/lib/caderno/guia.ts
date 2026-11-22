/**
 * Guia de Markdown do Caderno: só o que o editor do Caderno realmente faz.
 *
 * Cada exemplo diz o que digitar e o que deve acontecer. Os mesmos dados
 * alimentam a folha do guia (GuiaMarkdown.tsx) e o teste que digita cada
 * exemplo no editor de verdade (components/Caderno/editor/editor.test.mjs):
 * se um atalho deixar de funcionar, o teste quebra antes do guia mentir.
 * Textos explicativos vêm do i18n (caderno_editor.guia.*).
 *
 * Módulo PURO e SEM IMPORTS.
 */

export type NivelGuia = 'basico' | 'intermediario' | 'avancado'

/** Como conferir o exemplo no editor. */
export type Verificacao =
  | { tipo: 'bloco'; no: string; attrs?: Record<string, unknown> }
  | { tipo: 'marca'; marca: string; texto: string }
  | { tipo: 'texto'; texto: string }
  | { tipo: 'menu' }
  | { tipo: 'atalho'; tecla: string; no?: string; marca?: string; attrs?: Record<string, unknown> }

/** Desenho do "resultado" ao lado do exemplo. */
export type Previa =
  | 'h1' | 'h2' | 'h3'
  | 'negrito' | 'italico' | 'riscado' | 'sublinhado' | 'codigo'
  | 'lista' | 'numerada' | 'tarefa' | 'tarefa_feita'
  | 'citacao' | 'destaque' | 'divisor' | 'bloco_codigo'
  | 'ligacao' | 'tag' | 'referencia' | 'referencia_versao'
  | 'imagem' | 'video' | 'tabela' | 'propriedades' | 'menu' | 'quebra' | 'desfazer'

export interface ExemploGuia {
  id: string
  /** O que digitar (como o teste digita, com o espaço que dispara o atalho). */
  digitar: string
  /** Como mostrar no guia (padrão: `digitar` sem espaços nas pontas). */
  mostrar?: string
  /** Texto de exemplo do resultado (fica igual em todos os idiomas). */
  amostra?: string
  previa: Previa
  verificar: Verificacao
}

export interface SecaoGuia {
  id: string
  nivel: NivelGuia
  exemplos: ExemploGuia[]
}

export const GUIA: SecaoGuia[] = [
  {
    id: 'texto',
    nivel: 'basico',
    exemplos: [
      { id: 'negrito', digitar: '**graça**', amostra: 'graça', previa: 'negrito', verificar: { tipo: 'marca', marca: 'bold', texto: 'graça' } },
      { id: 'italico', digitar: '*fé*', amostra: 'fé', previa: 'italico', verificar: { tipo: 'marca', marca: 'italic', texto: 'fé' } },
      { id: 'riscado', digitar: '~~antes~~', amostra: 'antes', previa: 'riscado', verificar: { tipo: 'marca', marca: 'strike', texto: 'antes' } },
      { id: 'codigo', digitar: '`Rm 8:28`', amostra: 'Rm 8:28', previa: 'codigo', verificar: { tipo: 'marca', marca: 'code', texto: 'Rm 8:28' } },
    ],
  },
  {
    id: 'estrutura',
    nivel: 'basico',
    exemplos: [
      { id: 'titulo1', digitar: '# Salmo 23', amostra: 'Salmo 23', previa: 'h1', verificar: { tipo: 'bloco', no: 'heading', attrs: { level: 1 } } },
      { id: 'titulo2', digitar: '## O pastor', amostra: 'O pastor', previa: 'h2', verificar: { tipo: 'bloco', no: 'heading', attrs: { level: 2 } } },
      { id: 'titulo3', digitar: '### Versos 1-3', amostra: 'Versos 1-3', previa: 'h3', verificar: { tipo: 'bloco', no: 'heading', attrs: { level: 3 } } },
      { id: 'lista', digitar: '- oração', amostra: 'oração', previa: 'lista', verificar: { tipo: 'bloco', no: 'bulletList' } },
      { id: 'numerada', digitar: '1. ler', amostra: 'ler', previa: 'numerada', verificar: { tipo: 'bloco', no: 'orderedList' } },
      { id: 'tarefa', digitar: '[ ] ler Rute', amostra: 'ler Rute', previa: 'tarefa', verificar: { tipo: 'bloco', no: 'taskItem', attrs: { checked: false } } },
      { id: 'tarefa_feita', digitar: '[x] orar', amostra: 'orar', previa: 'tarefa_feita', verificar: { tipo: 'bloco', no: 'taskItem', attrs: { checked: true } } },
    ],
  },
  {
    id: 'blocos',
    nivel: 'intermediario',
    exemplos: [
      { id: 'citacao', digitar: '> Deus é amor', amostra: 'Deus é amor', previa: 'citacao', verificar: { tipo: 'bloco', no: 'blockquote' } },
      { id: 'destaque', digitar: '!> Lembrar', amostra: 'Lembrar', previa: 'destaque', verificar: { tipo: 'bloco', no: 'callout' } },
      { id: 'divisor', digitar: '---', previa: 'divisor', verificar: { tipo: 'bloco', no: 'horizontalRule' } },
      { id: 'bloco_codigo', digitar: '``` ', mostrar: '``` ␣', previa: 'bloco_codigo', verificar: { tipo: 'bloco', no: 'codeBlock' } },
    ],
  },
  {
    id: 'caderno',
    nivel: 'intermediario',
    exemplos: [
      { id: 'ligacao', digitar: '[[Graça]]', amostra: 'Graça', previa: 'ligacao', verificar: { tipo: 'texto', texto: '[[Graça]]' } },
      { id: 'tag', digitar: '#oração ', mostrar: '#oração', amostra: 'oração', previa: 'tag', verificar: { tipo: 'texto', texto: '#oração' } },
      { id: 'referencia', digitar: 'Jo 3:16', amostra: 'Jo 3:16', previa: 'referencia', verificar: { tipo: 'texto', texto: 'Jo 3:16' } },
      { id: 'referencia_versao', digitar: 'Jo 3:16 NVI', amostra: 'Jo 3:16 NVI', previa: 'referencia_versao', verificar: { tipo: 'texto', texto: 'Jo 3:16 NVI' } },
    ],
  },
  {
    id: 'avancado',
    nivel: 'avancado',
    exemplos: [
      { id: 'menu', digitar: '/', previa: 'menu', verificar: { tipo: 'menu' } },
      {
        id: 'imagem_link',
        digitar: '![Monte Sião](https://exemplo.org/monte.jpg) ',
        mostrar: '![descrição](https://…)',
        previa: 'imagem',
        verificar: { tipo: 'bloco', no: 'image' },
      },
      { id: 'imagem', digitar: '/imagem', previa: 'imagem', verificar: { tipo: 'menu' } },
      { id: 'video', digitar: '/vídeo', previa: 'video', verificar: { tipo: 'menu' } },
      { id: 'tabela', digitar: '/tabela', previa: 'tabela', verificar: { tipo: 'menu' } },
      { id: 'propriedades', digitar: '/propriedade', previa: 'propriedades', verificar: { tipo: 'menu' } },
    ],
  },
]

/** Atalhos de teclado (Ctrl no Windows/Linux, ⌘ no Mac). */
export const ATALHOS_TECLADO: ExemploGuia[] = [
  { id: 'k_negrito', digitar: 'Mod-b', amostra: 'graça', previa: 'negrito', verificar: { tipo: 'atalho', tecla: 'Mod-b', marca: 'bold' } },
  { id: 'k_italico', digitar: 'Mod-i', amostra: 'fé', previa: 'italico', verificar: { tipo: 'atalho', tecla: 'Mod-i', marca: 'italic' } },
  { id: 'k_sublinhado', digitar: 'Mod-u', amostra: 'paz', previa: 'sublinhado', verificar: { tipo: 'atalho', tecla: 'Mod-u', marca: 'underline' } },
  { id: 'k_riscado', digitar: 'Mod-Shift-s', amostra: 'antes', previa: 'riscado', verificar: { tipo: 'atalho', tecla: 'Mod-Shift-s', marca: 'strike' } },
  { id: 'k_codigo', digitar: 'Mod-e', amostra: 'Rm 8:28', previa: 'codigo', verificar: { tipo: 'atalho', tecla: 'Mod-e', marca: 'code' } },
  { id: 'k_titulo2', digitar: 'Mod-Alt-2', amostra: 'O pastor', previa: 'h2', verificar: { tipo: 'atalho', tecla: 'Mod-Alt-2', no: 'heading', attrs: { level: 2 } } },
  { id: 'k_lista', digitar: 'Mod-Shift-8', amostra: 'oração', previa: 'lista', verificar: { tipo: 'atalho', tecla: 'Mod-Shift-8', no: 'bulletList' } },
  { id: 'k_numerada', digitar: 'Mod-Shift-7', amostra: 'ler', previa: 'numerada', verificar: { tipo: 'atalho', tecla: 'Mod-Shift-7', no: 'orderedList' } },
  { id: 'k_tarefas', digitar: 'Mod-Shift-9', amostra: 'ler Rute', previa: 'tarefa', verificar: { tipo: 'atalho', tecla: 'Mod-Shift-9', no: 'taskList' } },
  { id: 'k_citacao', digitar: 'Mod-Shift-b', amostra: 'Deus é amor', previa: 'citacao', verificar: { tipo: 'atalho', tecla: 'Mod-Shift-b', no: 'blockquote' } },
  { id: 'k_quebra', digitar: 'Shift-Enter', previa: 'quebra', verificar: { tipo: 'atalho', tecla: 'Shift-Enter', no: 'hardBreak' } },
  { id: 'k_desfazer', digitar: 'Mod-z', previa: 'desfazer', verificar: { tipo: 'atalho', tecla: 'Mod-z' } },
]

/** "Mod-Shift-8" → "Ctrl + Shift + 8" (ou "⌘ + Shift + 8" no Mac). */
export function teclasLegiveis(tecla: string, mac: boolean): string {
  return tecla
    .split('-')
    .map((p) => {
      if (p === 'Mod') return mac ? '⌘' : 'Ctrl'
      if (p === 'Alt') return mac ? '⌥' : 'Alt'
      return p.length === 1 ? p.toUpperCase() : p
    })
    .join(' + ')
}
