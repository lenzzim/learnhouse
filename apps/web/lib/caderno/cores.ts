/**
 * Paleta do marca-texto e da cor do texto no Caderno (item 2.4).
 *
 * Quatro tons, sem dourado, âmbar ou roxo (identidade P&B). Os valores de
 * cor ficam em tokens CSS (styles/discipulei-dark.css, --marca-* e --cor-*),
 * com contraste ≥ 4,5:1 nos temas claro e escuro, inclusive cor sobre
 * marca-texto. No documento só entra o NOME do tom (whitelist): nunca um
 * valor de cor livre, nem estilo inline.
 *
 * No .md exportado:
 *  - marca-texto: `==texto==` (Obsidian); um tom que não seja o verde vira
 *    `<mark data-cor="azul">texto</mark>`;
 *  - cor do texto: `<span data-cor="azul">texto</span>`.
 * Os dois voltam iguais ao importar (markdownExtra.ts).
 *
 * Módulo PURO e SEM IMPORTS.
 */

export const CORES = ['verde', 'azul', 'rosa', 'grafite'] as const
export type Cor = (typeof CORES)[number]

/** Tom padrão do marca-texto (`==texto==`). */
export const COR_MARCA_PADRAO: Cor = 'verde'

export function corValida(valor: unknown): Cor | null {
  return typeof valor === 'string' && (CORES as readonly string[]).includes(valor) ? (valor as Cor) : null
}
