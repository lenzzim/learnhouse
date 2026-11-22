'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowRight, ChatsCircle, Flag } from '@phosphor-icons/react'
import { getUriWithOrg } from '@services/config/config'
import { startCourse } from '@services/courses/activity'
import { getDesafioAtual, type DesafioAtual } from '@services/communities/desafio'
import { queryKeys } from '@/lib/query/keys'
import { CHAVES_NAV, useDadosNav } from '@components/Discipulei/Navegacao/useDadosNav'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, SERIF, semPrefixo } from '@components/Discipulei/Navegacao/estilos'

export const CHAVE_DESAFIO = (orgId: number | undefined) => ['discipulei', 'desafio', orgId ?? 0] as const

/** Desafio atual da pessoa (null = nenhum aberto para ela). */
export function useDesafioAtual() {
  const { autenticado, token, orgId } = useDadosNav()
  return useQuery<DesafioAtual | null>({
    queryKey: CHAVE_DESAFIO(orgId),
    queryFn: () => getDesafioAtual(orgId as number, token),
    enabled: autenticado && !!orgId && !!token,
    staleTime: 60_000,
  })
}

/**
 * Cartão "Desafio atual" da tela /hoje. Discreto de propósito: o produto é o
 * Caderno e as conversas; o desafio é apoio. Some quando não há desafio.
 *
 * Inscrever-se = o "começar curso" nativo; dá acesso às aulas e às conversas
 * da comunidade ligada ao curso.
 */
export function CartaoDesafio({ orgslug }: { orgslug: string }) {
  const { t } = useTranslation()
  const { token, orgId, autenticado } = useDadosNav()
  const queryClient = useQueryClient()
  const { data: desafio } = useDesafioAtual()
  const [inscrevendo, setInscrevendo] = useState(false)

  if (!desafio) return null

  const rotaCurso = `/course/${semPrefixo(desafio.course_uuid, 'course_')}`
  const rotaComunidade = `/community/${semPrefixo(desafio.community_uuid, 'community_')}`

  const inscrever = async () => {
    setInscrevendo(true)
    try {
      await startCourse(desafio.course_uuid, orgslug, token)
      toast.success(t('aprender.inscricao_ok'))
      // A comunidade do desafio passa a aparecer na navegação e no Caderno.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: CHAVE_DESAFIO(orgId) }),
        queryClient.invalidateQueries({ queryKey: CHAVES_NAV.comunidades(orgId, autenticado) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.community.byCourse(desafio.course_uuid) }),
      ])
    } catch {
      toast.error(t('aprender.erro_inscricao'))
    } finally {
      setInscrevendo(false)
    }
  }

  return (
    <section
      aria-labelledby="hoje-desafio"
      className="mt-4 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5"
    >
      <p className="flex items-center gap-1.5 text-xs font-medium text-[var(--text-3)]">
        <Flag size={14} aria-hidden="true" />
        {t('aprender.desafio_atual')}
        {desafio.is_enrolled && (
          <>
            <span aria-hidden="true">·</span>
            <span>{t('aprender.participando')}</span>
          </>
        )}
      </p>
      <h2 id="hoje-desafio" className="mt-1.5 text-xl leading-tight text-[var(--text)]" style={SERIF} dir="auto">
        {desafio.course_name}
      </h2>
      <p className="mt-1 line-clamp-2 max-w-prose text-sm leading-snug text-[var(--text-2)]" dir="auto">
        {desafio.is_enrolled ? desafio.course_description || t('aprender.continuar_descricao') : t('aprender.convite')}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {desafio.is_enrolled ? (
          <>
            <Link href={getUriWithOrg(orgslug, rotaCurso)} className={`${BOTAO_PRIMARIO} min-h-11 px-5 text-sm`}>
              {t('aprender.continuar')}
              <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
            </Link>
            <Link href={getUriWithOrg(orgslug, rotaComunidade)} className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm`}>
              <ChatsCircle size={16} aria-hidden="true" />
              {t('aprender.conversas')}
            </Link>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={inscrever}
              disabled={inscrevendo}
              aria-busy={inscrevendo}
              className={`${BOTAO_PRIMARIO} min-h-11 px-5 text-sm disabled:opacity-60`}
            >
              {inscrevendo ? t('aprender.inscrevendo') : t('aprender.inscrever')}
            </button>
            <Link href={getUriWithOrg(orgslug, rotaCurso)} className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm`}>
              {t('aprender.ver_desafio')}
            </Link>
          </>
        )}
      </div>
    </section>
  )
}

export default CartaoDesafio
