import { Extension, type Editor } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import Suggestion from '@tiptap/suggestion'
import { RE_LIGACAO, RE_TAG } from '@/lib/caderno/conteudo'
import { MenuSugestao, type ItemSugestao, type MenuSugestaoRef } from './MenuSugestao'

/**
 * [[ligações]] e #tags no editor do Caderno.
 *
 * Ficam no documento como TEXTO (igual ao Obsidian): sobrevivem a importar e
 * exportar .md e o servidor extrai links e tags do texto ao salvar. Aqui elas
 * só ganham aparência e comportamento por DECORAÇÕES (nada é gravado a mais).
 * O clique é tratado pelo EditorNota (a[data-nota-titulo], a[data-nota-tag]).
 */

const chaveDecoracoes = new PluginKey<DecorationSet>('cadernoLigacoesTags')

function decorar(doc: PMNode): DecorationSet {
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.spec.code) return false
    if (!node.isTextblock) return true
    let texto = ''
    let base = -1
    const fechar = () => {
      if (texto) {
        const ocupados: [number, number][] = []
        for (const m of texto.matchAll(RE_LIGACAO)) {
          const ini = m.index ?? 0
          const fim = ini + m[0].length
          ocupados.push([ini, fim])
          decos.push(
            Decoration.inline(base + ini, base + fim, {
              nodeName: 'a',
              href: '#',
              class: 'nota-ligacao',
              'data-nota-titulo': m[1].trim(),
            })
          )
        }
        for (const m of texto.matchAll(RE_TAG)) {
          const ini = m.index ?? 0
          if (ocupados.some(([a, b]) => ini >= a && ini < b)) continue
          const tag = m[1].replace(/[-/]+$/, '')
          decos.push(
            Decoration.inline(base + ini, base + ini + tag.length + 1, {
              nodeName: 'a',
              href: '#',
              class: 'nota-tag',
              'data-nota-tag': tag,
            })
          )
        }
      }
      texto = ''
      base = -1
    }
    node.forEach((filho, offset) => {
      const elegivel = filho.isText && !filho.marks.some((m) => m.type.name === 'code' || m.type.name === 'link')
      if (elegivel) {
        if (base < 0) base = pos + 1 + offset
        texto += filho.text ?? ''
      } else {
        fechar()
      }
    })
    fechar()
    return false
  })
  return DecorationSet.create(doc, decos)
}

export const LigacoesETags = Extension.create({
  name: 'cadernoLigacoesTags',
  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: chaveDecoracoes,
        state: {
          init: (_, state) => decorar(state.doc),
          apply: (tr, anterior) => (tr.docChanged ? decorar(tr.doc) : anterior),
        },
        props: { decorations: (state) => chaveDecoracoes.getState(state) },
      }),
    ]
  },
})

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
