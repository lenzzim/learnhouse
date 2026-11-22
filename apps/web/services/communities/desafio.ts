import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'

/**
 * Desafio atual (Discipulei, 22/11/2026): o curso publicado mais recente que
 * tem comunidade ligada e que a pessoa pode ver. A regra mora na API
 * (apps/api/src/services/communities/desafio.py).
 */
export interface DesafioAtual {
  course_uuid: string
  course_name: string
  course_description: string | null
  course_thumbnail_image: string | null
  community_uuid: string
  community_name: string
  is_enrolled: boolean
}

export async function getDesafioAtual(orgId: number, accessToken?: string): Promise<DesafioAtual | null> {
  const result: any = await fetch(
    `${getAPIUrl()}communities/org/${orgId}/current-challenge`,
    RequestBodyWithAuthHeader('GET', null, null, accessToken)
  )
  const res = await errorHandling(result)
  return res ?? null
}
