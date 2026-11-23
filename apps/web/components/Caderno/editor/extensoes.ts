import { Extension, type Editor } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion from '@tiptap/suggestion'
import { MenuSugestao, type ItemSugestao, type MenuSugestaoRef } from './MenuSugestao'

export { LigacoesETags, decorarLigacoesTags } from './decoracoesCaderno'

/* ------------------------------------------------------- sugestões */

export interface FontesSugestao {
  /** Notas para [[: pode ser assíncrono (busca no servidor). */
  notas: (consulta: string) => Promise<ItemSugestao[]>
  /** Tags existentes para #. */
  tags: (consulta: string) => Promise<ItemSugestao[]>
  textos: { vazioNotas: string; vazioTags: string }
}

function renderizador(tipo: 'ligacao' | 'tag', vazio: () => string) {
  return () => {
    let componente: ReactRenderer<MenuSugestaoRef, any> | null = null
    let desmontar: (() => void) | null = null
    return {
      onStart: (props: any) => {
        componente = new ReactRenderer(MenuSugestao, {
          props: { ...props, tipo, vazio: vazio() },
          editor: props.editor as Editor,
        })
        const el = componente.element as HTMLElement
        el.style.zIndex = 'var(--z-popover)'
        desmontar = props.mount(el)
      },
      onUpdate: (props: any) => {
        componente?.updateProps({ ...props, tipo, vazio: vazio() })
      },
      onKeyDown: (props: { event: KeyboardEvent }) => {
        if (props.event.key === 'Escape') {
          desmontar?.()
          desmontar = null
          componente?.destroy()
          componente = null
          return true
        }
        return componente?.ref?.onKeyDown(props.event) ?? false
      },
      onExit: () => {
        desmontar?.()
        desmontar = null
        componente?.destroy()
        componente = null
      },
    }
  }
}

/** `[[` abre a lista de notas; escolher insere "[[Título]] ". `#` faz o mesmo com tags. */
export function criarSugestoes(fontes: () => FontesSugestao) {
  return Extension.create({
    name: 'cadernoSugestoes',
    addProseMirrorPlugins() {
      const editor = this.editor
      return [
        Suggestion<ItemSugestao, ItemSugestao>({
          editor,
          pluginKey: new PluginKey('sugestaoLigacao'),
          char: '[[',
          allowSpaces: true,
          allowedPrefixes: null,
          debounce: 150,
          allow: ({ state, range }) => {
            const trecho = state.doc.textBetween(range.from, range.to)
            if (trecho.slice(2).includes(']') || trecho.slice(2).includes('[')) return false
            // Cursor no meio de um [[...]] já fechado (setas): trocar só até o cursor
            // quebraria o link. Logo antes do "]]" continua valendo (o comando aproveita).
            const $fim = state.doc.resolve(range.to)
            const depois = $fim.parent.textBetween($fim.parentOffset, $fim.parent.content.size)
            return !/^[^[\]\n]+\]\]/.test(depois)
          },
          items: ({ query }) => fontes().notas(query),
          command: ({ editor: ed, range, props }) => {
            const titulo = props.rotulo.replace(/[[\]|]/g, '').trim()
            if (!titulo) return
            // Se o "]]" já estiver logo depois do cursor, aproveita.
            const depois = ed.state.doc.textBetween(range.to, Math.min(range.to + 2, ed.state.doc.content.size))
            const ate = depois === ']]' ? range.to + 2 : range.to
            ed.chain().focus().insertContentAt({ from: range.from, to: ate }, `[[${titulo}]] `).run()
          },
          render: renderizador('ligacao', () => fontes().textos.vazioNotas),
        }),
        Suggestion<ItemSugestao, ItemSugestao>({
          editor,
          pluginKey: new PluginKey('sugestaoTag'),
          char: '#',
          allowSpaces: false,
          debounce: 80,
          allow: ({ state, range }) => {
            // Não abre dentro de [[...]] nem em "##".
            const $pos = state.doc.resolve(range.from)
            const antes = $pos.parent.textBetween(0, $pos.parentOffset)
            return !/\[\[[^\]]*$/.test(antes) && !antes.endsWith('#')
          },
          items: ({ query }) => fontes().tags(query),
          command: ({ editor: ed, range, props }) => {
            const tag = props.rotulo.replace(/^#/, '').replace(/[^\p{L}\p{N}_\-/]/gu, '')
            if (!tag) return
            ed.chain().focus().insertContentAt(range, `#${tag} `).run()
          },
          render: renderizador('tag', () => fontes().textos.vazioTags),
        }),
      ]
    },
  })
}
