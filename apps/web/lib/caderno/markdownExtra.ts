/**
 * Markdown → documento do Caderno: o que o @tiptap/markdown (StarterKit) não
 * entende sozinho e o Caderno suporta.
 *
 *  - tarefas `- [ ] item` / `- [x] item` → taskList/taskItem;
 *  - imagens `![alt](https://...)` e `![alt](caderno:anexo/<uuid>)` (a
 *    imagem privada exportada pelo próprio Caderno) → nó image;
 *  - destaque no formato do Obsidian `> [!note]` → nó callout;
 *  - linha só com link do YouTube/Vimeo → vídeo (nocookie / dnt=1);
 *  - marca-texto `==texto==` e `<mark data-cor="azul">texto</mark>` → marca
 *    highlight; cor do texto `<span data-cor="azul">texto</span>` → marca
 *    corTexto. Só os tons da paleta (cores.ts); outra cor vira texto puro.
 *
 * Funciona em duas etapas em volta do parser: `prepararMarkdown` troca as
 * sintaxes por marcadores que o parser preserva como texto e `ajustarDoc`
 * transforma os marcadores em nós. Sem dependências de editor (puro).
 */
import type { NoTiptap } from './conteudo'
import { analisarUrlVideo, urlImagemValida } from './video'
import { CORES, COR_MARCA_PADRAO, corValida } from './cores'

export interface Preparado {
  md: string
  imagens: { alt: string; src: string | null; anexo: string | null }[]
}

const TAREFA = 'CDXTAREFA'
const IMAGEM = 'CDXIMAGEM'
const RE_ANEXO = /^noteatt_[0-9a-f-]{36}$/
// Cor e marca-texto em HTML viram marcadores de texto: CDXCORA<i>…CDXFIMCOR e
// CDXMARCA<i>…CDXFIMMARCA (i = posição do tom em CORES).
const COR_INI = 'CDXCORA'
const COR_FIM = 'CDXFIMCOR'
const MARCA_INI = 'CDXMARCA'
const MARCA_FIM = 'CDXFIMMARCA'
const RE_SPAN_COR = /<span\s+data-cor="([a-z]+)"\s*>([\s\S]*?)<\/span>/g
const RE_MARK_COR = /<mark(?:\s+data-cor="([a-z]+)")?\s*>([\s\S]*?)<\/mark>/g

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
    let l = linha
      .replace(RE_SPAN_COR, (_m, cor: string, dentro: string) => {
        const i = CORES.indexOf(corValida(cor) as (typeof CORES)[number])
        return i < 0 ? dentro : `${COR_INI}${i}${dentro}${COR_FIM}`
      })
      .replace(RE_MARK_COR, (_m, cor: string | undefined, dentro: string) => {
        const i = CORES.indexOf(corValida(cor) ?? COR_MARCA_PADRAO)
        return `${MARCA_INI}${i}${dentro}${MARCA_FIM}`
      })
    l = l.replace(/^(\s*)[-*+] \[( |x|X)\] /, (_m, esp: string, marca: string) => `${esp}- ${TAREFA}${marca === ' ' ? 0 : 1} `)
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

const RE_TOKENS_COR = new RegExp(`${COR_INI}([0-3])|${COR_FIM}|${MARCA_INI}([0-3])|${MARCA_FIM}|==`, 'g')
const RE_SOBRA = new RegExp(`${COR_INI}[0-3]|${COR_FIM}|${MARCA_INI}[0-3]|${MARCA_FIM}`, 'g')
const SEPARADOR = '￼'

type TokenCor =
  | { pos: number; fim: number; tipo: 'cor'; cor: string }
  | { pos: number; fim: number; tipo: 'fimcor' }
  | { pos: number; fim: number; tipo: 'marca'; cor: string }
  | { pos: number; fim: number; tipo: 'fimmarca' }

const ehCodigo = (n: NoTiptap) => !!n.marks?.some((m) => m.type === 'code')

/**
 * Marcas de cor no texto corrido de um bloco: marcadores CDX… (vindos do HTML)
 * e `==marca==`. Funciona através de nós de texto (`==**amor**==`, cor por
 * fora do negrito). Um `==` só abre colado ao texto seguinte e só fecha colado
 * ao anterior; sem par, fica como texto. Nada muda dentro de `código`.
 */
function marcasDeCor(nos: NoTiptap[]): NoTiptap[] {
  let corrido = ''
  const inicio: number[] = []
  for (const n of nos) {
    inicio.push(corrido.length)
    corrido += n.type === 'text' && !ehCodigo(n) ? n.text ?? '' : SEPARADOR
  }
  const brutos: (TokenCor | { pos: number; fim: number; tipo: 'eq' })[] = []
  for (const m of corrido.matchAll(RE_TOKENS_COR)) {
    const pos = m.index ?? 0
    const fim = pos + m[0].length
    if (m[0] === '==') brutos.push({ pos, fim, tipo: 'eq' })
    else if (m[1] !== undefined) brutos.push({ pos, fim, tipo: 'cor', cor: CORES[Number(m[1])] })
    else if (m[0] === COR_FIM) brutos.push({ pos, fim, tipo: 'fimcor' })
    else if (m[2] !== undefined) brutos.push({ pos, fim, tipo: 'marca', cor: CORES[Number(m[2])] })
    else brutos.push({ pos, fim, tipo: 'fimmarca' })
  }
  // pares de `==`: abre colado ao texto seguinte, fecha colado ao anterior
  const tokens: TokenCor[] = []
  let aberto: TokenCor | null = null
  const palavra = (c: string | undefined) => !!c && /[\p{L}\p{N}_=]/u.test(c)
  const espaco = (c: string | undefined) => !c || /\s/.test(c) || c === SEPARADOR
  for (const t of brutos) {
    if (t.tipo !== 'eq') {
      tokens.push(t)
      continue
    }
    const antes = corrido[t.pos - 1]
    const depois = corrido[t.fim]
    if (!aberto && !palavra(antes) && !espaco(depois) && depois !== '=') {
      aberto = { pos: t.pos, fim: t.fim, tipo: 'marca', cor: COR_MARCA_PADRAO }
      tokens.push(aberto)
    } else if (aberto && !espaco(antes) && antes !== '=' && !palavra(depois)) {
      tokens.push({ pos: t.pos, fim: t.fim, tipo: 'fimmarca' })
      aberto = null
    }
  }
  if (aberto) tokens.splice(tokens.indexOf(aberto), 1) // `==` sem par fica no texto
  tokens.sort((x, y) => x.pos - y.pos)

  const out: NoTiptap[] = []
  let cor: string | null = null
  let marca: string | null = null
  let k = 0
  nos.forEach((n, i) => {
    if (n.type !== 'text' || ehCodigo(n)) {
      out.push(n.type === 'text' ? { ...n, text: (n.text ?? '').replace(RE_SOBRA, '') } : n)
      return
    }
    const texto = n.text ?? ''
    const base = inicio[i]
    let cursor = 0
    const emitir = (ate: number) => {
      const pedaco = texto.slice(cursor, ate).replace(RE_SOBRA, '')
      if (pedaco) {
        const marks = [...(n.marks ?? [])]
        if (marca) marks.push({ type: 'highlight', attrs: { cor: marca } })
        if (cor) marks.push({ type: 'corTexto', attrs: { cor } })
        out.push(marks.length ? { ...n, text: pedaco, marks } : { type: 'text', text: pedaco })
      }
    }
    while (k < tokens.length && tokens[k].pos < base + texto.length) {
      const t = tokens[k++]
      emitir(t.pos - base)
      cursor = t.fim - base
      if (t.tipo === 'cor') cor = t.cor
      else if (t.tipo === 'fimcor') cor = null
      else if (t.tipo === 'marca') marca = t.cor
      else marca = null
    }
    emitir(texto.length)
  })
  return out
}

function ajustarInline(nos: NoTiptap[], imagens: Preparado['imagens']): NoTiptap[] {
  // imagem no meio do texto: o Caderno só tem imagem em bloco → fica o alt
  const semImagem = nos.map((n) =>
    n.type === 'text' && n.text?.includes(IMAGEM) ? { ...n, text: n.text.replace(RE_IMAGEM, (_m, i: string) => imagens[Number(i)]?.alt ?? '') } : n
  )
  return marcasDeCor(semImagem)
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
  // bloco com texto direto (título, célula...): as marcas de cor cruzam nós de texto
  if (atual.content?.some((c) => c.type === 'text')) atual = { ...atual, content: ajustarInline(atual.content, imagens) }
  else if (atual.content) atual = { ...atual, content: atual.content.flatMap((c) => ajustarNo(c, imagens)) }
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
