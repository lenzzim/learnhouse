'use client'

/**
 * Lista simples de notificações no app (decisão N39): por enquanto, menções
 * @nome em posts e comentários. O servidor só devolve o que a pessoa ainda
 * pode ler; abrir a página marca tudo como lido.
 */

import React, { useEffect } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BellSimple } from '@phosphor-icons/react'
import { useDadosNav } from '@components/Discipulei/Navegacao/useDadosNav'
import { FOCO, SERIF, caminhoDiscussao } from '@components/Discipulei/Navegacao/estilos'
import { getUriWithOrg } from '@services/config/config'
import { listarNotificacoes, marcarLidas, nomeDaPessoa, type Notificacao } from '@services/communities/social'
import { parseApiDate } from '@/lib/datas'
import { AvatarPessoa, CHAVE_NAO_LIDAS, PAINEL } from './comum'

export default function PaginaNotificacoes({ orgslug }: { orgslug: string }) {
  const { t } = useTranslation()
  const { autenticado, orgId, token, status } = useDadosNav()
  const queryClient = useQueryClient()

  const lista = useQuery<Notificacao[]>({
    queryKey: ['social', 'notificacoes', orgId ?? 0],
    queryFn: () => listarNotificacoes(orgId as number, token),
    enabled: autenticado && !!orgId && !!token,
  })

  // Abriu a lista: tudo lido (o destaque "nova" continua até sair da página).
  const temNaoLidas = (lista.data ?? []).some((n) => !n.read)
  useEffect(() => {
    if (!temNaoLidas || !orgId || !token) return
    marcarLidas(orgId, token)
      .then(() => queryClient.setQueryData(CHAVE_NAO_LIDAS(orgId), { count: 0 }))
      .catch(() => {})
  }, [temNaoLidas, orgId, token, queryClient])

  if (status !== 'loading' && !autenticado) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <p className="text-[var(--text-2)]">{t('social.pessoas.so_membros')}</p>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:pt-10">
      <h1 className="text-3xl leading-tight text-[var(--text)]" style={SERIF}>
        {t('social.notificacoes.titulo')}
      </h1>
      <div className="mt-6" aria-live="polite">
        {lista.isLoading ? (
          <div className={`${PAINEL} h-32 animate-pulse`} aria-hidden="true" />
        ) : (lista.data?.length ?? 0) === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--line-strong)] px-4 py-10 text-center">
            <BellSimple size={28} aria-hidden="true" className="text-[var(--text-3)]" />
            <p className="text-sm text-[var(--text-2)]">{t('social.notificacoes.vazio')}</p>
          </div>
        ) : (
          <ul className={`${PAINEL} divide-y divide-[var(--line)] overflow-hidden`}>
            {lista.data!.map((n) => {
              const quem = n.actor ? nomeDaPessoa(n.actor) : t('common.unknown')
              const destino = getUriWithOrg(orgslug, caminhoDiscussao(n.community_uuid, n.discussion_uuid))
              return (
                <li key={n.notification_uuid}>
                  <Link
                    href={destino}
                    className={`flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--surface)] ${FOCO} focus-visible:outline-offset-[-2px] ${
                      n.read ? '' : 'bg-[var(--surface)]'
                    }`}
                  >
                    {n.actor ? <AvatarPessoa pessoa={n.actor} tamanho={36} /> : <span className="h-9 w-9" />}
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm leading-snug text-[var(--text)]">
                        {n.comment_uuid
                          ? t('social.notificacoes.mencao_comentario', { nome: quem })
                          : t('social.notificacoes.mencao_post', { nome: quem })}
                      </span>
                      <span className="mt-0.5 block truncate text-sm text-[var(--text-2)]" dir="auto">
                        {n.discussion_title}
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--text-3)]">
                        {parseApiDate(n.creation_date).fromNow()}
                        {!n.read && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span className="font-semibold text-[var(--text)]">{t('social.notificacoes.nova')}</span>
                          </>
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </main>
  )
}
