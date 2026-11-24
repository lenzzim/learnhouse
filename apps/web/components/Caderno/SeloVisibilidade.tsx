'use client'

import React from 'react'
import { useTranslation } from 'react-i18next'
import { Globe, LinkSimple, Lock } from '@phosphor-icons/react'
import type { Visibilidade } from '@services/caderno/notas'

const ICONE = { private: Lock, link: LinkSimple, community: Globe }

/** Quem pode ver esta nota. Sempre visível no topo do editor e na lista. */
export function SeloVisibilidade({
  visibilidade,
  compacto = false,
  onClick,
}: {
  visibilidade: Visibilidade
  compacto?: boolean
  onClick?: () => void
}) {
  const { t } = useTranslation()
  const Icone = ICONE[visibilidade] ?? Lock
  const rotulo = t(`caderno.visibilidade_${visibilidade}`)
  const classe = `inline-flex shrink-0 items-center gap-1.5 rounded-full border text-xs font-medium ${
    visibilidade === 'private'
      ? 'border-[var(--line)] text-[var(--text-2)]'
      : 'border-[var(--text-2)] text-[var(--text)]'
  } ${compacto ? 'h-6 px-2' : 'h-8 px-3'}`
  const conteudo = (
    <>
      <Icone size={compacto ? 11 : 13} weight={visibilidade === 'private' ? 'regular' : 'bold'} aria-hidden="true" />
      <span>{rotulo}</span>
    </>
  )
  if (onClick) {
    // compacto: o selo continua pequeno, mas o alvo de toque tem 44 px no celular
    return (
      <button
        type="button"
        onClick={onClick}
        title={t(`caderno.visibilidade_${visibilidade}_dica`)}
        className={`group inline-flex shrink-0 items-center rounded-full outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)] ${compacto ? 'min-h-11 lg:min-h-0' : ''}`}
      >
        <span className={`${classe} transition-colors group-hover:border-[var(--line-strong)] group-hover:bg-[var(--surface)]`}>{conteudo}</span>
      </button>
    )
  }
  return (
    <span className={classe} title={t(`caderno.visibilidade_${visibilidade}_dica`)}>
      {conteudo}
    </span>
  )
}

export default SeloVisibilidade
