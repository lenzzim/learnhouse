/**
 * Importação de arquivos para o Caderno, toda no navegador (o arquivo não vai
 * para o servidor; só a nota convertida). As bibliotecas pesadas são
 * carregadas sob demanda.
 *  - .md / .markdown: @tiptap/markdown (frontmatter do Obsidian é removido;
 *    [[ligações]] e #tags continuam como texto e viram links no editor)
 *  - .txt: parágrafos (linha em branco separa)
 *  - .docx: mammoth → HTML → JSON do TipTap
 *  - .pdf: só o texto (pdfjs-dist, worker do próprio bundle), até 200 páginas
 *  - .html / .htm: sanitizado com DOMPurify antes de virar JSON
 *  - .json: nota exportada do próprio caderno ({ title, content_json }) ou um doc TipTap
 * Fora por enquanto: .odt e .rtf (sem biblioteca leve e segura no navegador).
 */
import { textoParaDoc, tituloImportado, type NoTiptap } from './conteudo'

export const EXTENSOES_ACEITAS = ['.md', '.markdown', '.txt', '.docx', '.pdf', '.html', '.htm', '.json']
export const ACCEPT = EXTENSOES_ACEITAS.join(',')
export const TAMANHO_MAXIMO = 5 * 1024 * 1024
export const TAMANHO_MAXIMO_PDF = 20 * 1024 * 1024
export const PAGINAS_MAXIMAS_PDF = 200

export type ErroImportacao = 'formato' | 'tamanho' | 'leitura' | 'grande_demais' | 'paginas' | 'pdf_sem_texto'

export interface Importado {
  titulo: string
  doc: NoTiptap
  /** formatação simplificada (PDF): avisar a pessoa */
  simplificado?: boolean
}

export function extensaoDe(nome: string): string {
  const m = /\.[^.]+$/.exec(nome.toLowerCase())
  return m ? m[0] : ''
}

export function formatoAceito(nome: string): boolean {
  return EXTENSOES_ACEITAS.includes(extensaoDe(nome))
}

async function extensoesBase() {
  const [{ default: StarterKit }] = await Promise.all([import('@tiptap/starter-kit')])
  return [StarterKit.configure({ link: { openOnClick: false } })]
}

/** Tira o frontmatter YAML (--- ... ---) do topo, comum no Obsidian. */
export function semFrontmatter(md: string): string {
  return md.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
}

async function markdownParaDoc(md: string): Promise<NoTiptap> {
  const { MarkdownManager } = await import('@tiptap/markdown')
  const gerenciador = new MarkdownManager({ extensions: await extensoesBase() })
  return gerenciador.parse(md) as NoTiptap
}

/** HTML qualquer → JSON do TipTap, sempre sanitizado antes. */
export async function htmlParaDoc(html: string): Promise<NoTiptap> {
  const { default: DOMPurify } = await import('dompurify')
  const limpo = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'img', 'video', 'audio', 'svg', 'math'],
    FORBID_ATTR: ['style', 'class', 'id'],
  })
  const { generateJSON } = await import('@tiptap/html')
  return generateJSON(limpo || '<p></p>', await extensoesBase()) as NoTiptap
}

/** Markdown → JSON (também usado ao colar markdown no editor). */
export async function markdownParaDocPublico(md: string): Promise<NoTiptap> {
  return markdownParaDoc(md)
}

function erro(codigo: ErroImportacao) {
  return Object.assign(new Error(codigo), { codigo })
}

async function pdfParaDoc(buffer: ArrayBuffer): Promise<NoTiptap> {
  const pdfjs: any = await import('pdfjs-dist')
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    // Worker servido pelo próprio app (nada vai para CDN de terceiros).
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  }
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(buffer), isEvalSupported: false }).promise
  if (pdf.numPages > PAGINAS_MAXIMAS_PDF) throw erro('paginas')
  const paragrafos: string[] = []
  for (let n = 1; n <= pdf.numPages; n++) {
    const pagina = await pdf.getPage(n)
    const conteudo = await pagina.getTextContent()
    let linha = ''
    let ultimoY: number | null = null
    const linhas: string[] = []
    for (const item of conteudo.items as any[]) {
      if (typeof item.str !== 'string') continue
      const y = item.transform?.[5] ?? 0
      if (ultimoY !== null && Math.abs(y - ultimoY) > 2) {
        linhas.push(linha)
        linha = ''
      }
      linha += item.str
      if (item.hasEOL) {
        linhas.push(linha)
        linha = ''
        ultimoY = null
        continue
      }
      ultimoY = y
    }
    if (linha) linhas.push(linha)
    // Linha vazia separa parágrafos; linhas seguidas viram um parágrafo só.
    let atual: string[] = []
    for (const l of linhas) {
      if (!l.trim()) {
        if (atual.length) paragrafos.push(atual.join(' '))
        atual = []
      } else atual.push(l.trim())
    }
    if (atual.length) paragrafos.push(atual.join(' '))
  }
  await pdf.destroy?.()
  if (!paragrafos.length) throw erro('pdf_sem_texto')
  return textoParaDoc(paragrafos.join('\n\n'))
}

/** .json do próprio caderno: { title, content_json } ou um doc TipTap puro. */
function jsonParaImportado(texto: string, nome: string): Importado {
  const dados = JSON.parse(texto)
  if (dados?.type === 'doc') return { titulo: tituloImportado(nome), doc: dados }
  if (typeof dados?.content_json === 'string') {
    const doc = dados.content_json ? JSON.parse(dados.content_json) : { type: 'doc', content: [{ type: 'paragraph' }] }
    if (doc?.type !== 'doc') throw erro('leitura')
    return { titulo: String(dados.title || tituloImportado(nome)).slice(0, 300), doc }
  }
  throw erro('leitura')
}

async function docxParaDoc(buffer: ArrayBuffer): Promise<NoTiptap> {
  const mammoth: any = await import('mammoth')
  const conversor = mammoth.convertToHtml ? mammoth : mammoth.default
  const { value: html } = await conversor.convertToHtml({ arrayBuffer: buffer })
  return htmlParaDoc(html || '<p></p>')
}

export async function importarArquivo(arquivo: File): Promise<Importado> {
  const ext = extensaoDe(arquivo.name)
  if (!EXTENSOES_ACEITAS.includes(ext)) throw Object.assign(new Error('formato'), { codigo: 'formato' as ErroImportacao })
  if (arquivo.size > (ext === '.pdf' ? TAMANHO_MAXIMO_PDF : TAMANHO_MAXIMO)) throw erro('tamanho')
  try {
    if (ext === '.pdf') {
      return { titulo: tituloImportado(arquivo.name), doc: await pdfParaDoc(await arquivo.arrayBuffer()), simplificado: true }
    }
    if (ext === '.html' || ext === '.htm') {
      const html = await arquivo.text()
      const t = /<title[^>]*>([^<]{1,300})<\/title>/i.exec(html)?.[1]?.trim()
      return { titulo: t || tituloImportado(arquivo.name), doc: await htmlParaDoc(html) }
    }
    if (ext === '.json') return jsonParaImportado(await arquivo.text(), arquivo.name)
    if (ext === '.docx') {
      const doc = await docxParaDoc(await arquivo.arrayBuffer())
      return { titulo: tituloImportado(arquivo.name), doc }
    }
    const texto = await arquivo.text()
    if (ext === '.txt') return { titulo: tituloImportado(arquivo.name), doc: textoParaDoc(texto) }
    let md = semFrontmatter(texto)
    const titulo = tituloImportado(arquivo.name, md)
    // O 1º "# Título" vira o título da nota (não repete no corpo).
    md = md.replace(/^\s*#\s+.+\r?\n?/, '')
    return { titulo, doc: await markdownParaDoc(md) }
  } catch (e: any) {
    if (e?.codigo) throw e
    throw Object.assign(new Error('leitura'), { codigo: 'leitura' as ErroImportacao })
  }
}
