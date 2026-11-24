'use client'

/**
 * Cartão discreto da tela Hoje: "Próximo evento na sua região" (a região
 * escolhida nos chips da Agenda, lembrada neste navegador) ou o próximo
 * evento da agenda, quando nenhuma região foi escolhida. Sem evento, não
 * aparece. Só renderiza depois de carregar (fora do fluxo enquanto isso).
 */

import React from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { CalendarBlank } from '@phosphor-icons/react'
import { getUriWithOrg } from '@services/config/config'
import { listarBatePapos, situacaoAgora, type BatePapo } from '@services/communities/batepapos'
import { useDadosNav } from '@components/Discipulei/Navegacao/useDadosNav'
import { FOCO, SERIF } from '@components/Discipulei/Navegacao/estilos'
import {
  BotaoEntrar,
  CHAVES_BATEPAPO,
  DataEvento,
  LINK_DISCRETO,
  LinhaLocal,
  Presenca,
  ROTA_BATEPAPOS,
  rotaBatePapo,
  useAgora,
  useRegiaoLembrada,
  useRegioes,
} from './comum'

export function CartaoProximoBatepapo({ orgslug }: { orgslug: string }) {
  const { t } = useTranslation()
  const { autenticado, orgId, token } = useDadosNav()
  const agora = useAgora()
  const [regiao] = useRegiaoLembrada()
  const regioes = useRegioes(orgId)
  const minha = (regioes.data ?? []).find((r) => r.region_uuid === regiao) ?? null

  const q = useQuery<BatePapo[]>({
    queryKey: [...CHAVES_BATEPAPO.lista(orgId, 'proximos'), 'hoje', minha?.region_uuid ?? '', autenticado],
    queryFn: () => listarBatePapos(orgId as number, 'proximos', 5, token, { regiao: minha?.region_uuid ?? null }),
    enabled: autenticado && !!orgId && !!token && !regioes.isLoading,
    staleTime: 60_000,
  })

  const ev = (q.data ?? []).find((e) => !e.cancelled && (agora ? situacaoAgora(e, agora) !== 'past' : true))
  if (!ev) return null

  const aoVivo = agora ? situacaoAgora(ev, agora) === 'live' : ev.status === 'live'
  const titulo = aoVivo
    ? t('agenda.hoje_card.agora')
    : minha
      ? t('agenda.hoje_card.na_regiao', { regiao: minha.is_online ? t('agenda.online') : minha.name })
      : t('agenda.hoje_card.titulo')

  return (
    <section aria-labelledby="hoje-agenda" className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 id="hoje-agenda" className="flex items-center gap-2 text-xl leading-tight text-[var(--text)]" style={SERIF}>
          <CalendarBlank size={20} aria-hidden="true" className="shrink-0 text-[var(--text-2)]" />
          {titulo}
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
      <p className="mt-1 text-sm text-[var(--text-2)]">
        <LinhaLocal ev={ev} />
      </p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <Presenca ev={ev} token={token} mostrarContagem={false} />
        <BotaoEntrar ev={ev} agora={agora} compacto />
      </div>
    </section>
  )
}

export default CartaoProximoBatepapo
