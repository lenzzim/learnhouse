/**
 * Menu de comandos "/" do Caderno (estilo Notion), sobre @tiptap/suggestion.
 *
 * Este arquivo não tem React: o desenho do menu vem de fora (`render`, ver
 * MenuComandos.tsx) e os comandos que abrem diálogo (imagem, vídeo,
 * versículo, modelo, propriedade, guia) são entregues a `aoPedir`. Assim a
 * lógica de blocos roda igual no editor e nos testes do Node.
 */
import { Extension, type Editor, type Range } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion, { exitSuggestion, type SuggestionOptions } from '@tiptap/suggestion'
import type { IdComando } from '@/lib/caderno/comandos'

export const CHAVE_COMANDOS = new PluginKey('cadernoComandos')

/** Comandos que precisam de diálogo/fluxo da tela (o "/" já foi apagado). */
export const COMANDOS_COM_DIALOGO: IdComando[] = ['imagem', 'video', 'versiculo', 'modelo', 'propriedade', 'guia']

export interface ItemMenuComando {
  id: IdComando
  rotulo: string
  descricao?: string
  atalho?: string
}

export interface OpcoesBarraComandos {
  itens: (consulta: string) => ItemMenuComando[]
  render: SuggestionOptions<ItemMenuComando, ItemMenuComando>['render']
  /** Comandos com diálogo: a tela abre o fluxo. */
  aoPedir: (id: IdComando, editor: Editor) => void
  /** Texto da data de hoje (no idioma da interface). */
  dataDeHoje: () => string
}

/** Menus "/" abertos pelo botão da barra: Esc apaga o "/" inserido. */
const abertosPeloBotao = new WeakSet<Editor>()

/**
 * Executa um comando de bloco no lugar do "/consulta". Devolve false quando o
 * comando precisa de diálogo (a tela trata com `aoPedir`).
 */
export function executarComando(editor: Editor, id: IdComando, range: Range | null, dataDeHoje: () => string): boolean {
  let c = editor.chain().focus()
  if (range) c = c.deleteRange(range)
  switch (id) {
    case 'texto':
      return c.clearNodes().run()
    case 'titulo1':
      return c.setHeading({ level: 1 }).run()
    case 'titulo2':
      return c.setHeading({ level: 2 }).run()
    case 'titulo3':
      return c.setHeading({ level: 3 }).run()
    case 'lista':
      return c.toggleBulletList().run()
    case 'lista_numerada':
      return c.toggleOrderedList().run()
    case 'tarefas':
      return c.toggleTaskList().run()
    case 'citacao':
      return c.toggleBlockquote().run()
    case 'destaque':
      return c.toggleCallout().run()
    case 'divisor':
      return c.setHorizontalRule().run()
    case 'codigo':
      return c.toggleCodeBlock().run()
    case 'tabela':
      return c.insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()
    case 'data_hoje':
      return c.insertContent(dataDeHoje() + ' ').run()
    case 'ligacao':
      // abre a sugestão de notas de [[ ]]
      return c.insertContent('[[').run()
    case 'tag': {
      const ok = c.run()
      const { $from } = editor.state.selection
      const antes = $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset)
      return ok && editor.chain().focus().insertContent(antes && !/\s/.test(antes) ? ' #' : '#').run()
    }
    default:
      c.run()
      return false
  }
}

/**
 * Abre o menu "/" a partir do botão da barra (no celular digitar "/" é menos
 * óbvio). Insere o "/" no cursor (com espaço antes, se colado a uma
 * palavra); Esc ou fechar sem escolher apaga o que foi inserido.
 */
export function abrirMenuComandos(editor: Editor): void {
  if (!editor.isEditable) return
  const { $from, empty } = editor.state.selection
  let c = editor.chain().focus()
  if (!empty) c = c.deleteSelection()
  const antes = $from.parent.isTextblock ? $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset) : ''
  const precisaEspaco = !!antes && !/\s/.test(antes)
  abertosPeloBotao.add(editor)
  c.insertContent(precisaEspaco ? ' /' : '/').run()
}

/** Fecha o menu; se ele foi aberto pelo botão e nada foi digitado, apaga o "/". */
export function fecharMenuComandos(editor: Editor, range: Range | null, query: string): void {
  if (abertosPeloBotao.has(editor) && range && !query) {
    abertosPeloBotao.delete(editor)
    editor.chain().deleteRange(range).run()
  }
  abertosPeloBotao.delete(editor)
  exitSuggestion(editor.view, CHAVE_COMANDOS)
}

export function criarBarraComandos(opcoes: () => OpcoesBarraComandos) {
  return Extension.create({
    name: 'cadernoComandos',
    addProseMirrorPlugins() {
      const editor = this.editor
      return [
        Suggestion<ItemMenuComando, ItemMenuComando>({
          editor,
          pluginKey: CHAVE_COMANDOS,
          char: '/',
          allowSpaces: false,
          startOfLine: false,
          allowedPrefixes: [' ', ' '],
          allow: ({ state, range }) => {
            const $pos = state.doc.resolve(range.from)
            // nada de menu dentro de bloco de código nem de título da tabela de código
            if ($pos.parent.type.spec.code) return false
            return editor.isEditable
          },
          items: ({ query }) => opcoes().itens(query),
          command: ({ editor: ed, range, props }) => {
            abertosPeloBotao.delete(ed)
            const o = opcoes()
            if (COMANDOS_COM_DIALOGO.includes(props.id)) {
              ed.chain().focus().deleteRange(range).run()
              o.aoPedir(props.id, ed)
              return
            }
            executarComando(ed, props.id, range, o.dataDeHoje)
          },
          render: () => {
            const base = opcoes().render?.()
            return {
              ...base,
              onExit: (props) => {
                abertosPeloBotao.delete(props.editor)
                base?.onExit?.(props)
              },
            }
          },
        }),
      ]
    },
  })
}
