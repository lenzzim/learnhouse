'use client'

/**
 * Posts salvos (decisão N44). Lista privada: só a própria pessoa vê, e o
 * servidor só devolve o que ela ainda pode ler.
 */

import React, { useState } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { BookmarkSimple } from '@phosphor-icons/react'
import { useDadosNav } from '@components/Discipulei/Navegacao/useDadosNav'
import { BOTAO_ICONE, BOTAO_SECUNDARIO, FOCO, SERIF, caminhoDiscussao } from '@components/Discipulei/Navegacao/estilos'
import { getUriWithOrg } from '@services/config/config'
import { getLabelInfo } from '@services/communities/discussions'
import { listarSalvos, salvarPost, type PostSalvo } from '@services/communities/membros'
import { parseApiDate } from '@/lib/datas'
import { PAINEL } from './comum'

const POR_PAGINA = 20

export const CHAVE_SALVOS = (orgId: number | undefined) => ['social', 'salvos', orgId ?? 0] as const

export default function PaginaSalvos({ orgslug }: { orgslug: string }) {
  const { t } = useTranslation()
  const { autenticado, orgId, token, status } = useDadosNav()
  const queryClient = useQueryClient()
  const [removendo, setRemovendo] = useState<string | null>(null)

  const lista = useInfiniteQuery({
    queryKey: CHAVE_SALVOS(orgId),
    queryFn: ({ pageParam }) => listarSalvos(orgId as number, pageParam as number, token),
    initialPageParam: 1,
    getNextPageParam: (ultima: PostSalvo[], todas: PostSalvo[][]) =>
      ultima.length < POR_PAGINA ? undefined : todas.length + 1,
    enabled: autenticado && !!orgId && !!token,
  })

  const remover = async (post: PostSalvo) => {
    setRemovendo(post.discussion_uuid)
    try {
      await salvarPost(post.discussion_uuid, false, token)
      queryClient.setQueryData<InfiniteData<PostSalvo[]>>(CHAVE_SALVOS(orgId), (antigo) =>
        antigo
          ? { ...antigo, pages: antigo.pages.map((p) => p.filter((x) => x.discussion_uuid !== post.discussion_uuid)) }
          : antigo
      )
    } catch {
      toast.error(t('salvos.erro_remover'))
    } finally {
      setRemovendo(null)
    }
  }

  if (status !== 'loading' && !autenticado) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <p className="text-[var(--text-2)]">{t('social.pessoas.so_membros')}</p>
      </main>
    )
  }

  const posts = lista.data?.pages.flat() ?? []

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:pt-10">
      <h1 className="text-3xl leading-tight text-[var(--text)]" style={SERIF}>
        {t('salvos.titulo')}
      </h1>
      <p className="mt-1 text-sm text-[var(--text-2)]">{t('salvos.privado')}</p>
      <div className="mt-6" aria-live="polite">
        {lista.isLoading ? (
          <div className={`${PAINEL} h-32 animate-pulse`} aria-hidden="true" />
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--line-strong)] px-4 py-10 text-center">
            <BookmarkSimple size={28} aria-hidden="true" className="text-[var(--text-3)]" />
            <p className="text-sm text-[var(--text-2)]">{t('salvos.vazio')}</p>
          </div>
        ) : (
          <ul className={`${PAINEL} divide-y divide-[var(--line)] overflow-hidden`}>
            {posts.map((d) => {
              const rotulo = getLabelInfo(d.label || 'general')
              return (
                <li key={d.discussion_uuid} className="flex items-center gap-1 pe-2">
                  <Link
                    href={getUriWithOrg(orgslug, caminhoDiscussao(d.community_uuid, d.discussion_uuid))}
                    className={`block min-w-0 flex-1 px-4 py-3.5 transition-colors hover:bg-[var(--surface)] ${FOCO} focus-visible:outline-offset-[-2px]`}
                  >
                    <span className="block text-base font-medium leading-snug text-[var(--text)]" dir="auto">
                      {d.title}
                    </span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-[var(--text-2)]">
                      <span>{d.community_name}</span>
                      <span aria-hidden="true">·</span>
                      <span>{t(`communities.labels.${rotulo.id}`)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{parseApiDate(d.creation_date).fromNow()}</span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    onClick={() => void remover(d)}
                    disabled={removendo === d.discussion_uuid}
                    aria-label={t('salvos.remover', { titulo: d.title })}
                    title={t('salvos.remover_curto')}
                    className={`${BOTAO_ICONE} disabled:opacity-50`}
                  >
                    <BookmarkSimple size={20} weight="fill" aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        )}
        {lista.hasNextPage && (
          <div className="mt-4 flex justify-center">
            <button
              type="button"
              onClick={() => void lista.fetchNextPage()}
              disabled={lista.isFetchingNextPage}
              className={`${BOTAO_SECUNDARIO} min-h-11 px-5 text-sm disabled:opacity-60`}
            >
              {t('salvos.mais')}
            </button>
          </div>
        )}
      </div>
    </main>
  )
}
