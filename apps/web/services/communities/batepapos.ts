/**
 * Cliente do Bate-papo Online (Bible Talk, N45). Rotas em /api/v1/batepapos.
 *
 * A agenda é aberta, mas o link da reunião (`meeting_url`) só vem para membros
 * logados da org. Criar/editar/apagar e a lista de confirmados: admins e grupo
 * de autores (o servidor confere).
 */
import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export type StatusPresenca = 'vou' | 'talvez'
export type SituacaoEvento = 'upcoming' | 'live' | 'past'

export interface BatePapo {
  event_uuid: string
  title: string
  theme: string
  description: string
  /** ISO em UTC ("2026-12-01T23:00:00+00:00"). */
  starts_at: string
  ends_at: string
  /** Fuso IANA em que foi marcado. */
  timezone: string
  duration_minutes: number
  /** Só para membros logados; visitante recebe null. */
  meeting_url: string | null
  host_name: string
  passages: string
  announcement_discussion_uuid: string | null
  announcement_community_uuid: string | null
  my_status: StatusPresenca | null
  going_count: number
  maybe_count: number
  can_manage: boolean
  status: SituacaoEvento
}

export interface NovoBatePapo {
  title: string
  theme?: string
  description?: string
  /** ISO local sem deslocamento ("2026-12-01T20:00") + timezone, ou com deslocamento. */
  starts_at: string
  timezone: string
  duration_minutes: number
  meeting_url?: string
  host_name?: string
  passages?: string
  /** Espaço onde publicar a divulgação (opcional). */
  announce_community_uuid?: string | null
}

export type EdicaoBatePapo = Partial<Omit<NovoBatePapo, 'announce_community_uuid'>>

export interface Confirmado {
  user_uuid: string
  username: string
  first_name: string
  last_name: string
  avatar_image: string | null
  status: StatusPresenca
}

export interface ListaConfirmados {
  going: Confirmado[]
  maybe: Confirmado[]
}

/** O botão "Entrar" fica em destaque desde 10 minutos antes até o fim. */
export const MINUTOS_DESTAQUE_ENTRAR = 10

const base = () => `${getAPIUrl()}batepapos`

async function chamar<T>(url: string, metodo: string, corpo: unknown, token?: string): Promise<T> {
  const res = await fetch(url, RequestBodyWithAuthHeader(metodo, corpo ?? null, null, token))
  return errorHandling(res)
}

/** uuid curto para URLs (sem "event_"). */
export const idCurtoEvento = (eventUuid: string) => eventUuid.replace(/^event_/, '')

export function listarBatePapos(orgId: number, quando: 'proximos' | 'passados', limit: number, token?: string) {
  return chamar<BatePapo[]>(`${base()}?org_id=${orgId}&quando=${quando}&limit=${limit}`, 'GET', null, token)
}

export function obterBatePapo(eventUuid: string, token?: string) {
  return chamar<BatePapo>(`${base()}/${encodeURIComponent(idCurtoEvento(eventUuid))}`, 'GET', null, token)
}

export function criarBatePapo(orgId: number, dados: NovoBatePapo, token?: string) {
  return chamar<BatePapo>(`${base()}?org_id=${orgId}`, 'POST', dados, token)
}

export function editarBatePapo(eventUuid: string, dados: EdicaoBatePapo, token?: string) {
  return chamar<BatePapo>(`${base()}/${encodeURIComponent(idCurtoEvento(eventUuid))}`, 'PUT', dados, token)
}

export function apagarBatePapo(eventUuid: string, token?: string) {
  return chamar<{ ok: boolean }>(`${base()}/${encodeURIComponent(idCurtoEvento(eventUuid))}`, 'DELETE', null, token)
}

/** status null cancela a presença. */
export function responderPresenca(eventUuid: string, status: StatusPresenca | null, token?: string) {
  return chamar<BatePapo>(`${base()}/${encodeURIComponent(idCurtoEvento(eventUuid))}/presenca`, 'PUT', { status }, token)
}

export function listarConfirmados(eventUuid: string, token?: string) {
  return chamar<ListaConfirmados>(`${base()}/${encodeURIComponent(idCurtoEvento(eventUuid))}/confirmados`, 'GET', null, token)
}

/**
 * Baixa o .ics gerado pelo servidor (com o token, para o link vir para
 * membros) e entrega ao navegador como arquivo.
 */
export async function baixarIcs(eventUuid: string, token?: string): Promise<void> {
  const res = await fetch(
    `${base()}/${encodeURIComponent(idCurtoEvento(eventUuid))}/ics`,
    RequestBodyWithAuthHeader('GET', null, null, token)
  )
  if (!res.ok) throw new Error(String(res.status))
  const disposition = res.headers.get('Content-Disposition') || ''
  const nome = /filename="([^"]+)"/.exec(disposition)?.[1] || 'bate-papo.ics'
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nome
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Situação calculada no cliente (o relógio anda depois da resposta). */
export function situacaoAgora(ev: Pick<BatePapo, 'starts_at' | 'ends_at'>, agora: Date = new Date()): SituacaoEvento {
  const ini = new Date(ev.starts_at).getTime()
  const fim = new Date(ev.ends_at).getTime()
  const t = agora.getTime()
  if (t < ini) return 'upcoming'
  if (t < fim) return 'live'
  return 'past'
}

/** "Entrar" em destaque: de 10 minutos antes até o fim. */
export function entrarEmDestaque(ev: Pick<BatePapo, 'starts_at' | 'ends_at'>, agora: Date = new Date()): boolean {
  const ini = new Date(ev.starts_at).getTime() - MINUTOS_DESTAQUE_ENTRAR * 60_000
  const fim = new Date(ev.ends_at).getTime()
  const t = agora.getTime()
  return t >= ini && t < fim
}
