/**
 * "Anotar" do leitor bíblico → Caderno (P0 do plano do leitor, item 3).
 *
 * O leitor monta as citações (uma por trecho contíguo da seleção, no formato
 * de blocoCitacao: aberta com o texto, licenciada só com a referência) e as
 * deixa aqui, no sessionStorage, antes de abrir a nota nova ou o TCD de hoje.
 * O editor da nota consome a entrega ao abrir e insere as citações no fim,
 * como uma edição da pessoa (salva normalmente).
 *
 * A entrega vale por poucos minutos e só para o destino pedido: "nota" (uma
 * nota nova, ainda vazia) ou "tcd" (o TCD da data indicada).
 *
 * Módulo puro (o armazenamento entra como parâmetro): roda no Node.
 */

export type DestinoCitacao = { tipo: 'nota' } | { tipo: 'tcd'; data: string }

type NoJson = { type: string; attrs?: Record<string, unknown>; content?: NoJson[]; text?: string }

export interface CitacaoPendente {
  destino: DestinoCitacao
  blocos: NoJson[]
  /** título sugerido para a nota nova ("João 3:16-17") */
  titulo: string
  criadaEm: number
}

export const CHAVE_CITACAO_PENDENTE = 'discipulei_citacao_pendente'
export const VALIDADE_CITACAO_MS = 5 * 60 * 1000

type Armazenamento = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function guardarCitacaoPendente(
  armazenamento: Armazenamento | null | undefined,
  dados: Omit<CitacaoPendente, 'criadaEm'>,
  agora = Date.now()
): boolean {
  if (!armazenamento || !dados.blocos.length) return false
  try {
    armazenamento.setItem(CHAVE_CITACAO_PENDENTE, JSON.stringify({ ...dados, criadaEm: agora }))
    return true
  } catch {
    return false // modo privado, cota
  }
}

/** A nota que abriu é o destino da entrega? */
function casa(destino: DestinoCitacao, nota: { kind: string; tcd_date?: string | null; vazia: boolean }): boolean {
  if (destino.tipo === 'tcd') return nota.kind === 'tcd' && nota.tcd_date === destino.data
  return nota.kind !== 'tcd' && nota.vazia
}

/**
 * Entrega pendente para esta nota (e a remove); null se não houver, se
 * expirou ou se a nota não é o destino.
 */
export function consumirCitacaoPendente(
  armazenamento: Armazenamento | null | undefined,
  nota: { kind: string; tcd_date?: string | null; vazia: boolean },
  agora = Date.now()
): CitacaoPendente | null {
  if (!armazenamento) return null
  let bruto: string | null = null
  try {
    bruto = armazenamento.getItem(CHAVE_CITACAO_PENDENTE)
  } catch {
    return null
  }
  if (!bruto) return null
  let dados: CitacaoPendente | null = null
  try {
    dados = JSON.parse(bruto)
  } catch {
    dados = null
  }
  const valida =
    !!dados &&
    Array.isArray(dados.blocos) &&
    dados.blocos.length > 0 &&
    typeof dados.criadaEm === 'number' &&
    agora - dados.criadaEm <= VALIDADE_CITACAO_MS &&
    !!dados.destino
  if (!valida) {
    try {
      armazenamento.removeItem(CHAVE_CITACAO_PENDENTE)
    } catch {
      /* nada */
    }
    return null
  }
  if (!casa((dados as CitacaoPendente).destino, nota)) return null
  try {
    armazenamento.removeItem(CHAVE_CITACAO_PENDENTE)
  } catch {
    /* nada */
  }
  return dados
}
