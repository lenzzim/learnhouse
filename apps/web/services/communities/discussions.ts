import { getAPIUrl } from '@services/config/config'
import {
  RequestBodyWithAuthHeader,
  errorHandling,
  getResponseMetadata,
} from '@services/utils/ts/requests'

// Discussion labels - must match backend (apps/api/src/db/communities/discussions.py)
// Discipulei: categorias de fórum devocional. Cores neutras/suaves que funcionam
// no tema escuro (#121211) e no claro (#fbfaf7) — sem dourado/âmbar (decisão N19).
// Só estas são oferecidas para posts novos.
export const DISCUSSION_LABELS = [
  { id: 'devocional', name: 'Devocional', color: '#8fb8ea', icon: 'BookOpen' },
  // Tipos de post da decisão N39 (estudo e culto entram aqui; pergunta,
  // testemunho e oração já existiam). O "tipo de post" é este mesmo campo.
  { id: 'estudo', name: 'Estudo', color: '#a3a19c', icon: 'NotebookPen' },
  { id: 'culto', name: 'Anotação de culto', color: '#a3a19c', icon: 'Church' },
  { id: 'testemunho', name: 'Testemunho', color: '#b9a6ec', icon: 'Sparkles' },
  { id: 'oracao', name: 'Pedido de oração', color: '#e5978f', icon: 'HandHeart' },
  { id: 'question', name: 'Pergunta', color: '#a3a19c', icon: 'HelpCircle' },
  { id: 'announcement', name: 'Aviso', color: '#8a877f', icon: 'Megaphone' },
  { id: 'general', name: 'Geral', color: '#7d7b75', icon: 'MessageSquare' },
] as const

// Rótulos antigos do upstream: não são mais oferecidos, mas posts antigos
// continuam renderizando com eles.
const LEGACY_DISCUSSION_LABELS = [
  { id: 'idea', name: 'Ideas', color: '#a3a19c', icon: 'Lightbulb' },
  { id: 'showcase', name: 'Show and Tell', color: '#a3a19c', icon: 'Star' },
] as const

export type DiscussionLabelId =
  | typeof DISCUSSION_LABELS[number]['id']
  | typeof LEGACY_DISCUSSION_LABELS[number]['id']

// Template leve para devocionais (TipTap JSON — o editor salva JSON, não HTML).
// Os títulos chegam já traduzidos de quem chama.
export function buildDevotionalTemplate(headings: {
  passage: string
  learned: string
  apply: string
  prayer: string
}) {
  const section = (text: string) => [
    { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text }] },
    { type: 'paragraph' },
  ]
  return {
    type: 'doc',
    content: [
      ...section(headings.passage),
      ...section(headings.learned),
      ...section(headings.apply),
      ...section(headings.prayer),
    ],
  }
}

// ============================================================================
// Visibilidade (caderno privado)
// ============================================================================

export type DiscussionVisibility = 'public' | 'private'

export interface DiscussionLabel {
  id: string
  name: string
  color: string
  icon: string
}

export interface Discussion {
  id: number
  community_id: number
  org_id: number
  author_id: number
  discussion_uuid: string
  title: string
  content: string | null
  label: string
  emoji: string | null
  upvote_count: number
  edit_count: number
  is_pinned: boolean
  is_locked: boolean
  // Opcional para tolerar respostas de uma API antiga (ausente = pública).
  visibility?: DiscussionVisibility
  /** Resposta útil (só em perguntas): id do comentário marcado. */
  accepted_comment_id?: number | null
  creation_date: string
  update_date: string
}

/** Rótulo das perguntas: só elas têm "resposta útil". */
export const LABEL_PERGUNTA = 'question'

export interface DiscussionAuthor {
  id: number
  user_uuid: string
  username: string
  first_name: string
  last_name: string
  avatar_image: string | null
}

export interface DiscussionWithAuthor extends Discussion {
  author: DiscussionAuthor | null
  has_voted: boolean
}

export interface DiscussionCreate {
  title: string
  content?: string | null
  label?: string
  emoji?: string | null
  visibility?: DiscussionVisibility
}

export interface DiscussionUpdate {
  title?: string
  content?: string | null
  label?: string
  emoji?: string | null
  visibility?: DiscussionVisibility
}

export function isPrivateDiscussion(discussion: Pick<Discussion, 'visibility'>): boolean {
  return discussion.visibility === 'private'
}

// Item do "Meu caderno": inclui a comunidade para montar o link.
export interface NotebookDiscussion extends DiscussionWithAuthor {
  community_uuid: string
  community_name: string
}

export type DiscussionSortBy = 'recent' | 'upvotes' | 'hot'

export interface DiscussionVote {
  id: number
  discussion_id: number
  user_id: number
  vote_uuid: string
  creation_date: string
}

export function getLabelInfo(labelId: string): DiscussionLabel {
  const all: readonly DiscussionLabel[] = [...DISCUSSION_LABELS, ...LEGACY_DISCUSSION_LABELS]
  return (
    all.find(l => l.id === labelId) ||
    all.find(l => l.id === 'general') ||
    DISCUSSION_LABELS[0]
  )
}

export async function setDiscussionVisibility(
  discussion_uuid: string,
  visibility: DiscussionVisibility,
  access_token: string
): Promise<DiscussionWithAuthor> {
  const result: any = await fetch(
    `${getAPIUrl()}discussions/${discussion_uuid}/visibility`,
    {
      ...RequestBodyWithAuthHeader('PATCH', null, null, access_token),
      // RequestBodyWithAuthHeader só serializa corpo em POST/PUT/DELETE.
      body: JSON.stringify({ visibility }),
    }
  )
  const res = await errorHandling(result)
  return res
}

export async function getMyNotebook(
  org_id: number,
  page: number = 1,
  limit: number = 20,
  access_token?: string
): Promise<NotebookDiscussion[]> {
  const result: any = await fetch(
    `${getAPIUrl()}discussions/notebook?org_id=${org_id}&page=${page}&limit=${limit}`,
    RequestBodyWithAuthHeader('GET', null, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function getDiscussionLabels(): Promise<DiscussionLabel[]> {
  const result: any = await fetch(
    `${getAPIUrl()}discussions/labels`,
    RequestBodyWithAuthHeader('GET', null, null)
  )
  const res = await errorHandling(result)
  return res
}

export async function getDiscussions(
  community_uuid: string,
  sort_by: DiscussionSortBy = 'recent',
  page: number = 1,
  limit: number = 10,
  next: any,
  access_token?: string,
  label?: string,
  author_uuid?: string
): Promise<DiscussionWithAuthor[]> {
  let url = `${getAPIUrl()}communities/${community_uuid}/discussions?sort_by=${sort_by}&page=${page}&limit=${limit}`
  if (label) {
    url += `&label=${label}`
  }
  if (author_uuid) {
    url += `&author_uuid=${encodeURIComponent(author_uuid)}`
  }
  const result: any = await fetch(
    url,
    RequestBodyWithAuthHeader('GET', null, next, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function getDiscussion(
  discussion_uuid: string,
  next: any,
  access_token?: string
): Promise<DiscussionWithAuthor> {
  const result: any = await fetch(
    `${getAPIUrl()}discussions/${discussion_uuid}`,
    RequestBodyWithAuthHeader('GET', null, next, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function createDiscussion(
  community_uuid: string,
  data: DiscussionCreate,
  access_token: string
): Promise<DiscussionWithAuthor> {
  const result: any = await fetch(
    `${getAPIUrl()}communities/${community_uuid}/discussions`,
    RequestBodyWithAuthHeader('POST', data, null, access_token)
  )
  const res = await getResponseMetadata(result)
  if (!res.success) {
    const detail = res.data?.detail || res.data?.message || res.data
    let message: string
    if (typeof detail === 'string') {
      message = detail
    } else if (detail && typeof detail === 'object' && typeof detail.message === 'string') {
      message = detail.message
    } else {
      message = JSON.stringify(detail)
    }
    const error: any = new Error(message)
    error.status = res.status
    error.detail = detail
    throw error
  }
  // Post publicado direto na comunidade (N40: convite depois da 1ª nota publicada).
  if (data.visibility !== 'private' && typeof window !== 'undefined') {
    try {
      window.dispatchEvent(new CustomEvent('discipulei:nota-publicada', { detail: { discussion_uuid: res.data?.discussion_uuid } }))
    } catch {
      // ambiente sem CustomEvent
    }
  }
  return res.data
}

export async function updateDiscussion(
  discussion_uuid: string,
  data: DiscussionUpdate,
  access_token: string
): Promise<DiscussionWithAuthor> {
  const result: any = await fetch(
    `${getAPIUrl()}discussions/${discussion_uuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, access_token)
  )
  const res = await getResponseMetadata(result)
  if (!res.success) {
    const detail = res.data?.detail || res.data?.message || res.data
    let message: string
    if (typeof detail === 'string') {
      message = detail
    } else if (detail && typeof detail === 'object' && typeof detail.message === 'string') {
      message = detail.message
    } else {
      message = JSON.stringify(detail)
    }
    const error: any = new Error(message)
    error.status = res.status
    error.detail = detail
    throw error
  }
  return res.data
}

export async function pinDiscussion(
  discussion_uuid: string,
  is_pinned: boolean,
  access_token: string
): Promise<DiscussionWithAuthor> {
  const result: any = await fetch(
    `${getAPIUrl()}discussions/${discussion_uuid}/pin`,
    RequestBodyWithAuthHeader('PUT', { is_pinned }, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function lockDiscussion(
  discussion_uuid: string,
  is_locked: boolean,
  access_token: string
): Promise<DiscussionWithAuthor> {
  const result: any = await fetch(
    `${getAPIUrl()}discussions/${discussion_uuid}/lock`,
    RequestBodyWithAuthHeader('PUT', { is_locked }, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function deleteDiscussion(
  discussion_uuid: string,
  access_token: string
) {
  const result: any = await fetch(
    `${getAPIUrl()}discussions/${discussion_uuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function upvoteDiscussion(
  discussion_uuid: string,
  access_token: string
): Promise<DiscussionVote> {
  const result: any = await fetch(
    `${getAPIUrl()}discussions/${discussion_uuid}/vote`,
    RequestBodyWithAuthHeader('POST', null, null, access_token)
  )
  const res = await getResponseMetadata(result)
  return res.data
}

export async function removeUpvote(
  discussion_uuid: string,
  access_token: string
) {
  const result: any = await fetch(
    `${getAPIUrl()}discussions/${discussion_uuid}/vote`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function getUserVotesBatch(
  discussion_uuids: string[],
  access_token?: string
): Promise<Record<string, boolean>> {
  const result: any = await fetch(
    `${getAPIUrl()}discussions/votes/batch`,
    RequestBodyWithAuthHeader('POST', discussion_uuids, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

// ============================================================================
// Comments
// ============================================================================

export interface DiscussionComment {
  id: number
  discussion_id: number
  author_id: number
  comment_uuid: string
  content: string
  upvote_count: number
  creation_date: string
  update_date: string
}

export interface DiscussionCommentWithAuthor extends DiscussionComment {
  author: DiscussionAuthor | null
  has_voted: boolean
}

export interface CommentCreate {
  content: string
}

export async function getComments(
  discussion_uuid: string,
  page: number = 1,
  limit: number = 50,
  next: any,
  access_token?: string
): Promise<DiscussionCommentWithAuthor[]> {
  const result: any = await fetch(
    `${getAPIUrl()}discussions/${discussion_uuid}/comments?page=${page}&limit=${limit}`,
    RequestBodyWithAuthHeader('GET', null, next, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function createComment(
  discussion_uuid: string,
  data: CommentCreate,
  access_token: string
): Promise<DiscussionCommentWithAuthor> {
  const result: any = await fetch(
    `${getAPIUrl()}discussions/${discussion_uuid}/comments`,
    RequestBodyWithAuthHeader('POST', data, null, access_token)
  )
  const res = await getResponseMetadata(result)
  if (!res.success) {
    const detail = res.data?.detail || res.data?.message || res.data
    let message: string
    if (typeof detail === 'string') {
      message = detail
    } else if (detail && typeof detail === 'object' && typeof detail.message === 'string') {
      message = detail.message
    } else {
      message = JSON.stringify(detail)
    }
    const error: any = new Error(message)
    error.status = res.status
    error.detail = detail
    throw error
  }
  return res.data
}

export async function updateComment(
  comment_uuid: string,
  data: CommentCreate,
  access_token: string
): Promise<DiscussionCommentWithAuthor> {
  const result: any = await fetch(
    `${getAPIUrl()}comments/${comment_uuid}`,
    RequestBodyWithAuthHeader('PUT', data, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function deleteComment(
  comment_uuid: string,
  access_token: string
) {
  const result: any = await fetch(
    `${getAPIUrl()}comments/${comment_uuid}`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function getCommentCount(
  discussion_uuid: string,
  next: any,
  access_token?: string
): Promise<number> {
  const result: any = await fetch(
    `${getAPIUrl()}discussions/${discussion_uuid}/comments/count`,
    RequestBodyWithAuthHeader('GET', null, next, access_token)
  )
  const res = await errorHandling(result)
  return res.count
}

export interface CommentVote {
  id: number
  comment_id: number
  user_id: number
  vote_uuid: string
  creation_date: string
}

export async function upvoteComment(
  comment_uuid: string,
  access_token: string
): Promise<CommentVote> {
  const result: any = await fetch(
    `${getAPIUrl()}comments/${comment_uuid}/vote`,
    RequestBodyWithAuthHeader('POST', null, null, access_token)
  )
  const res = await getResponseMetadata(result)
  return res.data
}

export async function removeCommentUpvote(
  comment_uuid: string,
  access_token: string
) {
  const result: any = await fetch(
    `${getAPIUrl()}comments/${comment_uuid}/vote`,
    RequestBodyWithAuthHeader('DELETE', null, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

// ============================================================================
// Reactions
// ============================================================================

export interface ReactionUser {
  id: number
  user_uuid: string
  username: string
  first_name: string | null
  last_name: string | null
  avatar_image: string | null
}

export interface ReactionSummary {
  emoji: string
  count: number
  users: ReactionUser[]
  has_reacted: boolean
}

export async function getReactions(
  discussion_uuid: string,
  access_token?: string
): Promise<ReactionSummary[]> {
  const result: any = await fetch(
    `${getAPIUrl()}discussions/${discussion_uuid}/reactions`,
    RequestBodyWithAuthHeader('GET', null, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}

export async function toggleReaction(
  discussion_uuid: string,
  emoji: string,
  access_token: string
): Promise<{ action: 'added' | 'removed'; emoji: string }> {
  const result: any = await fetch(
    `${getAPIUrl()}discussions/${discussion_uuid}/reactions`,
    RequestBodyWithAuthHeader('POST', { emoji }, null, access_token)
  )
  const res = await errorHandling(result)
  return res
}
