import React from 'react'
import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import Agenda from '@components/Discipulei/Batepapos/Agenda'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ orgslug: string }> }

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { orgslug } = await props.params
  const org = await getOrganizationContextInfo(orgslug, { revalidate: 120, tags: ['organizations'] })
  return {
    title: `Bate-papos — ${org.name}`,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    openGraph: { title: org.name, siteName: org.name },
  }
}

export default async function BatePaposPage(props: Props) {
  const { orgslug } = await props.params
  return <Agenda orgslug={orgslug} />
}
