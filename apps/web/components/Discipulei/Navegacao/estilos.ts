import type { CSSProperties } from 'react'

/**
 * Classes compartilhadas pelo shell de navegação. Tudo sai dos tokens de
 * styles/discipulei-dark.css, então funciona no tema escuro (padrão) e no
 * claro sem nenhum ramo.
 */

/** Anel de foco visível: 2px na cor do texto, afastado do elemento. */
export const FOCO =
  'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)]'

/** Botão primário de contraste (claro sobre o escuro, e o inverso no claro). */
export const BOTAO_PRIMARIO =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--cta-bg)] text-[var(--cta-fg)] ' +
  'hover:bg-[var(--cta-bg-hover)] font-semibold transition-colors ' + FOCO

/** Botão de contorno, discreto. */
export const BOTAO_SECUNDARIO =
  'inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--line-strong)] ' +
  'text-[var(--text)] hover:bg-[var(--surface)] font-medium transition-colors ' + FOCO

/** Botão só com ícone: 44px de área de toque. */
export const BOTAO_ICONE =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[var(--text-2)] ' +
  'hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors ' + FOCO

export const SERIF: CSSProperties = {
  fontFamily: "var(--font-serif), Georgia, 'Times New Roman', serif",
}

/** Tira o prefixo que a API põe nos uuids (`community_`, `discussion_`). */
export const semPrefixo = (uuid: string, prefixo: string) => uuid.replace(prefixo, '')

/** Caminho de uma nota do Caderno (/caderno/<id>; TCD abre pela data). */
export function caminhoNota(n: { note_uuid: string; kind?: string; tcd_date?: string | null }): string {
  if (n.kind === 'tcd' && n.tcd_date) return `/caderno/tcd/${n.tcd_date}`
  return `/caderno/${n.note_uuid.replace(/^note_/, '')}`
}

/** Caminho da discussão a partir dos uuids da API. */
export function caminhoDiscussao(communityUuid: string, discussionUuid: string): string {
  return `/community/${semPrefixo(communityUuid, 'community_')}/discussion/${semPrefixo(discussionUuid, 'discussion_')}`
}
