/**
 * Decorações do ProseMirror recalculadas só onde o documento mudou.
 *
 * As decorações de [[ligações]], #tags e referências bíblicas eram refeitas no
 * documento INTEIRO a cada transação (cada tecla). Numa nota longa, no
 * celular, isso tomava dezenas de milissegundos por tecla e o cursor
 * "engasgava" ao apagar ou digitar (item 1.5 do plano de 23/11/2026).
 *
 * Aqui o conjunto anterior é mapeado com `tr.mapping` e só os blocos de topo
 * tocados pela transação são redecorados. O resultado é o mesmo do cálculo
 * completo (o teste em decoracoesIncrementais.test.mjs compara os dois).
 */
import { Plugin, type PluginKey, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import type { Node as PMNode } from '@tiptap/pm/model'

/** Calcula as decorações de [de, ate) do documento (sempre blocos de topo inteiros). */
export type Decorador = (doc: PMNode, de: number, ate: number) => Decoration[]

/**
 * Faixas do documento NOVO tocadas pela transação, já alargadas para os blocos
 * de topo que as contêm (uma referência pode depender do bloco inteiro, como a
 * citação viva, que lê o blockquote todo). Faixas sobrepostas são unidas.
 */
export function faixasAlteradas(tr: Pick<Transaction, 'mapping' | 'doc'>): [number, number][] {
  const brutas: [number, number][] = []
  const mapas = tr.mapping.maps
  mapas.forEach((mapa, i) => {
    const resto = tr.mapping.slice(i + 1)
    mapa.forEach((_ai, _af, ni, nf) => {
      brutas.push([resto.map(ni, -1), resto.map(nf, 1)])
    })
  })
  if (!brutas.length) return []
  const doc = tr.doc
  const blocos: [number, number][] = []
  doc.forEach((no, offset) => {
    const fim = offset + no.nodeSize
    if (brutas.some(([a, b]) => fim >= a && offset <= b)) blocos.push([offset, fim])
  })
  // une blocos vizinhos (economiza passadas)
  const unidas: [number, number][] = []
  for (const [a, b] of blocos) {
    const ultima = unidas[unidas.length - 1]
    if (ultima && a <= ultima[1]) ultima[1] = Math.max(ultima[1], b)
    else unidas.push([a, b])
  }
  return unidas
}

/** Aplica uma transação a um conjunto de decorações, redecorando só o que mudou. */
export function atualizarDecoracoes(anterior: DecorationSet, tr: Transaction, decorar: Decorador): DecorationSet {
  if (!tr.docChanged) return anterior
  const faixas = faixasAlteradas(tr)
  // documento trocado quase todo (setContent, colar muito): refaz tudo
  const tamanho = tr.doc.content.size
  const tocado = faixas.reduce((s, [a, b]) => s + (b - a), 0)
  if (tocado >= tamanho * 0.9) return DecorationSet.create(tr.doc, decorar(tr.doc, 0, tamanho))
  let conjunto = anterior.map(tr.mapping, tr.doc)
  for (const [a, b] of faixas) {
    const velhas = conjunto.find(a, b, () => true).filter((d) => d.from >= a && d.to <= b)
    if (velhas.length) conjunto = conjunto.remove(velhas)
    const novas = decorar(tr.doc, a, b)
    if (novas.length) conjunto = conjunto.add(tr.doc, novas)
  }
  return conjunto
}

/** Plugin com estado de decorações incremental. */
export function pluginDecoracoes(chave: PluginKey<DecorationSet>, decorar: Decorador): Plugin<DecorationSet> {
  return new Plugin<DecorationSet>({
    key: chave,
    state: {
      init: (_, state) => DecorationSet.create(state.doc, decorar(state.doc, 0, state.doc.content.size)),
      apply: (tr, anterior) => atualizarDecoracoes(anterior, tr, decorar),
    },
    props: { decorations: (state) => chave.getState(state) },
  })
}
