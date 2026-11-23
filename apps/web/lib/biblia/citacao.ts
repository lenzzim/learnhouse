/**
 * Como uma passagem entra no texto (Caderno e discussões), item 2.2:
 *
 *  - **Citação completa**: bloco de citação com o texto e, na última linha,
 *    "— João 3:16 (SIGLA)". Nas versões ABERTAS o texto vai junto. Nas
 *    LICENCIADAS (NVI, ARA, ARC, NTLH...) só a linha da referência é gravada:
 *    quem lê vê o texto ao vivo, com o crédito, pelo widget da citação viva
 *    (components/Biblia/citacaoViva.ts). O texto licenciado nunca entra na nota.
 *  - **Menção**: só a referência no meio do texto, "Jo 3:16 (NVI)". A
 *    decoração de referências a torna clicável (pop-up na leitura, painel no
 *    Caderno) e a sigla diz em qual versão abrir.
 *
 * Módulo puro (sem React nem editor): os nós saem no formato JSON do TipTap.
 */
import type { Versiculo } from './dados'

export type ModoCitacao = 'completa' | 'mencao'
export const MODOS_CITACAO: ModoCitacao[] = ['completa', 'mencao']

const SOBRESCRITO = '⁰¹²³⁴⁵⁶⁷⁸⁹'

function sobrescrito(n: number): string {
  return String(n)
    .split('')
    .map((d) => SOBRESCRITO[Number(d)])
    .join('')
}

/** Texto do bloco: um versículo sem número; vários com números sobrescritos. */
export function textoDoBloco(versos: Versiculo[]): string {
  if (versos.length === 1) return versos[0].texto
  return versos.map((v) => `${sobrescrito(v.numero)} ${v.texto}`).join(' ')
}

interface NoJson {
  type: string
  attrs?: Record<string, unknown>
  content?: NoJson[]
  text?: string
}

/** Linha final da citação: "— João 3:16 (NVI)". A citação viva reconhece este formato. */
export function linhaReferencia(referencia: string, sigla: string): string {
  return `— ${referencia} (${sigla})`
}

/**
 * Bloco da citação completa. `texto` é ignorado em versão licenciada (só a
 * referência é gravada; o texto aparece ao vivo para quem lê).
 */
export function blocoCitacao({
  referencia,
  sigla,
  licenciada,
  texto,
}: {
  referencia: string
  sigla: string
  licenciada: boolean
  texto?: string
}): NoJson {
  const linha: NoJson = { type: 'paragraph', content: [{ type: 'text', text: linhaReferencia(referencia, sigla) }] }
  const corpo = !licenciada && texto?.trim() ? [{ type: 'paragraph', content: [{ type: 'text', text: texto.trim() }] }] : []
  return { type: 'blockquote', content: [...corpo, linha] }
}

/** Texto da menção: "Jo 3:16 (NVI)". */
export function textoMencao(referenciaCurta: string, sigla: string): string {
  return `${referenciaCurta} (${sigla})`
}

/**
 * Onde termina uma menção no texto: se logo depois da referência vier
 * " (SIGLA)", inclui a sigla. `texto` é o texto do parágrafo e `fim` o índice
 * logo depois da referência. Devolve o novo fim e a sigla encontrada.
 */
export function fimDaMencao(texto: string, fim: number): { fim: number; sigla: string | null } {
  const m = /^\s*\(([A-Za-z0-9]{2,8})\)/.exec(texto.slice(fim))
  return m ? { fim: fim + m[0].length, sigla: m[1].toUpperCase() } : { fim, sigla: null }
}

/** Valor guardado (localStorage) → modo válido; padrão: citação completa. */
export function modoValido(valor: unknown): ModoCitacao {
  return valor === 'mencao' ? 'mencao' : 'completa'
}
