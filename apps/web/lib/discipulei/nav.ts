/* ==========================================================================
   Navegação de app da comunidade Discipulei
   --------------------------------------------------------------------------
   Fonte única das decisões de navegação (dono, 21/11/2026). O shell
   (components/Discipulei/Navegacao) e o proxy leem daqui, em vez de espalhar
   condicionais pelo código do upstream.

   - Celular e tablet (< 1024px): barra superior (logo, busca, avatar) e barra
     de abas fixa embaixo, na zona do polegar.
   - Desktop (>= 1024px): barra lateral no estilo Notion/Discord.
   - O que é de LMS (cursos, biblioteca, podcasts...) some da navegação para
     todos e as rotas ficam fechadas para quem não é admin. Admin continua
     chegando ao painel pelo menu do avatar e pode abrir qualquer rota.

   Este arquivo não importa React nem nada do navegador: o proxy (edge) também
   o usa.
   ========================================================================== */

/** Primeira tela de quem já entrou. */
export const ROTA_INICIAL = '/hoje'

/** Chave do último capítulo lido, gravada pelo leitor da Bíblia ("JHN.3"). */
export const CHAVE_ULTIMO_CAPITULO = 'discipulei_biblia_ultimo'

/* --------------------------------------------------------------------------
   Idiomas (dono, 21/11/2026): português é o padrão para todos; o seletor
   oferece só PT, EN e ES nesta comunidade (os outros locales continuam no
   repositório, só não aparecem). A escolha fica em 'discipulei_lng'
   (LANGUAGE_STORAGE_KEY em lib/i18n.ts).
   -------------------------------------------------------------------------- */

/** Idiomas oferecidos no seletor, nesta ordem. */
export const IDIOMAS_DISCIPULEI = ['pt', 'en', 'es'] as const
export type IdiomaDiscipulei = (typeof IDIOMAS_DISCIPULEI)[number]

/** Código de idioma do i18next ("pt-BR", "en-US", "es") -> pt | en | es (padrão pt). */
export function idiomaDiscipulei(lng: string | null | undefined): IdiomaDiscipulei {
  const base = String(lng || '').split('-')[0].toLowerCase()
  return (IDIOMAS_DISCIPULEI as readonly string[]).includes(base) ? (base as IdiomaDiscipulei) : 'pt'
}

/** Página do discipulado no site, com o agendamento (português). */
export const URL_DISCIPULADO = 'https://www.discipulei.com.br/discipulado-biblico/'

/** A mesma página em cada idioma do seletor. */
export const URL_DISCIPULADO_POR_IDIOMA: Record<IdiomaDiscipulei, string> = {
  pt: URL_DISCIPULADO,
  en: 'https://www.discipulei.com.br/en/discipulado-biblico/',
  es: 'https://www.discipulei.com.br/es/discipulado-biblico/',
}

/**
 * Lugares de onde o "Agendar estudo" é aberto. Vão no `?o=comunidade-<lugar>`
 * para a atribuição no site.
 */
export type LugarAgendar =
  | 'lista'
  | 'comunidade'
  | 'discussao'
  | 'menu'
  | 'menu-lateral'
  | 'devocional'
  | 'biblia'

/**
 * Link do "Agendar estudo" — o único lugar que monta essa URL. Em inglês e
 * espanhol aponta para a página do site no idioma (/en/, /es/); o `o=` da
 * atribuição vai sempre.
 */
export function urlAgendar(
  lugar: LugarAgendar,
  ancora: 'agendar' | 'como-funciona' = 'agendar',
  idioma?: string | null
): string {
  return `${URL_DISCIPULADO_POR_IDIOMA[idiomaDiscipulei(idioma)]}?o=comunidade-${lugar}#${ancora}`
}

export type AbaId = 'inicio' | 'biblia' | 'caderno' | 'comunidades'

export interface ItemNav {
  id: AbaId
  rota: string
  /** Chave i18n do rótulo. */
  rotulo: string
  /** Segmentos de URL que deixam este item ativo. */
  segmentos: string[]
}

/** Itens principais, na ordem da barra de abas (o "Escrever" entra no meio). */
export const NAV_PRINCIPAL: ItemNav[] = [
  { id: 'inicio', rota: ROTA_INICIAL, rotulo: 'nav.inicio', segmentos: ['hoje'] },
  { id: 'biblia', rota: '/biblia', rotulo: 'nav.biblia', segmentos: ['biblia'] },
  { id: 'caderno', rota: '/caderno', rotulo: 'nav.caderno', segmentos: ['caderno'] },
  { id: 'comunidades', rota: '/communities', rotulo: 'nav.comunidades', segmentos: ['communities', 'community'] },
]

/**
 * Rotas do LMS que a comunidade não usa. Somem da navegação e, para quem não
 * é admin, a rota redireciona para a tela inicial.
 */
export const SEGMENTOS_OCULTOS = new Set([
  'courses',
  'course',
  'library',
  'podcasts',
  'podcast',
  'playgrounds',
  'playground',
  'store',
  'trail',
  'boards',
  'copilot',
  'certificates',
])

/** O selo "Feito com LearnHouse" e o logo do rodapé só aparecem para admin. */
export const MARCA_LEARNHOUSE_SO_ADMIN = true

function segmentosDe(pathname: string | null | undefined): string[] {
  return (pathname ?? '').split('?')[0].split('/').filter(Boolean)
}

/** A rota é de uma área do LMS escondida nesta comunidade? */
export function rotaOculta(pathname: string | null | undefined): boolean {
  return segmentosDe(pathname).some((s) => SEGMENTOS_OCULTOS.has(s))
}

/** Qual item principal está ativo nesta rota (ou null). */
export function abaAtiva(pathname: string | null | undefined): AbaId | null {
  const segs = segmentosDe(pathname)
  for (const item of NAV_PRINCIPAL) {
    if (segs.some((s) => item.segmentos.includes(s))) return item.id
  }
  return null
}

/**
 * Comunidade aberta na rota atual (`/community/<id>`), já com o prefixo que a
 * API usa (`community_<id>`).
 */
export function comunidadeDaRota(pathname: string | null | undefined): string | null {
  const segs = segmentosDe(pathname)
  const i = segs.indexOf('community')
  const id = i >= 0 ? segs[i + 1] : undefined
  if (!id) return null
  return id.startsWith('community_') ? id : `community_${id}`
}
