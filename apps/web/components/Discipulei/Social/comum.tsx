'use client'

import React from 'react'
import { useQuery } from '@tanstack/react-query'
import UserAvatar from '@components/Objects/UserAvatar'
import { getUserAvatarMediaDirectory } from '@services/media/media'
import { contarNaoLidas } from '@services/communities/social'
import { useDadosNav } from '@components/Discipulei/Navegacao/useDadosNav'

/** Rotas do social (sem o prefixo da org; o proxy resolve pelo domínio). */
export const ROTA_PESSOAS = '/pessoas'
export const ROTA_NOTIFICACOES = '/notificacoes'
export const rotaPessoa = (userUuid: string) => `/pessoas/${userUuid.replace(/^user_/, '')}`
export const uuidDaPessoa = (id: string) => (id.startsWith('user_') ? id : `user_${id}`)

export function urlAvatar(p: { user_uuid: string; avatar_image?: string | null }): string | undefined {
  if (!p.avatar_image) return undefined
  if (/^https?:\/\//.test(p.avatar_image)) return p.avatar_image
  return getUserAvatarMediaDirectory(p.user_uuid, p.avatar_image)
}

export function AvatarPessoa({ pessoa, tamanho = 40 }: { pessoa: { user_uuid: string; avatar_image?: string | null }; tamanho?: number }) {
  const url = urlAvatar(pessoa)
  return (
    <UserAvatar
      width={tamanho}
      rounded="rounded-full"
      avatar_url={url}
      predefined_avatar={url ? undefined : 'empty'}
      shadow="shadow-none"
      borderColor="border-transparent"
    />
  )
}

export const CHAVE_NAO_LIDAS = (orgId: number | undefined) => ['social', 'notificacoes', 'nao-lidas', orgId ?? 0]

/** Quantas notificações não lidas (menções). Atualiza a cada 2 minutos. */
export function useNaoLidas(): number {
  const { autenticado, orgId, token } = useDadosNav()
  const q = useQuery<{ count: number }>({
    queryKey: CHAVE_NAO_LIDAS(orgId),
    queryFn: () => contarNaoLidas(orgId as number, token),
    enabled: autenticado && !!orgId && !!token,
    staleTime: 60_000,
    refetchInterval: 120_000,
    refetchOnWindowFocus: true,
  })
  return q.data?.count ?? 0
}

export const PAINEL = 'rounded-2xl border border-[var(--line)] bg-[var(--panel)]'
