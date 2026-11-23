import type { Metadata } from 'next'
import { getServerCanonicalUrl } from '@/lib/seo/utils.server'

/**
 * Prévia de link (Open Graph) da comunidade (Discipulei, item 3.4).
 *
 * A imagem sai de /api/og, que busca o conteúdo como visitante: o que não for
 * público vira a imagem genérica. Aqui só montamos a URL absoluta e o bloco de
 * metadados. Server-only (usa next/headers).
 */
export type TipoOg =
  | { tipo: 'generico' }
  | { tipo: 'comunidades' }
  | { tipo: 'espaco'; comunidade: string }
  | { tipo: 'discussao'; comunidade: string; discussao: string }

const curto = (uuid: string, prefixo: string) => uuid.replace(prefixo, '')

export async function urlImagemOg(orgslug: string, alvo: TipoOg): Promise<string> {
  const p = new URLSearchParams()
  if (alvo.tipo !== 'generico') p.set('tipo', alvo.tipo)
  if (alvo.tipo === 'espaco') p.set('c', curto(alvo.comunidade, 'community_'))
  if (alvo.tipo === 'discussao') {
    p.set('c', curto(alvo.comunidade, 'community_'))
    p.set('d', curto(alvo.discussao, 'discussion_'))
  }
  const qs = p.toString()
  return getServerCanonicalUrl(orgslug, `/api/og${qs ? `?${qs}` : ''}`)
}

/** Imagens OG + Twitter no formato 1200×630. */
export async function imagensOg(orgslug: string, alvo: TipoOg, alt: string) {
  const url = await urlImagemOg(orgslug, alvo)
  return {
    openGraph: { images: [{ url, width: 1200, height: 630, alt }] },
    twitter: { card: 'summary_large_image' as const, images: [url] },
  }
}

/**
 * Prévia genérica para o que é privado (links /n/<token>, Caderno, espaços
 * restritos, desafios): nome do site e uma frase fixa. Nunca título nem trecho.
 */
export async function metadadosOgGenericos(orgslug: string, siteName: string): Promise<Pick<Metadata, 'openGraph' | 'twitter'>> {
  const url = await urlImagemOg(orgslug, { tipo: 'generico' })
  const descricao = 'Leia a Bíblia, escreva e partilhe com a comunidade.'
  return {
    openGraph: {
      title: siteName,
      description: descricao,
      siteName,
      type: 'website',
      images: [{ url, width: 1200, height: 630, alt: siteName }],
    },
    twitter: { card: 'summary_large_image', title: siteName, description: descricao, images: [url] },
  }
}
