'use client'

/**
 * Prévia pública de um post compartilhado (N44): título, autor (nome público)
 * e um trecho. O post completo é só para quem entra; login e cadastro voltam
 * direto para ele (?next=).
 */

import React from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { getUriWithOrg } from '@services/config/config'
import type { PostCompartilhado } from '@services/communities/membros'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import {
  BOTAO_PRIMARIO,
  BOTAO_SECUNDARIO,
  SERIF,
  caminhoDiscussao,
} from '@components/Discipulei/Navegacao/estilos'

export default function PostCompartilhadoCliente({ orgslug, post }: { orgslug: string; post: PostCompartilhado }) {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const logado = session?.status === 'authenticated'
  const destino = caminhoDiscussao(post.community_uuid, post.discussion_uuid)
  const next = encodeURIComponent(destino)

  return (
    <div className="min-h-dvh bg-[var(--page)] text-[var(--text)]">
      <main className="mx-auto w-full max-w-[42rem] px-4 pb-24 pt-14 sm:px-8 sm:pt-20">
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--text-3)]">
          {t('compartilhar.publico.rotulo')}
        </p>
        <h1
          className="mt-3 text-[2rem] font-medium leading-tight tracking-[-0.02em] text-[var(--text)] sm:text-[2.5rem]"
          style={SERIF}
        >
          {post.title}
        </h1>
        {post.author_name && (
          <p className="mt-3 text-sm text-[var(--text-2)]">{t('compartilhar.publico.por', { nome: post.author_name })}</p>
        )}

        {post.excerpt && (
          <p className="mt-8 whitespace-pre-line text-lg leading-relaxed text-[var(--text)]" style={SERIF}>
            {post.excerpt}
          </p>
        )}

        <section
          aria-labelledby="ler-completo"
          className="mt-10 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5"
        >
          {logado ? (
            <>
              <h2 id="ler-completo" className="text-base font-medium text-[var(--text)]">
                {t('compartilhar.publico.logado_titulo')}
              </h2>
              <div className="mt-4">
                <Link href={getUriWithOrg(orgslug, destino)} className={`${BOTAO_PRIMARIO} min-h-11 px-5 text-sm`}>
                  {t('compartilhar.publico.ler_completo')}
                </Link>
              </div>
            </>
          ) : (
            <>
              <h2 id="ler-completo" className="text-base font-medium text-[var(--text)]">
                {t('compartilhar.publico.cta')}
              </h2>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href={getUriWithOrg(orgslug, `/login?next=${next}`)}
                  className={`${BOTAO_PRIMARIO} min-h-11 px-5 text-sm`}
                  rel="nofollow"
                >
                  {t('compartilhar.publico.entrar')}
                </Link>
                <Link
                  href={getUriWithOrg(orgslug, `/signup?next=${next}`)}
                  className={`${BOTAO_SECUNDARIO} min-h-11 px-5 text-sm`}
                  rel="nofollow"
                >
                  {t('compartilhar.publico.criar_conta')}
                </Link>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  )
}
