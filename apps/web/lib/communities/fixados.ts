/**
 * Espaços fixados no topo da lista (`moderation_settings.pinned_at`, ISO 8601
 * em UTC ou null). A API já devolve os fixados primeiro; isto mantém a regra
 * quando a tela reordena (ex.: "Nome (A–Z)").
 */

type ComConfiguracoes = { moderation_settings?: { pinned_at?: string | null } | null }

/** Data em que o espaço foi fixado, ou null. */
export function fixadoEm(community: ComConfiguracoes): string | null {
  const valor = community.moderation_settings?.pinned_at
  return typeof valor === 'string' && valor ? valor : null
}

/** Fixados primeiro (na ordem em que foram fixados); `ordem` vale só para os demais. */
export function ordenarComFixados<T extends ComConfiguracoes>(
  lista: T[],
  ordem: (..._par: [T, T]) => number
): T[] {
  return [...lista].sort((a, b) => {
    const fa = fixadoEm(a)
    const fb = fixadoEm(b)
    if (fa && fb) return new Date(fa).getTime() - new Date(fb).getTime()
    if (fa) return -1
    if (fb) return 1
    return ordem(a, b)
  })
}
