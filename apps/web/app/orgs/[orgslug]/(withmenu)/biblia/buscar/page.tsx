import React, { Suspense } from 'react'
import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { getOrgSeoConfig, buildPageTitle } from '@/lib/seo/utils'
import BuscaBiblia from '@components/Busca/BuscaBiblia'

// Busca dentro da Bíblia: /biblia/buscar?q=amor&v=blivre&t=NT&l=JHN&o=canonica
// A página é leve; a busca roda no cliente contra /api/v1/search/biblia.

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
    title: buildPageTitle('Buscar na Bíblia', org.name, seoConfig),
    robots: { index: false },
  }
}

export default function BuscaBibliaPage() {
  return (
    // useSearchParams no cliente exige um limite de Suspense
    <Suspense fallback={null}>
      <BuscaBiblia />
    </Suspense>
  )
}
