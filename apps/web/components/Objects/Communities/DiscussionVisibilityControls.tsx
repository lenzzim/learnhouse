'use client'
import React, { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Globe, Loader2, Lock } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import {
  DiscussionVisibility,
  DiscussionWithAuthor,
  setDiscussionVisibility,
} from '@services/communities/discussions'

/**
 * Caderno privado: selo "Privado", botão "Publicar" com confirmação inline e
 * a ação "Tornar privado". Só o autor enxerga uma discussão privada, então
 * quem usa estes controles já é o autor — o backend valida de novo.
 */

export function PrivateBadge({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600 ${className}`}
      title={t('communities.visibility.private_notice')}
    >
      <Lock size={12} aria-hidden="true" />
      {t('communities.visibility.private_badge')}
    </span>
  )
}

function errorMessage(err: any, fallback: string): string {
  return (
    (err?.detail && typeof err.detail === 'object' && err.detail.message) ||
    (typeof err?.detail === 'string' && err.detail) ||
    err?.message ||
    fallback
  )
}

/** Troca a visibilidade e devolve a discussão atualizada (ou null em erro). */
export function useChangeVisibility() {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const [isChanging, setIsChanging] = useState(false)

  const changeVisibility = async (
    discussion: DiscussionWithAuthor,
    visibility: DiscussionVisibility
  ): Promise<DiscussionWithAuthor | null> => {
    if (!accessToken) return null
    setIsChanging(true)
    try {
      const updated = await setDiscussionVisibility(
        discussion.discussion_uuid,
        visibility,
        accessToken
      )
      toast.success(
        visibility === 'public'
          ? t('communities.visibility.published')
          : t('communities.visibility.made_private')
      )
      return updated
    } catch (err: any) {
      toast.error(errorMessage(err, t('communities.visibility.failed')))
      return null
    } finally {
      setIsChanging(false)
    }
  }

  return { changeVisibility, isChanging }
}

interface PublishDiscussionButtonProps {
  discussion: DiscussionWithAuthor
  onUpdated?: (updated: DiscussionWithAuthor) => void
  size?: 'sm' | 'md'
}

/** Botão primário "Publicar" com um pequeno diálogo de confirmação inline. */
export function PublishDiscussionButton({
  discussion,
  onUpdated,
  size = 'md',
}: PublishDiscussionButtonProps) {
  const { t } = useTranslation()
  const { changeVisibility, isChanging } = useChangeVisibility()
  const [confirming, setConfirming] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Fecha a confirmação com Esc ou clique fora.
  useEffect(() => {
    if (!confirming) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setConfirming(false)
    }
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setConfirming(false)
      }
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [confirming])

  const stop = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const handlePublish = async (e: React.MouseEvent) => {
    stop(e)
    const updated = await changeVisibility(discussion, 'public')
    if (updated) {
      setConfirming(false)
      onUpdated?.(updated)
    }
  }

  const sizeClasses = size === 'sm' ? 'min-h-9 px-3 text-xs' : 'min-h-10 px-3 text-sm'

  return (
    <div ref={containerRef} className="relative inline-block">
      <button
        type="button"
        onClick={(e) => {
          stop(e)
          setConfirming((v) => !v)
        }}
        aria-expanded={confirming}
        className={`inline-flex items-center gap-1.5 font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors ${sizeClasses}`}
      >
        <Globe size={size === 'sm' ? 12 : 14} />
        {t('communities.visibility.publish')}
      </button>

      {confirming && (
        <div
          role="dialog"
          aria-label={t('communities.visibility.publish_title')}
          onClick={(e) => e.stopPropagation()}
          className="absolute end-0 top-full mt-2 z-30 w-64 p-3 bg-white border border-gray-200 rounded-lg nice-shadow text-start"
        >
          <p className="text-sm font-medium text-gray-900">
            {t('communities.visibility.publish_title')}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            {t('communities.visibility.publish_confirm')}
          </p>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={(e) => {
                stop(e)
                setConfirming(false)
              }}
              className="px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-100 rounded-md transition-colors"
            >
              {t('communities.visibility.cancel')}
            </button>
            <button
              type="button"
              onClick={handlePublish}
              disabled={isChanging}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-md transition-colors disabled:opacity-50"
            >
              {isChanging && <Loader2 size={12} className="animate-spin" />}
              {t('communities.visibility.publish_button')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
