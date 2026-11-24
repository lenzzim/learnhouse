/**
 * Recuo de listas do Caderno (marcadores, numeradas e tarefas): "Aumentar
 * recuo" (sinkListItem) e "Diminuir recuo" (liftListItem), na barra, no menu
 * "/" e com Tab / Shift+Tab.
 *
 * - Tab e Shift+Tab só agem com o cursor numa lista: fora dela (e dentro de
 *   uma tabela, onde o Tab passa de célula) não fazem nada aqui, e o Tab
 *   segue o caminho normal (foco, célula seguinte).
 * - Dentro de uma lista o Tab é sempre consumido, mesmo quando não dá para
 *   recuar (o primeiro item não tem onde entrar): sair do editor no meio de
 *   uma lista era a surpresa.
 * - "Diminuir" só vale num item já recuado: no primeiro nível ele não tira o
 *   item da lista (para isso há o botão da lista).
 *
 * Sem React: roda igual no editor e nos testes do Node.
 */
import { Extension, type Editor } from '@tiptap/core'

const ITENS = ['listItem', 'taskItem']
const CELULAS = ['tableCell', 'tableHeader']

export type DirecaoRecuo = 1 | -1

/** Item de lista onde está o cursor (o mais próximo) e quantos itens o envolvem. */
export function itemDeLista(editor: Editor): { tipo: string; nivel: number } | null {
  const { $from } = editor.state.selection
  let tipo: string | null = null
  let nivel = 0
  for (let d = $from.depth; d > 0; d--) {
    const nome = $from.node(d).type.name
    if (!tipo && CELULAS.includes(nome)) return null // tabela dentro da lista: o Tab é da tabela
    if (ITENS.includes(nome)) {
      if (!tipo) tipo = nome
      nivel++
    }
  }
  return tipo ? { tipo, nivel } : null
}

export function podeRecuar(editor: Editor, direcao: DirecaoRecuo): boolean {
  if (!editor.isEditable) return false
  const item = itemDeLista(editor)
  if (!item) return false
  if (direcao === 1) return editor.can().sinkListItem(item.tipo)
  return item.nivel > 1 && editor.can().liftListItem(item.tipo)
}

export function recuar(editor: Editor, direcao: DirecaoRecuo): boolean {
  if (!podeRecuar(editor, direcao)) return false
  const item = itemDeLista(editor) as { tipo: string }
  const c = editor.chain().focus()
  return direcao === 1 ? c.sinkListItem(item.tipo).run() : c.liftListItem(item.tipo).run()
}

export const RecuoListas = Extension.create({
  name: 'recuoListas',
  // antes do Tab do ListItem/TaskItem (que devolve false e deixa o foco sair)
  priority: 1000,
  addKeyboardShortcuts() {
    const tecla = (direcao: DirecaoRecuo) => () => {
      if (!itemDeLista(this.editor)) return false
      recuar(this.editor, direcao)
      return true
    }
    return { Tab: tecla(1), 'Shift-Tab': tecla(-1) }
  },
})
