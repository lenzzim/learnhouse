'use client'

import React from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { getUriWithOrg } from '@services/config/config'
import { situacaoAgora, type BatePapo } from '@services/communities/batepapos'
import { FOCO, SERIF } from '@components/Discipulei/Navegacao/estilos'
import { BotaoEntrar, DataEvento, Presenca, rotaBatePapo } from './comum'

/** Um bate-papo na agenda: data, título, tema, quem conduz e ações rápidas. */
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
  const { t } = useTranslation()
  const situacao = agora ? situacaoAgora(ev, agora) : ev.status
  return (
    <article className="flex flex-col gap-3 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-2)]">
        {situacao === 'live' && (
          <span className="rounded-full border border-[var(--text)] px-2 py-0.5 text-xs font-semibold text-[var(--text)]">
            {t('batepapos.ao_vivo')}
          </span>
        )}
        <DataEvento ev={ev} />
      </div>
      <h3 className="text-lg leading-snug text-[var(--text)]" style={SERIF}>
        <Link
          href={getUriWithOrg(orgslug, rotaBatePapo(ev.event_uuid))}
          className={`rounded hover:underline hover:underline-offset-4 ${FOCO}`}
          dir="auto"
        >
          {ev.title}
        </Link>
      </h3>
      {(ev.theme || ev.host_name) && (
        <p className="text-sm text-[var(--text-2)]" dir="auto">
          {ev.theme}
          {ev.theme && ev.host_name && <span aria-hidden="true"> · </span>}
          {ev.host_name && t('batepapos.conduz', { nome: ev.host_name })}
        </p>
      )}
      {situacao !== 'past' && autenticado && (
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <Presenca ev={ev} token={token} />
          <BotaoEntrar ev={ev} agora={agora} compacto />
        </div>
      )}
    </article>
  )
}

export default CartaoEvento
