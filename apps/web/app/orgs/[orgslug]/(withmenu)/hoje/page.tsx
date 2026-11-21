import React from 'react'
import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import HojeClient from './hoje'

// Tela pessoal (leitura, rascunhos, comunidades da pessoa): sempre por requisição.
export const dynamic = 'force-dynamic'

type MetadataProps = {
  params: Promise<{ orgslug: string }>
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params
  const org = await getOrganizationContextInfo(params.orgslug, {
    revalidate: 120,
    tags: ['organizations'],
  })
  return {
    title: `Hoje — ${org.name}`,
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
  }
}

const HojePage = async (params: any) => {
  const orgslug = (await params.params).orgslug
  return <HojeClient orgslug={orgslug} />
}

export default HojePage
