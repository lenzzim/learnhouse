'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { CaretLeft, CaretRight } from '@phosphor-icons/react'
import { calendarioTcd } from '@services/caderno/notas'
import { dataLocal, gradeDoMes, mesDe, mesVizinho } from '@/lib/caderno/conteudo'
import { useCaderno, CHAVES_CADERNO } from './CadernoContexto'
import { ICONE_PEQUENO, SECAO, FOCO } from './estilos'
import { hrefCaderno } from './PainelEsquerdo'

/**
 * Calendário do TCD: um mês, um ponto nos dias com TCD, hoje com contorno.
 * A sequência aparece só a partir de 2 dias e nunca cobra quem parou.
 */
export function Calendario() {
  const { t, i18n } = useTranslation()
  const c = useCaderno()
  const pathname = usePathname() || ''
  const hoje = dataLocal()
  const [mes, setMes] = useState(mesDe(hoje))
  const aberto = /\/caderno\/tcd\/(\d{4}-\d{2}-\d{2})/.exec(pathname)?.[1]

  const q = useQuery({
    queryKey: CHAVES_CADERNO.calendario(c.orgId, mes),
    queryFn: () => calendarioTcd(c.orgId as number, mes, hoje, c.token),
    enabled: c.autenticado && !!c.orgId && !!c.token,
    staleTime: 30_000,
  })
  const comTcd = useMemo(() => new Set(q.data?.dates ?? []), [q.data])
  const semanas = useMemo(() => gradeDoMes(mes), [mes])
  const local = i18n.language?.startsWith('pt') ? 'pt-BR' : i18n.language || 'pt-BR'

  const [a, m] = mes.split('-').map(Number)
  const nomeMes = new Date(a, m - 1, 1).toLocaleDateString(local, { month: 'long', year: 'numeric' })
  // Iniciais dos dias da semana, a partir de um domingo conhecido (2026-11-01).
  const iniciais = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 10, 1 + i).toLocaleDateString(local, { weekday: 'narrow' })
  )
  const nomesLongos = Array.from({ length: 7 }, (_, i) =>
    new Date(2026, 10, 1 + i).toLocaleDateString(local, { weekday: 'long' })
  )
  const sequencia = q.data?.streak ?? 0

  return (
    <section aria-labelledby="caderno-calendario" className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between ps-2.5">
        <h2 id="caderno-calendario" className="text-sm font-medium capitalize text-[var(--text)]">
          {nomeMes}
        </h2>
        <div className="flex items-center">
          <button type="button" className={ICONE_PEQUENO} onClick={() => setMes(mesVizinho(mes, -1))} aria-label={t('caderno.mes_anterior')}>
            <CaretLeft size={14} aria-hidden="true" className="rtl:-scale-x-100" />
          </button>
          <button type="button" className={ICONE_PEQUENO} onClick={() => setMes(mesVizinho(mes, 1))} aria-label={t('caderno.mes_seguinte')}>
            <CaretRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
          </button>
        </div>
      </div>

      <table className="w-full table-fixed border-collapse text-center" aria-labelledby="caderno-calendario">
        <thead>
          <tr>
            {iniciais.map((d, i) => (
              <th key={i} scope="col" abbr={nomesLongos[i]} className="pb-1 text-[0.7rem] font-normal uppercase text-[var(--text-3)]">
                {d}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {semanas.map((semana, i) => (
            <tr key={i}>
              {semana.map((data, j) => {
                if (!data) return <td key={j} />
                const dia = Number(data.slice(8))
                const tem = comTcd.has(data)
                const ehHoje = data === hoje
                const futuro = data > hoje
                const atual = data === aberto
                const rotulo = `${new Date(a, m - 1, dia).toLocaleDateString(local, { day: 'numeric', month: 'long' })}${tem ? ` — ${t('caderno.tem_tcd')}` : ''}`
                return (
                  <td key={j} className="p-0">
                    {futuro ? (
                      <span className="mx-auto flex h-9 w-9 items-center justify-center text-xs tabular-nums text-[var(--text-3)] opacity-50 lg:h-8 lg:w-8">
                        {dia}
                      </span>
                    ) : (
                      <Link
                        href={hrefCaderno(c.orgslug, `/tcd/${data}`)}
                        aria-label={rotulo}
                        aria-current={atual ? 'date' : undefined}
                        className={`relative mx-auto flex h-9 w-9 flex-col items-center justify-center rounded-full text-xs tabular-nums transition-colors lg:h-8 lg:w-8 ${FOCO} ${
                          atual
                            ? 'bg-[var(--cta-bg)] font-semibold text-[var(--cta-fg)]'
                            : ehHoje
                              ? 'font-semibold text-[var(--text)] ring-1 ring-inset ring-[var(--line-strong)] hover:bg-[var(--surface)]'
                              : 'text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
                        }`}
                      >
                        {dia}
                        {tem && (
                          <span
                            aria-hidden="true"
                            className={`absolute bottom-1 h-1 w-1 rounded-full ${atual ? 'bg-[var(--cta-fg)]' : 'bg-[var(--text)]'}`}
                          />
                        )}
                      </Link>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {sequencia >= 2 && (
        <p className={`${SECAO} leading-snug`}>{t('caderno.sequencia', { count: sequencia })}</p>
      )}
    </section>
  )
}

export default Calendario
