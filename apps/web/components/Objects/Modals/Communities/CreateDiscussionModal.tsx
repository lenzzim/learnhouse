'use client'
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import {
  buildDevotionalTemplate,
  createDiscussion,
  DISCUSSION_LABELS,
  DiscussionVisibility,
  DiscussionWithAuthor,
} from '@services/communities/discussions'
import { useMutateDiscussions } from '@components/Hooks/useDiscussions'
import Modal from '@components/Objects/StyledElements/Modal/Modal'
import { DiscussionEditor } from '@components/Objects/Communities/DiscussionEditor'
import { EmojiPicker } from '@components/Objects/Communities/EmojiPicker'
import { Loader2, AlertCircle, Check, Lock, Globe } from 'lucide-react'
import { getLabelIcon } from '@components/Objects/Communities/labelIcons'
import { useLHAnalytics, AnalyticsEvent } from '@services/analytics'

export interface CommunityOption {
  community_uuid: string
  name: string
}

interface CreateDiscussionModalProps {
  isOpen: boolean
  onClose: () => void
  /** Comunidade fixa. Opcional quando `communityOptions` é passado. */
  communityUuid?: string
  orgSlug: string
  /**
   * Discipulei ("Meu caderno"): mostra um seletor de comunidade com estas
   * opções. A inicial é `defaultCommunityUuid` (ou a primeira).
   */
  communityOptions?: CommunityOption[]
  defaultCommunityUuid?: string
  /** Fixa a visibilidade e troca o seletor por um aviso. */
  lockVisibility?: DiscussionVisibility
  /** Categoria inicial; "devocional" já abre com o template. */
  initialLabel?: string
  dialogTitle?: string
  dialogDescription?: string
  onCreated?: (discussion: DiscussionWithAuthor, communityUuid: string) => void
}

// Rótulo cuja nota nasce no caderno (privada) e ganha o template devocional.
const DEVOTIONAL_LABEL = 'devocional'

function defaultVisibilityFor(label: string): DiscussionVisibility {
  return label === DEVOTIONAL_LABEL ? 'private' : 'public'
}

// O editor está "vazio" quando não há nenhum texto digitado (parágrafos vazios
// não contam). Assim o template nunca sobrescreve o que a pessoa escreveu.
function editorHasText(node: any): boolean {
  if (!node) return false
  if (node.type === 'text') return !!(node.text && node.text.trim())
  if (Array.isArray(node.content)) return node.content.some(editorHasText)
  return false
}

export function CreateDiscussionModal({
  isOpen,
  onClose,
  communityUuid,
  orgSlug: _orgSlug,
  communityOptions,
  defaultCommunityUuid,
  lockVisibility,
  initialLabel = 'general',
  dialogTitle,
  dialogDescription,
  onCreated,
}: CreateDiscussionModalProps) {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const _router = useRouter()
  const mutateDiscussions = useMutateDiscussions()
  const { track } = useLHAnalytics('learner')

  const devotionalTemplate = () =>
    buildDevotionalTemplate({
      passage: t('communities.devotional_template.passage'),
      learned: t('communities.devotional_template.learned'),
      apply: t('communities.devotional_template.apply'),
      prayer: t('communities.devotional_template.prayer'),
    })
  const initialContent = () => (initialLabel === DEVOTIONAL_LABEL ? devotionalTemplate() : null)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState<any>(initialContent)
  const [titleError, setTitleError] = useState<string | null>(null)
  const [selectedLabel, setSelectedLabel] = useState<string>(initialLabel)
  const [selectedEmoji, setSelectedEmoji] = useState<string | null>(null)
  const [pickedCommunity, setPickedCommunity] = useState<string | null>(null)
  const [visibility, setVisibility] = useState<DiscussionVisibility>(defaultVisibilityFor(initialLabel))
  // Depois que a pessoa escolhe a visibilidade, trocar a categoria não a altera mais.
  const [visibilityTouched, setVisibilityTouched] = useState(false)
  // O DiscussionEditor só lê `content` ao montar; trocar a key remonta com o template.
  const [editorKey, setEditorKey] = useState(0)

  const accessToken = session?.data?.tokens?.access_token
  const hasCommunityPicker = !!communityOptions
  const targetCommunity =
    (pickedCommunity && communityOptions?.some((c) => c.community_uuid === pickedCommunity)
      ? pickedCommunity
      : null) ||
    communityUuid ||
    defaultCommunityUuid ||
    communityOptions?.[0]?.community_uuid ||
    ''
  const effectiveVisibility: DiscussionVisibility = lockVisibility ?? visibility

  const validateTitle = (value: string) => {
    if (!value.trim()) {
      return t('communities.create_discussion.title_required')
    }
    if (value.trim().length < 5) {
      return t('communities.create_discussion.title_min_length')
    }
    if (value.length > 200) {
      return t('communities.create_discussion.title_max_length')
    }
    return null
  }

  const handleLabelSelect = (labelId: string) => {
    setSelectedLabel(labelId)
    if (!visibilityTouched) {
      setVisibility(defaultVisibilityFor(labelId))
    }
    if (labelId === DEVOTIONAL_LABEL && !editorHasText(content)) {
      setContent(devotionalTemplate())
      setEditorKey((k) => k + 1)
    }
  }

  const handleVisibilitySelect = (value: DiscussionVisibility) => {
    setVisibility(value)
    setVisibilityTouched(true)
  }

  const resetForm = () => {
    setTitle('')
    setContent(initialContent())
    setSelectedLabel(initialLabel)
    setSelectedEmoji(null)
    setVisibility(defaultVisibilityFor(initialLabel))
    setVisibilityTouched(false)
    setEditorKey((k) => k + 1)
  }

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setTitle(value)
    setTitleError(validateTitle(value))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    const validationError = validateTitle(title)
    if (validationError) {
      setTitleError(validationError)
      return
    }

    if (!targetCommunity) {
      setError(t('communities.notebook.no_community'))
      return
    }

    setIsSubmitting(true)
    setError(null)
    try {
      const result = await createDiscussion(
        targetCommunity,
        {
          title: title.trim(),
          content: content ? JSON.stringify(content) : null,
          label: selectedLabel,
          emoji: selectedEmoji,
          visibility: effectiveVisibility,
        },
        accessToken
      )

      if (result) {
        track(AnalyticsEvent.DiscussionCreated, {
          label: selectedLabel,
          has_content: !!hasContent,
          title_length: title.trim().length,
        })
        // Revalidate SWR cache to show new discussion immediately
        mutateDiscussions(targetCommunity)
        onCreated?.(result, targetCommunity)
        resetForm()
        onClose()
      }
    } catch (err: any) {
      const message =
        (err?.detail && typeof err.detail === 'object' && err.detail.message) ||
        (typeof err?.detail === 'string' && err.detail) ||
        err?.message ||
        t('communities.create_discussion.failed_to_create')
      setError(message)
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const isValid = !validateTitle(title)
  const hasContent = content && content.content && content.content.length > 0

  return (
    <Modal
      isDialogOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          resetForm()
          setError(null)
          setTitleError(null)
          onClose()
        }
      }}
      dialogTitle={dialogTitle ?? t('communities.create_discussion.title')}
      dialogDescription={dialogDescription ?? t('communities.create_discussion.description')}
      minWidth="lg"
      dialogContent={
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Comunidade onde a nota fica guardada (só no "Meu caderno") */}
          {hasCommunityPicker && (
            <div>
              <label htmlFor="discussion-community" className="block text-sm font-medium text-gray-700 mb-1">
                {t('communities.notebook.community_label')}
              </label>
              {communityOptions && communityOptions.length > 0 ? (
                <select
                  id="discussion-community"
                  value={targetCommunity}
                  onChange={(e) => setPickedCommunity(e.target.value)}
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg bg-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none h-11"
                >
                  {communityOptions.map((c) => (
                    <option key={c.community_uuid} value={c.community_uuid}>
                      {c.name}
                    </option>
                  ))}
                </select>
              ) : (
                <p className="text-sm text-gray-500">{t('communities.notebook.no_community')}</p>
              )}
              <p className="mt-1.5 text-xs text-gray-500">{t('communities.notebook.community_hint')}</p>
            </div>
          )}

          {/* Label Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('communities.create_discussion.category_label')}
            </label>
            <div className="flex flex-wrap gap-2">
              {DISCUSSION_LABELS.map((label) => (
                <button
                  key={label.id}
                  type="button"
                  onClick={() => handleLabelSelect(label.id)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
                    selectedLabel === label.id
                      ? 'border-gray-900 bg-gray-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <span style={{ color: label.color }}>
                    {getLabelIcon(label.icon, 16)}
                  </span>
                  <span className={`text-sm ${selectedLabel === label.id ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                    {t(`communities.labels.${label.id}`)}
                  </span>
                  {selectedLabel === label.id && (
                    <Check size={14} className="text-gray-900" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Title with Emoji */}
          <div>
            <label
              htmlFor="title"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t('communities.create_discussion.title_label')} *
            </label>
            <div className="flex gap-3">
              {/* Emoji Picker */}
              <EmojiPicker
                value={selectedEmoji}
                onChange={setSelectedEmoji}
                triggerClassName={`flex items-center justify-center w-12 h-12 rounded-lg border-2 transition-colors flex-shrink-0 ${
                  selectedEmoji
                    ? 'border-gray-200 bg-gray-50'
                    : 'border-dashed border-gray-300 hover:border-gray-400'
                }`}
              />
              <div className="flex-1">
                <input
                  type="text"
                  name="title"
                  id="title"
                  value={title}
                  onChange={handleTitleChange}
                  placeholder={t('communities.create_discussion.title_placeholder')}
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all h-12"
                />
              </div>
            </div>
            <p className="mt-1.5 text-xs text-gray-500">
              {selectedEmoji ? t('communities.create_discussion.emoji_selected') : t('communities.create_discussion.emoji_hint')}
            </p>
            {titleError && (
              <p className="mt-1 text-sm text-red-500">{titleError}</p>
            )}
          </div>

          {/* Content Editor */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('communities.create_discussion.details_label')}
            </label>
            <DiscussionEditor
              key={editorKey}
              content={content}
              onChange={setContent}
              placeholder={t('communities.create_discussion.details_placeholder')}
              minHeight="180px"
            />
            <p className="mt-1.5 text-xs text-gray-500">
              {t('communities.create_discussion.editor_hint')}
            </p>
          </div>

          {/* Visibilidade fixa (ex.: nova nota do caderno): só um aviso */}
          {lockVisibility === 'private' && (
            <div className="flex items-start gap-2 p-3 rounded-lg border border-gray-200 bg-gray-50 text-sm text-gray-700">
              <Lock size={16} className="mt-0.5 shrink-0 text-gray-500" aria-hidden="true" />
              <span>{t('communities.notebook.private_lock_note')}</span>
            </div>
          )}

          {/* Visibilidade: caderno (só eu) ou comunidade */}
          {!lockVisibility && (
          <fieldset>
            <legend className="block text-sm font-medium text-gray-700 mb-2">
              {t('communities.visibility.label')}
            </legend>
            <div role="radiogroup" aria-label={t('communities.visibility.label')} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {([
                { value: 'private', icon: <Lock size={16} />, title: t('communities.visibility.private_option'), hint: t('communities.visibility.private_hint') },
                { value: 'public', icon: <Globe size={16} />, title: t('communities.visibility.public_option'), hint: t('communities.visibility.public_hint') },
              ] as const).map((option) => {
                const selected = visibility === option.value
                return (
                  <button
                    key={option.value}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => handleVisibilitySelect(option.value)}
                    className={`flex items-start gap-2 p-3 rounded-lg border text-start transition-all ${
                      selected
                        ? 'border-gray-900 bg-gray-50'
                        : 'border-gray-200 hover:border-gray-300 bg-white'
                    }`}
                  >
                    <span className={`mt-0.5 ${selected ? 'text-gray-900' : 'text-gray-500'}`}>{option.icon}</span>
                    <span className="flex-1 min-w-0">
                      <span className={`block text-sm ${selected ? 'font-medium text-gray-900' : 'text-gray-700'}`}>
                        {option.title}
                      </span>
                      <span className="block text-xs text-gray-500 mt-0.5">{option.hint}</span>
                    </span>
                    {selected && <Check size={14} className="mt-0.5 text-gray-900" />}
                  </button>
                )
              })}
            </div>
          </fieldset>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-lg text-red-700 text-sm">
              <AlertCircle size={16} className="flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            >
              {t('communities.create_discussion.cancel')}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !isValid || !targetCommunity}
              className="px-4 py-2 text-sm font-medium text-white bg-neutral-900 hover:bg-neutral-800 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting && <Loader2 size={16} className="animate-spin" />}
              {effectiveVisibility === 'private'
                ? t('communities.visibility.submit_private')
                : t('communities.create_discussion.submit')}
            </button>
          </div>
        </form>
      }
    />
  )
}

export default CreateDiscussionModal
