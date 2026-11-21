/**
 * Utilitários puros do estudo dos originais (dados STEPBible em
 * public/biblia-dados/original e /lexico). Sem imports: roda no Node.
 */

/** Palavra do AT: [hebraico, transliteração, strong, morfologia, glosa_en] */
export type PalavraHeb = [string, string, string, string, string]
/** Palavra do NT: [grego, transliteração, strong, morfologia, glosa_en, glosa_es, marca ''|'N'|'K'] */
export type PalavraGrc = [string, string, string, string, string, string, string]
export type PalavraOriginal = PalavraHeb | PalavraGrc
/** Capítulo: índice = versículo (0 = título dos Salmos) */
export type CapituloOriginal = PalavraOriginal[][]

export interface Verbete {
  lema: string
  translit: string
  morf: string
  glosa: string
  /** definição em inglês; só <br>, <b>, <i> (o resto vem escapado) */
  def: string
}

export const CREDITO_STEPBIBLE = 'Dados do STEPBible.org (Tyndale House, Cambridge), CC BY 4.0'
export const URL_STEPBIBLE = 'https://www.stepbible.org'

/** "H7225G" -> "biblia-dados/lexico/H/72.json"; "G21501" -> ".../G/215.json". null se inválido. */
export function caminhoLexico(strong: string): string | null {
  const m = /^([HG])(\d{1,5})[A-Za-z]?$/.exec(strong)
  if (!m) return null
  const bloco = String(Math.floor(Number(m[2]) / 100)).padStart(2, '0')
  return `/biblia-dados/lexico/${m[1]}/${bloco}.json`
}

export function ehNovoTestamento(palavra: PalavraOriginal): palavra is PalavraGrc {
  return palavra.length >= 7
}

export type ParteDef =
  | { tipo: 'texto'; texto: string; negrito: boolean; italico: boolean }
  | { tipo: 'quebra' }

const ENTIDADES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" }

/**
 * Converte a definição sanitizada em partes para renderizar como texto React
 * (nada de innerHTML). Tags desbalanceadas não quebram: o estado só liga/desliga.
 */
export function partesDefinicao(def: string): ParteDef[] {
  const partes: ParteDef[] = []
  let negrito = false
  let italico = false
  for (const pedaco of def.split(/(<br>|<\/?[bi]>)/)) {
    if (!pedaco) continue
    if (pedaco === '<br>') partes.push({ tipo: 'quebra' })
    else if (pedaco === '<b>') negrito = true
    else if (pedaco === '</b>') negrito = false
    else if (pedaco === '<i>') italico = true
    else if (pedaco === '</i>') italico = false
    else partes.push({ tipo: 'texto', texto: pedaco.replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTIDADES[e]), negrito, italico })
  }
  return partes
}
