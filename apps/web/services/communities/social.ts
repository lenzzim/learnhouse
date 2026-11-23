/**
 * Cliente do "social contido" (decisão N39): Pessoas, seguir, menções,
 * notificações, "Amém"/"Orando" e resposta útil. Rotas em /api/v1/social;
 * o servidor checa org e leitura em todas. Nada aqui traz e-mail.
 */
import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { DiscussionWithAuthor } from '@services/communities/discussions'

export type ReacaoFe = 'amem' | 'orando'
export const REACOES_FE: ReacaoFe[] = ['amem', 'orando']

export interface MeuPerfil {
  visible: boolean
  bio: string
  /** Só o dono recebe (N22). */
  follower_count: number
  following_count: number
}

export interface Pessoa {
  user_uuid: string
  username: string
  first_name: string
  last_name: string
  avatar_image: string | null
  bio: string
  is_self: boolean
  is_following: boolean
  /** Preenchido só quando a pessoa vê o próprio perfil. */
  follower_count: number | null
}

export interface CandidatoMencao {
  user_uuid: string
  username: string
  first_name: string
  last_name: string
  avatar_image: string | null
}

export interface Notificacao {
  notification_uuid: string
  kind: 'mention'
  creation_date: string
  read: boolean
  actor: CandidatoMencao | null
  discussion_uuid: string
  discussion_title: string
  community_uuid: string
  comment_uuid: string | null
}

export interface EstadoReacao {
  reacted: boolean
  /** null para quem não é o autor (N22). */
  count: number | null
}

export interface ReacoesFe {
  discussion: Record<ReacaoFe, EstadoReacao>
  comments: Record<string, Record<ReacaoFe, EstadoReacao>>
}

export type PostDoFeed = DiscussionWithAuthor & { community_uuid: string; community_name: string }

const base = () => `${getAPIUrl()}social`

async function chamar<T>(url: string, metodo: string, corpo: unknown, token?: string): Promise<T> {
  const res = await fetch(url, RequestBodyWithAuthHeader(metodo, corpo ?? null, null, token))
  return errorHandling(res)
}

export const nomeDaPessoa = (p: { first_name?: string | null; last_name?: string | null; username: string }) =>
  `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.username

// Perfil -----------------------------------------------------------------

export function obterMeuPerfil(orgId: number, token?: string) {
  return chamar<MeuPerfil>(`${base()}/profile?org_id=${orgId}`, 'GET', null, token)
}

export function salvarMeuPerfil(orgId: number, dados: { visible?: boolean; bio?: string }, token?: string) {
  return chamar<MeuPerfil>(`${base()}/profile?org_id=${orgId}`, 'PUT', dados, token)
}

// Pessoas ------------------------------------------------------------------

export function listarPessoas(
  orgId: number,
  opcoes: { q?: string; page?: number; limit?: number; seguindo?: boolean },
  token?: string
) {
  const p = new URLSearchParams({ org_id: String(orgId) })
  if (opcoes.q) p.set('q', opcoes.q)
  if (opcoes.page) p.set('page', String(opcoes.page))
  if (opcoes.limit) p.set('limit', String(opcoes.limit))
  if (opcoes.seguindo) p.set('following', 'true')
  return chamar<Pessoa[]>(`${base()}/people?${p}`, 'GET', null, token)
}

export function obterPessoa(orgId: number, userUuid: string, token?: string) {
  return chamar<Pessoa>(`${base()}/people/${encodeURIComponent(userUuid)}?org_id=${orgId}`, 'GET', null, token)
}

export function postsDaPessoa(orgId: number, userUuid: string, page: number, token?: string) {
  return chamar<PostDoFeed[]>(
    `${base()}/people/${encodeURIComponent(userUuid)}/discussions?org_id=${orgId}&page=${page}&limit=20`,
    'GET',
    null,
    token
  )
}

export function seguir(orgId: number, userUuid: string, token?: string) {
  return chamar<Pessoa>(`${base()}/people/${encodeURIComponent(userUuid)}/follow?org_id=${orgId}`, 'POST', null, token)
}

export function deixarDeSeguir(orgId: number, userUuid: string, token?: string) {
  return chamar<{ following: false }>(
    `${base()}/people/${encodeURIComponent(userUuid)}/follow?org_id=${orgId}`,
    'DELETE',
    null,
    token
  )
}

export function feedSeguindo(orgId: number, limit: number, token?: string) {
  return chamar<PostDoFeed[]>(`${base()}/feed/following?org_id=${orgId}&limit=${limit}`, 'GET', null, token)
}

// Menções ------------------------------------------------------------------

export function candidatosMencao(communityUuid: string, q: string, discussionUuid: string | undefined, token?: string) {
  const p = new URLSearchParams({ community_uuid: communityUuid, q })
  if (discussionUuid) p.set('discussion_uuid', discussionUuid)
  return chamar<CandidatoMencao[]>(`${base()}/mentionable?${p}`, 'GET', null, token)
}

// Notificações -------------------------------------------------------------

export function listarNotificacoes(orgId: number, token?: string) {
  return chamar<Notificacao[]>(`${base()}/notifications?org_id=${orgId}`, 'GET', null, token)
}

export function contarNaoLidas(orgId: number, token?: string) {
  return chamar<{ count: number }>(`${base()}/notifications/unread?org_id=${orgId}`, 'GET', null, token)
}

export function marcarLidas(orgId: number, token?: string, notificationUuid?: string) {
  const extra = notificationUuid ? `&notification_uuid=${encodeURIComponent(notificationUuid)}` : ''
  return chamar<{ ok: boolean }>(`${base()}/notifications/read?org_id=${orgId}${extra}`, 'POST', null, token)
}

// Amém / Orando --------------------------------------------------------------

export function obterReacoesFe(discussionUuid: string, token?: string) {
  return chamar<ReacoesFe>(`${base()}/discussions/${encodeURIComponent(discussionUuid)}/reacoes`, 'GET', null, token)
}

export function alternarReacaoPost(discussionUuid: string, tipo: ReacaoFe, token?: string) {
  return chamar<{ kind: ReacaoFe; reacted: boolean }>(
    `${base()}/discussions/${encodeURIComponent(discussionUuid)}/reacoes/${tipo}`,
    'POST',
    null,
    token
  )
}

export function alternarReacaoComentario(commentUuid: string, tipo: ReacaoFe, token?: string) {
  return chamar<{ kind: ReacaoFe; reacted: boolean }>(
    `${base()}/comments/${encodeURIComponent(commentUuid)}/reacoes/${tipo}`,
    'POST',
    null,
    token
  )
}

// Resposta útil --------------------------------------------------------------

export function marcarRespostaUtil(discussionUuid: string, commentUuid: string | null, token?: string) {
  return chamar<{ accepted_comment_id: number | null }>(
    `${base()}/discussions/${encodeURIComponent(discussionUuid)}/resposta-util`,
    'PUT',
    { comment_uuid: commentUuid },
    token
  )
}
