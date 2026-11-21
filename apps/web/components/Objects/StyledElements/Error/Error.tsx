'use client'
import { classifyError } from '@lib/errors/classify'
import type { ResolutionKind } from '@lib/errors/types'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ErrorActions from './ErrorActions'

/**
 * Discipulei: a API dorme quando fica parada e o primeiro acesso pode
 * devolver 502/503 enquanto ela acorda. Nesses casos a página tenta de novo
 * sozinha, uma vez, depois de 3 s (guardado na sessionStorage por 60 s para
 * nunca entrar em laço).
 */
const ESPERA_AQUECIMENTO_MS = 3000
const CHAVE_RETRY = 'discipulei_erro_retry'

function ehAquecimento(status: number | undefined, kind: string | undefined, detail: string | undefined): boolean {
  if (status === 502 || status === 503) return true
  if (kind === 'service_unavailable') return true
  const msg = (detail || '').toLowerCase()
  return msg.includes('bad gateway') || msg.includes('service unavailable')
}

function podeTentarSozinho(): boolean {
  try {
    const chave = `${CHAVE_RETRY}:${window.location.pathname}`
    const ultimo = Number(window.sessionStorage.getItem(chave) || 0)
    if (Date.now() - ultimo < 60_000) return false
    window.sessionStorage.setItem(chave, String(Date.now()))
    return true
  } catch {
    return false
  }
}

interface ErrorUIProps {
  /** The actual error — when given we classify it for a meaningful message. */
  error?: unknown
  /** Override the headline (back-compat with old `<ErrorUI message=.. />`). */
  message?: string
  /** Override the sub-line. */
  submessage?: string
  /** Next error-boundary reset(); wired to the Retry action when present. */
  reset?: () => void
  /** Sentry event id, so the "Report this problem" button ties to this event. */
  eventId?: string
  /** Force a specific set of recovery actions (otherwise from classification). */
  resolutions?: ResolutionKind[]
  /** Where "Log back in" should return to. */
  loginNext?: string
  /** Tighter layout for inline (non-full-page) use. */
  compact?: boolean
}

/**
 * The shared error surface. Given a raw `error` it shows a SPECIFIC, reassuring
 * message (from the error catalog) plus the recovery actions that actually help
 * — including a sign-out escape hatch and a Sentry "report this problem" button.
 * Collapsible technical details carry the real cause + ids for support.
 */
function ErrorUI({
  error,
  message,
  submessage,
  reset,
  eventId,
  resolutions,
  loginNext,
  compact,
}: ErrorUIProps) {
  const { t } = useTranslation()
  const [showDetails, setShowDetails] = useState(false)
  const [tentandoDeNovo, setTentandoDeNovo] = useState(false)

  const classified = useMemo(
    () => (error !== undefined ? classifyError(error) : undefined),
    [error],
  )

  // Headline + body: explicit props win, else the classified category, else a
  // meaningful default (never a bare "Something went wrong").
  const kind = classified?.category.kind
  const aquecendo = !message && ehAquecimento(classified?.status, kind, classified?.detail)
  const title =
    message ||
    (aquecendo
      ? t('erros.aquecimento.titulo')
      : kind
        ? t(`erros.${kind}.titulo`, { defaultValue: classified?.category.title })
        : t('erros.unknown.titulo', { defaultValue: 'Something unexpected happened' }))
  const description =
    submessage ||
    (aquecendo
      ? t('erros.aquecimento.descricao')
      : kind
        ? t(`erros.${kind}.descricao`, { defaultValue: classified?.category.description })
        : t('erros.unknown.descricao', {
            defaultValue: "We ran into an error. It's been logged automatically — retrying or heading home usually helps.",
          }))

  // 502/503 durante o aquecimento da API: uma tentativa automática.
  useEffect(() => {
    if (!aquecendo || !podeTentarSozinho()) return
    setTentandoDeNovo(true)
    const timer = window.setTimeout(() => window.location.reload(), ESPERA_AQUECIMENTO_MS)
    return () => window.clearTimeout(timer)
  }, [aquecendo])

  const actions: ResolutionKind[] =
    resolutions ||
    classified?.category.resolutions ||
    (['retry', 'home', 'report'] as ResolutionKind[])

  // The raw cause we can safely show under "details".
  const detail = classified?.detail
  const status = classified?.status
  const digest = classified?.digest
  const hasDetails = Boolean(detail || status || digest || eventId)

  return (
    <div
      className={`flex flex-col items-center text-center mx-auto antialiased ${
        compact ? 'py-6 px-4 space-y-4 max-w-lg' : 'py-12 px-6 space-y-6 max-w-xl'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className="bg-rose-100 p-3 rounded-2xl shrink-0">
          <AlertTriangle className="text-rose-700" size={compact ? 28 : 38} />
        </div>
        <div className="flex flex-col text-start">
          <p className={`font-bold text-rose-700 ${compact ? 'text-xl' : 'text-2xl md:text-3xl'}`}>
            {title}
          </p>
          {tentandoDeNovo && (
            <span className="text-sm font-medium text-gray-500" role="status">
              {t('erros.aquecimento.tentando')}
            </span>
          )}
        </div>
      </div>

      <p className={`text-gray-600 ${compact ? 'text-sm' : 'text-base'} max-w-prose`}>
        {description}
      </p>

      <ErrorActions resolutions={actions} reset={reset} eventId={eventId} loginNext={loginNext} />

      {hasDetails && (
        <div className="w-full max-w-lg">
          <button
            onClick={() => setShowDetails((s) => !s)}
            className="flex min-h-11 items-center gap-1 mx-auto text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors"
          >
            {showDetails ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span>{showDetails ? t('erros.esconder_detalhes') : t('erros.mostrar_detalhes')}</span>
          </button>
          {showDetails && (
            <div className="mt-3 bg-gray-50 border border-gray-200 rounded-xl p-4 text-start">
              <dl className="space-y-1.5 text-xs font-mono text-gray-600 break-words">
                {detail && (
                  <div className="flex gap-2">
                    <dt className="text-gray-400 shrink-0">cause</dt>
                    <dd className="break-all">{detail}</dd>
                  </div>
                )}
                {status !== undefined && (
                  <div className="flex gap-2">
                    <dt className="text-gray-400 shrink-0">status</dt>
                    <dd>{status}</dd>
                  </div>
                )}
                {digest && (
                  <div className="flex gap-2">
                    <dt className="text-gray-400 shrink-0">digest</dt>
                    <dd className="break-all">{digest}</dd>
                  </div>
                )}
                {eventId && (
                  <div className="flex gap-2">
                    <dt className="text-gray-400 shrink-0">ref</dt>
                    <dd className="break-all">{eventId}</dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default ErrorUI
