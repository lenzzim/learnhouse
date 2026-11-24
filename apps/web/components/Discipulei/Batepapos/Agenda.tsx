'use client'

/**
 * Página "Bate-papos" (N45): agenda de encontros online, próximos e passados.
 * Visitante vê a agenda sem o link; membros confirmam presença; admins e o
 * grupo de autores criam ("Novo bate-papo").
 */

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ChatsCircle, Plus } from '@phosphor-icons/react'
import { getUriWithOrg } from '@services/config/config'
import { listarBatePapos, type BatePapo } from '@services/communities/batepapos'
import { obterConfigComunidade, type ConfigComunidade } from '@services/communities/membros'
import { useDadosNav } from '@components/Discipulei/Navegacao/useDadosNav'
import { BOTAO_PRIMARIO, FOCO, SERIF } from '@components/Discipulei/Navegacao/estilos'
import { FolhaInferior } from '@components/Discipulei/Navegacao/FolhaInferior'
import { CartaoEvento } from './CartaoEvento'
import { FormularioEvento } from './FormularioEvento'
import { CHAVES_BATEPAPO, rotaBatePapo, useAgora } from './comum'

const PAINEL = 'rounded-2xl border border-[var(--line)] bg-[var(--panel)]'

type Aba = 'proximos' | 'passados'

export default function Agenda({ orgslug }: { orgslug: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { autenticado, orgId, token, status } = useDadosNav()
  const agora = useAgora()
  const [aba, setAba] = useState<Aba>('proximos')
  const [criando, setCriando] = useState(false)

  const lista = useQuery<BatePapo[]>({
    queryKey: [...CHAVES_BATEPAPO.lista(orgId, aba), autenticado],
    queryFn: () => listarBatePapos(orgId as number, aba, 30, token),
    enabled: !!orgId && status !== 'loading',
    staleTime: 30_000,
  })

  const config = useQuery<ConfigComunidade>({
    queryKey: ['social', 'config', orgId ?? 0],
    queryFn: () => obterConfigComunidade(orgId as number, token),
    enabled: autenticado && !!orgId && !!token,
    staleTime: 5 * 60_000,
  })
  const podeCriar = !!config.data?.can_manage_events

  const classeAba = (a: Aba) =>
    `inline-flex min-h-11 items-center rounded-lg px-4 text-sm transition-colors ${FOCO} ${
      aba === a
        ? 'bg-[var(--surface)] font-semibold text-[var(--text)]'
        : 'font-medium text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
    }`

  const itens = lista.data ?? []

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl leading-tight text-[var(--text)]" style={SERIF}>
            {t('batepapos.titulo')}
          </h1>
          <p className="mt-1 max-w-prose text-sm text-[var(--text-2)]">{t('batepapos.descricao')}</p>
        </div>
        {podeCriar && (
          <button type="button" onClick={() => setCriando(true)} className={`${BOTAO_PRIMARIO} min-h-11 px-4 text-sm`}>
            <Plus size={16} weight="bold" aria-hidden="true" />
            {t('batepapos.novo')}
          </button>
        )}
      </div>

      <div role="tablist" aria-label={t('batepapos.titulo')} className="mt-6 flex gap-1">
        <button type="button" role="tab" aria-selected={aba === 'proximos'} onClick={() => setAba('proximos')} className={classeAba('proximos')}>
          {t('batepapos.proximos')}
        </button>
        <button type="button" role="tab" aria-selected={aba === 'passados'} onClick={() => setAba('passados')} className={classeAba('passados')}>
          {t('batepapos.passados')}
        </button>
      </div>

      <div className="mt-4" aria-live="polite">
        {lista.isLoading || status === 'loading' ? (
          <div className={`${PAINEL} h-40 animate-pulse`} aria-hidden="true" />
        ) : lista.isError ? (
          <p className="text-sm text-[var(--text-2)]">{t('batepapos.erro')}</p>
        ) : itens.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--line-strong)] px-4 py-10 text-center">
            <ChatsCircle size={28} aria-hidden="true" className="text-[var(--text-3)]" />
            <p className="text-sm text-[var(--text-2)]">
              {aba === 'proximos' ? t('batepapos.vazio_proximos') : t('batepapos.vazio_passados')}
            </p>
          </div>
        ) : (
          <ul className={`${PAINEL} divide-y divide-[var(--line)] overflow-hidden`}>
            {itens.map((ev) => (
              <li key={ev.event_uuid}>
                <CartaoEvento ev={ev} orgslug={orgslug} agora={agora} token={token} autenticado={autenticado} />
              </li>
            ))}
          </ul>
        )}
      </div>

      {status === 'unauthenticated' && (
        <p className="mt-6 text-sm text-[var(--text-2)]">
          <Link
            href={getUriWithOrg(orgslug, '/login?next=/batepapos')}
            className={`underline underline-offset-2 hover:text-[var(--text)] ${FOCO}`}
          >
            {t('batepapos.entre_para_link')}
          </Link>
        </p>
      )}

      <FolhaInferior aberta={criando} aoMudar={setCriando} titulo={t('batepapos.novo')} larguraDesktop="md">
        <FormularioEvento
          aoCancelar={() => setCriando(false)}
          aoSalvar={(ev) => {
            setCriando(false)
            queryClient.invalidateQueries({ queryKey: CHAVES_BATEPAPO.todas })
            router.push(getUriWithOrg(orgslug, rotaBatePapo(ev.event_uuid)))
          }}
        />
      </FolhaInferior>
    </main>
  )
}
