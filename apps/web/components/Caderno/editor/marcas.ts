import { Mark, markInputRule, markPasteRule, mergeAttributes } from '@tiptap/core'
import { COR_MARCA_PADRAO, corValida, type Cor } from '@/lib/caderno/cores'

/**
 * Marca-texto e cor do texto do Caderno (item 2.4), sem dependência nova.
 *
 * O documento guarda só o nome do tom (verde, azul, rosa, grafite): o HTML
 * sai como <mark data-cor> / <span data-cor> e a cor vem do CSS por tema.
 * Qualquer valor fora da paleta é descartado (marca-texto cai no verde; cor
 * do texto some), no editor, na leitura por link e na discussion publicada.
 */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    marcaTexto: {
      /** Liga o marca-texto no tom (padrão: verde). */
      setMarcaTexto: (cor?: Cor) => ReturnType
      /** Liga/desliga o marca-texto. */
      toggleMarcaTexto: (cor?: Cor) => ReturnType
      unsetMarcaTexto: () => ReturnType
    }
    corTexto: {
      setCorTexto: (cor: Cor) => ReturnType
      unsetCorTexto: () => ReturnType
    }
  }
}

/** `==texto==` digitado (o espaço/caractere seguinte fecha). Mesma regra do Obsidian. */
export const RE_MARCA_DIGITADA = /(?:^|\s)(==(?!\s+==)([^=]+)==(?!\s+==))$/
export const RE_MARCA_COLADA = /(?:^|\s)(==(?!\s+==)([^=]+)==(?!\s+==))/g

export const MarcaTexto = Mark.create({
  name: 'highlight',
  // Marca-texto por fora da cor do texto (o fundo envolve o span colorido).
  priority: 1001,

  addAttributes() {
    return {
      cor: {
        default: COR_MARCA_PADRAO,
        parseHTML: (el) => corValida(el.getAttribute('data-cor')) ?? COR_MARCA_PADRAO,
        renderHTML: (attrs) => ({ 'data-cor': corValida(attrs.cor) ?? COR_MARCA_PADRAO }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'mark' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['mark', mergeAttributes({ class: 'caderno-marca' }, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setMarcaTexto:
        (cor) =>
        ({ commands }) =>
          commands.setMark(this.name, { cor: corValida(cor) ?? COR_MARCA_PADRAO }),
      toggleMarcaTexto:
        (cor) =>
        ({ commands, editor }) => {
          const alvo = corValida(cor) ?? COR_MARCA_PADRAO
          // mesmo tom já aplicado: desliga; outro tom: troca
          if (editor.isActive(this.name, { cor: alvo })) return commands.unsetMark(this.name)
          return commands.setMark(this.name, { cor: alvo })
        },
      unsetMarcaTexto:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    }
  },

  addKeyboardShortcuts() {
    return { 'Mod-Shift-h': () => this.editor.commands.toggleMarcaTexto() }
  },

  addInputRules() {
    return [markInputRule({ find: RE_MARCA_DIGITADA, type: this.type })]
  },

  addPasteRules() {
    return [markPasteRule({ find: RE_MARCA_COLADA, type: this.type })]
  },
})

export const CorTexto = Mark.create({
  name: 'corTexto',

  addAttributes() {
    return {
      cor: {
        default: null,
        parseHTML: (el) => corValida(el.getAttribute('data-cor')),
        renderHTML: (attrs) => {
          const cor = corValida(attrs.cor)
          return cor ? { 'data-cor': cor } : {}
        },
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-cor]',
        getAttrs: (el) => (corValida((el as HTMLElement).getAttribute('data-cor')) ? null : false),
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'caderno-cor' }, HTMLAttributes), 0]
  },

  addCommands() {
    return {
      setCorTexto:
        (cor) =>
        ({ commands }) => {
          const valida = corValida(cor)
          return valida ? commands.setMark(this.name, { cor: valida }) : commands.unsetMark(this.name)
        },
      unsetCorTexto:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),
    }
  },
})
