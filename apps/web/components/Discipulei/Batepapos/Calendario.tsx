'use client'

/**
 * Calendário da Agenda, feito à mão (Date + Intl, sem dependência).
 *
 * - Telas ≥ sm: grade do mês (6 semanas), marcadores por dia (até 3 pontos).
 * - Celular: faixa da semana (7 botões de 44 px), setas de semana.
 * - Tocar num dia lista os eventos dele logo abaixo.
 */

import React, { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { listarIntervalo, type BatePapo, type FiltrosAgenda } from '@services/communities/batepapos'
import { BOTAO_ICONE, FOCO, SERIF } from '@components/Discipulei/Navegacao/estilos'
import { CartaoEvento } from './CartaoEvento'
import { CHAVES_BATEPAPO, localeDe } from './comum'
import {
  chaveDia,
  chaveDiaIso,
  diasDaGrade,
  inicioDaSemana,
  inicioDoMes,
  nomeDoMes,
  nomesDaSemana,
  rotuloDia,
  somarDias,
  somarMeses,
} from './datas'

const PAINEL = 'rounded-2xl border border-[var(--line)] bg-[var(--panel)]'

export function Calendario({
  orgId,
  orgslug,
  token,
  filtros,
  agora,
  autenticado,
  pronto,
}: {
  orgId?: number
  orgslug: string
  token?: string
  filtros: FiltrosAgenda
  agora: Date | null
  autenticado: boolean
  pronto: boolean
}) {
  const { t, i18n } = useTranslation()
  const locale = localeDe(i18n.language)
  const hoje = agora ?? new Date()
  const [foco, setFoco] = useState<Date>(() => new Date())

  const grade = useMemo(() => diasDaGrade(foco), [foco])
  const semana = useMemo(() => {
    const ini = inicioDaSemana(foco)
    return Array.from({ length: 7 }, (_, i) => somarDias(ini, i))
  }, [foco])
  const de = grade[0] < semana[0] ? grade[0] : semana[0]
  const ultimo = grade[41] > semana[6] ? grade[41] : semana[6]
  const ate = somarDias(ultimo, 1)

  const q = useQuery<BatePapo[]>({
    queryKey: [...CHAVES_BATEPAPO.intervalo(orgId, chaveDia(de)), chaveDia(ate), filtros.regiao ?? '', filtros.tipo ?? '', autenticado],
    queryFn: () => listarIntervalo(orgId as number, de, ate, token, filtros),
    enabled: !!orgId && pronto,
    staleTime: 30_000,
  })

  const porDia = useMemo(() => {
    const m = new Map<string, BatePapo[]>()
    for (const ev of q.data ?? []) {
      const k = chaveDiaIso(ev.starts_at)
      m.set(k, [...(m.get(k) ?? []), ev])
    }
    return m
  }, [q.data])

  const semanaNomes = useMemo(() => nomesDaSemana(locale), [locale])
  const chaveFoco = chaveDia(foco)
  const chaveHoje = chaveDia(hoje)
  const doDia = porDia.get(chaveFoco) ?? []
  const mesFoco = foco.getMonth()

  const marcadores = (k: string) => {
    const n = Math.min(3, (porDia.get(k) ?? []).filter((e) => !e.cancelled).length)
    return (
      <span className="flex h-1.5 items-center justify-center gap-0.5" aria-hidden="true">
        {Array.from({ length: n }, (_, i) => (
          <span key={i} className="h-1.5 w-1.5 rounded-full bg-current" />
        ))}
      </span>
    )
  }

  const rotuloAcessivel = (d: Date) => {
    const n = (porDia.get(chaveDia(d)) ?? []).length
    return `${rotuloDia(chaveDia(d), hoje, locale, t)}${n ? `, ${t('agenda.n_eventos', { count: n })}` : ''}`
  }

  const classeDia = (d: Date, foraDoMes: boolean) => {
    const k = chaveDia(d)
    const sel = k === chaveFoco
    return `flex min-h-11 w-full flex-col items-center justify-center gap-1 rounded-lg text-sm tabular-nums transition-colors ${FOCO} ${
      sel
        ? 'bg-[var(--cta-bg)] text-[var(--cta-fg)] font-semibold'
        : `${foraDoMes ? 'text-[var(--text-3)]' : 'text-[var(--text)]'} hover:bg-[var(--surface)]`
    } ${k === chaveHoje && !sel ? 'ring-1 ring-[var(--line-strong)]' : ''}`
  }

  return (
    <div className="flex flex-col gap-4">
      <section className={`${PAINEL} p-3 sm:p-4`} aria-label={t('agenda.calendario')}>
        {/* Cabeçalho: mês (≥ sm) ou semana (celular) */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className={`${BOTAO_ICONE} hidden sm:inline-flex`}
            onClick={() => setFoco(somarMeses(foco, -1))}
            aria-label={t('agenda.mes_anterior')}
          >
            <CaretLeft size={18} aria-hidden="true" className="rtl:-scale-x-100" />
          </button>
          <button
            type="button"
            className={`${BOTAO_ICONE} sm:hidden`}
            onClick={() => setFoco(somarDias(foco, -7))}
            aria-label={t('agenda.semana_anterior')}
          >
            <CaretLeft size={18} aria-hidden="true" className="rtl:-scale-x-100" />
          </button>
          <h2 className="text-lg first-letter:uppercase text-[var(--text)]" style={SERIF} aria-live="polite">
            {nomeDoMes(inicioDoMes(foco), locale)}
          </h2>
          <button
            type="button"
            className={`${BOTAO_ICONE} hidden sm:inline-flex`}
            onClick={() => setFoco(somarMeses(foco, 1))}
            aria-label={t('agenda.mes_seguinte')}
          >
            <CaretRight size={18} aria-hidden="true" className="rtl:-scale-x-100" />
          </button>
          <button
            type="button"
            className={`${BOTAO_ICONE} sm:hidden`}
            onClick={() => setFoco(somarDias(foco, 7))}
            aria-label={t('agenda.semana_seguinte')}
          >
            <CaretRight size={18} aria-hidden="true" className="rtl:-scale-x-100" />
          </button>
        </div>

        <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs text-[var(--text-3)]" aria-hidden="true">
          {semanaNomes.map((n, i) => (
            <span key={i} className="truncate capitalize">
              {n.replace('.', '')}
            </span>
          ))}
        </div>

        {/* Celular: uma semana */}
        <div className="mt-1 grid grid-cols-7 gap-1 sm:hidden">
          {semana.map((d) => (
            <button
              key={chaveDia(d)}
              type="button"
              onClick={() => setFoco(d)}
              aria-pressed={chaveDia(d) === chaveFoco}
              aria-label={rotuloAcessivel(d)}
              className={classeDia(d, false)}
            >
              <span>{d.getDate()}</span>
              {marcadores(chaveDia(d))}
            </button>
          ))}
        </div>

        {/* ≥ sm: o mês inteiro */}
        <div className="mt-1 hidden grid-cols-7 gap-1 sm:grid">
          {grade.map((d) => (
            <button
              key={chaveDia(d)}
              type="button"
              onClick={() => setFoco(d)}
              aria-pressed={chaveDia(d) === chaveFoco}
              aria-label={rotuloAcessivel(d)}
              className={classeDia(d, d.getMonth() !== mesFoco)}
            >
              <span>{d.getDate()}</span>
              {marcadores(chaveDia(d))}
            </button>
          ))}
        </div>

        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => setFoco(new Date())}
            className={`min-h-11 rounded-lg px-4 text-sm text-[var(--text-2)] underline underline-offset-2 hover:text-[var(--text)] ${FOCO}`}
          >
            {t('agenda.ir_para_hoje')}
          </button>
        </div>
      </section>

      <section aria-labelledby="dia-escolhido" aria-live="polite">
        <h2 id="dia-escolhido" className="mb-2 text-base font-semibold first-letter:uppercase text-[var(--text)]">
          {rotuloDia(chaveFoco, hoje, locale, t)}
        </h2>
        {q.isLoading ? (
          <div className={`${PAINEL} h-24 animate-pulse`} aria-hidden="true" />
        ) : q.isError ? (
          <p className="text-sm text-[var(--text-2)]">{t('batepapos.erro')}</p>
        ) : doDia.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--line-strong)] px-4 py-6 text-center text-sm text-[var(--text-2)]">
            {t('agenda.dia_vazio')}
          </p>
        ) : (
          <ul className={`${PAINEL} divide-y divide-[var(--line)] overflow-hidden`}>
            {doDia.map((ev) => (
              <li key={ev.event_uuid}>
                <CartaoEvento ev={ev} orgslug={orgslug} agora={agora} token={token} autenticado={autenticado} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default Calendario
