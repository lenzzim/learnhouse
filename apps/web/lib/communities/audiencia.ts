/**
 * Para quem o espaço é (`audience`), calculado no servidor a partir do acesso
 * real: `open` (público), `members` (privado sem grupo, só membros logados) e
 * `group` (privado ligado a grupos de usuários). Nunca é configurado à mão.
 *
 * Também agrupa a lista de espaços em seções: "Comunidade" (abertos + só
 * membros) e uma seção por conjunto de grupos (ex.: "Área dos Discípulos").
 * A API só devolve os espaços que a pessoa pode ler, então quem não é do
 * grupo nem recebe a seção.
 */

import { ordenarComFixados } from './fixados'

export type TipoAudiencia = 'open' | 'members' | 'group'

export interface Audiencia {
  kind: TipoAudiencia
  groups: string[]
}

type ComAudiencia = {
  public: boolean
  audience?: Audiencia | null
  moderation_settings?: { pinned_at?: string | null } | null
}

/** A audiência do espaço; sem o campo (API antiga), deduz pelo `public`. */
export function audienciaDe(c: ComAudiencia): Audiencia {
  const a = c.audience
  if (a && (a.kind === 'open' || a.kind === 'members' || a.kind === 'group')) {
    if (a.kind === 'group' && (!Array.isArray(a.groups) || a.groups.length === 0)) {
      return { kind: 'members', groups: [] }
    }
    return { kind: a.kind, groups: a.kind === 'group' ? [...a.groups] : [] }
  }
  return { kind: c.public ? 'open' : 'members', groups: [] }
}

export const SECAO_COMUNIDADE = 'comunidade'

export interface Secao<T> {
  /** `comunidade` ou `grupo:<nomes>`. */
  chave: string
  /** Nomes dos grupos da seção (vazio na seção "Comunidade"). */
  grupos: string[]
  itens: T[]
}

/** Nome sem acento e em minúsculas, para reconhecer "Discípulos". */
export function normalizarNome(nome: string): string {
  return nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()
}

export function ehGrupoDiscipulos(grupos: string[]): boolean {
  return grupos.length === 1 && normalizarNome(grupos[0]) === 'discipulos'
}

/**
 * Seções na ordem: "Comunidade" primeiro, depois os grupos em ordem
 * alfabética. Dentro de cada seção mantém a ordem recebida, com os fixados
 * no topo.
 */
export function agruparEmSecoes<T extends ComAudiencia>(lista: T[]): Secao<T>[] {
  const secoes = new Map<string, Secao<T>>()
  for (const c of lista) {
    const a = audienciaDe(c)
    const grupos = a.kind === 'group' ? a.groups : []
    const chave = grupos.length ? `grupo:${grupos.join('|')}` : SECAO_COMUNIDADE
    let secao = secoes.get(chave)
    if (!secao) {
      secao = { chave, grupos, itens: [] }
      secoes.set(chave, secao)
    }
    secao.itens.push(c)
  }
  const ordenadas = [...secoes.values()].sort((a, b) => {
    if (a.chave === SECAO_COMUNIDADE) return -1
    if (b.chave === SECAO_COMUNIDADE) return 1
    return a.grupos.join(', ').localeCompare(b.grupos.join(', '))
  })
  return ordenadas.map((s) => ({ ...s, itens: ordenarComFixados(s.itens, () => 0) }))
}
