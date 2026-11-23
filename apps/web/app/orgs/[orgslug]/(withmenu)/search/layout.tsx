import { Metadata } from 'next'
import { getOrganizationContextInfo } from '@services/organizations/orgs'

type Props = { params: Promise<{ orgslug: string }>; children: React.ReactNode }

export async function generateMetadata(props: { params: Promise<{ orgslug: string }> }): Promise<Metadata> {
  const params = await props.params
  const org = await getOrganizationContextInfo(params.orgslug, { revalidate: 120, tags: ['organizations'] }).catch(() => null)
  return { title: `Buscar — ${org?.name || 'Discipulei'}`, robots: { index: false, follow: false } }
}

export default function BuscaLayout({ children }: Props) {
  return children
}
