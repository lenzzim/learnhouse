'use client'

/**
 * Selo "para quem é" do espaço: Aberto a todos / Só membros / Só {grupo}.
 * Derivado do acesso real (campo `audience` da API); texto sempre visível,
 * ícone discreto, P&B.
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, Lock, Users } from 'lucide-react'
import type { TFunction } from 'i18next'
import { audienciaDe, ehGrupoDiscipulos, type Audiencia } from '@/lib/communities/audiencia'

type ComAudiencia = Parameters<typeof audienciaDe>[0]

/** "Discípulos e Equipe" na língua da interface. */
export function juntarNomes(nomes: string[], idioma: string): string {
  try {
    return new Intl.ListFormat(idioma || 'pt', { style: 'long', type: 'conjunction' }).format(nomes)
  } catch {
    return nomes.join(', ')
  }
}

export function rotuloAudiencia(a: Audiencia, t: TFunction, idioma: string): string {
  if (a.kind === 'open') return t('communities.audiencia.open')
  if (a.kind === 'members') return t('communities.audiencia.members')
  return t('communities.audiencia.group', { grupos: juntarNomes(a.groups, idioma) })
}

/** Título da seção de um grupo restrito ("Área dos Discípulos", "Homens"...). */
export function tituloSecao(grupos: string[], t: TFunction, idioma: string): string {
  if (grupos.length === 0) return t('communities.secao_comunidade')
  if (ehGrupoDiscipulos(grupos)) return t('communities.area_discipulos')
  return juntarNomes(grupos, idioma)
}

export function IconeAudiencia({ audiencia, size = 12, className }: { audiencia: Audiencia; size?: number; className?: string }) {
  const Icone = audiencia.kind === 'open' ? Globe : audiencia.kind === 'members' ? Users : Lock
  return <Icone size={size} aria-hidden="true" className={className} />
}

export default function AudienciaSelo({
  community,
  size = 12,
  className = '',
}: {
  community: ComAudiencia
  size?: number
  className?: string
}) {
  const { t, i18n } = useTranslation()
  const a = audienciaDe(community)
  return (
    <span className={`inline-flex min-w-0 items-center gap-1.5 ${className}`}>
      <IconeAudiencia audiencia={a} size={size} className="shrink-0" />
      <span className="truncate">{rotuloAudiencia(a, t, i18n.language)}</span>
    </span>
  )
}
