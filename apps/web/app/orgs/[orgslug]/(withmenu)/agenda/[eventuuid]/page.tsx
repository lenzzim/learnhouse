import React from 'react'
import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { obterBatePapo } from '@services/communities/batepapos'
import DetalheEvento from '@components/Discipulei/Batepapos/DetalheEvento'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ orgslug: string; eventuuid: string }> }

/**
 * Prévia (OG) genérica: título, data e cidade. A busca é feita sem sessão,
 * então o servidor nunca devolve endereço nem link aqui.
 */
export async function generateMetadata(props: Props): Promise<Metadata> {
  const { orgslug, eventuuid } = await props.params
  const org = await getOrganizationContextInfo(orgslug, { revalidate: 120, tags: ['organizations'] })
  try {
    const ev = await obterBatePapo(eventuuid)
    const quando = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: ev.timezone || 'America/Sao_Paulo',
    }).format(new Date(ev.starts_at))
    const lugar = ev.mode === 'in_person' ? ev.city || ev.region?.name || '' : 'Online'
    const descricao = [quando, lugar].filter(Boolean).join(' · ')
    const titulo = `${ev.cancelled ? '[Cancelado] ' : ''}${ev.title}`
    return {
      title: `${titulo} — ${org.name}`,
      description: descricao,
      openGraph: { title: titulo, description: descricao, siteName: org.name, type: 'website' },
      twitter: { card: 'summary', title: titulo, description: descricao },
    }
  } catch {
    return {
      title: `Agenda — ${org.name}`,
      robots: { index: false, follow: false },
      openGraph: { title: org.name, siteName: org.name },
    }
  }
}

export default async function EventoPage(props: Props) {
  const { orgslug, eventuuid } = await props.params
  return <DetalheEvento id={eventuuid} orgslug={orgslug} />
}
