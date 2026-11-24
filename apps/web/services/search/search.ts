import { RequestBodyWithAuthHeader } from "@services/utils/ts/requests"
import { getAPIUrl } from "@services/config/config"
import { getResponseMetadata } from "@services/utils/ts/requests"

export async function searchOrgContent(
  org_slug: string,
  query: string,
  page: number = 1,
  limit: number = 10,
  next: any,
  access_token?: any,
) {
  const url = `${getAPIUrl()}search/org_slug/${org_slug}?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`
  const result: any = await fetch(
    url,
    RequestBodyWithAuthHeader('GET', null, next, access_token),
  )
  return getResponseMetadata(result)
}

/** Posts que citam a passagem ("1Pe 1", "Salmos", "Mt 28:18-20", "Mt 28:19"). */
export async function searchPassage(
  org_slug: string,
  query: string,
  page: number = 1,
  limit: number = 10,
  access_token?: any,
) {
  const url = `${getAPIUrl()}search/org_slug/${org_slug}/passage?query=${encodeURIComponent(query)}&page=${page}&limit=${limit}`
  const result: any = await fetch(url, RequestBodyWithAuthHeader('GET', null, null, access_token))
  return getResponseMetadata(result)
}

export interface BuscaBibliaParams {
  query: string
  versao?: string
  testamento?: '' | 'AT' | 'NT'
  livro?: string
  ordem?: 'relevancia' | 'canonica'
  page?: number
  limit?: number
}

/** Busca por palavras na Bíblia (versões abertas no banco; licenciadas pelo provedor, com recuo). */
export async function searchBible(params: BuscaBibliaParams, access_token?: any) {
  const q = new URLSearchParams({ query: params.query })
  if (params.versao) q.set('versao', params.versao)
  if (params.testamento) q.set('testamento', params.testamento)
  if (params.livro) q.set('livro', params.livro)
  if (params.ordem && params.ordem !== 'relevancia') q.set('ordem', params.ordem)
  q.set('page', String(params.page ?? 1))
  q.set('limit', String(params.limit ?? 20))
  const result: any = await fetch(
    `${getAPIUrl()}search/biblia?${q.toString()}`,
    RequestBodyWithAuthHeader('GET', null, null, access_token),
  )
  return getResponseMetadata(result)
}
