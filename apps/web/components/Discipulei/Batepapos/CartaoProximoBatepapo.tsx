'use client'

/**
 * Cartão "Próximo bate-papo" da tela Hoje (N45): o encontro que está
 * acontecendo ou o próximo, com presença rápida e "Entrar". Sem nenhum
 * encontro marcado, não aparece. Só renderiza depois de carregar (fica fora
 * do fluxo enquanto isso, sem empurrar o resto: não causa CLS acima dele).
 */

import React from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ChatsCircle } from '@phosphor-icons/react'
import { getUriWithOrg } from '@services/config/config'
import { listarBatePapos, situacaoAgora, type BatePapo } from '@services/communities/batepapos'
import { useDadosNav } from '@components/Discipulei/Navegacao/useDadosNav'
import { FOCO, SERIF } from '@components/Discipulei/Navegacao/estilos'
import { BotaoEntrar, CHAVES_BATEPAPO, DataEvento, LINK_DISCRETO, Presenca, ROTA_BATEPAPOS, rotaBatePapo, useAgora } from './comum'

export function CartaoProximoBatepapo({ orgslug }: { orgslug: string }) {
  const { t } = useTranslation()
  const { autenticado, orgId, token } = useDadosNav()
  const agora = useAgora()

  const q = useQuery<BatePapo[]>({
    queryKey: [...CHAVES_BATEPAPO.lista(orgId, 'proximos'), 'hoje', autenticado],
    queryFn: () => listarBatePapos(orgId as number, 'proximos', 3, token),
    enabled: autenticado && !!orgId && !!token,
    staleTime: 60_000,
  })

  const ev = (q.data ?? []).find((e) => (agora ? situacaoAgora(e, agora) !== 'past' : true))
  if (!ev) return null

  const aoVivo = agora ? situacaoAgora(ev, agora) === 'live' : ev.status === 'live'

  return (
    <section aria-labelledby="hoje-batepapo" className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="hoje-batepapo" className="flex items-center gap-2 text-xl leading-tight text-[var(--text)]" style={SERIF}>
          <ChatsCircle size={20} aria-hidden="true" className="shrink-0 text-[var(--text-2)]" />
          {aoVivo ? t('batepapos.hoje.agora') : t('batepapos.hoje.titulo')}
        </h2>
        <Link href={getUriWithOrg(orgslug, ROTA_BATEPAPOS)} className={`${LINK_DISCRETO} inline-flex min-h-11 items-center text-sm`}>
          {t('batepapos.hoje.ver_agenda')}
        </Link>
      </div>
      <Link
        href={getUriWithOrg(orgslug, rotaBatePapo(ev.event_uuid))}
        className={`mt-2 block rounded text-lg leading-snug text-[var(--text)] hover:underline hover:underline-offset-4 ${FOCO}`}
        style={SERIF}
        dir="auto"
      >
        {ev.title}
      </Link>
      <p className="mt-1 text-sm text-[var(--text-2)]">
        <DataEvento ev={ev} />
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Presenca ev={ev} token={token} mostrarContagem={false} />
        <BotaoEntrar ev={ev} agora={agora} compacto />
      </div>
    </section>
  )
}

export default CartaoProximoBatepapo
