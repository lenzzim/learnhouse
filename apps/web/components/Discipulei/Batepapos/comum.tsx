'use client'

/**
 * Peças comuns do Bate-papo Online (N45): rotas, chaves do React Query,
 * relógio que anda (o botão "Entrar" acende 10 minutos antes) e formatação
 * de data no idioma da interface e no fuso do navegador, com o fuso do
 * encontro quando for diferente.
 */

import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowSquareOut, CalendarPlus, Check, Question, VideoCamera } from '@phosphor-icons/react'
import {
  baixarIcs,
  entrarEmDestaque,
  idCurtoEvento,
  responderPresenca,
  situacaoAgora,
  type BatePapo,
  type StatusPresenca,
} from '@services/communities/batepapos'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, FOCO } from '@components/Discipulei/Navegacao/estilos'

export const ROTA_BATEPAPOS = '/batepapos'
export const rotaBatePapo = (eventUuid: string) => `${ROTA_BATEPAPOS}/${idCurtoEvento(eventUuid)}`

export const CHAVES_BATEPAPO = {
  todas: ['batepapos'] as const,
  lista: (orgId: number | undefined, quando: string) => ['batepapos', 'lista', orgId ?? 0, quando] as const,
  um: (id: string) => ['batepapos', 'um', idCurtoEvento(id)] as const,
  confirmados: (id: string) => ['batepapos', 'confirmados', idCurtoEvento(id)] as const,
}

/** Relógio que anda a cada 30 s (null no servidor, para não dar mismatch). */
export function useAgora(intervaloMs = 30_000): Date | null {
  const [agora, setAgora] = useState<Date | null>(null)
  useEffect(() => {
    setAgora(new Date())
    const id = window.setInterval(() => setAgora(new Date()), intervaloMs)
    return () => window.clearInterval(id)
  }, [intervaloMs])
  return agora
}

export function localeDe(lng: string | undefined): string {
  if (!lng) return 'pt-BR'
  return lng.startsWith('pt') ? 'pt-BR' : lng
}

export function fusoDoNavegador(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo'
  } catch {
    return 'America/Sao_Paulo'
  }
}

/** "terça, 1 de dezembro, 20:00" no fuso do navegador. */
export function formatarQuando(iso: string, locale: string, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    }).format(new Date(iso))
  } catch {
    return new Date(iso).toLocaleString()
  }
}

export function formatarHora(iso: string, locale: string, timeZone?: string): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      hour: '2-digit',
      minute: '2-digit',
      ...(timeZone ? { timeZone } : {}),
    }).format(new Date(iso))
  } catch {
    return ''
  }
}

/** Data no fuso do navegador e, se diferente, a hora no fuso do encontro. */
export function DataEvento({ ev, className = '' }: { ev: Pick<BatePapo, 'starts_at' | 'timezone' | 'duration_minutes'>; className?: string }) {
  const { t, i18n } = useTranslation()
  const [fuso, setFuso] = useState<string | null>(null)
  useEffect(() => setFuso(fusoDoNavegador()), [])
  const locale = localeDe(i18n.language)
  if (!fuso) {
    // Antes de montar: fuso do encontro (igual no servidor e no cliente).
    return <span className={className}>{formatarQuando(ev.starts_at, locale, ev.timezone)}</span>
  }
  const diferente = fuso !== ev.timezone
  return (
    <span className={className}>
      <time dateTime={ev.starts_at}>{formatarQuando(ev.starts_at, locale, fuso)}</time>
      <span className="text-[var(--text-3)]">
        {' · '}
        {t('batepapos.duracao', { min: ev.duration_minutes })}
      </span>
      {diferente && (
        <span className="block text-xs text-[var(--text-3)]">
          {t('batepapos.no_fuso', { hora: formatarHora(ev.starts_at, locale, ev.timezone), fuso: ev.timezone })}
        </span>
      )}
    </span>
  )
}

/** Botão "Entrar": destacado de 10 min antes até o fim; só com link. */
export function BotaoEntrar({
  ev,
  agora,
  compacto = false,
}: {
  ev: BatePapo
  agora: Date | null
  compacto?: boolean
}) {
  const { t } = useTranslation()
  if (!ev.meeting_url) return null
  const situacao = agora ? situacaoAgora(ev, agora) : ev.status
  if (situacao === 'past') return null
  const destaque = agora ? entrarEmDestaque(ev, agora) : false
  return (
    <a
      href={ev.meeting_url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${destaque ? BOTAO_PRIMARIO : BOTAO_SECUNDARIO} min-h-11 px-4 text-sm ${compacto ? '' : 'w-full sm:w-auto'}`}
    >
      <VideoCamera size={18} weight={destaque ? 'fill' : 'regular'} aria-hidden="true" />
      {situacao === 'live' ? t('batepapos.entrar_agora') : t('batepapos.entrar')}
      <ArrowSquareOut size={14} aria-hidden="true" />
      <span className="sr-only">({t('batepapos.nova_aba')})</span>
    </a>
  )
}

/** "Vou" / "Talvez" (clicar de novo cancela), com as contagens. */
export function Presenca({
  ev,
  token,
  aoMudar,
  mostrarContagem = true,
}: {
  ev: BatePapo
  token?: string
  aoMudar?: (ev: BatePapo) => void
  mostrarContagem?: boolean
}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [enviando, setEnviando] = useState(false)

  const responder = async (status: StatusPresenca) => {
    if (enviando) return
    setEnviando(true)
    const novo = ev.my_status === status ? null : status
    try {
      const atualizado = await responderPresenca(ev.event_uuid, novo, token)
      aoMudar?.(atualizado)
      queryClient.setQueryData(CHAVES_BATEPAPO.um(ev.event_uuid), atualizado)
      queryClient.invalidateQueries({ queryKey: CHAVES_BATEPAPO.todas })
      toast.success(
        novo === 'vou' ? t('batepapos.presenca.confirmada') : novo === 'talvez' ? t('batepapos.presenca.talvez_ok') : t('batepapos.presenca.cancelada')
      )
    } catch {
      toast.error(t('batepapos.erro'))
    } finally {
      setEnviando(false)
    }
  }

  const botao = (status: StatusPresenca, rotulo: string, Icone: typeof Check) => {
    const ativo = ev.my_status === status
    return (
      <button
        type="button"
        onClick={() => responder(status)}
        disabled={enviando}
        aria-pressed={ativo}
        className={`${ativo ? BOTAO_PRIMARIO : BOTAO_SECUNDARIO} min-h-11 px-4 text-sm disabled:opacity-60`}
      >
        <Icone size={16} weight={ativo ? 'bold' : 'regular'} aria-hidden="true" />
        {rotulo}
      </button>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {botao('vou', t('batepapos.presenca.vou'), Check)}
      {botao('talvez', t('batepapos.presenca.talvez'), Question)}
      {mostrarContagem && (
        <span className="text-xs text-[var(--text-3)]" aria-live="polite">
          {t('batepapos.presenca.contagem', { vou: ev.going_count, talvez: ev.maybe_count })}
        </span>
      )}
    </div>
  )
}

/** "Adicionar à agenda": .ics gerado no servidor. */
export function BotaoAgenda({ ev, token }: { ev: BatePapo; token?: string }) {
  const { t } = useTranslation()
  const [baixando, setBaixando] = useState(false)
  return (
    <button
      type="button"
      disabled={baixando}
      onClick={async () => {
        setBaixando(true)
        try {
          await baixarIcs(ev.event_uuid, token)
        } catch {
          toast.error(t('batepapos.erro'))
        } finally {
          setBaixando(false)
        }
      }}
      className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm disabled:opacity-60`}
    >
      <CalendarPlus size={18} aria-hidden="true" />
      {t('batepapos.adicionar_agenda')}
    </button>
  )
}

export const LINK_DISCRETO = `underline underline-offset-2 text-[var(--text-2)] hover:text-[var(--text)] ${FOCO}`
