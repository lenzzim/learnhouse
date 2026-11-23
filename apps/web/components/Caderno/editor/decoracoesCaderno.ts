import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { Decoration, type DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { pluginDecoracoes } from '@/lib/editor/decoracoesIncrementais'
import { RE_LIGACAO, RE_TAG } from '@/lib/caderno/conteudo'

/**
 * [[ligações]] e #tags no editor do Caderno.
 *
 * Ficam no documento como TEXTO (igual ao Obsidian): sobrevivem a importar e
 * exportar .md e o servidor extrai links e tags do texto ao salvar. Aqui elas
 * só ganham aparência e comportamento por DECORAÇÕES (nada é gravado a mais).
 * O clique é tratado pelo EditorNota (a[data-nota-titulo], a[data-nota-tag]).
 */

const chaveDecoracoes = new PluginKey<DecorationSet>('cadernoLigacoesTags')

export function decorarLigacoesTags(doc: PMNode, de: number, ate: number): Decoration[] {
  const decos: Decoration[] = []
  doc.nodesBetween(de, ate, (node, pos) => {
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
  return decos
}

export const LigacoesETags = Extension.create({
  name: 'cadernoLigacoesTags',
  addProseMirrorPlugins() {
    return [
      pluginDecoracoes(chaveDecoracoes, decorarLigacoesTags),
    ]
  },
})

