'use client'
import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import dayjs from 'dayjs'
import { parseApiDate } from '@/lib/datas'
import relativeTime from 'dayjs/plugin/relativeTime'

dayjs.extend(relativeTime)
import { Trash2, MoreVertical, Lock } from 'lucide-react'
import { PencilSimple } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import UserAvatar from '@components/Objects/UserAvatar'
import { useRouter } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'
import { DiscussionWithAuthor, DiscussionAuthor, deleteDiscussion, getLabelInfo, isPrivateDiscussion } from '@services/communities/discussions'
import { EditDiscussionForm } from '@components/Objects/Modals/Communities/EditDiscussionModal'
import { BotoesReacaoFe } from './ReacoesFe'
import { getLabelIcon } from './labelIcons'
import { PrivateBadge, PublishDiscussionButton, useChangeVisibility } from './DiscussionVisibilityControls'
import { getUserAvatarMediaDirectory } from '@services/media/media'
import { CommentSection } from './CommentSection'
import { DiscussionContent } from './DiscussionContent'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import ConfirmationModal from '@components/Objects/StyledElements/ConfirmationModal/ConfirmationModal'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@components/ui/dropdown-menu"

interface DiscussionDetailProps {
  discussion: DiscussionWithAuthor
  communityUuid: string
  orgslug: string
  /** Obsoleto (item 1.6): a edição agora acontece no lugar, nesta página. */
  onEdit?: () => void
  onDiscussionUpdated?: (updated: DiscussionWithAuthor) => void
}

/**
 * Parse discussion content - handles both JSON (tiptap) and plain text (legacy)
 */
function parseDiscussionContent(content: string | null): any {
  if (!content) return null

  // Try to parse as JSON (tiptap content)
  try {
    const parsed = JSON.parse(content)
    // Verify it looks like tiptap content
    if (parsed && typeof parsed === 'object' && parsed.type === 'doc') {
      return parsed
    }
    // Not tiptap format, return as string
    return content
  } catch {
    // Not JSON, return as plain text
    return content
  }
}

/**
 * Get the proper avatar URL for a user
 */
function getAvatarUrl(author: DiscussionAuthor | null): string | null {
  if (!author?.avatar_image) return null

  // If it's already a full URL (external auth like Google), use directly
  if (author.avatar_image.startsWith('http://') || author.avatar_image.startsWith('https://')) {
    return author.avatar_image
  }

  // Otherwise construct the media URL
  return getUserAvatarMediaDirectory(author.user_uuid, author.avatar_image)
}

export function DiscussionDetail({
  discussion,
  communityUuid,
  orgslug,
  onDiscussionUpdated,
}: DiscussionDetailProps) {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const router = useRouter()
  const communityId = communityUuid.replace('community_', '')
  const accessToken = session?.data?.tokens?.access_token
  const currentUserId = session?.data?.user?.id

  const timeAgo = parseApiDate(discussion.creation_date).fromNow()
  const isAuthor = currentUserId === discussion.author_id
  const labelInfo = getLabelInfo(discussion.label || 'general')
  const isPrivate = isPrivateDiscussion(discussion)
  const { changeVisibility } = useChangeVisibility()
  // Item 1.6: abre sempre na leitura; "Editar" troca pelo formulário no lugar.
  const [editando, setEditando] = useState(false)
  const restamEdicoes = isPrivate || 2 - (discussion.edit_count || 0) > 0
  const podeEditar = isAuthor && restamEdicoes

  const handleMakePrivate = async () => {
    const updated = await changeVisibility(discussion, 'private')
    if (updated) onDiscussionUpdated?.(updated)
  }

  const authorName = discussion.author
    ? `${discussion.author.first_name} ${discussion.author.last_name}`.trim() || discussion.author.username
    : t('common.unknown')

  const handleDelete = async () => {
    try {
      await deleteDiscussion(discussion.discussion_uuid, accessToken)
      router.push(getUriWithOrg(orgslug, `/community/${communityId}`))
      router.refresh()
    } catch (err: any) {
      const message =
        (err?.detail && typeof err.detail === 'object' && err.detail.message) ||
        (typeof err?.detail === 'string' && err.detail) ||
        err?.message ||
        t('communities.discussion_detail.delete_failed')
      toast.error(message)
    }
  }

  return (
    <div className="bg-white nice-shadow rounded-lg overflow-hidden">
      {/* Header */}
      <div className="p-6 pb-0">
        {/* Title Row */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            {editando ? (
              <h1 className="text-lg font-semibold text-gray-900">{t('communities.edit_discussion.title')}</h1>
            ) : (
            <h1 className="text-2xl font-bold text-gray-900 break-words flex items-start gap-3">
              {discussion.emoji && (
                <span className="text-3xl flex-shrink-0">{discussion.emoji}</span>
              )}
              <span dir="auto">{discussion.title}</span>
            </h1>
            )}
            {isPrivate && <PrivateBadge className="mt-2" />}
          </div>

          {isAuthor && !editando && (
            <div className="flex flex-shrink-0 items-center gap-1">
            {podeEditar && (
              <button
                type="button"
                onClick={() => setEditando(true)}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-gray-200 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
              >
                <PencilSimple size={16} aria-hidden="true" />
                {t('communities.discussion_detail.edit')}
              </button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button aria-label={t('social.discussao.mais_acoes')} className="flex-shrink-0 inline-flex h-11 w-11 items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                  <MoreVertical size={18} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {!isPrivate && (
                  <DropdownMenuItem onClick={handleMakePrivate}>
                    <Lock className="me-2 h-4 w-4" />
                    {t('communities.visibility.make_private')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem asChild>
                  <ConfirmationModal
                    confirmationMessage={t('communities.discussion_detail.delete_confirm')}
                    confirmationButtonText={t('communities.discussion_detail.delete_button')}
                    dialogTitle={t('communities.discussion_detail.delete_title')}
                    dialogTrigger={
                      <button className="w-full text-start flex items-center px-2 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-md transition-colors">
                        <Trash2 className="me-2 h-4 w-4" /> {t('communities.discussion_detail.delete')}
                      </button>
                    }
                    functionToExecute={handleDelete}
                    status="warning"
                  />
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            </div>
          )}
        </div>
        {!editando && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-0.5 text-xs text-gray-600">
            <span aria-hidden="true">{getLabelIcon(labelInfo.icon, 12)}</span>
            {t(`communities.labels.${labelInfo.id}`)}
          </p>
        )}

        {/* Nota privada: aviso + publicar (só o autor chega até aqui) */}
        {isPrivate && isAuthor && (
          <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
            <Lock size={16} className="flex-shrink-0 text-gray-500" />
            <p className="flex-1 text-sm text-gray-600">
              {t('communities.visibility.private_notice')}
            </p>
            <PublishDiscussionButton discussion={discussion} onUpdated={onDiscussionUpdated} />
          </div>
        )}

        {/* Author info - Mobile only */}
        <div className="mt-4 flex items-center gap-3 md:hidden">
          <UserAvatar
            width={36}
            rounded="rounded-full"
            avatar_url={getAvatarUrl(discussion.author) || undefined}
            predefined_avatar={discussion.author?.avatar_image ? undefined : 'empty'}
            showProfilePopup={true}
            userId={discussion.author?.id?.toString()}
            shadow="shadow-none"
          />
          <div>
            <div className="text-sm font-medium text-gray-900">{authorName}</div>
            <div className="text-xs text-gray-500">{timeAgo}</div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {editando ? (
          <EditDiscussionForm
            discussion={discussion}
            communityUuid={communityUuid}
            onCancel={() => setEditando(false)}
            onUpdated={(updated) => {
              setEditando(false)
              onDiscussionUpdated?.(updated)
            }}
          />
        ) : discussion.content ? (
          <div className="prose prose-gray max-w-none">
            <DiscussionContent content={parseDiscussionContent(discussion.content)} />
          </div>
        ) : (
          <p className="text-gray-500 italic">{t('communities.discussion_detail.no_details')}</p>
        )}
        {!editando && !isPrivate && (
          <div className="mt-5">
            <BotoesReacaoFe discussionUuid={discussion.discussion_uuid} />
          </div>
        )}
      </div>

      {/* Comments Section */}
      <div className="border-t border-gray-100">
        <CommentSection
          discussionUuid={discussion.discussion_uuid}
          communityUuid={communityUuid}
          isLocked={discussion.is_locked}
          isPrivate={isPrivate}
          discussion={discussion}
          onDiscussionUpdated={onDiscussionUpdated}
        />
      </div>
    </div>
  )
}

export default DiscussionDetail
