'use client'

import React, { useState } from 'react'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { CommunitySidebar } from '@components/Objects/Communities/CommunitySidebar'
import { MessageCircle, Plus, Settings } from 'lucide-react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useCommunityRights } from '@components/Hooks/useCommunityRights'
import { useOrgMembership } from '@components/Contexts/OrgContext'
import { getUriWithOrg } from '@services/config/config'
import { DiscussionList } from '@components/Objects/Communities/DiscussionList'
import { CreateDiscussionModal } from '@components/Objects/Modals/Communities/CreateDiscussionModal'
import { Community } from '@services/communities/communities'
import AudienciaSelo from '@components/Objects/Communities/AudienciaSelo'
import { DiscussionWithAuthor } from '@services/communities/discussions'
import { useTrackView, AnalyticsEvent } from '@services/analytics'

interface CommunityClientProps {
  community: Community
  initialDiscussions: DiscussionWithAuthor[]
  orgslug: string
  org_id: number
}

const CommunityClient = ({
  community,
  initialDiscussions,
  orgslug,
}: CommunityClientProps) => {
  const { t } = useTranslation()
  const [isCreateDiscussionModalOpen, setIsCreateDiscussionModalOpen] = useState(false)
  const { canManageCommunity, canCreateDiscussion } = useCommunityRights(community.community_uuid)
  const { isUserPartOfTheOrg } = useOrgMembership()

  useTrackView(AnalyticsEvent.CommunityViewed, {
    is_public: community.public,
    initial_discussion_count: initialDiscussions.length,
  })

  return (
    <>
      <GeneralWrapperStyled>
        {/* Breadcrumbs */}
        <div className="pb-4">
          <Breadcrumbs items={[
            { label: t('communities.title'), href: getUriWithOrg(orgslug, '/communities'), icon: <MessageCircle size={14} /> },
            { label: community.name }
          ]} />
        </div>

        {/* Forum Layout - Sidebar Left, Content Right */}
        <div className="flex flex-col md:flex-row gap-6 pt-2">
          {/* Left Sidebar - Community Info (Desktop only) */}
          <div className="hidden md:block w-full md:w-72 lg:w-80 flex-shrink-0">
            <div className="sticky top-24">
              <CommunitySidebar
                community={community}
                discussionCount={initialDiscussions.length}
                orgslug={orgslug}
                onCreateDiscussion={() => setIsCreateDiscussionModalOpen(true)}
              />
            </div>
          </div>

          {/* Main Content - Discussions Feed */}
          <div className="flex-1 min-w-0">
            {/* Celular: nome, descrição e ações no fluxo da página (sem barra
                fixa, que brigaria com a barra de abas do app). */}
            <div className="md:hidden mb-4">
              <h1 className="text-2xl leading-tight text-gray-900">
                {community.name}
              </h1>
              <AudienciaSelo community={community} className="mt-1 max-w-full text-xs font-medium text-gray-600" />
              {community.description && (
                <p className="mt-1 text-sm text-gray-500 line-clamp-3">
                  {community.description}
                </p>
              )}
              {(canCreateDiscussion && isUserPartOfTheOrg) || canManageCommunity ? (
                <div className="mt-3 flex items-center gap-2">
                  {canCreateDiscussion && isUserPartOfTheOrg && (
                    <button
                      type="button"
                      onClick={() => setIsCreateDiscussionModalOpen(true)}
                      className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-neutral-900 px-4 text-sm font-semibold text-white hover:bg-neutral-800"
                    >
                      <Plus size={16} aria-hidden="true" />
                      {t('communities.discussion_list.new_discussion')}
                    </button>
                  )}
                  {canManageCommunity && (
                    <Link
                      href={getUriWithOrg(orgslug, '/dash/communities')}
                      aria-label={t('communities.manage_community')}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      <Settings size={18} aria-hidden="true" />
                    </Link>
                  )}
                </div>
              ) : null}
            </div>

            {/* Discussions List */}
            <div className="bg-white nice-shadow rounded-lg overflow-hidden">
              <DiscussionList
                communityUuid={community.community_uuid}
                orgslug={orgslug}
                onCreateClick={() => setIsCreateDiscussionModalOpen(true)}
                initialDiscussions={initialDiscussions}
              />
            </div>
          </div>
        </div>
      </GeneralWrapperStyled>

      {/* Modals */}
      <CreateDiscussionModal
        isOpen={isCreateDiscussionModalOpen}
        onClose={() => setIsCreateDiscussionModalOpen(false)}
        communityUuid={community.community_uuid}
        orgSlug={orgslug}
      />
    </>
  )
}

export default CommunityClient
