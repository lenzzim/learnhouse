import React from 'react'
import { Metadata } from 'next'
import NotaCompartilhadaCliente from '@components/Caderno/NotaCompartilhada'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { metadadosOgGenericos } from '@/lib/discipulei/og.server'

// Nota compartilhada por link privado: nunca indexar, nunca vazar o link
// pelo Referer e nunca guardar em cache. Fora do (withmenu): sem shell e sem
// o rastreador de visualizações.
export const dynamic = 'force-dynamic'

// Prévia de link genérica (item 3.4): nunca o título nem um trecho da nota,
// para nada privado aparecer no WhatsApp.
export async function generateMetadata(props: { params: Promise<{ orgslug: string }> }): Promise<Metadata> {
  const { orgslug } = await props.params
  let siteName = 'Discipulei'
  try {
    const org = await getOrganizationContextInfo(orgslug, { revalidate: 120, tags: ['organizations'] })
    siteName = org?.name || siteName
  } catch {
    // org indisponível: segue com o nome da marca
  }
  return {
    title: 'Nota compartilhada',
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
    referrer: 'no-referrer',
    ...(await metadadosOgGenericos(orgslug, siteName)),
  }
}

export default async function NotaCompartilhadaPage(props: { params: Promise<{ token: string; orgslug: string }> }) {
  const { token, orgslug } = await props.params
  return <NotaCompartilhadaCliente token={token} orgslug={orgslug} />
}
