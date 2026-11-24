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
    title: `Agenda — ${org.name}`,
    description: 'Rodas de conversa, cultos e encontros, online e presenciais.',
    openGraph: { title: `Agenda — ${org.name}`, siteName: org.name },
  }
}

export default async function AgendaPage(props: Props) {
  const { orgslug } = await props.params
  return <Agenda orgslug={orgslug} />
}
