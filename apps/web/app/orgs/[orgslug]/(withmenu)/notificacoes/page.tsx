import React from 'react'
import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import PaginaNotificacoes from '@components/Discipulei/Social/Notificacoes'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ orgslug: string }> }

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { orgslug } = await props.params
  const org = await getOrganizationContextInfo(orgslug, { revalidate: 120, tags: ['organizations'] })
  return {
    title: `Notificações — ${org.name}`,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    openGraph: { title: org.name, siteName: org.name },
  }
}

export default async function NotificacoesPage(props: Props) {
  const { orgslug } = await props.params
  return <PaginaNotificacoes orgslug={orgslug} />
}
