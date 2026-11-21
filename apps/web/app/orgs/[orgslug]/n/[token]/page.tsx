import React from 'react'
import { Metadata } from 'next'
import NotaCompartilhadaCliente from '@components/Caderno/NotaCompartilhada'

// Nota compartilhada por link privado: nunca indexar, nunca vazar o link
// pelo Referer e nunca guardar em cache. Fora do (withmenu): sem shell e sem
// o rastreador de visualizações.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Nota compartilhada',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: 'no-referrer',
}

export default async function NotaCompartilhadaPage(props: { params: Promise<{ token: string; orgslug: string }> }) {
  const { token, orgslug } = await props.params
  return <NotaCompartilhadaCliente token={token} orgslug={orgslug} />
}
