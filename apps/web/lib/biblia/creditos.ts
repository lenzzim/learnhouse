/**
 * Créditos das traduções no fim de uma nota ou post (decisão N43).
 *
 * Em vez de um crédito em cada citação, um rodapé único e discreto:
 *   "Textos bíblicos: NVI © Biblica, Inc.; ARA © SBB."
 * sem repetir versões, com a versão CURTA do copyright e, ao lado, "ver
 * créditos completos" (o copyright integral que a API entrega). Aparece
 * quando a nota exibe texto bíblico: licenciado (citação viva) ou aberto
 * embutido (o crédito da aberta fica só no rodapé). Menção sem texto não
 * conta.
 *
 * Módulo puro (só imports de módulos puros): roda no Node.
 */
import { VERSOES, VERSOES_LICENCIADAS, versaoPorId, type VersaoInfo } from './versoes'
import { lerLinhaCitacao } from './citacao'

/** Copyright curto das licenciadas (a forma longa vem da API). */
const CURTO_LICENCIADAS: Record<string, string> = {
  nvi: 'NVI © Biblica, Inc.',
  nvi2011: 'NVI © Biblica, Inc.',
  nbvp: 'NBVP © Biblica, Inc.',
  olivro: 'OL © Biblica, Inc.',
  niv: 'NIV © Biblica, Inc.',
  ara: 'ARA © SBB',
  arc: 'ARC © SBB',
  ntlh: 'NTLH © SBB',
  rc69: 'RC69 © SBB',
  nkjv: 'NKJV © Thomas Nelson',
}

/** "NVI © Biblica, Inc." ou, nas abertas, "BLIVRE (CC BY 4.0 BR)". */
export function creditoCurto(versao: VersaoInfo, rotuloDominioPublico = 'domínio público'): string {
  if (versao.fonte === 'licenciada') return CURTO_LICENCIADAS[versao.id] ?? `${versao.sigla} ©`
  const licenca = versao.licenca === 'Domínio público' ? rotuloDominioPublico : versao.licenca
  return `${versao.sigla} (${licenca})`
}

export interface TextoExibido {
  /** id da versão cujo texto aparece de fato (no recuo, a aberta) */
  versao: string
  /** copyright integral entregue pela API (licenciadas), se houver */
  completo?: string | null
}

export interface LinhaCredito {
  versao: VersaoInfo
  curto: string
  completo: string
}

const ORDEM = [...VERSOES_LICENCIADAS, ...VERSOES].map((v) => v.id)

/**
 * Uma linha por versão (sem repetir), licenciadas antes, na ordem do seletor.
 * Ids desconhecidos ficam de fora.
 */
export function montarCreditos(textos: TextoExibido[], rotuloDominioPublico?: string): LinhaCredito[] {
  const porVersao = new Map<string, LinhaCredito>()
  for (const t of textos) {
    const versao = versaoPorId(t.versao)
    if (!versao) continue
    const atual = porVersao.get(versao.id)
    if (atual && (atual.completo !== versao.credito || !t.completo)) continue
    porVersao.set(versao.id, {
      versao,
      curto: creditoCurto(versao, rotuloDominioPublico),
      completo: (versao.fonte === 'licenciada' && t.completo) || versao.credito,
    })
  }
  return [...porVersao.values()].sort((a, b) => ORDEM.indexOf(a.versao.id) - ORDEM.indexOf(b.versao.id))
}

/** Chave estável do rodapé (para só re-renderizar quando muda). */
export function chaveCreditos(linhas: LinhaCredito[]): string {
  return linhas.map((l) => `${l.versao.id}:${l.completo}`).join('|')
}

/**
 * Lê do DOM o que aparece: citações vivas (.biblia-citacao-viva[data-credito-versao])
 * e citações de aberta com o texto embutido. Menções não exibem texto.
 */
export function lerTextosExibidos(raiz: ParentNode): TextoExibido[] {
  const out: TextoExibido[] = []
  raiz.querySelectorAll<HTMLElement>('.biblia-citacao-viva[data-credito-versao]').forEach((el) => {
    out.push({ versao: el.dataset.creditoVersao as string, completo: el.dataset.creditoCompleto || null })
  })
  raiz.querySelectorAll('blockquote').forEach((bq) => {
    const paragrafos = Array.from(bq.children).filter((c) => c.tagName === 'P')
    if (paragrafos.length < 2) return // só a linha da referência: sem texto embutido
    const lida = lerLinhaCitacao(paragrafos[paragrafos.length - 1].textContent || '')
    if (lida && lida.versao.fonte !== 'licenciada') out.push({ versao: lida.versao.id })
  })
  return out
}

