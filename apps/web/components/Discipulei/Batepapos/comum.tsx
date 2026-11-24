'use client'

/**
 * Peças comuns da Agenda (antes Bate-papo Online, N45): rotas, chaves do React Query,
 * relógio que anda (o botão "Entrar" acende 10 minutos antes) e formatação
 * de data no idioma da interface e no fuso do navegador, com o fuso do
 * encontro quando for diferente.
 */

import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { useQuery } from '@tanstack/react-query'
import {
  ArrowSquareOut,
  CalendarPlus,
  CaretDown,
  Check,
  GoogleLogo,
  MapPin,
  Question,
  ShareNetwork,
  VideoCamera,
} from '@phosphor-icons/react'
import {
  baixarIcs,
  entrarEmDestaque,
  idCurtoEvento,
  listarRegioes,
  localPublico,
  responderPresenca,
  situacaoAgora,
  urlGoogleAgenda,
  type BatePapo,
  type Regiao,
  type StatusPresenca,
} from '@services/communities/batepapos'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, FOCO } from '@components/Discipulei/Navegacao/estilos'

export const ROTA_BATEPAPOS = '/agenda'
export const rotaBatePapo = (eventUuid: string) => `${ROTA_BATEPAPOS}/${idCurtoEvento(eventUuid)}`

export const CHAVES_BATEPAPO = {
  todas: ['batepapos'] as const,
  lista: (orgId: number | undefined, quando: string) => ['batepapos', 'lista', orgId ?? 0, quando] as const,
  intervalo: (orgId: number | undefined, de: string) => ['batepapos', 'intervalo', orgId ?? 0, de] as const,
  um: (id: string) => ['batepapos', 'um', idCurtoEvento(id)] as const,
  confirmados: (id: string) => ['batepapos', 'confirmados', idCurtoEvento(id)] as const,
  regioes: (orgId: number | undefined) => ['batepapos', 'regioes', orgId ?? 0] as const,
  preferencias: (orgId: number | undefined) => ['batepapos', 'preferencias', orgId ?? 0] as const,
}

/** Regiões ativas (Online primeiro, ordem do painel). */
export function useRegioes(orgId: number | undefined) {
  return useQuery<Regiao[]>({
    queryKey: CHAVES_BATEPAPO.regioes(orgId),
    queryFn: () => listarRegioes(orgId as number),
    enabled: !!orgId,
    staleTime: 10 * 60_000,
  })
}

const CHAVE_REGIAO = 'discipulei:agenda:regiao'

/** Região escolhida nos chips, lembrada neste navegador ('' = Todas). */
export function useRegiaoLembrada(): [string, (v: string) => void] {
  const [valor, setValor] = useState('')
  useEffect(() => {
    try {
      setValor(window.localStorage.getItem(CHAVE_REGIAO) || '')
    } catch {
      /* armazenamento bloqueado: fica em "Todas" */
    }
  }, [])
  const mudar = (v: string) => {
    setValor(v)
    try {
      if (v) window.localStorage.setItem(CHAVE_REGIAO, v)
      else window.localStorage.removeItem(CHAVE_REGIAO)
    } catch {
      /* sem armazenamento: vale só nesta visita */
    }
  }
  return [valor, mudar]
}

/** "Bible Talk · Cambuí, Campinas" (ou "Online"). */
export function LinhaLocal({ ev, className = '' }: { ev: BatePapo; className?: string }) {
  const { t } = useTranslation()
  const lugar = ev.mode === 'in_person' ? localPublico(ev) : t('agenda.online')
  const Icone = ev.mode === 'in_person' ? MapPin : VideoCamera
  return (
    <span className={`inline-flex flex-wrap items-center gap-x-1.5 ${className}`}>
      <span className="font-medium text-[var(--text)]">{t(`agenda.tipo.${ev.kind || 'bible_talk'}`)}</span>
      <span aria-hidden="true">·</span>
      <Icone size={14} aria-hidden="true" className="shrink-0" />
      <span dir="auto">{lugar}</span>
      {ev.mode === 'in_person' && ev.region && ev.city && ev.region.name !== ev.city && (
        <span className="text-[var(--text-3)]" dir="auto">
          ({ev.region.name})
        </span>
      )}
    </span>
  )
}

/** Selos: Cancelado, Ao vivo, Lotado. */
export function Selos({ ev, situacao }: { ev: BatePapo; situacao: string }) {
  const { t } = useTranslation()
  return (
    <>
      {ev.cancelled && (
        <span className="rounded-full border border-[var(--text)] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--text)]">
          {t('agenda.cancelado')}
        </span>
      )}
      {!ev.cancelled && situacao === 'live' && (
        <span className="rounded-full border border-[var(--text)] px-2 py-0.5 text-xs font-semibold text-[var(--text)]">
          {t('batepapos.ao_vivo')}
        </span>
      )}
      {!ev.cancelled && situacao !== 'past' && ev.is_full && (
        <span className="rounded-full border border-[var(--line-strong)] px-2 py-0.5 text-xs text-[var(--text-2)]">
          {t('agenda.lotado')}
        </span>
      )}
    </>
  )
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
    } catch (err: any) {
      toast.error(err?.status === 409 ? t('agenda.lotado_dica') : t('batepapos.erro'))
    } finally {
      setEnviando(false)
    }
  }

  if (ev.cancelled) return null

  const botao = (status: StatusPresenca, rotulo: string, Icone: typeof Check) => {
    const ativo = ev.my_status === status
    // Lotado: "Vou" bloqueado para quem ainda não tem vaga ("Talvez" continua).
    const bloqueado = status === 'vou' && ev.is_full && !ativo
    return (
      <button
        type="button"
        onClick={() => responder(status)}
        disabled={enviando || bloqueado}
        title={bloqueado ? t('agenda.lotado_dica') : undefined}
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
          {ev.capacity ? ` · ${t('agenda.vagas', { n: ev.spots_left ?? 0, total: ev.capacity })}` : ''}
        </span>
      )}
    </div>
  )
}

/**
 * "Adicionar à agenda": Google Agenda (link de modelo, sem login) ou .ics
 * (Apple/Outlook), os dois só com o que o servidor mandou para esta pessoa.
 */
export function BotaoAgenda({ ev, token, linkPublico }: { ev: BatePapo; token?: string; linkPublico: string }) {
  const { t } = useTranslation()
  const [baixando, setBaixando] = useState(false)
  const baixar = async () => {
    setBaixando(true)
    try {
      await baixarIcs(ev.event_uuid, token)
    } catch {
      toast.error(t('batepapos.erro'))
    } finally {
      setBaixando(false)
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" disabled={baixando} className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm disabled:opacity-60`}>
          <CalendarPlus size={18} aria-hidden="true" />
          {t('batepapos.adicionar_agenda')}
          <CaretDown size={14} aria-hidden="true" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-56">
        <DropdownMenuItem asChild className="min-h-11 cursor-pointer gap-2">
          <a href={urlGoogleAgenda(ev, linkPublico)} target="_blank" rel="noopener noreferrer">
            <GoogleLogo size={18} aria-hidden="true" />
            {t('agenda.google')}
            <span className="sr-only">({t('batepapos.nova_aba')})</span>
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem className="min-h-11 cursor-pointer gap-2" onSelect={() => void baixar()}>
          <CalendarPlus size={18} aria-hidden="true" />
          {t('agenda.ics')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Compartilhar: link público do evento (sem endereço nem link da reunião). */
export function BotaoCompartilhar({ titulo, url }: { titulo: string; url: string }) {
  const { t } = useTranslation()
  const compartilhar = async () => {
    try {
      const nav = navigator as Navigator & { share?: (d: { title: string; url: string }) => Promise<void> }
      if (nav.share) {
        await nav.share({ title: titulo, url })
        return
      }
      await navigator.clipboard.writeText(url)
      toast.success(t('agenda.link_copiado'))
    } catch {
      /* cancelado pela pessoa */
    }
  }
  return (
    <button type="button" onClick={compartilhar} className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm`}>
      <ShareNetwork size={18} aria-hidden="true" />
      {t('agenda.compartilhar')}
    </button>
  )
}

export const LINK_DISCRETO = `underline underline-offset-2 text-[var(--text-2)] hover:text-[var(--text)] ${FOCO}`
