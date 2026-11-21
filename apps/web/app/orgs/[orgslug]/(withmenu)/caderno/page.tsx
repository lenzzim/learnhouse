import React from 'react'
import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import NotebookClient from './caderno'

// Conteúdo pessoal e privado: sempre renderizado por requisição.
export const dynamic = 'force-dynamic'

type MetadataProps = {
  params: Promise<{ orgslug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

export async function generateMetadata(props: MetadataProps): Promise<Metadata> {
  const params = await props.params
  const org = await getOrganizationContextInfo(params.orgslug, {
    revalidate: 120,
    tags: ['organizations'],
  })
  return {
    title: `Meu caderno — ${org.name}`,
    // O caderno é privado: nunca indexar.
    robots: {
      index: false,
      follow: false,
      nocache: true,
      googleBot: { index: false, follow: false },
    },
  }
}

const NotebookPage = async (params: any) => {
  const orgslug = (await params.params).orgslug
  return <NotebookClient orgslug={orgslug} />
}

export default NotebookPage
