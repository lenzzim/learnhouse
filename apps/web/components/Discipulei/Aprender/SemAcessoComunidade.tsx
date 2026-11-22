'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Flag, Lock } from '@phosphor-icons/react'
import { getUriWithOrg } from '@services/config/config'
import { getCommunityRights } from '@services/communities/communities'
import { startCourse } from '@services/courses/activity'
import { queryKeys } from '@/lib/query/keys'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, SERIF, semPrefixo } from '@components/Discipulei/Navegacao/estilos'

/**
 * Tela de quem abriu uma comunidade sem permissão (no lugar do texto fixo do
 * upstream). Se for a comunidade de um desafio que a pessoa pode ver, explica
 * e oferece a inscrição ali mesmo; senão, só avisa que é restrita.
 */
export function SemAcessoComunidade({ communityUuid, orgslug }: { communityUuid: string; orgslug: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const [inscrevendo, setInscrevendo] = useState(false)

  const { data: direitos, isLoading } = useQuery({
    queryKey: queryKeys.community.rights(communityUuid),
    queryFn: () => getCommunityRights(communityUuid, token),
    enabled: !!token,
    staleTime: 30_000,
  })

  const cursoUuid = direitos?.access?.requires_enrollment ? direitos.access.course_uuid : null

  const inscrever = async () => {
    if (!cursoUuid) return
    setInscrevendo(true)
    try {
      await startCourse(cursoUuid, orgslug, token)
      toast.success(t('aprender.inscricao_ok'))
      await queryClient.invalidateQueries({ queryKey: ['discipulei'] })
      await queryClient.invalidateQueries({ queryKey: queryKeys.community.rights(communityUuid) })
      router.refresh()
    } catch {
      toast.error(t('aprender.erro_inscricao'))
    } finally {
      setInscrevendo(false)
    }
  }

  if (isLoading) {
    return <div className="mx-auto mt-16 h-32 w-full max-w-md animate-pulse rounded-2xl bg-[var(--surface)]" aria-hidden="true" />
  }

  return (
    <main className="mx-auto flex min-h-[50vh] w-full max-w-md flex-col justify-center px-4 py-12 text-center">
      <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--line-strong)] text-[var(--text)]">
        {cursoUuid ? <Flag size={22} aria-hidden="true" /> : <Lock size={22} aria-hidden="true" />}
      </span>
      <h1 className="mt-4 text-2xl leading-tight text-[var(--text)]" style={SERIF}>
        {cursoUuid ? t('aprender.sem_acesso_titulo') : t('aprender.restrita_titulo')}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-[var(--text-2)]">
        {cursoUuid ? t('aprender.sem_acesso_descricao') : t('aprender.restrita_descricao')}
      </p>
      {cursoUuid && (
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={inscrever}
            disabled={inscrevendo}
            aria-busy={inscrevendo}
            className={`${BOTAO_PRIMARIO} min-h-11 px-5 text-sm disabled:opacity-60`}
          >
            {inscrevendo ? t('aprender.inscrevendo') : t('aprender.inscrever')}
          </button>
          <Link
            href={getUriWithOrg(orgslug, `/course/${semPrefixo(cursoUuid, 'course_')}`)}
            className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm`}
          >
            {t('aprender.ver_desafio')}
          </Link>
        </div>
      )}
    </main>
  )
}

export default SemAcessoComunidade
