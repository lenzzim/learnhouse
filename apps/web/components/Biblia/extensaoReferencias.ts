import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'
import { codigoReferencia, encontrarReferencias } from '@/lib/biblia/referencias'
import { hrefLeitor } from '@/lib/biblia/dados'
import { versaoPorSigla } from '@/lib/biblia/versoes'
import { criarCitacaoViva, lerCitacaoLicenciada } from './citacaoViva'

/**
 * Transforma referências bíblicas do texto ("Jo 3:16", "Sl 23"...) em links
 * para o leitor, como DECORAÇÕES do ProseMirror: nada é gravado no documento
 * (o conteúdo salvo não muda) e não mexemos no DOM que o ProseMirror controla
 * (o que dispararia o DOMObserver dele). Pula texto dentro de link, de código
 * inline e de bloco de código.
 *
 * O comportamento (popover, navegação) fica em <ReferenciasNoTexto>, que
 * envolve o EditorContent e escuta os eventos dos links `a[data-biblia-ref]`.
 *
 * Uma referência seguida de "(SIGLA)" ("Jo 3:16 (ARA)") leva a versão no link
 * (data-biblia-versao). Um blockquote que é só "— João 3:16-18 (ARA)" de uma
 * versão licenciada ganha um widget com o texto buscado na hora (ver
 * citacaoViva.ts): o post guarda a referência, nunca o texto licenciado.
 */

/** "(ARA)" logo depois da posição `fim` -> id da versão citada; senão undefined. */
export function versaoCitadaApos(texto: string, fim: number): string | undefined {
  const m = /^\s*\(([A-Za-z0-9]{2,8})\)/.exec(texto.slice(fim))
  return m ? versaoPorSigla(m[1])?.id : undefined
}

export const CLASSE_REF = 'biblia-ref'
const chave = new PluginKey<DecorationSet>('referenciasBiblicas')

function decorar(doc: PMNode): DecorationSet {
  const decos: Decoration[] = []
  doc.descendants((node, pos) => {
    if (node.type.spec.code) return false
    if (node.type.name === 'blockquote') {
      const citacao = lerCitacaoLicenciada(node.textContent)
      if (citacao) {
        decos.push(
          Decoration.widget(pos + 1, () => criarCitacaoViva(citacao), {
            side: -1,
            key: `citacao:${citacao.versao}:${citacao.codigo}`,
            ignoreSelection: true,
          })
        )
      }
      return true
    }
    if (!node.isTextblock) return true

    // junta nós de texto vizinhos elegíveis (ex.: "Jo 3:16" com parte em negrito)
    let texto = ''
    let base = -1
    const fechar = () => {
      if (texto) {
        for (const r of encontrarReferencias(texto)) {
          const codigo = codigoReferencia(r)
          const versao = versaoCitadaApos(texto, r.fim)
          const attrs: Record<string, string> = {
            nodeName: 'a',
            href: hrefLeitor(codigo, versao),
            class: CLASSE_REF,
            'data-biblia-ref': codigo,
          }
          if (versao) attrs['data-biblia-versao'] = versao
          decos.push(Decoration.inline(base + r.inicio, base + r.fim, attrs))
        }
      }
      texto = ''
      base = -1
    }
    node.forEach((filho, offset) => {
      const elegivel =
        filho.isText && !filho.marks.some((m) => m.type.name === 'link' || m.type.name === 'code')
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

export const ReferenciasBiblicas = Extension.create({
  name: 'referenciasBiblicas',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: chave,
        state: {
          init: (_, state) => decorar(state.doc),
          apply: (tr, anterior) => (tr.docChanged ? decorar(tr.doc) : anterior),
        },
        props: {
          decorations: (state) => chave.getState(state),
        },
      }),
    ]
  },
})

export default ReferenciasBiblicas
