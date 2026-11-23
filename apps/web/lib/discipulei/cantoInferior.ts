/**
 * O canto inferior da tela (acima da barra de abas) é dividido por dois
 * avisos: o convite de instalar o app e o convite de estudo. Os dois usam o
 * mesmo lugar, então nunca podem aparecer juntos: quem pediu e recebeu o
 * canto fica com ele até soltar; o outro espera e aparece em seguida.
 *
 * Se os dois pedirem ao mesmo tempo, o convite de instalar vem primeiro.
 * Módulo puro (sem React) para ser testado no Node.
 */

export type DonoCanto = 'instalar' | 'estudo'

const PRIORIDADE: readonly DonoCanto[] = ['instalar', 'estudo']

let atual: DonoCanto | null = null
const querem = new Set<DonoCanto>()
const ouvintes = new Set<() => void>()

function recalcular() {
  const antes = atual
  if (!(atual && querem.has(atual))) {
    atual = PRIORIDADE.find((d) => querem.has(d)) ?? null
  }
  if (antes !== atual) ouvintes.forEach((f) => f())
}

/** Pede o canto. Devolve true se ficou com ele agora. */
export function pedirCanto(dono: DonoCanto): boolean {
  querem.add(dono)
  recalcular()
  return atual === dono
}

/** Solta o canto (ou desiste de esperar por ele). */
export function soltarCanto(dono: DonoCanto) {
  querem.delete(dono)
  recalcular()
}

export function donoDoCanto(): DonoCanto | null {
  return atual
}

export function ouvirCanto(f: () => void): () => void {
  ouvintes.add(f)
  return () => {
    ouvintes.delete(f)
  }
}

/** Só para testes. */
export function _zerarCanto() {
  atual = null
  querem.clear()
  ouvintes.clear()
}
