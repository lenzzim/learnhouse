/**
 * Markdown → documento do Caderno: o que o @tiptap/markdown (StarterKit) não
 * entende sozinho e o Caderno suporta.
 *
 *  - tarefas `- [ ] item` / `- [x] item` → taskList/taskItem;
 *  - imagens `![alt](https://...)` e `![alt](caderno:anexo/<uuid>)` (a
 *    imagem privada exportada pelo próprio Caderno) → nó image;
 *  - destaque no formato do Obsidian `> [!note]` → nó callout;
 *  - linha só com link do YouTube/Vimeo → vídeo (nocookie / dnt=1).
 *
 * Funciona em duas etapas em volta do parser: `prepararMarkdown` troca as
 * sintaxes por marcadores que o parser preserva como texto e `ajustarDoc`
 * transforma os marcadores em nós. Sem dependências de editor (puro).
 */
import type { NoTiptap } from './conteudo'
import { analisarUrlVideo, urlImagemValida } from './video'

export interface Preparado {
  md: string
  imagens: { alt: string; src: string | null; anexo: string | null }[]
}

const TAREFA = 'CDXTAREFA'
const IMAGEM = 'CDXIMAGEM'
const RE_ANEXO = /^noteatt_[0-9a-f-]{36}$/

/** Troca tarefas e imagens por marcadores de texto (preservados pelo parser). */
export function prepararMarkdown(md: string): Preparado {
  const imagens: Preparado['imagens'] = []
  let emCodigo = false
  const linhas = (md || '').split(/\r?\n/).map((linha) => {
    if (/^\s{0,3}(```|~~~)/.test(linha)) {
      emCodigo = !emCodigo
      return linha
    }
    if (emCodigo) return linha
    let l = linha.replace(/^(\s*)[-*+] \[( |x|X)\] /, (_m, esp: string, marca: string) => `${esp}- ${TAREFA}${marca === ' ' ? 0 : 1} `)
    l = l.replace(/!\[([^\]\n]*)\]\(((?:[^()\s]|\([^()\s]*\))+)(?:\s+"[^"\n]*")?\)/g, (_m, alt: string, alvo: string) => {
      let anexo: string | null = null
      let src: string | null = null
      const m = /^caderno:anexo\/(.+)$/.exec(alvo)
      if (m && RE_ANEXO.test(m[1])) anexo = m[1]
      else src = urlImagemValida(alvo)
      if (!anexo && !src) return alt
      imagens.push({ alt: alt.trim().slice(0, 300), src, anexo })
      return `${IMAGEM}${imagens.length - 1}X`
    })
    return l
  })
  return { md: linhas.join('\n'), imagens }
}

const RE_IMAGEM = new RegExp(`${IMAGEM}(\\d+)X`, 'g')
const RE_IMAGEM_SO = new RegExp(`^\\s*${IMAGEM}(\\d+)X\\s*$`)
const RE_TAREFA = new RegExp(`^${TAREFA}([01]) ?`)

function textoSimples(no: NoTiptap): string {
  if (no.type === 'text') return no.text ?? ''
  return (no.content ?? []).map(textoSimples).join('')
}

/** Primeiro nó de texto do bloco (para ler/tirar o marcador inicial). */
function primeiroTexto(no: NoTiptap): NoTiptap | null {
  if (no.type === 'text') return no
  for (const f of no.content ?? []) {
    const t = primeiroTexto(f)
    if (t) return t
  }
  return null
}

function comoParagrafos(conteudo: NoTiptap[]): NoTiptap[] {
  // listItem do parser pode vir com texto solto (sem parágrafo)
  const out: NoTiptap[] = []
  let inline: NoTiptap[] = []
  const fechar = () => {
    if (inline.length) out.push({ type: 'paragraph', content: inline })
    inline = []
  }
  for (const c of conteudo) {
    if (c.type === 'text' || c.type === 'hardBreak') inline.push(c)
    else {
      fechar()
      out.push(c)
    }
  }
  fechar()
  return out.length ? out : [{ type: 'paragraph' }]
}

function ajustarLista(no: NoTiptap): NoTiptap {
  const itens = no.content ?? []
  const ehTarefa = itens.some((it) => RE_TAREFA.test(primeiroTexto(it)?.text ?? ''))
  if (!ehTarefa) return no
  return {
    type: 'taskList',
    content: itens.map((it) => {
      const t = primeiroTexto(it)
      const m = RE_TAREFA.exec(t?.text ?? '')
      if (t && m) t.text = (t.text ?? '').slice(m[0].length)
      return {
        type: 'taskItem',
        attrs: { checked: m?.[1] === '1' },
        content: comoParagrafos((it.content ?? []).filter((c) => !(c.type === 'text' && !c.text))),
      }
    }),
  }
}

function ajustarCitacao(no: NoTiptap): NoTiptap {
  const conteudo = [...(no.content ?? [])]
  const primeiro = conteudo[0]
  const t = primeiro ? primeiroTexto(primeiro) : null
  const m = /^\[!([A-Za-zÀ-ÿ-]+)\][+-]?[ \t]*([^\n]*)\n?/.exec(t?.text ?? '')
  if (!t || !m) return no
  t.text = (t.text ?? '').slice(m[0].length)
  if (primeiro.type === 'paragraph' && !textoSimples(primeiro).trim()) conteudo.shift()
  const titulo = m[2].trim()
  if (titulo) conteudo.unshift({ type: 'paragraph', content: [{ type: 'text', text: titulo, marks: [{ type: 'bold' }] }] })
  return { type: 'callout', content: conteudo.length ? conteudo : [{ type: 'paragraph' }] }
}

function videoDoParagrafo(no: NoTiptap): NoTiptap | null {
  const filhos = (no.content ?? []).filter((c) => !(c.type === 'text' && !(c.text ?? '').trim()))
  if (filhos.length !== 1 || filhos[0].type !== 'text') return null
  const texto = (filhos[0].text ?? '').trim()
  const v = analisarUrlVideo(texto)
  if (!v || !/^https?:\/\//i.test(texto)) return null
  if (v.tipo === 'youtube') return { type: 'youtube', attrs: { src: v.url, start: v.inicio ?? 0 } }
  return { type: 'vimeo', attrs: { id: v.id, hash: v.hash ?? null } }
}

function ajustarInline(nos: NoTiptap[], imagens: Preparado['imagens']): NoTiptap[] {
  // imagem no meio do texto: o Caderno só tem imagem em bloco → fica o alt
  return nos.map((n) => {
    if (n.type !== 'text' || !n.text || !n.text.includes(IMAGEM)) return n
    return { ...n, text: n.text.replace(RE_IMAGEM, (_m, i: string) => imagens[Number(i)]?.alt ?? '') }
  })
}

function ajustarNo(no: NoTiptap, imagens: Preparado['imagens']): NoTiptap[] {
  if (no.type === 'paragraph') {
    const texto = textoSimples(no)
    const so = RE_IMAGEM_SO.exec(texto)
    if (so) {
      const img = imagens[Number(so[1])]
      if (img) return [{ type: 'image', attrs: { src: img.src, anexo: img.anexo, alt: img.alt } }]
    }
    const video = videoDoParagrafo(no)
    if (video) return [video]
    return [{ ...no, content: no.content ? ajustarInline(no.content, imagens) : no.content }]
  }
  if (no.type === 'text') return ajustarInline([no], imagens)
  let atual = no
  if (atual.content) atual = { ...atual, content: atual.content.flatMap((c) => ajustarNo(c, imagens)) }
  if (atual.type === 'bulletList' || atual.type === 'orderedList') atual = ajustarLista(atual)
  if (atual.type === 'blockquote') atual = ajustarCitacao(atual)
  return [atual]
}

/** O ProseMirror não aceita nó de texto vazio (sobra ao tirar marcadores). */
function semTextoVazio(no: NoTiptap): NoTiptap {
  if (!no.content) return no
  return { ...no, content: no.content.filter((c) => !(c.type === 'text' && !c.text)).map(semTextoVazio) }
}

/** Converte os marcadores de `prepararMarkdown` em nós do Caderno. */
export function ajustarDoc(doc: NoTiptap, imagens: Preparado['imagens']): NoTiptap {
  const content = (doc.content ?? []).flatMap((c) => ajustarNo(c, imagens))
  // texto solto na raiz (ex.: imagem inválida do parser) vira parágrafo
  return semTextoVazio({ ...doc, type: 'doc', content: comoParagrafos(content) })
}
