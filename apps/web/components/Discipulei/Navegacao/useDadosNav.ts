'use client'

import { useQuery } from '@tanstack/react-query'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import useAdminStatus from '@components/Hooks/useAdminStatus'
import { Community, getCommunities } from '@services/communities/communities'
import { getMyNotebook, NotebookDiscussion } from '@services/communities/discussions'

/** Chaves do React Query do shell (para invalidar depois de criar uma nota). */
export const CHAVES_NAV = {
  comunidades: (orgId: number | undefined, autenticado: boolean) =>
    ['discipulei', 'nav', 'comunidades', orgId ?? 0, autenticado] as const,
  notasRecentes: (orgId: number | undefined) => ['discipulei', 'nav', 'notas', orgId ?? 0] as const,
}

/**
 * Dados que a navegação mostra: sessão, papel de admin, comunidades que a
 * pessoa pode acessar (a API já esconde as áreas restritas de quem não é
 * membro) e as 5 notas privadas mais recentes do caderno.
 */
export function useDadosNav() {
  const session = useLHSession() as any
  const org = useOrg() as any
  const { rights, loading: carregandoPapel } = useAdminStatus()

  const token: string | undefined = session?.data?.tokens?.access_token
  const status: 'loading' | 'authenticated' | 'unauthenticated' = session?.status ?? 'loading'
  const autenticado = status === 'authenticated'
  const orgId: number | undefined = org?.id
  const usuario = session?.data?.user

  const ehAdmin = autenticado && !!rights?.dashboard?.action_access

  const comunidadesQuery = useQuery<Community[]>({
    queryKey: CHAVES_NAV.comunidades(orgId, autenticado),
    queryFn: async () => {
      const lista = await getCommunities(orgId as number, 1, 100, null, token)
      return Array.isArray(lista) ? lista : []
    },
    enabled: !!orgId && status !== 'loading',
    staleTime: 60_000,
  })

  const notasQuery = useQuery<NotebookDiscussion[]>({
    queryKey: CHAVES_NAV.notasRecentes(orgId),
    queryFn: async () => {
      const lista = await getMyNotebook(orgId as number, 1, 5, token)
      return Array.isArray(lista) ? lista : []
    },
    enabled: autenticado && !!orgId && !!token,
    staleTime: 30_000,
  })

  return {
    status,
    autenticado,
    token,
    orgId,
    usuario,
    ehAdmin,
    /** O papel ainda está sendo resolvido: não decidir nada com base nele. */
    papelPendente: status === 'loading' || (autenticado && carregandoPapel),
    comunidades: comunidadesQuery.data ?? [],
    carregandoComunidades: comunidadesQuery.isLoading,
    notasRecentes: notasQuery.data ?? [],
    carregandoNotas: notasQuery.isLoading,
  }
}

/** Primeiro nome para cumprimentar (ou o usuário, se não houver nome). */
export function primeiroNome(usuario: any): string {
  const nome = (usuario?.first_name || '').trim()
  if (nome) return nome.split(/\s+/)[0]
  return (usuario?.username || '').trim()
}
