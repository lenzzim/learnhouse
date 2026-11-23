'use client'
import React, { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { MessageCircle, Plus, Loader2, Search, X, Trash2, CheckSquare, Square, SlidersHorizontal, Check } from 'lucide-react'
import { DiscussionCard } from './DiscussionCard'
import { SortDropdown } from './SortDropdown'
import { LabelFilter } from './LabelFilter'
import {
  deleteDiscussion,
  getCommentCount,
  DiscussionSortBy,
  DiscussionWithAuthor,
  DISCUSSION_LABELS,
} from '@services/communities/discussions'
import { FolhaInferior } from '@components/Discipulei/Navegacao/FolhaInferior'
import toast from 'react-hot-toast'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrgMembership } from '@components/Contexts/OrgContext'
import { useCommunityRights } from '@components/Hooks/useCommunityRights'
import { useDiscussions, useMutateDiscussions } from '@components/Hooks/useDiscussions'
import ConfirmationModal from '@components/Objects/StyledElements/ConfirmationModal/ConfirmationModal'
import { searchMatchesAny } from '@/lib/search/normalize'
import { useLHAnalytics, AnalyticsEvent } from '@services/analytics'

interface DiscussionListProps {
  communityUuid: string
  orgslug: string
  onCreateClick?: () => void
  initialDiscussions?: DiscussionWithAuthor[]
}

export function DiscussionList({
  communityUuid,
  orgslug,
  onCreateClick,
  initialDiscussions = [],
}: DiscussionListProps) {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const { isUserPartOfTheOrg } = useOrgMembership()
  const { canCreateDiscussion: hasCreatePermission, canManageCommunity } = useCommunityRights(communityUuid)
  const canCreateDiscussion = hasCreatePermission && isUserPartOfTheOrg
  const accessToken = session?.data?.tokens?.access_token
  const mutateDiscussions = useMutateDiscussions()
  const { track } = useLHAnalytics('learner')

  const [sortBy, setSortBy] = useState<DiscussionSortBy>('recent')
  const [searchQuery, setSearchQuery] = useState('')
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null)
  // Filtro por autor (N39): "meus posts" ou "posts de…". Vem também da URL
  // (?autor=user_…), usado pelo link do perfil na página Pessoas.
  const currentUserUuid: string | undefined = session?.data?.user?.user_uuid
  const [autor, setAutor] = useState<{ uuid: string; nome: string } | null>(null)
  useEffect(() => {
    // Lido da URL no cliente (sem useSearchParams, que pede Suspense no build).
    const p = new URLSearchParams(window.location.search)
    const daUrl = p.get('autor')
    if (daUrl) setAutor({ uuid: daUrl, nome: p.get('nome') || '' })
  }, [])
  const [autoresConhecidos, setAutoresConhecidos] = useState<Record<string, string>>({})
  // Celular: busca, categoria, ordem e seleção ficam numa folha "Filtrar".
  const [filtrosAbertos, setFiltrosAbertos] = useState(false)

  // Selection state
  const [isSelectMode, setIsSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDeleting, setIsDeleting] = useState(false)

  // Use SWR for fetching discussions
  const { discussions: swrDiscussions, isLoading, mutate } = useDiscussions({
    communityUuid,
    sortBy,
    page: 1,
    limit: 50, // Fetch more initially since we're not paginating for now
    label: selectedLabel,
    authorUuid: autor?.uuid ?? null,
  })

  // Use SWR data, fall back to initial data if SWR hasn't loaded yet.
  // Com filtro ativo, nunca cair na lista inicial (sem filtro).
  const temFiltroServidor = !!selectedLabel || !!autor
  const discussions = temFiltroServidor
    ? swrDiscussions
    : swrDiscussions.length > 0
      ? swrDiscussions
      : initialDiscussions

  // Autores vistos na lista sem filtro de autor: opções do "Posts de…".
  useEffect(() => {
    if (autor) return
    const novos: Record<string, string> = {}
    for (const d of discussions) {
      if (!d.author) continue
      novos[d.author.user_uuid] =
        `${d.author.first_name || ''} ${d.author.last_name || ''}`.trim() || d.author.username
    }
    setAutoresConhecidos((anteriores) => ({ ...anteriores, ...novos }))
  }, [discussions, autor])

  const opcoesAutor = Object.entries(autoresConhecidos)
    .filter(([uuid]) => uuid !== currentUserUuid)
    .sort((a, b) => a[1].localeCompare(b[1]))
  const valorAutor = !autor ? '' : autor.uuid === currentUserUuid ? '__meus__' : autor.uuid
  const mudarAutor = (valor: string) => {
    if (!valor) setAutor(null)
    else if (valor === '__meus__' && currentUserUuid) setAutor({ uuid: currentUserUuid, nome: '' })
    else setAutor({ uuid: valor, nome: autoresConhecidos[valor] || '' })
  }
  const seletorAutor = isUserPartOfTheOrg && !!currentUserUuid && (
    <label className="inline-flex items-center gap-2 text-xs text-gray-500">
      <span className="sr-only md:not-sr-only">{t('social.autor.rotulo')}</span>
      <select
        value={valorAutor}
        onChange={(e) => mudarAutor(e.target.value)}
        className="min-h-11 md:min-h-0 md:h-8 rounded-md border border-gray-200 bg-gray-50 px-2 text-sm md:text-xs text-gray-700"
      >
        <option value="">{t('social.autor.todos')}</option>
        <option value="__meus__">{t('social.autor.meus')}</option>
        {autor && valorAutor === autor.uuid && !autoresConhecidos[autor.uuid] && (
          <option value={autor.uuid}>{t('social.autor.de', { nome: autor.nome || t('common.unknown') })}</option>
        )}
        {opcoesAutor.map(([uuid, nome]) => (
          <option key={uuid} value={uuid}>
            {t('social.autor.de', { nome })}
          </option>
        ))}
      </select>
    </label>
  )

  const fetchCommentCounts = async (discussionList: DiscussionWithAuthor[]) => {
    if (!discussionList.length) return
    try {
      const counts = await Promise.all(
        discussionList.map(async (d) => {
          try {
            const count = await getCommentCount(d.discussion_uuid, null, accessToken)
            return { uuid: d.discussion_uuid, count }
          } catch {
            return { uuid: d.discussion_uuid, count: 0 }
          }
        })
      )
      setCommentCounts(prev => {
        const newCounts = { ...prev }
        counts.forEach(({ uuid, count }) => {
          newCounts[uuid] = count
        })
        return newCounts
      })
    } catch (_error) {
      // silent — counts fall back to 0
    }
  }

  // Fetch comment counts when discussions change
  useEffect(() => {
    if (discussions.length > 0) {
      // Only fetch counts for discussions we don't have counts for
      const newDiscussions = discussions.filter(d => !(d.discussion_uuid in commentCounts))
      if (newDiscussions.length > 0) {
        fetchCommentCounts(newDiscussions)
      }
    }
  }, [discussions])

  const handleCreateClick = (source: 'header' | 'empty_state') => {
    track(AnalyticsEvent.CreateDiscussionModalOpened, {
      source,
      feed_is_empty: filteredDiscussions.length === 0,
    })
    onCreateClick?.()
  }

  const handleSortChange = (newSort: DiscussionSortBy) => {
    setSortBy(newSort)
  }

  const handleLabelChange = (label: string | null) => {
    setSelectedLabel(label)
  }

  // Filter discussions based on search query
  const filteredDiscussions = useMemo(() => {
    if (!searchQuery.trim()) return discussions
    return discussions.filter(d =>
      searchMatchesAny(
        [d.title, d.author?.username, d.author?.first_name, d.author?.last_name],
        searchQuery,
      )
    )
  }, [discussions, searchQuery])

  // Selection handlers
  const toggleSelectMode = () => {
    setIsSelectMode(!isSelectMode)
    setSelectedIds(new Set())
  }

  const toggleSelection = (discussionUuid: string) => {
    const newSelected = new Set(selectedIds)
    if (newSelected.has(discussionUuid)) {
      newSelected.delete(discussionUuid)
    } else {
      newSelected.add(discussionUuid)
    }
    setSelectedIds(newSelected)
  }

  const selectAll = () => {
    if (selectedIds.size === filteredDiscussions.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(filteredDiscussions.map(d => d.discussion_uuid)))
    }
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !accessToken) return

    setIsDeleting(true)
    try {
      // Delete discussions one by one
      const deletePromises = Array.from(selectedIds).map(uuid =>
        deleteDiscussion(uuid, accessToken)
      )
      await Promise.all(deletePromises)

      // Revalidate SWR cache
      mutateDiscussions(communityUuid)
      setSelectedIds(new Set())
      setIsSelectMode(false)
    } catch (err: any) {
      const message =
        (err?.detail && typeof err.detail === 'object' && err.detail.message) ||
        (typeof err?.detail === 'string' && err.detail) ||
        err?.message ||
        t('communities.discussion_list.delete_failed')
      toast.error(message)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleDiscussionUpdate = (updated: DiscussionWithAuthor) => {
    mutate(
      (current) => current?.map(d =>
        d.discussion_uuid === updated.discussion_uuid ? updated : d
      ),
    )
  }

  const handleDiscussionDelete = (discussionUuid: string) => {
    mutate(
      (current) => current?.filter(d => d.discussion_uuid !== discussionUuid),
    )
  }

  const allSelected = filteredDiscussions.length > 0 && selectedIds.size === filteredDiscussions.length

  return (
    <div>
      {/* Header with Search and Filters */}
      {(() => {
        const filtrosAtivos = (searchQuery.trim() ? 1 : 0) + (selectedLabel ? 1 : 0) + (sortBy !== 'recent' ? 1 : 0) + (autor ? 1 : 0)
        const contagem = (
          <span className="text-xs text-gray-500">
            {filteredDiscussions.length} {filteredDiscussions.length === 1 ? t('communities.discussion') : t('communities.discussions')}
          </span>
        )
        const campoBusca = (
          <div className="relative">
            <Search size={16} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" aria-hidden="true" />
            <input dir="auto"
              type="search"
              placeholder={t('communities.discussion_list.search_placeholder')}
              aria-label={t('communities.discussion_list.search_placeholder')}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-11 md:min-h-0 ps-9 pe-11 py-2 text-base md:text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-400/30 focus:border-gray-400 transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label={t('communities.discussion_list.clear_search')}
                className="absolute end-1 top-1/2 -translate-y-1/2 inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-400 hover:text-gray-600"
              >
                <X size={14} aria-hidden="true" />
              </button>
            )}
          </div>
        )
        const botaoSelecionar = canManageCommunity && filteredDiscussions.length > 0 && (
          <button
            type="button"
            onClick={toggleSelectMode}
            aria-pressed={isSelectMode}
            className={`flex items-center gap-1.5 px-3 min-h-11 md:min-h-0 md:h-8 whitespace-nowrap text-xs font-medium rounded-md transition-colors ${
              isSelectMode
                ? 'bg-gray-900 text-white'
                : 'bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100'
            }`}
          >
            <CheckSquare size={14} aria-hidden="true" />
            {isSelectMode ? t('communities.discussion_list.cancel') : t('communities.discussion_list.select')}
          </button>
        )
        const ordens: { value: DiscussionSortBy; label: string }[] = [
          { value: 'recent', label: t('communities.discussion_list.latest_activity') },
          { value: 'upvotes', label: t('communities.discussion_list.top') },
          { value: 'hot', label: t('communities.discussion_list.hot') },
        ]
        const chip = (ativo: boolean) =>
          `inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors ${
            ativo ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
          }`

        return (
          <>
            {/* Desktop e tablet (>= 768px): barra completa */}
            <div className="hidden md:block p-4 border-b border-gray-100 space-y-3">
              {campoBusca}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <LabelFilter value={selectedLabel} onChange={handleLabelChange} />
                  {seletorAutor}
                  <SortDropdown value={sortBy} onChange={handleSortChange} />
                  {contagem}
                </div>
                <div className="flex items-center gap-2">
                  {botaoSelecionar}
                  {canCreateDiscussion && onCreateClick && !isSelectMode && (
                    <button
                      onClick={() => handleCreateClick('header')}
                      className="flex items-center gap-2 px-3 py-2 h-8 whitespace-nowrap bg-neutral-900 hover:bg-neutral-800 text-white rounded-md transition-colors text-xs font-medium"
                    >
                      <Plus size={14} />
                      {t('communities.discussion_list.new_discussion')}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Celular: um botão "Filtrar" abre a folha com tudo */}
            <div className="md:hidden flex items-center gap-3 px-4 py-2 border-b border-gray-100">
              <button
                type="button"
                onClick={() => setFiltrosAbertos(true)}
                aria-haspopup="dialog"
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                <SlidersHorizontal size={16} aria-hidden="true" />
                {t('communities.discussion_list.filter')}
                {filtrosAtivos > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gray-900 px-1.5 text-xs font-semibold text-white">
                    {filtrosAtivos}
                  </span>
                )}
              </button>
              {contagem}
              <span className="flex-1" />
              {isSelectMode && botaoSelecionar}
            </div>

            <FolhaInferior
              aberta={filtrosAbertos}
              aoMudar={setFiltrosAbertos}
              titulo={t('communities.discussion_list.filter')}
            >
              <div className="flex flex-col gap-5">
                {campoBusca}

                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-gray-700">{t('communities.label_filter.label')}</legend>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => handleLabelChange(null)} aria-pressed={!selectedLabel} className={chip(!selectedLabel)}>
                      {!selectedLabel && <Check size={14} aria-hidden="true" />}
                      {t('communities.label_filter.all')}
                    </button>
                    {DISCUSSION_LABELS.map((label) => (
                      <button
                        key={label.id}
                        type="button"
                        onClick={() => handleLabelChange(label.id)}
                        aria-pressed={selectedLabel === label.id}
                        className={chip(selectedLabel === label.id)}
                      >
                        {selectedLabel === label.id && <Check size={14} aria-hidden="true" />}
                        {t(`communities.labels.${label.id}`)}
                      </button>
                    ))}
                  </div>
                </fieldset>

                {seletorAutor && (
                  <div className="flex flex-col gap-2">
                    <span className="text-sm font-medium text-gray-700">{t('social.autor.rotulo')}</span>
                    {seletorAutor}
                  </div>
                )}

                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-gray-700">{t('communities.discussion_list.sort_by')}</legend>
                  <div className="flex flex-wrap gap-2">
                    {ordens.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => handleSortChange(o.value)}
                        aria-pressed={sortBy === o.value}
                        className={chip(sortBy === o.value)}
                      >
                        {sortBy === o.value && <Check size={14} aria-hidden="true" />}
                        {o.label}
                      </button>
                    ))}
                  </div>
                </fieldset>

                <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
                  {!isSelectMode && canManageCommunity && filteredDiscussions.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        toggleSelectMode()
                        setFiltrosAbertos(false)
                      }}
                      className="flex items-center gap-1.5 px-3 min-h-11 text-sm font-medium rounded-md bg-gray-50 border border-gray-200 text-gray-600 hover:bg-gray-100"
                    >
                      <CheckSquare size={14} aria-hidden="true" />
                      {t('communities.discussion_list.select')}
                    </button>
                  )}
                  <span className="flex-1" />
                  {filtrosAtivos > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('')
                        handleLabelChange(null)
                        handleSortChange('recent')
                        setAutor(null)
                      }}
                      className="min-h-11 px-3 text-sm font-medium text-gray-600 underline underline-offset-4"
                    >
                      {t('communities.discussion_list.clear_filters')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFiltrosAbertos(false)}
                    className="min-h-11 rounded-lg bg-neutral-900 px-5 text-sm font-semibold text-white hover:bg-neutral-800"
                  >
                    {t('communities.discussion_list.show_results', { count: filteredDiscussions.length })}
                  </button>
                </div>
              </div>
            </FolhaInferior>
          </>
        )
      })()}

      {/* Selection Action Bar */}
      {isSelectMode && selectedIds.size > 0 && (
        <div className="px-4 py-3 bg-gray-100 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={selectAll}
              className="flex items-center gap-1.5 text-xs text-gray-900 hover:text-gray-900"
            >
              {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
              {allSelected ? t('communities.discussion_list.deselect_all') : t('communities.discussion_list.select_all')}
            </button>
            <span className="text-xs text-gray-900 font-medium">
              {selectedIds.size} {t('communities.discussion_list.selected')}
            </span>
          </div>

          <ConfirmationModal
            confirmationMessage={t('communities.discussion_list.delete_discussions_confirm', { count: selectedIds.size, type: selectedIds.size === 1 ? t('communities.discussion') : t('communities.discussions') })}
            confirmationButtonText={t('communities.discussion_list.delete')}
            dialogTitle={selectedIds.size === 1 ? t('communities.discussion_list.delete_discussions_title', { count: selectedIds.size }) : t('communities.discussion_list.delete_discussions_title_plural', { count: selectedIds.size })}
            dialogTrigger={
              <button
                disabled={isDeleting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-medium transition-colors disabled:opacity-50"
              >
                {isDeleting ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Trash2 size={14} />
                )}
                {t('communities.discussion_list.delete')}
              </button>
            }
            functionToExecute={handleBulkDelete}
            status="warning"
          />
        </div>
      )}

      {/* Discussion List */}
      <div>
        {filteredDiscussions.length === 0 && !isLoading ? (
          <div className="flex flex-col items-center justify-center py-16 px-4">
            <div className="p-4 bg-gray-50 rounded-full mb-4">
              <MessageCircle size={28} className="text-gray-300" />
            </div>
            {searchQuery ? (
              <>
                <h3 className="text-base font-semibold text-gray-600 mb-1">{t('communities.discussion_list.no_results')}</h3>
                <p className="text-sm text-gray-400 text-center max-w-xs mb-4">
                  {t('communities.discussion_list.no_results_description')}
                </p>
                <button
                  onClick={() => setSearchQuery('')}
                  className="text-sm text-gray-900 underline underline-offset-4 font-medium"
                >
                  {t('communities.discussion_list.clear_search')}
                </button>
              </>
            ) : (
              <>
                <h3 className="text-base font-semibold text-gray-600 mb-1">{t('communities.discussion_list.no_discussions')}</h3>
                <p className="text-sm text-gray-400 text-center max-w-xs mb-4">
                  {t('communities.discussion_list.no_discussions_description')}
                </p>
                {canCreateDiscussion && onCreateClick && (
                  <button
                    onClick={() => handleCreateClick('empty_state')}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-lg transition-colors text-sm font-medium"
                  >
                    <Plus size={16} />
                    {t('communities.discussion_list.start_discussion')}
                  </button>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            {isLoading && discussions.length === 0 ? (
              <div className="flex justify-center py-8">
                <Loader2 size={24} className="animate-spin text-gray-400" />
              </div>
            ) : (
              filteredDiscussions.map((discussion) => (
                <DiscussionCard
                  key={discussion.discussion_uuid}
                  discussion={discussion}
                  orgslug={orgslug}
                  communityUuid={communityUuid}
                  commentCount={commentCounts[discussion.discussion_uuid] || 0}
                  isSelectMode={isSelectMode}
                  isSelected={selectedIds.has(discussion.discussion_uuid)}
                  onToggleSelect={() => toggleSelection(discussion.discussion_uuid)}
                  canManage={canManageCommunity}
                  onDiscussionUpdate={handleDiscussionUpdate}
                  onDiscussionDelete={handleDiscussionDelete}
                />
              ))
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default DiscussionList
