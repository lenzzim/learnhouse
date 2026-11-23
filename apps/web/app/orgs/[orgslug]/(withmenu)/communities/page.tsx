import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { Metadata } from 'next'
import { getServerSession } from '@/lib/auth/server'
import { getCommunities } from '@services/communities/communities'
import { getOrgSeoConfig, buildPageTitle, buildBreadcrumbJsonLd } from '@/lib/seo/utils'
import { getServerCanonicalUrl } from '@/lib/seo/utils.server'
import { imagensOg } from '@/lib/discipulei/og.server'
import { JsonLd } from '@components/SEO/JsonLd'
import CommunitiesClient from './communities'

type MetadataProps = {
  params: Promise<{ orgslug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params
  const org = await getOrganizationContextInfo(params.orgslug, {
    revalidate: 120,
    tags: ['organizations'],
  })

  const seoConfig = getOrgSeoConfig(org)

  const title = buildPageTitle('Comunidades', org.name, seoConfig)
  const description = seoConfig.default_meta_description || `Discussion communities from ${org.name}`
  const canonical = await getServerCanonicalUrl(params.orgslug, '/communities')

  // Prévia de link P&B gerada (item 3.4); o que não é público vira a genérica.
  const og = await imagensOg(params.orgslug, { tipo: 'comunidades' }, org.name)

  return {
    title,
    description,
    robots: {
      index: !seoConfig.noindex_communities,
      follow: true,
      nocache: true,
      googleBot: {
        index: !seoConfig.noindex_communities,
        follow: true,
        'max-image-preview': 'large',
      },
    },
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      type: 'website',
      siteName: org.name,
      images: og.openGraph.images,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: og.twitter.images,
      ...(seoConfig.twitter_handle && { site: seoConfig.twitter_handle }),
    },
  }
}

const CommunitiesPage = async (params: any) => {
  const session = await getServerSession()
  const access_token = session?.tokens?.access_token
  const orgslug = (await params.params).orgslug
  const org = await getOrganizationContextInfo(orgslug, {
    revalidate: 120,
    tags: ['organizations'],
  })
  const org_id = org.id

  let communities = []
  try {
    communities = await getCommunities(
      org_id,
      1,
      100,
      { revalidate: 120, tags: ['communities'] },
      access_token ? access_token : undefined
    )
  } catch (error) {
    console.error('Failed to fetch communities:', error)
    communities = []
  }

  const breadcrumbJsonLd = buildBreadcrumbJsonLd([
    { name: 'Home', url: await getServerCanonicalUrl(orgslug, '/') },
    { name: 'Communities', url: await getServerCanonicalUrl(orgslug, '/communities') },
  ])

  return (
    <>
      <JsonLd data={breadcrumbJsonLd} />
      {/* Discipulei: a faixa "Agendar estudo" saiu daqui (21/11/2026); o convite
          fica no menu e nos momentos certos (devocional publicado, fim do
          capítulo). */}
      <CommunitiesClient
        communities={communities || []}
        orgslug={orgslug}
        org_id={org_id}
      />
    </>
  )
}

export default CommunitiesPage
