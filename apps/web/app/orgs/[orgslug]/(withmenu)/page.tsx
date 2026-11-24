import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getOrgSeoConfig, buildPageTitle } from '@/lib/seo/utils'
import { getServerCanonicalUrl } from '@/lib/seo/utils.server'
import { imagensOg } from '@/lib/discipulei/og.server'
import HomeClient from './home-client'

type MetadataProps = {
  params: Promise<{ orgslug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params;
  // Get Org context information
  const org = await getOrganizationContextInfo(params.orgslug, {
    revalidate: 120,
    tags: ['organizations'],
  })

  const seoConfig = getOrgSeoConfig(org)
  const canonical = await getServerCanonicalUrl(params.orgslug, '/')
  const title = buildPageTitle('Hoje', org.name, seoConfig)
  const description = org.description || seoConfig.default_meta_description || ''

  // Prévia de link P&B gerada (item 3.4); o que não é público vira a genérica.
  const og = await imagensOg(params.orgslug, { tipo: 'generico' }, org.name)

  // SEO
  return {
    title,
    description,
    robots: {
      index: true,
      follow: true,
      nocache: true,
      googleBot: {
        index: true,
        follow: true,
        'max-image-preview': 'large',
      },
    },
    alternates: {
      canonical,
    },
    ...(seoConfig.google_site_verification
      ? {
          verification: {
            google: seoConfig.google_site_verification,
          },
        }
      : {}),
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

const OrgHomePage = async (params: any) => {
  const orgslug = (await params.params).orgslug
  return <HomeClient orgslug={orgslug} />
}

export default OrgHomePage
