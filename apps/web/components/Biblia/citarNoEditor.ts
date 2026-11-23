/**
 * Operações de citação bíblica dentro de um editor TipTap (Caderno e editor
 * de discussões). Sem React: roda igual nos testes do Node.
 *
 * - inserirCitacao: o bloco da citação completa onde está o cursor.
 * - mencaoDoLink: a faixa do documento de uma referência decorada
 *   (a[data-biblia-ref]), incluindo o " (SIGLA)" que vier logo depois.
 * - citacaoNoLugar: transforma uma menção em citação completa (item 2.3).
 *   Se o parágrafo é só a menção, ele vira o bloco; se a menção está numa
 *   frase, a frase fica como está e o bloco entra logo depois dela.
 * - trocarVersaoDaMencao: troca (ou acrescenta) a sigla depois da referência.
 */
import type { Editor } from '@tiptap/core'
import { fimDaMencao } from '@/lib/biblia/citacao'

type NoJson = { type: string; attrs?: Record<string, unknown>; content?: NoJson[]; text?: string }

export interface FaixaMencao {
  /** início da referência no documento */
  from: number
  /** fim da referência (sem a sigla) */
  fimRef: number
  /** fim da menção (com " (SIGLA)", se houver) */
  to: number
  sigla: string | null
}

export function inserirCitacao(editor: Editor, bloco: NoJson): boolean {
  return editor.chain().focus().insertContent([bloco, { type: 'paragraph' }]).run()
}

export function inserirMencao(editor: Editor, texto: string): boolean {
  const { $from } = editor.state.selection
  const antes = $from.parent.isTextblock ? $from.parent.textBetween(Math.max(0, $from.parentOffset - 1), $from.parentOffset) : ''
  const espaco = antes && !/\s/.test(antes) ? ' ' : ''
  return editor.chain().focus().insertContent(`${espaco}${texto} `).run()
}

/** Faixa da menção a partir do link decorado; null se o link não está neste editor. */
export function mencaoDoLink(editor: Editor, link: HTMLElement): FaixaMencao | null {
  if (!editor.view.dom.contains(link)) return null
  let from: number
  try {
    from = editor.view.posAtDOM(link, 0)
  } catch {
    return null
  }
  const texto = link.textContent ?? ''
  if (!texto) return null
  const fimRef = from + texto.length
  const doc = editor.state.doc
  if (fimRef > doc.content.size || doc.textBetween(from, fimRef) !== texto) return null
  const $fim = doc.resolve(fimRef)
  const bloco = $fim.parent
  const offset = $fim.parentOffset
  const { fim, sigla } = fimDaMencao(bloco.textBetween(0, bloco.content.size, '\n', ' '), offset)
  return { from, fimRef, to: fimRef + (fim - offset), sigla }
}

/** Menção → citação completa no lugar. */
export function citacaoNoLugar(editor: Editor, faixa: FaixaMencao, bloco: NoJson): boolean {
  const doc = editor.state.doc
  const $from = doc.resolve(faixa.from)
  const paragrafo = $from.parent
  if (!paragrafo.isTextblock) return false
  const inicio = $from.before()
  const fim = $from.after()
  const resto = (paragrafo.textContent.slice(0, $from.parentOffset) + paragrafo.textContent.slice($from.parentOffset + (faixa.to - faixa.from)))
    .replace(/[\s.,;:!?—–-]+/g, '')
  // parágrafo que é só a menção (talvez com pontuação): vira o bloco
  if (!resto && $from.depth === 1) {
    return editor
      .chain()
      .focus()
      .insertContentAt({ from: inicio, to: fim }, [bloco, { type: 'paragraph' }])
      .run()
  }
  // menção dentro de uma frase: o bloco entra depois do bloco de topo dela
  const depoisDoTopo = $from.after(1)
  return editor.chain().focus().insertContentAt(depoisDoTopo, bloco).run()
}

/** Troca a sigla da menção (ou acrescenta " (SIGLA)"). */
export function trocarVersaoDaMencao(editor: Editor, faixa: FaixaMencao, sigla: string): boolean {
  return editor
    .chain()
    .focus()
    .insertContentAt({ from: faixa.fimRef, to: faixa.to }, ` (${sigla})`)
    .run()
}
