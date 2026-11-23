import React from 'react'
import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import PerfilPessoa from '@components/Discipulei/Social/PerfilPessoa'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ orgslug: string; usuario: string }> }

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { orgslug } = await props.params
  const org = await getOrganizationContextInfo(orgslug, { revalidate: 120, tags: ['organizations'] })
  // Título e prévia genéricos: o perfil só existe para membros logados.
  return {
    title: `Pessoas — ${org.name}`,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    openGraph: { title: org.name, siteName: org.name },
  }
}

export default async function PerfilPessoaPage(props: Props) {
  const { orgslug, usuario } = await props.params
  return <PerfilPessoa id={usuario} orgslug={orgslug} />
}
