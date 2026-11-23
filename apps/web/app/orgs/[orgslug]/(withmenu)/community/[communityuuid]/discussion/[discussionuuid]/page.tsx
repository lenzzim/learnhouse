import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import SemAcessoComunidade from '@components/Discipulei/Aprender/SemAcessoComunidade'
import { getServerSession } from '@/lib/auth/server'
import { getCommunity } from '@services/communities/communities'
import { getDiscussion } from '@services/communities/discussions'
import { imagensOg } from '@/lib/discipulei/og.server'
import DiscussionPageClient from './discussion'
import { getOrgSeoConfig } from '@/lib/seo/utils'

/**
 * Extract plain text from discussion content for SEO metadata
 */
function getContentDescription(content: string | null): string {
  if (!content) return ''

  try {
    const parsed = JSON.parse(content)
    if (parsed && typeof parsed === 'object' && parsed.type === 'doc') {
      // Extract text from tiptap JSON
      const extractText = (node: any): string => {
        if (!node) return ''
        if (node.type === 'text') return node.text || ''
        if (node.content && Array.isArray(node.content)) {
          return node.content.map(extractText).join(' ')
        }
        return ''
      }
      return extractText(parsed).trim()
    }
  } catch {
    // Not JSON, return as-is
  }

  return content
}

type MetadataProps = {
  params: Promise<{ orgslug: string; communityuuid: string; discussionuuid: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params
  const org = await getOrganizationContextInfo(params.orgslug, {
    revalidate: 120,
    tags: ['organizations'],
  })

  const discussionUuid = `discussion_${params.discussionuuid}`
  let discussion = null
  try {
    // Sem token de propósito: os metadados (título, descrição, OG) só podem
    // vir do que é público. Uma nota privada (caderno) responde 404 aqui.
    discussion = await getDiscussion(discussionUuid, { revalidate: 120, tags: ['discussions'] })
  } catch (error) {
    // Discussion might not exist or user doesn't have access
  }
  // Defesa extra caso a API devolva uma privada: nunca expor seu conteúdo.
  if (discussion && discussion.visibility === 'private') {
    discussion = null
  }

  const title = discussion ? `${discussion.title} — ${org.name}` : `Conversa — ${org.name}`
  const contentText = discussion ? getContentDescription(discussion.content) : ''
  const description = contentText ? contentText.substring(0, 160) : `Uma conversa da comunidade ${org.name}.`

  // The community pages honour `noindex_communities`, but this page hardcoded
  // `index: true` — so turning the toggle on hid the community listing while
  // every individual post (with its author) stayed indexable. Posts are the
  // most personal content on the platform, so they must follow the same switch.
  // Caderno privado: o que não carrega anonimamente (nota privada, removida ou
  // de comunidade fechada) também não pode ser indexado.
  const noindex = !!getOrgSeoConfig(org).noindex_communities || !discussion

  // Prévia de link P&B (item 3.4): a imagem é gerada a partir do que é
  // público; se a discussão não carregou como visitante, é a genérica.
  const og = await imagensOg(
    params.orgslug,
    discussion
      ? { tipo: 'discussao', comunidade: `community_${params.communityuuid}`, discussao: discussionUuid }
      : { tipo: 'generico' },
    org.name
  )

  return {
    title,
    description,
    robots: {
      index: !noindex,
      follow: true,
      nocache: true,
      googleBot: {
        index: !noindex,
        follow: true,
        'max-image-preview': 'large',
      },
    },
    openGraph: {
      title,
      description,
      type: 'article',
      siteName: org.name,
      images: og.openGraph.images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: og.twitter.images,
    },
  }
}

const DiscussionPage = async (params: any) => {
  const session = await getServerSession()
  const access_token = session?.tokens?.access_token
  const { orgslug, communityuuid, discussionuuid } = await params.params
  const communityUuid = `community_${communityuuid}`
  const discussionUuid = `discussion_${discussionuuid}`

  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 120,
    tags: ['organizations'],
  })

  let community = null
  let discussion = null
  let fetchErrored = false

  try {
    community = await getCommunity(
      communityUuid,
      { revalidate: 120, tags: ['communities'] },
      access_token ? access_token : undefined
    )
  } catch (error) {
    fetchErrored = true
    console.error('Failed to fetch community:', error)
  }

  try {
    discussion = await getDiscussion(
      discussionUuid,
      { revalidate: 120, tags: ['discussions'] },
      access_token ? access_token : undefined
    )
  } catch (error) {
    fetchErrored = true
    console.error('Failed to fetch discussion:', error)
  }

  // Missing or denied-to-anon: 404 so non-public discussions aren't enumerable.
  if ((!community || !discussion) && (!fetchErrored || !access_token)) {
    notFound()
  }

  // Discipulei: tela traduzida; na comunidade de um desafio, oferece a
  // inscrição (só inscritos leem as conversas do desafio).
  if (!community || !discussion) {
    return <SemAcessoComunidade communityUuid={communityUuid} orgslug={orgslug} />
  }

  return (
    <DiscussionPageClient
      discussion={discussion}
      community={community}
      orgslug={orgslug}
    />
  )
}

export default DiscussionPage
