import { FOCO } from '@components/Discipulei/Navegacao/estilos'

export { FOCO, BOTAO_PRIMARIO, BOTAO_SECUNDARIO, BOTAO_ICONE, SERIF } from '@components/Discipulei/Navegacao/estilos'

/** Linha de navegação dos painéis (44px de alvo no toque, 36px no desktop). */
export const LINHA =
  'flex min-h-11 lg:min-h-9 w-full items-center gap-2.5 rounded-md px-2.5 text-sm transition-colors ' + FOCO

export const LINHA_ATIVA = 'bg-[var(--surface)] text-[var(--text)] font-medium'
export const LINHA_INATIVA = 'text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)]'

/** Título de seção dos painéis: pequeno, sem caixa-alta gritante. */
export const SECAO = 'caderno-secao px-2.5 text-xs font-medium text-[var(--text-3)]'

/** Botão quadrado pequeno (ícone) dos painéis. */
export const ICONE_PEQUENO =
  'inline-flex h-9 w-9 lg:h-8 lg:w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-3)] ' +
  'hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors ' + FOCO

export const CAMPO =
  'w-full rounded-lg border border-[var(--line)] bg-[var(--page)] px-3 text-sm text-[var(--text)] ' +
  'placeholder:text-[var(--text-3)] focus:border-[var(--line-strong)] ' + FOCO

/** Ícone do cabeçalho da nota: 44 px no toque, 32 px no computador. */
export const ICONE_CABECALHO =
  'inline-flex h-11 w-11 lg:h-8 lg:w-8 shrink-0 items-center justify-center rounded-md text-[var(--text-3)] ' +
  'hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors ' + FOCO
