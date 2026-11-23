import React from 'react'
import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import PaginaPessoas from '@components/Discipulei/Social/Pessoas'

// Página Pessoas (N39): só para membros logados; nunca indexada.
export const dynamic = 'force-dynamic'

export async function generateMetadata(props: { params: Promise<{ orgslug: string }> }): Promise<Metadata> {
  const { orgslug } = await props.params
  const org = await getOrganizationContextInfo(orgslug, { revalidate: 120, tags: ['organizations'] })
  return {
    title: `Pessoas — ${org.name}`,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    // Prévia genérica: nenhum nome de membro vai para o WhatsApp.
    openGraph: { title: org.name, siteName: org.name },
  }
}

export default function PessoasPage() {
  return <PaginaPessoas />
}
