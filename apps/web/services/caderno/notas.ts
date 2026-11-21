/**
 * Cliente da API do Caderno (/api/v1/notes). Toda rota, menos a leitura por
 * link (/notes/shared/<token>), só devolve as notas da própria pessoa: nem
 * admin nem moderador leem o caderno de ninguém (LGPD art. 11).
 */
import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

export type TipoNota = 'note' | 'tcd' | 'study'
export type Visibilidade = 'private' | 'link' | 'community'
export type EscopoLink = 'anyone_with_link' | 'members'

export interface RefBiblica {
  book: string
  chapter: number
  verse_start?: number | null
  verse_end?: number | null
}

export interface NotaResumo {
  note_uuid: string
  title: string
  kind: TipoNota
  tcd_date: string | null
  collection_uuid: string | null
  visibility: Visibilidade
  excerpt: string
  tags: string[]
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Nota {
  note_uuid: string
  org_id: number
  title: string
  content_json: string
  kind: TipoNota
  tcd_date: string | null
  collection_uuid: string | null
  visibility: Visibilidade
  tags: string[]
  links: { target_title: string; target_note_uuid: string | null }[]
  bible_refs: RefBiblica[]
  published_discussion_uuid: string | null
  published_community_uuid: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface ListaNotas {
  items: NotaResumo[]
  total: number
  page: number
  limit: number
}

export interface Colecao {
  collection_uuid: string
  name: string
  parent_uuid: string | null
  position: number
  note_count: number
}

export interface Tag {
  tag_uuid: string
  name: string
  count: number
}

export interface Compartilhamento {
  share_uuid: string
  scope: EscopoLink
  created_at: string
  expires_at: string | null
}

export interface CompartilhamentoCriado extends Compartilhamento {
  token: string
}

export interface NotaCompartilhada {
  title: string
  content_json: string
  kind: TipoNota
  tcd_date: string | null
  updated_at: string
  author_name: string
  scope: EscopoLink
}

export interface FiltrosNotas {
  collection_uuid?: string
  tag?: string
  kind?: TipoNota
  q?: string
  date_from?: string
  date_to?: string
  trash?: boolean
  page?: number
  limit?: number
}

const base = () => `${getAPIUrl()}notes`

async function chamar<T>(url: string, metodo: string, corpo: unknown, token?: string): Promise<T> {
  const res = await fetch(url, RequestBodyWithAuthHeader(metodo, corpo ?? null, null, token))
  return errorHandling(res)
}

/** Prefixo da API ↔ id curto da URL (/caderno/<id>). */
export const idDaNota = (noteUuid: string) => noteUuid.replace(/^note_/, '')
export const uuidDaNota = (id: string) => (id.startsWith('note_') ? id : `note_${id}`)

export function listarNotas(orgId: number, filtros: FiltrosNotas, token?: string) {
  const p = new URLSearchParams({ org_id: String(orgId) })
  for (const [k, v] of Object.entries(filtros)) {
    if (v === undefined || v === null || v === '') continue
    p.set(k, String(v))
  }
  return chamar<ListaNotas>(`${base()}?${p}`, 'GET', null, token)
}

export function criarNota(
  dados: { org_id: number; title?: string; content_json?: string; kind?: TipoNota; collection_uuid?: string | null },
  token?: string
) {
  return chamar<Nota>(base(), 'POST', dados, token)
}

export function obterNota(noteUuid: string, token?: string) {
  return chamar<Nota>(`${base()}/${encodeURIComponent(noteUuid)}`, 'GET', null, token)
}

export function salvarNota(
  noteUuid: string,
  dados: { title?: string; content_json?: string; collection_uuid?: string; bible_refs?: RefBiblica[] },
  token?: string
) {
  return chamar<Nota>(`${base()}/${encodeURIComponent(noteUuid)}`, 'PUT', dados, token)
}

export function moverParaLixeira(noteUuid: string, token?: string) {
  return chamar<{ ok: boolean }>(`${base()}/${encodeURIComponent(noteUuid)}`, 'DELETE', null, token)
}

export function restaurarNota(noteUuid: string, token?: string) {
  return chamar<Nota>(`${base()}/${encodeURIComponent(noteUuid)}/restore`, 'POST', null, token)
}

export function apagarDeVez(noteUuid: string, token?: string) {
  return chamar<{ ok: boolean }>(`${base()}/${encodeURIComponent(noteUuid)}/permanent`, 'DELETE', null, token)
}

/** Nota com esse título exato (sem diferenciar maiúsculas), ou null. */
export async function resolverTitulo(orgId: number, titulo: string, token?: string): Promise<NotaResumo | null> {
  try {
    return await chamar<NotaResumo>(
      `${base()}/resolve?org_id=${orgId}&title=${encodeURIComponent(titulo)}`,
      'GET',
      null,
      token
    )
  } catch (e: any) {
    if (e?.status === 404) return null
    throw e
  }
}

/** TCD do dia: abre o que existe ou cria (idempotente). */
export function abrirTcd(orgId: number, data: string, token?: string) {
  return chamar<Nota>(`${base()}/tcd`, 'POST', { org_id: orgId, date: data }, token)
}

export function calendarioTcd(orgId: number, mes: string, hoje: string, token?: string) {
  return chamar<{ dates: string[]; streak: number }>(
    `${base()}/tcd-calendar?org_id=${orgId}&month=${mes}&today=${hoje}`,
    'GET',
    null,
    token
  )
}

export function backlinks(noteUuid: string, token?: string) {
  return chamar<NotaResumo[]>(`${base()}/${encodeURIComponent(noteUuid)}/backlinks`, 'GET', null, token)
}

export async function exportarMarkdown(noteUuid: string, token?: string): Promise<{ nome: string; texto: string }> {
  const res = await fetch(
    `${base()}/${encodeURIComponent(noteUuid)}/export`,
    RequestBodyWithAuthHeader('GET', null, null, token)
  )
  if (!res.ok) throw Object.assign(new Error('export'), { status: res.status })
  const disp = res.headers.get('content-disposition') || ''
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disp)
  return { nome: m ? decodeURIComponent(m[1]) : 'nota.md', texto: await res.text() }
}

export function listarColecoes(orgId: number, token?: string) {
  return chamar<Colecao[]>(`${base()}/collections?org_id=${orgId}`, 'GET', null, token)
}

export function criarColecao(orgId: number, nome: string, paiUuid: string | null, token?: string) {
  return chamar<Colecao>(`${base()}/collections`, 'POST', { org_id: orgId, name: nome, parent_uuid: paiUuid }, token)
}

export function editarColecao(
  uuid: string,
  dados: { name?: string; parent_uuid?: string; position?: number },
  token?: string
) {
  return chamar<Colecao>(`${base()}/collections/${encodeURIComponent(uuid)}`, 'PUT', dados, token)
}

export function apagarColecao(uuid: string, token?: string) {
  return chamar<{ ok: boolean }>(`${base()}/collections/${encodeURIComponent(uuid)}`, 'DELETE', null, token)
}

export function listarTags(orgId: number, token?: string) {
  return chamar<Tag[]>(`${base()}/tags?org_id=${orgId}`, 'GET', null, token)
}

export function renomearTag(tagUuid: string, nome: string, token?: string) {
  return chamar<Tag>(`${base()}/tags/${encodeURIComponent(tagUuid)}`, 'PUT', { name: nome }, token)
}

export function listarLinks(noteUuid: string, token?: string) {
  return chamar<Compartilhamento[]>(`${base()}/${encodeURIComponent(noteUuid)}/shares`, 'GET', null, token)
}

export function criarLink(noteUuid: string, escopo: EscopoLink, token?: string) {
  return chamar<CompartilhamentoCriado>(
    `${base()}/${encodeURIComponent(noteUuid)}/shares`,
    'POST',
    { scope: escopo },
    token
  )
}

export function revogarLink(noteUuid: string, shareUuid: string, token?: string) {
  return chamar<{ ok: boolean }>(
    `${base()}/${encodeURIComponent(noteUuid)}/shares/${encodeURIComponent(shareUuid)}`,
    'DELETE',
    null,
    token
  )
}

export function publicarNaComunidade(noteUuid: string, communityUuid: string, token?: string) {
  return chamar<{ discussion_uuid: string; community_uuid: string }>(
    `${base()}/${encodeURIComponent(noteUuid)}/publish`,
    'POST',
    { community_uuid: communityUuid },
    token
  )
}

/** Copia as notas antigas ("Meu caderno" = discussões privadas). Idempotente. */
export function migrarCadernoAntigo(orgId: number, token?: string) {
  return chamar<{ copied: number }>(`${base()}/migrate-legacy?org_id=${orgId}`, 'POST', null, token)
}

/** Leitura pública por link. Sem cache e sem referer. */
export async function lerCompartilhada(tokenLink: string, tokenSessao?: string): Promise<NotaCompartilhada> {
  const opcoes = RequestBodyWithAuthHeader('GET', null, null, tokenSessao)
  const res = await fetch(`${base()}/shared/${encodeURIComponent(tokenLink)}`, {
    ...opcoes,
    referrerPolicy: 'no-referrer',
  })
  return errorHandling(res)
}
