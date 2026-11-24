'use client'

/**
 * Ações do post (N44): Salvar (lista "Salvos", privada) e Compartilhar.
 *
 * Compartilhar só aparece quando o servidor diz que o post é elegível (espaço
 * público, sem grupo, não desafio, não "não compartilhável", não pedido de
 * oração) e o autor não desligou. Usa a Web Share API e, sem ela, copia o
 * link. O autor de um post elegível vê também "Permitir compartilhar fora da
 * comunidade". O estado vem do mesmo pedido das reações (useReacoesFe).
 */

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { BookmarkSimple, ShareNetwork, LinkSimple } from '@phosphor-icons/react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg } from '@services/config/config'
import { alternarCompartilhamento, caminhoCompartilhado, salvarPost } from '@services/communities/membros'
import type { ReacoesFe as DadosReacoes } from '@services/communities/social'
import { useReacoesFe } from './ReacoesFe'

const chave = (discussionUuid: string) => ['social', 'reacoes-fe', discussionUuid]

const BOTAO =
  'inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-sm transition-colors outline-none ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'
const INATIVO = 'border-[var(--line)] text-[var(--text-2)] hover:border-[var(--line-strong)] hover:text-[var(--text)]'
const ATIVO = 'border-[var(--text)] bg-[var(--text)] text-[var(--page)]'

function urlAbsoluta(caminho: string): string {
  const url = caminho
  if (/^https?:\/\//.test(url)) return url
  return `${window.location.origin}${url.startsWith('/') ? '' : '/'}${url}`
}

export function AcoesPost({
  discussionUuid,
  titulo,
  orgslug,
}: {
  discussionUuid: string
  titulo: string
  orgslug: string
}) {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const queryClient = useQueryClient()
  const { data } = useReacoesFe(discussionUuid)
  const [ocupado, setOcupado] = useState(false)

  if (!token || !data) return null

  const salvo = !!data.saved
  const share = data.share
  const podeCompartilhar = !!share?.eligible && !share.disabled_by_author
  const mostraControleAutor = !!share?.eligible && !!share?.can_toggle

  const atualizar = (parcial: Partial<DadosReacoes>) =>
    queryClient.setQueryData<DadosReacoes>(chave(discussionUuid), (d) => (d ? { ...d, ...parcial } : d))

  const alternarSalvo = async () => {
    const novo = !salvo
    atualizar({ saved: novo })
    try {
      await salvarPost(discussionUuid, novo, token)
      toast.success(novo ? t('social.salvar.salvo_toast') : t('social.salvar.removido_toast'))
      queryClient.invalidateQueries({ queryKey: ['social', 'salvos'] })
    } catch (err: any) {
      atualizar({ saved: !novo })
      toast.error(err?.status === 429 ? t('social.reacoes.devagar') : t('social.salvar.erro'))
    }
  }

  const link = () => urlAbsoluta(getUriWithOrg(orgslug, caminhoCompartilhado(discussionUuid)))

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(link())
      toast.success(t('compartilhar.copiado'))
    } catch {
      toast.error(t('compartilhar.erro_copiar'))
    }
  }

  const compartilhar = async () => {
    const url = link()
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: titulo, url })
        return
      } catch (err: any) {
        // A pessoa fechou a folha: nada a fazer.
        if (err?.name === 'AbortError') return
      }
    }
    await copiar()
  }

  const alternarPermissao = async () => {
    if (!share) return
    const ligado = share.disabled_by_author // vai ligar se estava desligado
    setOcupado(true)
    atualizar({ share: { ...share, disabled_by_author: !ligado } })
    try {
      await alternarCompartilhamento(discussionUuid, ligado, token)
    } catch {
      atualizar({ share })
      toast.error(t('compartilhar.erro_permissao'))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2" role="group" aria-label={t('compartilhar.acoes')}>
        <button
          type="button"
          onClick={alternarSalvo}
          aria-pressed={salvo}
          className={`${BOTAO} ${salvo ? ATIVO : INATIVO}`}
        >
          <BookmarkSimple size={16} weight={salvo ? 'fill' : 'regular'} aria-hidden="true" />
          <span>{salvo ? t('social.salvar.salvo') : t('social.salvar.salvar')}</span>
        </button>
        {podeCompartilhar && (
          <>
            <button type="button" onClick={compartilhar} className={`${BOTAO} ${INATIVO}`}>
              <ShareNetwork size={16} aria-hidden="true" />
              <span>{t('compartilhar.compartilhar')}</span>
            </button>
            <button
              type="button"
              onClick={copiar}
              className={`${BOTAO} ${INATIVO}`}
              aria-label={t('compartilhar.copiar_link')}
              title={t('compartilhar.copiar_link')}
            >
              <LinkSimple size={16} aria-hidden="true" />
              <span className="hidden sm:inline">{t('compartilhar.copiar_link')}</span>
            </button>
          </>
        )}
      </div>
      {mostraControleAutor && (
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm text-[var(--text-2)]">
          <input
            type="checkbox"
            className="h-5 w-5 accent-[var(--text)]"
            checked={!share!.disabled_by_author}
            disabled={ocupado}
            onChange={alternarPermissao}
          />
          <span>
            {t('compartilhar.permitir')}
            <span className="block text-xs text-[var(--text-3)]">{t('compartilhar.permitir_ajuda')}</span>
          </span>
        </label>
      )}
    </div>
  )
}
