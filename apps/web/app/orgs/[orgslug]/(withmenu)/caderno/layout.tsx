import React, { Suspense } from 'react'
import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import AreaCaderno from '@components/Caderno/AreaCaderno'
import { metadadosOgGenericos } from '@/lib/discipulei/og.server'

// Conteúdo pessoal e privado: sempre por requisição e nunca indexado.
export const dynamic = 'force-dynamic'

export async function generateMetadata(props: { params: Promise<{ orgslug: string }> }): Promise<Metadata> {
  const { orgslug } = await props.params
  const org = await getOrganizationContextInfo(orgslug, { revalidate: 120, tags: ['organizations'] })
  return {
    title: `Caderno — ${org.name}`,
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    referrer: 'no-referrer',
    // Prévia genérica (item 3.4): nada do Caderno vai para a prévia do link.
    ...(await metadadosOgGenericos(orgslug, org.name)),
  }
}

export default async function CadernoLayout(props: { children: React.ReactNode; params: Promise<{ orgslug: string }> }) {
  const { orgslug } = await props.params
  return (
    <Suspense fallback={null}>
      <AreaCaderno orgslug={orgslug}>{props.children}</AreaCaderno>
    </Suspense>
  )
}
