'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import { DiscussionDetail } from '@components/Objects/Communities/DiscussionDetail'
import { DiscussionSidebar } from '@components/Objects/Communities/DiscussionSidebar'
import { ConviteEstudo } from '@components/Discipulei/ChamadaEstudo'
import { Breadcrumbs } from '@components/Objects/Breadcrumbs/Breadcrumbs'
import { Community } from '@services/communities/communities'
import { DiscussionWithAuthor, isPrivateDiscussion } from '@services/communities/discussions'
import { MessageCircle } from 'lucide-react'
import { getUriWithOrg } from '@services/config/config'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useTrackView, AnalyticsEvent } from '@services/analytics'
import { useTranslation } from 'react-i18next'

interface DiscussionPageClientProps {
  discussion: DiscussionWithAuthor
  community: Community
  orgslug: string
}

const DiscussionPageClient = ({
  discussion: initialDiscussion,
  community,
  orgslug,
}: DiscussionPageClientProps) => {
  const router = useRouter()
  const { t } = useTranslation()
  const session = useLHSession() as any
  const [discussion, setDiscussion] = useState(initialDiscussion)
  // Discipulei: convite para estudar com alguém logo depois de publicar um devocional.
  const [convidarEstudo, setConvidarEstudo] = useState(false)

  useTrackView(AnalyticsEvent.DiscussionViewed, {
    label: discussion.label,
    is_locked: discussion.is_locked,
    is_author: session?.data?.user?.id === discussion.author_id,
  })

  const handleDiscussionUpdated = (updated: DiscussionWithAuthor) => {
    if (isPrivateDiscussion(discussion) && !isPrivateDiscussion(updated) && updated.label === 'devocional') {
      setConvidarEstudo(true)
    }
    setDiscussion(updated)
    router.refresh()
  }

  return (
    <GeneralWrapperStyled>
      {/* Breadcrumbs */}
      <div className="pb-4">
        <Breadcrumbs items={[
          { label: t('communities.title'), href: getUriWithOrg(orgslug, '/communities'), icon: <MessageCircle size={14} /> },
          { label: community.name, href: getUriWithOrg(orgslug, `/community/${community.community_uuid.replace('community_', '')}`) },
          { label: discussion.title }
        ]} />
      </div>

      {/* Layout - Sidebar Left, Content Right */}
      <div className="flex flex-col md:flex-row gap-6 pt-2">
        {/* Left Sidebar - Discussion Info (Desktop only) */}
        <div className="hidden md:block w-full md:w-72 lg:w-80 flex-shrink-0">
          <div className="sticky top-24">
            <DiscussionSidebar
              discussion={discussion}
              community={community}
              orgslug={orgslug}
            />
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 min-w-0">
          {convidarEstudo && (
            <ConviteEstudo lugar="devocional" className="mb-4" aoFechar={() => setConvidarEstudo(false)} />
          )}
          <DiscussionDetail
            discussion={discussion}
            communityUuid={community.community_uuid}
            orgslug={orgslug}
            onDiscussionUpdated={handleDiscussionUpdated}
          />
        </div>
      </div>
    </GeneralWrapperStyled>
  )
}

export default DiscussionPageClient
