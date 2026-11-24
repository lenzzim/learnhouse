/**
 * Consulta de busca que é uma referência bíblica (página Buscar e busca da
 * Bíblia). Espelha `interpretar_consulta` do servidor
 * (apps/api/src/services/biblia/referencias.py):
 *
 *   "Salmos", "Sl", "1 Pe", "1pedro"  -> livro
 *   "1Pe 1", "Sl 23"                  -> capítulo
 *   "Mt 28:19"                        -> versículo
 *   "Mt 28:18-20"                     -> intervalo
 *
 * Arquivo novo (e não uma mudança em referencias.ts) para não mexer nas
 * assinaturas usadas pelo Caderno e pelo leitor. Puro: roda no Node
 * (lib/biblia/consulta.test.mjs).
 */
import { encontrarReferencias, formatarReferencia, livroPorId, LIVROS, type Referencia } from './referencias'

export type TipoPassagem = 'livro' | 'capitulo' | 'versiculo' | 'intervalo'

export interface PassagemConsulta {
  livroId: string
  capitulo?: number
  versoIni?: number
  versoFim?: number
  tipo: TipoPassagem
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/** Palavras comuns que, em minúscula e sozinhas, não são o nome de um livro. */
const PALAVRAS_COMUNS = new Set([
  'os', 'na', 'ap', 'ag', 'am', 'at', 'ed', 'et', 'num', 'mi', 'santiago',
  'numeros', 'atos', 'juizes', 'reis', 'cronicas', 'lamentacoes', 'proverbios', 'cantares', 'canticos',
  'numbers', 'judges', 'kings', 'chronicles', 'lamentations', 'proverbs', 'acts', 'mark',
  'revelation', 'revelations', 'job', 'is', 'jueces', 'reyes', 'lamentaciones', 'hechos', 'sal', 'mal', 'dan',
])

function tipoDe(r: Referencia): TipoPassagem {
  if (r.versoIni === undefined) return 'capitulo'
  if (r.versoFim !== undefined && r.versoFim !== r.versoIni) return 'intervalo'
  return 'versiculo'
}

/**
 * Livro sozinho: reaproveita o próprio parser do front com um capítulo
 * fictício ("Salmos" -> "Salmos 1"), para valer exatamente a mesma lista de
 * nomes e abreviações (pt, en, es; com e sem acento; "1 Pe", "1pedro").
 */
function soLivro(t: string): string | null {
  const m = /^(.*?)[.\s]*$/.exec(t)
  const nome = m ? m[1] : t
  if (!nome || /\d/.test(nome.replace(/^[1-3]/, ''))) return null
  const primeiraLetra = nome.replace(/^[1-3ºª°.\s]+/, '')
  if (!primeiraLetra) return null
  const temPrefixo = primeiraLetra.length !== nome.length
  if (!temPrefixo && primeiraLetra[0] === primeiraLetra[0].toLowerCase() && PALAVRAS_COMUNS.has(semAcento(primeiraLetra.toLowerCase()))) {
    return null
  }
  const teste = `${nome} 1`
  const achados = encontrarReferencias(teste, { estrito: false })
  if (achados.length === 1 && achados[0].inicio === 0 && achados[0].fim === teste.length) return achados[0].livroId
  // "Pedro" sozinho: livro numerado sem número -> o primeiro (1 Pedro)
  if (!temPrefixo) {
    const comUm = `1 ${nome} 1`
    const a = encontrarReferencias(comUm, { estrito: false })
    if (a.length === 1 && a[0].inicio === 0 && a[0].fim === comUm.length) return a[0].livroId
  }
  return null
}

/** A consulta é SÓ uma referência? (livro, capítulo, versículo ou intervalo) */
export function interpretarConsulta(texto: string): PassagemConsulta | null {
  const t = texto.replace(/\s+/g, ' ').trim()
  if (!t || t.length > 60) return null
  const achados = encontrarReferencias(t, { estrito: false })
  if (achados.length === 1 && achados[0].inicio === 0 && achados[0].fim === t.length) {
    const a = achados[0]
    const r: PassagemConsulta = { livroId: a.livroId, capitulo: a.capitulo, tipo: tipoDe(a) }
    if (a.versoIni !== undefined) {
      r.versoIni = a.versoIni
      r.versoFim = a.versoFim ?? a.versoIni
    }
    return r
  }
  if (achados.length) return null
  const livro = soLivro(t)
  return livro ? { livroId: livro, tipo: 'livro' } : null
}

/** Rótulo do chip: "1 Pedro 1", "Salmos", "Mateus 28:18-20". */
export function rotuloPassagem(p: PassagemConsulta): string {
  if (p.capitulo === undefined) return livroPorId(p.livroId)?.nome ?? p.livroId
  return formatarReferencia({ livroId: p.livroId, capitulo: p.capitulo, versoIni: p.versoIni, versoFim: p.versoFim })
}

/** Código para o leitor (?ref=): livro sozinho abre o capítulo 1. */
export function codigoLeitor(p: PassagemConsulta): string {
  if (p.capitulo === undefined) return `${p.livroId}.1`
  let s = `${p.livroId}.${p.capitulo}`
  if (p.versoIni !== undefined) {
    s += `.${p.versoIni}`
    if (p.versoFim !== undefined && p.versoFim !== p.versoIni) s += `-${p.versoFim}`
  }
  return s
}

/**
 * Divide o texto em partes marcadas e não marcadas, a partir dos intervalos
 * [início, fim) que o servidor devolve (destaque sem HTML vindo do servidor).
 */
export function partesDestacadas(texto: string, destaques: [number, number][]): { texto: string; marcado: boolean }[] {
  const out: { texto: string; marcado: boolean }[] = []
  let pos = 0
  const ordenados = [...(destaques || [])]
    .filter(([a, b]) => Number.isInteger(a) && Number.isInteger(b) && a < b)
    .sort((x, y) => x[0] - y[0])
  for (const [a0, b0] of ordenados) {
    const a = Math.max(a0, pos)
    const b = Math.min(b0, texto.length)
    if (a >= b) continue
    if (a > pos) out.push({ texto: texto.slice(pos, a), marcado: false })
    out.push({ texto: texto.slice(a, b), marcado: true })
    pos = b
  }
  if (pos < texto.length) out.push({ texto: texto.slice(pos), marcado: false })
  return out
}

/** Livros para o filtro da busca da Bíblia (na ordem canônica). */
export function livrosDoTestamento(testamento: '' | 'AT' | 'NT') {
  return LIVROS.filter((l) => !testamento || l.testamento === testamento)
}
