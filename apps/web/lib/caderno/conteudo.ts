/**
 * Utilitários puros do Caderno: datas do TCD, texto do documento TipTap,
 * [[ligações]], #tags, sumário, árvore de coleções e importação de .txt.
 * Sem imports: roda no Node (lib/caderno/conteudo.test.mjs).
 *
 * As regras de [[ligação]] e #tag espelham o parser do servidor
 * (apps/api/src/services/notes), que é quem grava links e tags.
 */

export interface NoTiptap {
  type?: string
  text?: string
  attrs?: Record<string, any>
  marks?: { type: string; attrs?: Record<string, any> }[]
  content?: NoTiptap[]
}

export const DOC_VAZIO: NoTiptap = { type: 'doc', content: [{ type: 'paragraph' }] }

/* ------------------------------------------------------------- datas */

const pad = (n: number) => String(n).padStart(2, '0')

/** Data local (não UTC) no formato YYYY-MM-DD. */
export function dataLocal(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function dataValida(s: string | null | undefined): boolean {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [a, m, d] = s.split('-').map(Number)
  const dt = new Date(a, m - 1, d)
  return dt.getFullYear() === a && dt.getMonth() === m - 1 && dt.getDate() === d
}

/** "2026-11-21" → "21/11/2026" */
export function dataBR(s: string): string {
  const [a, m, d] = s.split('-')
  return `${d}/${m}/${a}`
}

/** "2026-11" a partir de "2026-11-21" */
export const mesDe = (data: string) => data.slice(0, 7)

/**
 * Nome do mês para o cabeçalho do calendário: rotuloMes("2026-11", "pt-BR") →
 * "Novembro de 2026". Só a primeira letra sobe (CSS capitalize faria "De").
 */
export function rotuloMes(mes: string, local: string): string {
  const [a, m] = mes.split('-').map(Number)
  const cru = new Date(a, m - 1, 1).toLocaleDateString(local, { month: 'long', year: 'numeric' })
  return cru.charAt(0).toLocaleUpperCase(local) + cru.slice(1)
}

/** Mês vizinho: mesVizinho("2026-01", -1) → "2025-12" */
export function mesVizinho(mes: string, delta: number): string {
  const [a, m] = mes.split('-').map(Number)
  const d = new Date(a, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/**
 * Semanas do mês (domingo a sábado) com as datas YYYY-MM-DD; null nos dias
 * que pertencem a outro mês.
 */
export function gradeDoMes(mes: string): (string | null)[][] {
  const [a, m] = mes.split('-').map(Number)
  const primeiro = new Date(a, m - 1, 1)
  const dias = new Date(a, m, 0).getDate()
  const semanas: (string | null)[][] = []
  let semana: (string | null)[] = Array(primeiro.getDay()).fill(null)
  for (let d = 1; d <= dias; d++) {
    semana.push(`${a}-${pad(m)}-${pad(d)}`)
    if (semana.length === 7) {
      semanas.push(semana)
      semana = []
    }
  }
  if (semana.length) semanas.push([...semana, ...Array(7 - semana.length).fill(null)])
  return semanas
}

/* --------------------------------------------------------- documento */

/** Lê o content_json salvo; texto puro antigo vira parágrafos. */
export function lerDoc(contentJson: string | null | undefined): NoTiptap {
  if (!contentJson || !contentJson.trim()) return DOC_VAZIO
  try {
    const doc = JSON.parse(contentJson)
    if (doc && typeof doc === 'object' && doc.type === 'doc') return doc
  } catch {
    /* texto puro */
  }
  return textoParaDoc(contentJson)
}

const BLOCOS = new Set([
  'paragraph',
  'heading',
  'blockquote',
  'codeBlock',
  'listItem',
  'bulletList',
  'orderedList',
  'horizontalRule',
])

/** Texto do documento: um bloco por linha. */
export function textoDoDoc(doc: NoTiptap | null | undefined): string {
  const linhas: string[] = []
  let atual = ''
  const fechar = () => {
    if (atual.trim()) linhas.push(atual.trim())
    atual = ''
  }
  const visitar = (no: NoTiptap) => {
    if (no.type === 'text') atual += no.text ?? ''
    else if (no.type === 'hardBreak') atual += '\n'
    if (no.content) {
      for (const filho of no.content) {
        visitar(filho)
        if (filho.type && BLOCOS.has(filho.type)) fechar()
      }
    }
  }
  if (doc) visitar(doc)
  fechar()
  return linhas.join('\n')
}

export function docVazio(doc: NoTiptap | null | undefined): boolean {
  return textoDoDoc(doc).trim() === ''
}

/* -------------------------------------------------- ligações e tags */

export const RE_LIGACAO = /\[\[([^[\]|\n]{1,300})(?:\|[^[\]\n]*)?\]\]/g
export const RE_TAG = /(?<![\p{L}\p{N}_&/#])#([\p{L}\p{N}_][\p{L}\p{N}_\-/]{0,49})/gu

/** Títulos citados com [[...]] (sem repetição, na ordem). */
export function extrairLigacoes(texto: string): string[] {
  const vistos = new Map<string, string>()
  for (const m of texto.matchAll(RE_LIGACAO)) {
    const titulo = m[1].trim()
    if (titulo && !vistos.has(titulo.toLowerCase())) vistos.set(titulo.toLowerCase(), titulo)
  }
  return [...vistos.values()]
}

/** #tags do texto (sem repetição; ignora o que está dentro de [[...]]). */
export function extrairTags(texto: string): string[] {
  const semLigacoes = texto.replace(RE_LIGACAO, ' ')
  const vistos = new Map<string, string>()
  for (const m of semLigacoes.matchAll(RE_TAG)) {
    const tag = m[1].replace(/[-/]+$/, '')
    if (tag && !vistos.has(tag.toLowerCase())) vistos.set(tag.toLowerCase(), tag)
  }
  return [...vistos.values()]
}

/* ------------------------------------------------------------ sumário */

export interface Titulo {
  nivel: number
  texto: string
  /** índice entre os headings do documento (para rolar até ele) */
  indice: number
}

export function titulosDoDoc(doc: NoTiptap | null | undefined): Titulo[] {
  const out: Titulo[] = []
  const visitar = (no: NoTiptap) => {
    if (no.type === 'heading') {
      out.push({ nivel: Number(no.attrs?.level ?? 2), texto: textoDoDoc({ type: 'doc', content: [no] }), indice: out.length })
      return
    }
    no.content?.forEach(visitar)
  }
  if (doc) visitar(doc)
  return out
}

/* ------------------------------------------------------------- modelo */

/** Modelo do TCD: Leitura → Observação → Aplicação → Oração. */
export function modeloTcd(secoes: string[]): NoTiptap {
  const content: NoTiptap[] = []
  for (const s of secoes) {
    content.push({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: s }] })
    content.push({ type: 'paragraph' })
  }
  return { type: 'doc', content }
}

/* ---------------------------------------------------------- importação */

/** .txt → documento: linha em branco separa parágrafos; quebra simples vira <br>. */
export function textoParaDoc(texto: string): NoTiptap {
  const normal = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const paragrafos = normal.split(/\n\s*\n/).map((p) => p.replace(/^\n+|\n+$/g, '')).filter((p) => p.trim())
  if (!paragrafos.length) return DOC_VAZIO
  return {
    type: 'doc',
    content: paragrafos.map((p) => {
      const linhas = p.split('\n')
      const content: NoTiptap[] = []
      linhas.forEach((l, i) => {
        if (i > 0) content.push({ type: 'hardBreak' })
        if (l) content.push({ type: 'text', text: l })
      })
      return { type: 'paragraph', content }
    }),
  }
}

/** Título para uma nota importada: 1º heading "# ..." do markdown, senão o nome do arquivo. */
export function tituloImportado(nomeArquivo: string, texto?: string): string {
  const h = texto ? /^\s*#\s+(.+)$/m.exec(texto) : null
  const base = (h?.[1] ?? nomeArquivo.replace(/\.[^.]+$/, '')).trim()
  return base.slice(0, 300)
}

/* ---------------------------------------------------------- coleções */

export interface ColecaoBasica {
  collection_uuid: string
  name: string
  parent_uuid: string | null
  position: number
}

export type NoColecao<T extends ColecaoBasica> = T & { filhos: NoColecao<T>[]; nivel: number }

/** Lista plana → árvore (por posição e nome). Pai inexistente vira raiz; ciclos são cortados. */
export function arvoreColecoes<T extends ColecaoBasica>(lista: T[]): NoColecao<T>[] {
  const porId = new Map<string, NoColecao<T>>()
  for (const c of lista) porId.set(c.collection_uuid, { ...c, filhos: [], nivel: 0 })
  const raizes: NoColecao<T>[] = []
  for (const no of porId.values()) {
    const pai = no.parent_uuid ? porId.get(no.parent_uuid) : undefined
    if (pai && pai !== no) pai.filhos.push(no)
    else raizes.push(no)
  }
  const ordenar = (nos: NoColecao<T>[], nivel: number, caminho: Set<string>) => {
    nos.sort((a, b) => a.position - b.position || a.name.localeCompare(b.name, 'pt-BR'))
    for (const no of nos) {
      no.nivel = nivel
      if (caminho.has(no.collection_uuid)) {
        no.filhos = []
        continue
      }
      const prox = new Set(caminho).add(no.collection_uuid)
      ordenar(no.filhos, nivel + 1, prox)
    }
  }
  ordenar(raizes, 0, new Set())
  return raizes
}

/** A coleção `alvo` é a própria `uuid` ou uma descendente dela? (para impedir mover para dentro de si). */
export function ehDescendente(lista: ColecaoBasica[], uuid: string, alvo: string): boolean {
  const pai = new Map(lista.map((c) => [c.collection_uuid, c.parent_uuid]))
  let atual: string | null | undefined = alvo
  const vistos = new Set<string>()
  while (atual && !vistos.has(atual)) {
    if (atual === uuid) return true
    vistos.add(atual)
    atual = pai.get(atual)
  }
  return false
}

/* ------------------------------------------------------------ modelos */

export interface ModeloPronto {
  id: string
  /** sugere o tipo, mas o tipo da nota não muda por causa do modelo */
  paraTcd?: boolean
  /** chaves i18n das seções (caderno.modelos.<id>.secoes) — resolvidas na tela */
  lista?: 'ordenada'
}

/** Modelos prontos. Nome e seções vêm do i18n: caderno.modelos.<id>.{nome,descricao,secoes}. */
export const MODELOS_PRONTOS: ModeloPronto[] = [
  { id: 'tcd', paraTcd: true },
  { id: 'soap', paraTcd: true },
  { id: 'tres_perguntas', paraTcd: true },
  { id: 'culto' },
  { id: 'estudo' },
  { id: 'tematico' },
  { id: 'oracao', paraTcd: true },
  { id: 'resumo' },
  { id: 'gratidao', lista: 'ordenada' },
]

/** Seções → documento: título h3 + parágrafo vazio por seção. Gratidão: h3 + lista de 3 itens. */
export function docDoModelo(secoes: string[], lista?: 'ordenada'): NoTiptap {
  if (lista === 'ordenada') {
    const [titulo = '', ...itens] = secoes
    const n = Math.max(itens.length, 3)
    return {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: titulo ? [{ type: 'text', text: titulo }] : [] },
        {
          type: 'orderedList',
          attrs: { start: 1 },
          content: Array.from({ length: n }, () => ({ type: 'listItem', content: [{ type: 'paragraph' }] })),
        },
      ],
    }
  }
  const content: NoTiptap[] = []
  for (const s of secoes) {
    content.push({ type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: s }] })
    content.push({ type: 'paragraph' })
  }
  return { type: 'doc', content: content.length ? content : [{ type: 'paragraph' }] }
}

/** Texto colado parece markdown? (títulos, listas, citações, negrito, links, código) */
export function pareceMarkdown(texto: string): boolean {
  if (!texto || texto.length > 500_000) return false
  const linhas = texto.split(/\r?\n/)
  let sinais = 0
  for (const l of linhas) {
    if (/^\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s?|```|---\s*$)/.test(l)) sinais++
  }
  if (/\*\*[^*\n]+\*\*|__[^_\n]+__|\[[^\]\n]+\]\([^)\s]+\)/.test(texto)) sinais++
  return sinais >= 1
}
