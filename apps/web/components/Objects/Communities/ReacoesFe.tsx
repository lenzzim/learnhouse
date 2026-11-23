'use client'

/**
 * "Amém" e "Orando" (decisão N39) no post e nos comentários.
 *
 * Um único pedido por discussão (react-query compartilha entre o post e os
 * comentários). A contagem só chega para o autor do post/comentário (N22);
 * quem reage vê apenas que reagiu.
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { HandsPraying, Check } from '@phosphor-icons/react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import {
  REACOES_FE,
  alternarReacaoComentario,
  alternarReacaoPost,
  obterReacoesFe,
  type EstadoReacao,
  type ReacaoFe,
  type ReacoesFe as DadosReacoes,
} from '@services/communities/social'

const chave = (discussionUuid: string) => ['social', 'reacoes-fe', discussionUuid]

export function useReacoesFe(discussionUuid: string, ativo = true) {
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  return useQuery<DadosReacoes>({
    queryKey: chave(discussionUuid),
    queryFn: () => obterReacoesFe(discussionUuid, token),
    enabled: ativo && !!token && !!discussionUuid,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  })
}

const VAZIO: Record<ReacaoFe, EstadoReacao> = {
  amem: { reacted: false, count: null },
  orando: { reacted: false, count: null },
}

export function BotoesReacaoFe({
  discussionUuid,
  commentUuid,
  desativado = false,
  compacto = false,
}: {
  discussionUuid: string
  /** Sem `commentUuid`, as reações são do post. */
  commentUuid?: string
  desativado?: boolean
  compacto?: boolean
}) {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const queryClient = useQueryClient()
  const { data } = useReacoesFe(discussionUuid, !desativado)

  if (!token || desativado) return null

  const estados: Record<ReacaoFe, EstadoReacao> =
    (commentUuid ? data?.comments?.[commentUuid] : data?.discussion) ?? VAZIO

  const alternar = async (tipo: ReacaoFe) => {
    const anterior = queryClient.getQueryData<DadosReacoes>(chave(discussionUuid))
    const inverter = (e: EstadoReacao): EstadoReacao => ({
      reacted: !e.reacted,
      count: e.count === null ? null : Math.max(0, e.count + (e.reacted ? -1 : 1)),
    })
    // Otimista: muda já e desfaz se o servidor recusar.
    queryClient.setQueryData<DadosReacoes>(chave(discussionUuid), (d) => {
      const base: DadosReacoes = d ?? { discussion: { ...VAZIO }, comments: {} }
      if (commentUuid) {
        const atual = base.comments[commentUuid] ?? VAZIO
        return { ...base, comments: { ...base.comments, [commentUuid]: { ...atual, [tipo]: inverter(atual[tipo]) } } }
      }
      return { ...base, discussion: { ...base.discussion, [tipo]: inverter(base.discussion[tipo] ?? VAZIO[tipo]) } }
    })
    try {
      if (commentUuid) await alternarReacaoComentario(commentUuid, tipo, token)
      else await alternarReacaoPost(discussionUuid, tipo, token)
    } catch (err: any) {
      queryClient.setQueryData(chave(discussionUuid), anterior)
      toast.error(err?.status === 429 ? t('social.reacoes.devagar') : t('social.reacoes.erro'))
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('social.reacoes.rotulo')}>
      {REACOES_FE.map((tipo) => {
        const e = estados[tipo] ?? VAZIO[tipo]
        return (
          <button
            key={tipo}
            type="button"
            onClick={() => alternar(tipo)}
            aria-pressed={e.reacted}
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)] ${
              compacto ? 'px-2.5 text-xs' : ''
            } ${
              e.reacted
                ? 'border-[var(--text)] bg-[var(--text)] text-[var(--page)]'
                : 'border-[var(--line)] text-[var(--text-2)] hover:border-[var(--line-strong)] hover:text-[var(--text)]'
            }`}
          >
            {tipo === 'orando' ? (
              <HandsPraying size={compacto ? 14 : 16} aria-hidden="true" />
            ) : e.reacted ? (
              <Check size={compacto ? 14 : 16} aria-hidden="true" />
            ) : null}
            <span>{t(`social.reacoes.${tipo}`)}</span>
            {e.count !== null && e.count > 0 && (
              <span className="tabular-nums opacity-80">
                <span aria-hidden="true">· </span>
                <span className="sr-only">, </span>
                {t('social.reacoes.contagem', { count: e.count })}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
