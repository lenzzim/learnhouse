'use client'

/**
 * Página "Agenda" (antes "Bate-papos"): rodas de conversa, cultos, estudos e
 * encontros, online e presenciais, por região.
 *
 * - Linha do tempo (próximos agrupados por dia: Hoje, Amanhã, data; aba
 *   Passados) ou Calendário (mês no desktop, semana no celular).
 * - Filtros: chips de região (lembrados neste navegador) e tipo.
 * - Visitante vê a agenda aberta; endereço e link só para quem confirma "Vou"
 *   (o servidor decide). Organizadores, Equipe e admins criam ("Novo evento").
 * - "Minha agenda": assinatura pessoal e lembretes por e-mail.
 */

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarBlank, ListBullets, Plus } from '@phosphor-icons/react'
import { getUriWithOrg } from '@services/config/config'
import { listarBatePapos, TIPOS_EVENTO, type BatePapo, type TipoEvento } from '@services/communities/batepapos'
import { obterConfigComunidade, type ConfigComunidade } from '@services/communities/membros'
import { useDadosNav } from '@components/Discipulei/Navegacao/useDadosNav'
import { BOTAO_PRIMARIO, FOCO, SERIF } from '@components/Discipulei/Navegacao/estilos'
import { FolhaInferior } from '@components/Discipulei/Navegacao/FolhaInferior'
import { CartaoEvento } from './CartaoEvento'
import { Calendario } from './Calendario'
import { FormularioEvento } from './FormularioEvento'
import { MinhaAgenda } from './MinhaAgenda'
import { CHAVES_BATEPAPO, ROTA_BATEPAPOS, localeDe, rotaBatePapo, useAgora, useRegiaoLembrada, useRegioes } from './comum'
import { agruparPorDia, rotuloDia } from './datas'

const PAINEL = 'rounded-2xl border border-[var(--line)] bg-[var(--panel)]'

type Aba = 'proximos' | 'passados'
type Visao = 'lista' | 'calendario'

export default function Agenda({ orgslug }: { orgslug: string }) {
  const { t, i18n } = useTranslation()
  const locale = localeDe(i18n.language)
  const router = useRouter()
  const queryClient = useQueryClient()
  const { autenticado, orgId, token, status } = useDadosNav()
  const agora = useAgora()
  const [aba, setAba] = useState<Aba>('proximos')
  const [visao, setVisao] = useState<Visao>('lista')
  const [criando, setCriando] = useState(false)
  const [regiao, setRegiao] = useRegiaoLembrada()
  const [tipo, setTipo] = useState<TipoEvento | ''>('')

  const regioes = useRegioes(orgId)
  // Região lembrada que deixou de existir (desativada no painel): volta para "Todas".
  const regiaoValida = regiao && (regioes.data ?? []).some((r) => r.region_uuid === regiao) ? regiao : ''
  const filtros = { regiao: regiaoValida || null, tipo: tipo || null }
  const pronto = status !== 'loading' && !regioes.isLoading

  const lista = useQuery<BatePapo[]>({
    queryKey: [...CHAVES_BATEPAPO.lista(orgId, aba), regiaoValida, tipo, autenticado],
    queryFn: () => listarBatePapos(orgId as number, aba, 50, token, filtros),
    enabled: !!orgId && pronto && visao === 'lista',
    staleTime: 30_000,
  })

  const config = useQuery<ConfigComunidade>({
    queryKey: ['social', 'config', orgId ?? 0],
    queryFn: () => obterConfigComunidade(orgId as number, token),
    enabled: autenticado && !!orgId && !!token,
    staleTime: 5 * 60_000,
  })
  const podeCriar = !!config.data?.can_manage_events

  const classeSeg = (ativo: boolean) =>
    `inline-flex min-h-11 items-center gap-2 rounded-lg px-4 text-sm transition-colors ${FOCO} ${
      ativo
        ? 'bg-[var(--surface)] font-semibold text-[var(--text)]'
        : 'font-medium text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
    }`

  const classeChip = (ativo: boolean) =>
    `inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm transition-colors ${FOCO} ${
      ativo
        ? 'border-[var(--text)] bg-[var(--cta-bg)] font-semibold text-[var(--cta-fg)]'
        : 'border-[var(--line-strong)] text-[var(--text-2)] hover:text-[var(--text)]'
    }`

  const itens = lista.data ?? []
  const grupos = agruparPorDia(itens)
  const hoje = agora ?? new Date()

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:pt-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl leading-tight text-[var(--text)]" style={SERIF}>
            {t('agenda.titulo')}
          </h1>
          <p className="mt-1 max-w-prose text-sm text-[var(--text-2)]">{t('agenda.descricao')}</p>
        </div>
        {podeCriar && (
          <button type="button" onClick={() => setCriando(true)} className={`${BOTAO_PRIMARIO} min-h-11 px-4 text-sm`}>
            <Plus size={16} weight="bold" aria-hidden="true" />
            {t('agenda.novo')}
          </button>
        )}
      </div>

      {/* Região: chips com rolagem lateral no celular */}
      <div
        role="group"
        aria-label={t('agenda.filtro_regiao')}
        className="-mx-4 mt-6 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
      >
        <button type="button" aria-pressed={!regiaoValida} onClick={() => setRegiao('')} className={classeChip(!regiaoValida)}>
          {t('agenda.todas')}
        </button>
        {(regioes.data ?? []).map((r) => (
          <button
            key={r.region_uuid}
            type="button"
            aria-pressed={regiaoValida === r.region_uuid}
            onClick={() => setRegiao(r.region_uuid)}
            className={classeChip(regiaoValida === r.region_uuid)}
          >
            {r.is_online ? t('agenda.online') : r.name}
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm text-[var(--text-2)]">
          <span>{t('agenda.filtro_tipo')}</span>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoEvento | '')}
            className={`min-h-11 rounded-lg border border-[var(--line-strong)] bg-[var(--page)] px-3 text-sm text-[var(--text)] ${FOCO}`}
          >
            <option value="">{t('agenda.todos_tipos')}</option>
            {TIPOS_EVENTO.map((k) => (
              <option key={k} value={k}>
                {t(`agenda.tipo.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <div role="group" aria-label={t('agenda.visao')} className="flex gap-1">
          <button type="button" aria-pressed={visao === 'lista'} onClick={() => setVisao('lista')} className={classeSeg(visao === 'lista')}>
            <ListBullets size={18} aria-hidden="true" />
            {t('agenda.linha_do_tempo')}
          </button>
          <button
            type="button"
            aria-pressed={visao === 'calendario'}
            onClick={() => setVisao('calendario')}
            className={classeSeg(visao === 'calendario')}
          >
            <CalendarBlank size={18} aria-hidden="true" />
            {t('agenda.calendario')}
          </button>
        </div>
      </div>

      {visao === 'calendario' ? (
        <div className="mt-4">
          <Calendario
            orgId={orgId}
            orgslug={orgslug}
            token={token}
            filtros={filtros}
            agora={agora}
            autenticado={autenticado}
            pronto={pronto}
          />
        </div>
      ) : (
        <>
          <div role="tablist" aria-label={t('agenda.titulo')} className="mt-4 flex gap-1">
            <button type="button" role="tab" aria-selected={aba === 'proximos'} onClick={() => setAba('proximos')} className={classeSeg(aba === 'proximos')}>
              {t('batepapos.proximos')}
            </button>
            <button type="button" role="tab" aria-selected={aba === 'passados'} onClick={() => setAba('passados')} className={classeSeg(aba === 'passados')}>
              {t('batepapos.passados')}
            </button>
          </div>

          <div className="mt-4 flex flex-col gap-5" aria-live="polite">
            {lista.isLoading || !pronto ? (
              <div className={`${PAINEL} h-40 animate-pulse`} aria-hidden="true" />
            ) : lista.isError ? (
              <p className="text-sm text-[var(--text-2)]">{t('batepapos.erro')}</p>
            ) : itens.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--line-strong)] px-4 py-10 text-center">
                <CalendarBlank size={28} aria-hidden="true" className="text-[var(--text-3)]" />
                <p className="text-sm text-[var(--text-2)]">
                  {aba === 'proximos' ? t('agenda.vazio_proximos') : t('agenda.vazio_passados')}
                </p>
              </div>
            ) : (
              grupos.map(([dia, evs]) => (
                <section key={dia} aria-labelledby={`dia-${dia}`}>
                  <h2
                    id={`dia-${dia}`}
                    className="mb-2 text-sm font-semibold first-letter:uppercase text-[var(--text)]"
                    suppressHydrationWarning
                  >
                    {rotuloDia(dia, hoje, locale, (k) => t(k))}
                  </h2>
                  <ul className={`${PAINEL} divide-y divide-[var(--line)] overflow-hidden`}>
                    {evs.map((ev) => (
                      <li key={ev.event_uuid}>
                        <CartaoEvento ev={ev} orgslug={orgslug} agora={agora} token={token} autenticado={autenticado} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}
          </div>
        </>
      )}

      {status === 'unauthenticated' && (
        <p className="mt-6 text-sm text-[var(--text-2)]">
          <Link
            href={getUriWithOrg(orgslug, `/login?next=${encodeURIComponent(ROTA_BATEPAPOS)}`)}
            className={`inline-flex min-h-11 items-center underline underline-offset-2 hover:text-[var(--text)] ${FOCO}`}
          >
            {t('agenda.entrar_para_inscrever')}
          </Link>
        </p>
      )}

      {autenticado && orgId && (
        <div className="mt-8">
          <MinhaAgenda orgId={orgId} token={token} />
        </div>
      )}

      <FolhaInferior aberta={criando} aoMudar={setCriando} titulo={t('agenda.novo')} larguraDesktop="md">
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
