/**
 * Nós próprios do editor do Caderno (só @tiptap/core, sem dependência nova):
 *
 *  - image     imagem enviada (attrs.anexo, servida por endpoint autenticado)
 *              ou por link https (attrs.src);
 *  - taskList / taskItem   lista de tarefas com caixa de seleção;
 *  - callout   destaque (caixa de anotação);
 *  - vimeo     vídeo do Vimeo (player com dnt=1);
 *  - youtube   @tiptap/extension-youtube, sempre no domínio youtube-nocookie.
 *
 * Os NodeViews são DOM puro (sem React) para funcionarem iguais no editor, na
 * leitura por link (/n/<token>), na discussion publicada e nos testes do Node.
 * Tudo que vira src de <img>/<iframe> passa por validação (lib/caderno/video):
 * conteúdo forjado pela API não consegue injetar javascript: nem domínio fora
 * da lista.
 */
import { Node, mergeAttributes, nodeInputRule, wrappingInputRule } from '@tiptap/core'
import Youtube from '@tiptap/extension-youtube'
import { embedVimeo, embedYoutube, urlImagemValida } from '@/lib/caderno/video'

const RE_ANEXO = /^noteatt_[0-9a-f-]{36}$/

export const anexoValido = (v: unknown): string | null => (typeof v === 'string' && RE_ANEXO.test(v) ? v : null)

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    cadernoImagem: {
      /** Insere uma imagem (anexo do Caderno ou link https). */
      inserirImagem: (attrs: { anexo?: string | null; src?: string | null; alt?: string }) => ReturnType
    }
    cadernoTarefas: {
      toggleTaskList: () => ReturnType
    }
    cadernoDestaque: {
      toggleCallout: () => ReturnType
    }
    cadernoVimeo: {
      inserirVimeo: (attrs: { id: string; hash?: string | null }) => ReturnType
    }
  }
}

/* ------------------------------------------------------------ imagem */

export interface OpcoesImagem {
  /**
   * Busca o arquivo de um anexo (com a credencial certa para o contexto:
   * dono, link privado ou discussion) e devolve uma URL utilizável no <img>
   * (normalmente um blob: em cache). null: só imagens por link.
   */
  carregar: ((anexo: string) => Promise<string>) | null
  rotuloErro: string
}

export const CadernoImagem = Node.create<OpcoesImagem>({
  name: 'image',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addOptions() {
    return { carregar: null, rotuloErro: 'Imagem indisponível' }
  },

  addAttributes() {
    return {
      src: {
        default: null,
        parseHTML: (el) => urlImagemValida(el.getAttribute('src') || ''),
      },
      anexo: {
        default: null,
        parseHTML: (el) => anexoValido(el.getAttribute('data-anexo')),
      },
      alt: {
        default: '',
        parseHTML: (el) => (el.getAttribute('alt') || '').slice(0, 300),
      },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'img',
        getAttrs: (el) => {
          const e = el as HTMLElement
          return anexoValido(e.getAttribute('data-anexo')) || urlImagemValida(e.getAttribute('src') || '') ? null : false
        },
      },
    ]
  },

  renderHTML({ node }) {
    const src = urlImagemValida(node.attrs.src || '')
    const anexo = anexoValido(node.attrs.anexo)
    return [
      'img',
      {
        src: anexo ? undefined : (src ?? undefined),
        'data-anexo': anexo ?? undefined,
        alt: node.attrs.alt || '',
        loading: 'lazy',
        referrerpolicy: 'no-referrer',
      },
    ]
  },

  addCommands() {
    return {
      inserirImagem:
        (attrs) =>
        ({ commands }) => {
          const anexo = anexoValido(attrs.anexo)
          const src = anexo ? null : urlImagemValida(attrs.src || '')
          if (!anexo && !src) return false
          return commands.insertContent([
            { type: this.name, attrs: { anexo, src, alt: (attrs.alt || '').slice(0, 300) } },
            { type: 'paragraph' },
          ])
        },
    }
  },

  addInputRules() {
    // ![descrição](https://...) → imagem por link
    return [
      nodeInputRule({
        find: /(?:^|\s)!\[([^\]\n]{0,300})\]\((https:\/\/[^)\s]+)\)\s$/,
        type: this.type,
        getAttributes: (m) => (urlImagemValida(m[2]) ? { src: urlImagemValida(m[2]), alt: m[1] } : false),
      }),
    ]
  },

  addNodeView() {
    const opcoes = this.options
    return ({ node }) => {
      let atual = node
      let vivo = true
      const fig = document.createElement('figure')
      fig.className = 'caderno-imagem'
      fig.setAttribute('data-caderno-imagem', '')
      const img = document.createElement('img')
      img.loading = 'lazy'
      img.decoding = 'async'
      img.draggable = false
      img.setAttribute('referrerpolicy', 'no-referrer')
      fig.append(img)

      const aplicar = () => {
        img.alt = atual.attrs.alt || ''
        const anexo = anexoValido(atual.attrs.anexo)
        const src = urlImagemValida(atual.attrs.src || '')
        img.removeAttribute('src')
        fig.removeAttribute('data-estado')
        fig.removeAttribute('title')
        if (anexo) {
          if (!opcoes.carregar) {
            fig.setAttribute('data-estado', 'erro')
            fig.title = opcoes.rotuloErro
            return
          }
          fig.setAttribute('data-estado', 'carregando')
          const pedido = anexo
          opcoes
            .carregar(anexo)
            .then((url) => {
              if (!vivo || anexoValido(atual.attrs.anexo) !== pedido) return
              img.src = url
              fig.removeAttribute('data-estado')
            })
            .catch(() => {
              if (!vivo) return
              fig.setAttribute('data-estado', 'erro')
              fig.title = opcoes.rotuloErro
            })
        } else if (src) {
          img.src = src
        } else {
          fig.setAttribute('data-estado', 'erro')
        }
      }
      img.addEventListener('error', () => {
        fig.setAttribute('data-estado', 'erro')
        fig.title = opcoes.rotuloErro
      })
      aplicar()

      return {
        dom: fig,
        update: (novo) => {
          if (novo.type !== atual.type) return false
          const mudou = novo.attrs.anexo !== atual.attrs.anexo || novo.attrs.src !== atual.attrs.src
          atual = novo
          if (mudou) aplicar()
          else img.alt = novo.attrs.alt || ''
          return true
        },
        destroy: () => {
          vivo = false
        },
      }
    }
  },
})

/* ----------------------------------------------------------- tarefas */

export interface OpcoesTarefa {
  rotuloCaixa: string
}

export const TarefaLista = Node.create({
  name: 'taskList',
  group: 'block list',
  content: 'taskItem+',

  parseHTML() {
    return [{ tag: 'ul[data-type="taskList"]', priority: 51 }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['ul', mergeAttributes(HTMLAttributes, { 'data-type': 'taskList', class: 'caderno-tarefas' }), 0]
  },

  addCommands() {
    return {
      toggleTaskList:
        () =>
        ({ commands }) =>
          commands.toggleList(this.name, 'taskItem'),
    }
  },

  addKeyboardShortcuts() {
    return { 'Mod-Shift-9': () => this.editor.commands.toggleTaskList() }
  },
})

export const TarefaItem = Node.create<OpcoesTarefa>({
  name: 'taskItem',
  content: 'paragraph block*',
  defining: true,

  addOptions() {
    return { rotuloCaixa: 'Concluída' }
  },

  addAttributes() {
    return {
      checked: {
        default: false,
        keepOnSplit: false,
        parseHTML: (el) => el.getAttribute('data-checked') === 'true',
        renderHTML: (attrs) => ({ 'data-checked': attrs.checked ? 'true' : 'false' }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'li[data-type="taskItem"]', priority: 51 }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'li',
      mergeAttributes(HTMLAttributes, { 'data-type': 'taskItem' }),
      ['label', { contenteditable: 'false' }, ['input', { type: 'checkbox', checked: node.attrs.checked ? 'checked' : null }]],
      ['div', 0],
    ]
  },

  addKeyboardShortcuts() {
    return {
      Enter: () => this.editor.commands.splitListItem(this.name),
      Tab: () => this.editor.commands.sinkListItem(this.name),
      'Shift-Tab': () => this.editor.commands.liftListItem(this.name),
    }
  },

  addInputRules() {
    // "[ ] " ou "[x] " no começo da linha → tarefa
    return [
      wrappingInputRule({
        find: /^\s*\[([ xX]?)\]\s$/,
        type: this.type,
        getAttributes: (m) => ({ checked: m[1] === 'x' || m[1] === 'X' }),
      }),
    ]
  },

  addNodeView() {
    const rotulo = this.options.rotuloCaixa
    return ({ node, getPos, editor }) => {
      let atual = node
      const li = document.createElement('li')
      li.setAttribute('data-type', 'taskItem')
      const label = document.createElement('label')
      label.contentEditable = 'false'
      const caixa = document.createElement('input')
      caixa.type = 'checkbox'
      caixa.setAttribute('aria-label', rotulo)
      const conteudo = document.createElement('div')
      label.append(caixa)
      li.append(label, conteudo)

      const refletir = () => {
        caixa.checked = !!atual.attrs.checked
        li.setAttribute('data-checked', atual.attrs.checked ? 'true' : 'false')
        caixa.disabled = !editor.isEditable
      }
      refletir()
      // não deixa o clique mover o cursor para dentro da caixa
      label.addEventListener('mousedown', (e) => e.preventDefault())
      caixa.addEventListener('change', () => {
        if (!editor.isEditable) {
          caixa.checked = !!atual.attrs.checked
          return
        }
        const pos = typeof getPos === 'function' ? getPos() : undefined
        if (typeof pos !== 'number') return
        editor
          .chain()
          .command(({ tr }) => {
            const no = tr.doc.nodeAt(pos)
            if (!no || no.type.name !== 'taskItem') return false
            tr.setNodeMarkup(pos, undefined, { ...no.attrs, checked: caixa.checked })
            return true
          })
          .run()
      })

      return {
        dom: li,
        contentDOM: conteudo,
        update: (novo) => {
          if (novo.type !== atual.type) return false
          atual = novo
          refletir()
          return true
        },
        ignoreMutation: (m) => label.contains(m.target as globalThis.Node),
      }
    }
  },
})

/* ---------------------------------------------------------- destaque */

export const Destaque = Node.create({
  name: 'callout',
  group: 'block',
  content: 'block+',
  defining: true,

  parseHTML() {
    return [{ tag: 'aside[data-type="callout"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, { 'data-type': 'callout', class: 'caderno-destaque', role: 'note' }), 0]
  },

  addCommands() {
    return {
      toggleCallout:
        () =>
        ({ commands }) =>
          commands.toggleWrap(this.name),
    }
  },

  addInputRules() {
    // "!> " no começo da linha → destaque
    return [wrappingInputRule({ find: /^\s*!>\s$/, type: this.type })]
  },
})

/* ------------------------------------------------------------ vídeos */

const SANDBOX_VIDEO = 'allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox'
const ALLOW_VIDEO = 'encrypted-media; picture-in-picture; fullscreen'

function iframeVideo(src: string, titulo: string, marca: string) {
  return [
    'div',
    { class: 'caderno-video', [marca]: '' },
    [
      'iframe',
      {
        src,
        title: titulo,
        loading: 'lazy',
        allow: ALLOW_VIDEO,
        allowfullscreen: 'true',
        sandbox: SANDBOX_VIDEO,
        referrerpolicy: 'strict-origin-when-cross-origin',
        frameborder: '0',
      },
    ],
  ] as const
}

/** YouTube sempre por youtube-nocookie.com; src fora da lista não vira iframe. */
export const VideoYoutube = Youtube.extend({
  renderHTML({ HTMLAttributes }) {
    let src = embedYoutube(String(HTMLAttributes.src || ''))
    if (!src) return ['div', { class: 'caderno-video', 'data-video-invalido': '' }]
    const inicio = Number(HTMLAttributes.start) || 0
    if (inicio > 0 && !src.includes('start=')) src += `?start=${Math.floor(inicio)}`
    return iframeVideo(src, 'YouTube', 'data-youtube-video') as any
  },
}).configure({ nocookie: true, addPasteHandler: false, inline: false })

export const VideoVimeo = Node.create({
  name: 'vimeo',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      id: { default: null },
      hash: { default: null },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-vimeo-video] iframe',
        getAttrs: (el) => {
          const m = /^https:\/\/player\.vimeo\.com\/video\/(\d{1,12})(?:\?.*?(?:[?&]h=([0-9a-f]{6,20}))?)?/i.exec(
            (el as HTMLElement).getAttribute('src') || ''
          )
          return m ? { id: m[1], hash: m[2] ?? null } : false
        },
      },
    ]
  },

  renderHTML({ node }) {
    const src = embedVimeo(String(node.attrs.id || ''), node.attrs.hash)
    if (!src) return ['div', { class: 'caderno-video', 'data-video-invalido': '' }]
    return iframeVideo(src, 'Vimeo', 'data-vimeo-video') as any
  },

  addCommands() {
    return {
      inserirVimeo:
        (attrs) =>
        ({ commands }) => {
          if (!embedVimeo(attrs.id, attrs.hash)) return false
          return commands.insertContent([{ type: this.name, attrs: { id: attrs.id, hash: attrs.hash ?? null } }, { type: 'paragraph' }])
        },
    }
  },
})
