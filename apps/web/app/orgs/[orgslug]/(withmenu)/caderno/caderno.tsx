'use client'

import React, { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { Loader2, Lock, NotebookPen, ChevronRight } from 'lucide-react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg } from '@services/config/config'
import {
  getLabelInfo,
  getMyNotebook,
  NotebookDiscussion,
} from '@services/communities/discussions'
import { getLabelIcon } from '@components/Objects/Communities/labelIcons'
import { PrivateBadge } from '@components/Objects/Communities/DiscussionVisibilityControls'

dayjs.extend(relativeTime)

const PAGE_SIZE = 20

const semPrefixo = (uuid: string, prefix: string) => uuid.replace(prefix, '')

interface NotebookClientProps {
  orgslug: string
}

/**
 * "Meu caderno": as discussions privadas do usuário em todas as comunidades
 * da organização. Os dados vêm de GET /discussions/notebook, que só devolve
 * as notas do próprio usuário.
 */
export default function NotebookClient({ orgslug }: NotebookClientProps) {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const org = useOrg() as any
  const accessToken = session?.data?.tokens?.access_token
  const isAuthenticated = session?.status === 'authenticated'
  const orgId: number | undefined = org?.id

  const [items, setItems] = useState<NotebookDiscussion[]>([])
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState(false)

  const loadPage = useCallback(
    async (pageToLoad: number) => {
      if (!orgId || !accessToken) return
      setIsLoading(true)
      setError(false)
      try {
        const result = await getMyNotebook(orgId, pageToLoad, PAGE_SIZE, accessToken)
        setItems((prev) => (pageToLoad === 1 ? result : [...prev, ...result]))
        setHasMore(result.length === PAGE_SIZE)
        setPage(pageToLoad)
      } catch {
        setError(true)
      } finally {
        setIsLoading(false)
      }
    },
    [orgId, accessToken]
  )

  useEffect(() => {
    if (isAuthenticated) loadPage(1)
  }, [isAuthenticated, loadPage])

  return (
    <GeneralWrapperStyled>
      <div className="pb-4">
        <Breadcrumbs
          items={[
            { label: t('communities.title'), href: getUriWithOrg(orgslug, '/communities') },
            { label: t('communities.notebook.title') },
          ]}
        />
      </div>

      <div className="flex flex-col gap-1 mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <NotebookPen size={22} className="text-gray-500" />
          {t('communities.notebook.title')}
        </h1>
        <p className="text-sm text-gray-500 flex items-center gap-1.5">
          <Lock size={12} />
          {t('communities.notebook.description')}
        </p>
      </div>

      {session?.status === 'unauthenticated' && (
        <div className="p-6 text-center bg-white nice-shadow rounded-lg">
          <p className="text-sm text-gray-500">{t('communities.notebook.login_required')}</p>
        </div>
      )}

      {isAuthenticated && error && items.length === 0 && (
        <div className="p-6 text-center bg-white nice-shadow rounded-lg">
          <p className="text-sm text-gray-500">{t('communities.notebook.error')}</p>
        </div>
      )}

      {isAuthenticated && !error && !isLoading && items.length === 0 && (
        <div className="flex flex-col justify-center items-center py-12 px-4 border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/30 text-center">
          <div className="p-4 bg-white rounded-full nice-shadow mb-4">
            <NotebookPen className="w-8 h-8 text-gray-300" strokeWidth={1.5} />
          </div>
          <p className="text-md font-medium text-gray-700">{t('communities.notebook.empty_title')}</p>
          <p className="text-sm text-gray-500 mt-1 max-w-md">{t('communities.notebook.empty_description')}</p>
        </div>
      )}

      {items.length > 0 && (
        <div className="bg-white rounded-xl nice-shadow overflow-hidden">
          {items.map((note) => {
            const labelInfo = getLabelInfo(note.label || 'general')
            const href = getUriWithOrg(
              orgslug,
              `/community/${semPrefixo(note.community_uuid, 'community_')}/discussion/${semPrefixo(note.discussion_uuid, 'discussion_')}`
            )
            return (
              <Link
                key={note.discussion_uuid}
                href={href}
                className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
              >
                <span
                  className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: note.emoji ? undefined : `${labelInfo.color}15`, color: labelInfo.color }}
                >
                  {note.emoji ? <span className="text-base">{note.emoji}</span> : getLabelIcon(labelInfo.icon, 14)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-900 truncate" dir="auto">
                    {note.title}
                  </span>
                  <span className="mt-0.5 flex items-center flex-wrap gap-x-2 gap-y-1 text-xs text-gray-500">
                    <span style={{ color: labelInfo.color }}>
                      {t(`communities.labels.${labelInfo.id}`)}
                    </span>
                    <PrivateBadge />
                    <span>{t('communities.notebook.in_community', { community: note.community_name })}</span>
                    <span className="text-gray-300">·</span>
                    <span>{dayjs(note.update_date || note.creation_date).fromNow()}</span>
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-gray-300" />
              </Link>
            )
          })}
        </div>
      )}

      {isLoading && (
        <div className="flex justify-center py-6">
          <Loader2 size={18} className="animate-spin text-gray-400" />
        </div>
      )}

      {hasMore && !isLoading && (
        <div className="flex justify-center pt-4">
          <button
            type="button"
            onClick={() => loadPage(page + 1)}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-lg transition-colors"
          >
            {t('communities.notebook.load_more')}
          </button>
        </div>
      )}
    </GeneralWrapperStyled>
  )
}
