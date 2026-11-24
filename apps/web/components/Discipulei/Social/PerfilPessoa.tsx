'use client'

/**
 * Perfil de uma pessoa (decisão N39): nome, foto, bio curta e os posts
 * públicos que você pode ler (o servidor passa tudo pela regra de leitura:
 * comunidades restritas e desafios só para inscritos). Nunca mostra e-mail.
 * A contagem de seguidores aparece só para o próprio dono (N22).
 */

import React from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from '@phosphor-icons/react'
import { useDadosNav } from '@components/Discipulei/Navegacao/useDadosNav'
import { FOCO, SERIF, caminhoDiscussao } from '@components/Discipulei/Navegacao/estilos'
import { getUriWithOrg } from '@services/config/config'
import { getLabelInfo } from '@services/communities/discussions'
import { nomeDaPessoa, obterPessoa, postsDaPessoa, type Pessoa, type PostDoFeed } from '@services/communities/social'
import { parseApiDate } from '@/lib/datas'
import { AvatarPessoa, PAINEL, ROTA_PESSOAS, uuidDaPessoa } from './comum'
import { BotaoSeguir } from './Pessoas'

export function ListaPosts({ posts, orgslug }: { posts: PostDoFeed[]; orgslug: string }) {
  const { t } = useTranslation()
  return (
    <ul className={`${PAINEL} divide-y divide-[var(--line)] overflow-hidden`}>
      {posts.map((d) => {
        const rotulo = getLabelInfo(d.label || 'general')
        return (
          <li key={d.discussion_uuid}>
            <Link
              href={getUriWithOrg(orgslug, caminhoDiscussao(d.community_uuid, d.discussion_uuid))}
              className={`block px-4 py-3.5 transition-colors hover:bg-[var(--surface)] ${FOCO} focus-visible:outline-offset-[-2px]`}
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
          </li>
        )
      })}
    </ul>
  )
}

export default function PerfilPessoa({ id, orgslug }: { id: string; orgslug: string }) {
  const { t } = useTranslation()
  const { autenticado, orgId, token, status } = useDadosNav()
  const queryClient = useQueryClient()
  const userUuid = uuidDaPessoa(id)
  const chave = ['social', 'pessoa', orgId ?? 0, userUuid]

  const pessoa = useQuery<Pessoa>({
    queryKey: chave,
    queryFn: () => obterPessoa(orgId as number, userUuid, token),
    enabled: autenticado && !!orgId && !!token,
    retry: false,
  })
  const posts = useQuery<PostDoFeed[]>({
    queryKey: ['social', 'pessoa-posts', orgId ?? 0, userUuid],
    queryFn: () => postsDaPessoa(orgId as number, userUuid, 1, token),
    enabled: !!pessoa.data,
  })

  const voltar = (
    <Link
      href={ROTA_PESSOAS}
      className={`inline-flex min-h-11 items-center gap-2 text-sm text-[var(--text-2)] hover:text-[var(--text)] ${FOCO}`}
    >
      <ArrowLeft size={16} aria-hidden="true" className="rtl:-scale-x-100" />
      {t('social.pessoas.titulo')}
    </Link>
  )

  if (status !== 'loading' && !autenticado) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <p className="text-[var(--text-2)]">{t('social.pessoas.so_membros')}</p>
      </main>
    )
  }

  if (pessoa.isError) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        {voltar}
        <p className="mt-6 text-[var(--text-2)]">{t('social.pessoas.nao_encontrada')}</p>
      </main>
    )
  }

  const p = pessoa.data
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-4 sm:pt-8">
      {voltar}
      {!p ? (
        <div className={`${PAINEL} mt-4 h-32 animate-pulse`} aria-hidden="true" />
      ) : (
        <section className={`${PAINEL} mt-4 p-5`} aria-labelledby="nome-pessoa">
          <div className="flex flex-wrap items-center gap-4">
            <AvatarPessoa pessoa={p} tamanho={64} />
            <div className="min-w-0 flex-1">
              <h1 id="nome-pessoa" className="text-2xl leading-tight text-[var(--text)]" style={SERIF}>
                {nomeDaPessoa(p)}
              </h1>
              {p.is_self && p.follower_count !== null && (
                <p className="mt-0.5 text-sm text-[var(--text-2)]">
                  {t('social.perfil.seguidores', { count: p.follower_count })}
                </p>
              )}
            </div>
            {orgId && (
              <BotaoSeguir
                pessoa={p}
                orgId={orgId}
                token={token}
                aoMudar={(novo) => {
                  queryClient.setQueryData(chave, novo)
                  queryClient.invalidateQueries({ queryKey: ['social', 'feed-seguindo'] })
                }}
              />
            )}
          </div>
          {p.bio && (
            <p className="mt-4 whitespace-pre-wrap text-base leading-relaxed text-[var(--text)]" dir="auto">
              {p.bio}
            </p>
          )}
          {p.is_self && (
            <p className="mt-4 text-xs text-[var(--text-3)]">{t('social.perfil.como_os_outros_veem')}</p>
          )}
          {p.is_self && (
            // Salvos (N44): privado, só o próprio dono vê o atalho.
            <Link
              href={getUriWithOrg(orgslug, '/salvos')}
              className={`mt-3 inline-flex min-h-11 items-center text-sm font-medium text-[var(--text)] underline underline-offset-2 ${FOCO}`}
            >
              {t('salvos.titulo')}
            </Link>
          )}
        </section>
      )}

      {p && (
        <section aria-labelledby="posts-pessoa" className="mt-8">
          <h2 id="posts-pessoa" className="text-xl text-[var(--text)]" style={SERIF}>
            {p.is_self ? t('social.autor.meus') : t('social.pessoas.posts_de', { nome: nomeDaPessoa(p) })}
          </h2>
          <div className="mt-3">
            {posts.isLoading ? (
              <div className={`${PAINEL} h-24 animate-pulse`} aria-hidden="true" />
            ) : (posts.data?.length ?? 0) === 0 ? (
              <p className="rounded-2xl border border-dashed border-[var(--line-strong)] px-4 py-6 text-sm text-[var(--text-2)]">
                {t('social.pessoas.sem_posts')}
              </p>
            ) : (
              <ListaPosts posts={posts.data!} orgslug={orgslug} />
            )}
          </div>
        </section>
      )}
    </main>
  )
}
