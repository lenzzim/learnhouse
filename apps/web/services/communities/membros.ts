/**
 * Cliente da comunidade v5 (24/11/2026): WhatsApp na entrada (N42),
 * configurações da org e grupo de autores (N45), salvos e compartilhar (N44).
 * Rotas em /api/v1/social; o servidor checa org e leitura em todas.
 *
 * A escolha do grupo do WhatsApp só volta para a própria pessoa e para admins.
 */
import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { PostDoFeed } from '@services/communities/social'

export type GrupoWhatsapp = 'homens' | 'mulheres'

/** Só se cada grupo tem link; o link em si nunca vem aqui. */
export interface WhatsappConfigurado {
  mulheres: boolean
  homens: boolean
}

export interface MeuWhatsapp {
  group: GrupoWhatsapp | null
  /** O passo único já foi mostrado (escolheu ou "Agora não"). */
  prompted: boolean
  /**
   * Link só do grupo escolhido (null sem escolha ou sem link configurado).
   * Espaço privativo: a API só devolve para membro logado da org.
   */
  url: string | null
  /** O grupo escolhido tem link? false = "Em breve o link aparece aqui". */
  configured: boolean
}

export interface ConfigComunidade {
  is_author: boolean
  can_manage_events: boolean
  whatsapp: WhatsappConfigurado
}

export interface RefGrupo {
  usergroup_uuid: string
  name: string
}

export interface ConfigOrgAdmin {
  authors_usergroup: RefGrupo | null
  men_usergroup: RefGrupo | null
  women_usergroup: RefGrupo | null
  whatsapp_men_url: string
  whatsapp_women_url: string
  default_whatsapp_men_url: string
  default_whatsapp_women_url: string
  /** Grupo sem link nenhum (nem painel nem env): mostrar aviso ao admin. */
  whatsapp_men_missing: boolean
  whatsapp_women_missing: boolean
}

export interface ConfigOrgAdminUpdate {
  /** "" limpa; ausente mantém. */
  authors_usergroup_uuid?: string
  men_usergroup_uuid?: string
  women_usergroup_uuid?: string
  whatsapp_men_url?: string
  whatsapp_women_url?: string
}

export interface EscolhaWhatsappAdmin {
  user_uuid: string
  username: string
  first_name: string
  last_name: string
  whatsapp_group: GrupoWhatsapp | null
  /** Só sugestão: a entrada no grupo continua aprovada por um líder (N31). */
  suggested_usergroup: RefGrupo | null
  in_suggested_group: boolean
}

export interface PostCompartilhado {
  discussion_uuid: string
  community_uuid: string
  title: string
  author_name: string
  excerpt: string
  truncated: boolean
  label: string | null
  creation_date: string
}

export type PostSalvo = PostDoFeed & { saved: true }

/** Regras de cada espaço, guardadas em community.moderation_settings. */
export interface RegrasEspaco {
  /** 'all' = todos os membros publicam; 'group' = só um grupo de usuários. */
  post_policy?: 'all' | 'group'
  post_usergroup_uuid?: string | null
  comments_disabled?: boolean
  /** Nunca gera link público (ex.: "Pedidos de oração"). */
  not_shareable?: boolean
}

const base = () => `${getAPIUrl()}social`

async function chamar<T>(url: string, metodo: string, corpo: unknown, token?: string): Promise<T> {
  const res = await fetch(url, RequestBodyWithAuthHeader(metodo, corpo ?? null, null, token))
  return errorHandling(res)
}

// Config --------------------------------------------------------------------

export function obterConfigComunidade(orgId: number, token?: string) {
  return chamar<ConfigComunidade>(`${base()}/config?org_id=${orgId}`, 'GET', null, token)
}

export function obterConfigOrgAdmin(orgId: number, token?: string) {
  return chamar<ConfigOrgAdmin>(`${base()}/admin/settings?org_id=${orgId}`, 'GET', null, token)
}

export function salvarConfigOrgAdmin(orgId: number, dados: ConfigOrgAdminUpdate, token?: string) {
  return chamar<ConfigOrgAdmin>(`${base()}/admin/settings?org_id=${orgId}`, 'PUT', dados, token)
}

export function listarEscolhasWhatsapp(orgId: number, page: number, token?: string) {
  return chamar<EscolhaWhatsappAdmin[]>(`${base()}/admin/whatsapp?org_id=${orgId}&page=${page}&limit=50`, 'GET', null, token)
}

// WhatsApp (N42) ------------------------------------------------------------

export function obterMeuWhatsapp(orgId: number, token?: string) {
  return chamar<MeuWhatsapp>(`${base()}/whatsapp?org_id=${orgId}`, 'GET', null, token)
}

/** group = escolha; dismissed = "Agora não"; group null sem dismissed = apagar a escolha. */
export function salvarMeuWhatsapp(
  orgId: number,
  dados: { group: GrupoWhatsapp | null; dismissed?: boolean },
  token?: string
) {
  return chamar<MeuWhatsapp>(`${base()}/whatsapp?org_id=${orgId}`, 'PUT', dados, token)
}

// Salvos (N44) --------------------------------------------------------------

export function listarSalvos(orgId: number, page: number, token?: string) {
  return chamar<PostSalvo[]>(`${base()}/salvos?org_id=${orgId}&page=${page}&limit=20`, 'GET', null, token)
}

export function salvarPost(discussionUuid: string, salvo: boolean, token?: string) {
  return chamar<{ saved: boolean }>(
    `${base()}/discussions/${encodeURIComponent(discussionUuid)}/salvo`,
    salvo ? 'PUT' : 'DELETE',
    null,
    token
  )
}

// Compartilhar (N44) --------------------------------------------------------

export function alternarCompartilhamento(discussionUuid: string, ligado: boolean, token?: string) {
  return chamar<{ enabled: boolean; shareable: boolean }>(
    `${base()}/discussions/${encodeURIComponent(discussionUuid)}/compartilhamento`,
    'PUT',
    { enabled: ligado },
    token
  )
}

/** Prévia pública (sem login). Lança erro (404) para o que não pode sair. */
export async function obterPostCompartilhado(orgId: number, discussionUuid: string): Promise<PostCompartilhado | null> {
  const res = await fetch(
    `${base()}/compartilhado/${encodeURIComponent(discussionUuid)}?org_id=${orgId}`,
    { method: 'GET', headers: { 'Content-Type': 'application/json' }, cache: 'no-store' }
  )
  if (!res.ok) return null
  return (await res.json()) as PostCompartilhado
}

/** Caminho público do post compartilhado (sem o prefixo "discussion_"). */
export function caminhoCompartilhado(discussionUuid: string): string {
  return `/p/${discussionUuid.replace(/^discussion_/, '')}`
}
