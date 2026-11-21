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
    return (
      <button
        type="button"
        onClick={onClick}
        title={t(`caderno.visibilidade_${visibilidade}_dica`)}
        className={`${classe} transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface)] outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)]`}
      >
        {conteudo}
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
