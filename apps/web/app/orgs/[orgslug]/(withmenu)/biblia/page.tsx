import React, { Suspense } from 'react'
import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getOrgSeoConfig, buildPageTitle } from '@/lib/seo/utils'
import LeitorBiblia from '@components/Biblia/LeitorBiblia'

// Leitor da Bíblia Livre (BLIVRE). URL: /biblia?ref=JHN.3.16-18
// (livro USFM . capítulo [. versículo[-versículo]]). O texto é buscado no
// cliente em /biblia-dados/blivre/<ID>.json — a página em si é leve.

type MetadataProps = {
  params: Promise<{ orgslug: string }>
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params
  const org = await getOrganizationContextInfo(params.orgslug, {
    revalidate: 120,
    tags: ['organizations'],
  })
  const seoConfig = getOrgSeoConfig(org)
  return {
    title: buildPageTitle('Bíblia', org.name, seoConfig),
    description: 'Bíblia Livre (BLIVRE), CC BY 4.0 BR.',
  }
}

export default function BibliaPage() {
  return (
    // useSearchParams no cliente exige um limite de Suspense
    <Suspense fallback={null}>
      <LeitorBiblia />
    </Suspense>
  )
}
