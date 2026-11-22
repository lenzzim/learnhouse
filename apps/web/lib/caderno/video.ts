/**
 * Vídeos no Caderno: só por link, só YouTube e Vimeo (lista fechada de
 * domínios). Nada de upload de vídeo.
 *
 * - YouTube vira embed no domínio youtube-nocookie.com (sem cookie de
 *   rastreio até a pessoa dar play);
 * - Vimeo vira player.vimeo.com com `dnt=1` (do not track).
 *
 * Módulo PURO e SEM IMPORTS: roda no Node (lib/caderno/video.test.mjs).
 */

export type VideoAnalisado =
  | { tipo: 'youtube'; id: string; inicio?: number; url: string; embed: string }
  | { tipo: 'vimeo'; id: string; hash?: string; url: string; embed: string }

const HOSTS_YOUTUBE = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
  'youtu.be',
  'youtube-nocookie.com',
  'www.youtube-nocookie.com',
])
const HOSTS_VIMEO = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com'])

const ID_YOUTUBE = /^[A-Za-z0-9_-]{11}$/
const ID_VIMEO = /^\d{1,12}$/
const HASH_VIMEO = /^[0-9a-f]{6,20}$/i

/** "1h2m3s", "90s", "90" → segundos */
function segundos(valor: string | null): number | undefined {
  if (!valor) return undefined
  if (/^\d+$/.test(valor)) return Number(valor) || undefined
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(valor)
  if (!m || (!m[1] && !m[2] && !m[3])) return undefined
  const total = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)
  return total || undefined
}

function lerUrl(texto: string): URL | null {
  const bruto = (texto || '').trim()
  if (!bruto || bruto.length > 500 || /\s/.test(bruto)) return null
  try {
    const url = new URL(/^https?:\/\//i.test(bruto) ? bruto : `https://${bruto}`)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    if (url.username || url.password || (url.port && url.port !== '443' && url.port !== '80')) return null
    return url
  } catch {
    return null
  }
}

/** Link de vídeo → dados do embed, ou null se não for YouTube/Vimeo válido. */
export function analisarUrlVideo(texto: string): VideoAnalisado | null {
  const url = lerUrl(texto)
  if (!url) return null
  const host = url.hostname.toLowerCase()
  const partes = url.pathname.split('/').filter(Boolean)

  if (HOSTS_YOUTUBE.has(host)) {
    let id: string | undefined
    if (host === 'youtu.be') id = partes[0]
    else if (partes[0] === 'watch') id = url.searchParams.get('v') ?? undefined
    else if (['embed', 'shorts', 'live', 'v'].includes(partes[0] ?? '')) id = partes[1]
    if (!id || !ID_YOUTUBE.test(id)) return null
    const inicio = segundos(url.searchParams.get('t') ?? url.searchParams.get('start'))
    const embed = `https://www.youtube-nocookie.com/embed/${id}${inicio ? `?start=${inicio}` : ''}`
    return { tipo: 'youtube', id, inicio, url: `https://www.youtube.com/watch?v=${id}${inicio ? `&t=${inicio}` : ''}`, embed }
  }

  if (HOSTS_VIMEO.has(host)) {
    let id: string | undefined
    let hash: string | undefined
    if (host === 'player.vimeo.com') {
      if (partes[0] !== 'video') return null
      id = partes[1]
      hash = url.searchParams.get('h') ?? undefined
    } else {
      // vimeo.com/123, vimeo.com/123/abcdef (não listado), vimeo.com/channels/x/123
      const i = partes.findIndex((p) => ID_VIMEO.test(p))
      if (i < 0) return null
      id = partes[i]
      const prox = partes[i + 1]
      hash = prox && HASH_VIMEO.test(prox) ? prox : (url.searchParams.get('h') ?? undefined)
    }
    if (!id || !ID_VIMEO.test(id)) return null
    if (hash && !HASH_VIMEO.test(hash)) hash = undefined
    return {
      tipo: 'vimeo',
      id,
      hash,
      url: `https://vimeo.com/${id}${hash ? `/${hash}` : ''}`,
      embed: embedVimeo(id, hash),
    }
  }
  return null
}

/** Embed do Vimeo sempre com dnt=1 ('' se o id não for válido). */
export function embedVimeo(id: string, hash?: string | null): string {
  if (!ID_VIMEO.test(id || '')) return ''
  const h = hash && HASH_VIMEO.test(hash) ? `&h=${hash}` : ''
  return `https://player.vimeo.com/video/${id}?dnt=1${h}`
}

/** src de embed do YouTube (nocookie) a partir de qualquer link aceito; '' se inválido. */
export function embedYoutube(texto: string): string {
  const v = analisarUrlVideo(texto)
  return v && v.tipo === 'youtube' ? v.embed : ''
}

/** Imagem por link: só https e sem credenciais na URL. */
export function urlImagemValida(texto: string): string | null {
  const bruto = (texto || '').trim()
  if (!bruto || bruto.length > 2000 || /\s/.test(bruto)) return null
  try {
    const url = new URL(bruto)
    if (url.protocol !== 'https:' || url.username || url.password) return null
    return url.toString()
  } catch {
    return null
  }
}
