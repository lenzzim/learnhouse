'use client'

import React from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { getUriWithOrg } from '@services/config/config'
import { situacaoAgora, type BatePapo } from '@services/communities/batepapos'
import { FOCO, SERIF } from '@components/Discipulei/Navegacao/estilos'
import { BotaoEntrar, LinhaLocal, Presenca, Selos, formatarHora, localeDe, rotaBatePapo } from './comum'

/**
 * Um evento na linha do tempo: hora, tipo e lugar públicos, título, quem
 * organiza e ações rápidas. A data do dia vem do cabeçalho do grupo.
 */
export function CartaoEvento({
  ev,
  orgslug,
  agora,
  token,
  autenticado,
}: {
  ev: BatePapo
  orgslug: string
  agora: Date | null
  token?: string
  autenticado: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = localeDe(i18n.language)
  const situacao = agora ? situacaoAgora(ev, agora) : ev.status
  const quem = ev.host_name || ev.organizer_name
  return (
    <article className={`flex flex-col gap-2 px-4 py-4 sm:px-5 ${ev.cancelled ? 'opacity-70' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-2)]">
        <time dateTime={ev.starts_at} className="font-semibold tabular-nums text-[var(--text)]" suppressHydrationWarning>
          {formatarHora(ev.starts_at, locale)}
        </time>
        <span className="text-[var(--text-3)]">{t('batepapos.duracao', { min: ev.duration_minutes })}</span>
        <Selos ev={ev} situacao={situacao} />
      </div>
      <h3 className="text-lg leading-snug text-[var(--text)]" style={SERIF}>
        <Link
          href={getUriWithOrg(orgslug, rotaBatePapo(ev.event_uuid))}
          className={`rounded hover:underline hover:underline-offset-4 ${FOCO} ${ev.cancelled ? 'line-through' : ''}`}
          dir="auto"
        >
          {ev.title}
        </Link>
      </h3>
      <p className="text-sm text-[var(--text-2)]">
        <LinhaLocal ev={ev} />
      </p>
      {quem && (
        <p className="text-sm text-[var(--text-3)]" dir="auto">
          {t('agenda.organiza', { nome: quem })}
        </p>
      )}
      {situacao !== 'past' && autenticado && !ev.cancelled && (
        <div className="mt-1 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Presenca ev={ev} token={token} />
          <BotaoEntrar ev={ev} agora={agora} compacto />
        </div>
      )}
    </article>
  )
}

export default CartaoEvento
