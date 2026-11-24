import React from 'react'
import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import DetalheEvento from '@components/Discipulei/Batepapos/DetalheEvento'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ orgslug: string; eventuuid: string }> }

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { orgslug } = await props.params
  const org = await getOrganizationContextInfo(orgslug, { revalidate: 120, tags: ['organizations'] })
  // Título genérico: o link da reunião nunca vai para a prévia.
  return {
    title: `Bate-papo — ${org.name}`,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    openGraph: { title: org.name, siteName: org.name },
  }
}

export default async function BatePapoPage(props: Props) {
  const { orgslug, eventuuid } = await props.params
  return <DetalheEvento id={eventuuid} orgslug={orgslug} />
}
