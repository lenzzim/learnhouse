/**
 * Cliente da Agenda de eventos (antes Bate-papo Online, N45). Rotas em
 * /api/v1/agenda (o alias /api/v1/batepapos continua no servidor).
 *
 * A agenda é aberta, mas o endereço exato (`address`) e o link online
 * (`meeting_url`) só vêm para quem respondeu "Vou", quem criou e admins/Equipe
 * (o servidor decide; aqui só se mostra o que veio). Criar: organizadores
 * (Discípulos), Equipe e admins. Editar/cancelar/lista de nomes: quem criou,
 * Equipe e admins.
 */
import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export type StatusPresenca = 'vou' | 'talvez'
export type SituacaoEvento = 'upcoming' | 'live' | 'past'
export type TipoEvento = 'bible_talk' | 'worship' | 'study' | 'meetup' | 'other'
export type ModoEvento = 'online' | 'in_person'

export const TIPOS_EVENTO: TipoEvento[] = ['bible_talk', 'worship', 'study', 'meetup', 'other']

export interface Regiao {
  region_uuid: string
  slug: string
  name: string
  is_online: boolean
  active: boolean
  position: number
}

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
  kind: TipoEvento
  mode: ModoEvento
  region: Regiao | null
  /** Públicos. */
  city: string
  neighborhood: string
  /** Privados: só com "Vou", para quem criou e admins/Equipe; os outros recebem null. */
  meeting_url: string | null
  address: string | null
  /** Há endereço/link guardado que esta pessoa ainda não pode ver. */
  details_locked: boolean
  host_name: string
  organizer_name: string
  passages: string
  capacity: number | null
  spots_left: number | null
  is_full: boolean
  cancelled: boolean
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
  kind?: TipoEvento
  mode?: ModoEvento
  region_uuid?: string | null
  city?: string
  neighborhood?: string
  address?: string
  /** 0 = sem limite. */
  capacity?: number | null
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

export interface FiltrosAgenda {
  regiao?: string | null
  tipo?: TipoEvento | null
}

/** O botão "Entrar" fica em destaque desde 10 minutos antes até o fim. */
export const MINUTOS_DESTAQUE_ENTRAR = 10

const base = () => `${getAPIUrl()}agenda`

async function chamar<T>(url: string, metodo: string, corpo: unknown, token?: string): Promise<T> {
  const res = await fetch(url, RequestBodyWithAuthHeader(metodo, corpo ?? null, null, token))
  return errorHandling(res)
}

/** uuid curto para URLs (sem "event_"). */
export const idCurtoEvento = (eventUuid: string) => eventUuid.replace(/^event_/, '')

const urlEvento = (eventUuid: string) => `${base()}/${encodeURIComponent(idCurtoEvento(eventUuid))}`

function qsFiltros(f?: FiltrosAgenda): string {
  let q = ''
  if (f?.regiao) q += `&regiao=${encodeURIComponent(f.regiao)}`
  if (f?.tipo) q += `&tipo=${encodeURIComponent(f.tipo)}`
  return q
}

export function listarBatePapos(
  orgId: number,
  quando: 'proximos' | 'passados',
  limit: number,
  token?: string,
  filtros?: FiltrosAgenda
) {
  return chamar<BatePapo[]>(
    `${base()}?org_id=${orgId}&quando=${quando}&limit=${limit}${qsFiltros(filtros)}`,
    'GET',
    null,
    token
  )
}

/** Eventos que começam em [de, ate) (calendário). */
export function listarIntervalo(orgId: number, de: Date, ate: Date, token?: string, filtros?: FiltrosAgenda) {
  const q = `de=${encodeURIComponent(de.toISOString())}&ate=${encodeURIComponent(ate.toISOString())}`
  return chamar<BatePapo[]>(`${base()}?org_id=${orgId}&${q}&limit=300${qsFiltros(filtros)}`, 'GET', null, token)
}

export function listarRegioes(orgId: number) {
  return chamar<Regiao[]>(`${base()}/regioes?org_id=${orgId}`, 'GET', null)
}

export function obterBatePapo(eventUuid: string, token?: string) {
  return chamar<BatePapo>(urlEvento(eventUuid), 'GET', null, token)
}

export function criarBatePapo(orgId: number, dados: NovoBatePapo, token?: string) {
  return chamar<BatePapo>(`${base()}?org_id=${orgId}`, 'POST', dados, token)
}

export function editarBatePapo(eventUuid: string, dados: EdicaoBatePapo, token?: string) {
  return chamar<BatePapo>(urlEvento(eventUuid), 'PUT', dados, token)
}

export function cancelarEvento(eventUuid: string, token?: string) {
  return chamar<BatePapo>(`${urlEvento(eventUuid)}/cancelar`, 'POST', null, token)
}

export function apagarBatePapo(eventUuid: string, token?: string) {
  return chamar<{ ok: boolean }>(urlEvento(eventUuid), 'DELETE', null, token)
}

/** status null cancela a presença. */
export function responderPresenca(eventUuid: string, status: StatusPresenca | null, token?: string) {
  return chamar<BatePapo>(`${urlEvento(eventUuid)}/presenca`, 'PUT', { status }, token)
}

export function listarConfirmados(eventUuid: string, token?: string) {
  return chamar<ListaConfirmados>(`${urlEvento(eventUuid)}/confirmados`, 'GET', null, token)
}

/**
 * Baixa o .ics gerado pelo servidor (com o token: o endereço/link só entram
 * para quem confirmou "Vou") e entrega ao navegador como arquivo.
 */
export async function baixarIcs(eventUuid: string, token?: string): Promise<void> {
  const res = await fetch(`${urlEvento(eventUuid)}/ics`, RequestBodyWithAuthHeader('GET', null, null, token))
  if (!res.ok) throw new Error(String(res.status))
  const disposition = res.headers.get('Content-Disposition') || ''
  const nome = /filename="([^"]+)"/.exec(disposition)?.[1] || 'evento.ics'
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

// Minha agenda: preferências e feed pessoal ---------------------------------

export interface PreferenciasAgenda {
  email_reminders: boolean
  /** O servidor envia e-mail de lembrete? Sem isso, o interruptor não aparece. */
  email_available: boolean
  feed_active: boolean
  feed_created_at: string | null
}

export function obterPreferencias(orgId: number, token?: string) {
  return chamar<PreferenciasAgenda>(`${base()}/preferencias?org_id=${orgId}`, 'GET', null, token)
}

export function salvarPreferencias(orgId: number, dados: { email_reminders: boolean }, token?: string) {
  return chamar<PreferenciasAgenda>(`${base()}/preferencias?org_id=${orgId}`, 'PUT', dados, token)
}

/** Gera (ou troca) o link secreto. O token só vem nesta resposta. */
export function gerarFeed(orgId: number, token?: string) {
  return chamar<{ token: string; path: string }>(`${base()}/feed?org_id=${orgId}`, 'POST', null, token)
}

export function desligarFeed(orgId: number, token?: string) {
  return chamar<PreferenciasAgenda>(`${base()}/feed?org_id=${orgId}`, 'DELETE', null, token)
}

/** URL absoluta do feed a partir do caminho devolvido ("agenda/feed/<token>.ics"). */
export function urlFeed(path: string): string {
  const api = getAPIUrl()
  const abs = /^https?:\/\//.test(api) ? api : `${typeof window !== 'undefined' ? window.location.origin : ''}${api}`
  return `${abs}${path}`
}

/** "Assinar no Google Agenda": cid=webcal://… (o Google busca o feed sozinho). */
export function urlAssinarGoogle(feedUrl: string): string {
  const webcal = feedUrl.replace(/^https?:\/\//, 'webcal://')
  return `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}`
}

// Painel do admin -------------------------------------------------------------

export interface ConfigAgendaAdmin {
  organizers_usergroup_uuid: string | null
  organizers_usergroup_name: string | null
  regions: Regiao[]
}

export interface RegiaoEditada {
  region_uuid?: string | null
  name: string
  active: boolean
}

export function obterConfigAgenda(orgId: number, token?: string) {
  return chamar<ConfigAgendaAdmin>(`${base()}/admin/config?org_id=${orgId}`, 'GET', null, token)
}

export function salvarConfigAgenda(
  orgId: number,
  dados: { organizers_usergroup_uuid?: string; regions?: RegiaoEditada[] },
  token?: string
) {
  return chamar<ConfigAgendaAdmin>(`${base()}/admin/config?org_id=${orgId}`, 'PUT', dados, token)
}

// Google Agenda (link de modelo, sem OAuth) ---------------------------------

function dataGoogle(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** Local público: bairro e cidade (presencial) ou "Online". */
export function localPublico(ev: Pick<BatePapo, 'mode' | 'city' | 'neighborhood' | 'region'>): string {
  if (ev.mode === 'in_person') return [ev.neighborhood, ev.city || ev.region?.name].filter(Boolean).join(', ')
  return 'Online'
}

/**
 * Link "Adicionar ao Google Agenda". Usa só o que o servidor mandou: para quem
 * não confirmou "Vou", `address`/`meeting_url` vêm null, então o local fica só
 * bairro/cidade (ou "Online") e os detalhes levam o link público do evento.
 */
export function urlGoogleAgenda(ev: BatePapo, linkPublico: string): string {
  const local = ev.address
    ? [ev.address, ev.neighborhood, ev.city].filter(Boolean).join(', ')
    : ev.meeting_url || localPublico(ev)
  const detalhes = [ev.theme, ev.description, ev.meeting_url ? `Entrar: ${ev.meeting_url}` : '', linkPublico]
    .filter(Boolean)
    .join('\n\n')
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: ev.title,
    dates: `${dataGoogle(ev.starts_at)}/${dataGoogle(ev.ends_at)}`,
    details: detalhes.slice(0, 1500),
  })
  if (local) p.set('location', local)
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

// Situação --------------------------------------------------------------------

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
