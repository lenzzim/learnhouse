'use client'

/**
 * Grupo do WhatsApp (decisão N42): estado compartilhado entre o passo único
 * da entrada, o cartão da tela Hoje, o menu do avatar e a Conta.
 *
 * A escolha "Sou homem / Sou mulher" só serve para mostrar o link do grupo
 * certo. Ela só volta da API para a própria pessoa (e para admins, no painel);
 * nunca aparece para outros membros nem é usada para mais nada.
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowUpRight, WhatsappLogo } from '@phosphor-icons/react'
import { useOrgMembership } from '@components/Contexts/OrgContext'
import { useDadosNav } from '@components/Discipulei/Navegacao/useDadosNav'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO } from '@components/Discipulei/Navegacao/estilos'
import {
  obterMeuWhatsapp,
  salvarMeuWhatsapp,
  type GrupoWhatsapp,
  type MeuWhatsapp,
} from '@services/communities/membros'

/** Evento de janela que abre o passo de escolha (menu do avatar, cartão). */
export const EVENTO_ABRIR_WHATSAPP = 'discipulei:whatsapp-abrir'

export function abrirPassoWhatsapp() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(EVENTO_ABRIR_WHATSAPP))
}

export const CHAVE_WHATSAPP = (orgId: number | undefined) => ['discipulei', 'whatsapp', orgId ?? 0] as const

/** Meu grupo do WhatsApp. Só para membros logados da org. */
export function useMeuWhatsapp() {
  const { autenticado, orgId, token } = useDadosNav()
  const { isUserPartOfTheOrg } = useOrgMembership()
  const queryClient = useQueryClient()
  const habilitado = autenticado && !!orgId && !!token && isUserPartOfTheOrg

  const query = useQuery<MeuWhatsapp>({
    queryKey: CHAVE_WHATSAPP(orgId),
    queryFn: () => obterMeuWhatsapp(orgId as number, token),
    enabled: habilitado,
    staleTime: 5 * 60_000,
  })

  const mutation = useMutation({
    mutationFn: (dados: { group: GrupoWhatsapp | null; dismissed?: boolean }) =>
      salvarMeuWhatsapp(orgId as number, dados, token),
    onSuccess: (dados) => queryClient.setQueryData(CHAVE_WHATSAPP(orgId), dados),
  })

  return { habilitado, dados: query.data, carregando: query.isLoading, salvar: mutation.mutateAsync, salvando: mutation.isPending }
}

/** Escolher o grupo, com toast de erro. Devolve o estado novo (ou null). */
export function useEscolherWhatsapp() {
  const { t } = useTranslation()
  const { salvar, salvando } = useMeuWhatsapp()
  const escolher = async (dados: { group: GrupoWhatsapp | null; dismissed?: boolean }) => {
    try {
      return await salvar(dados)
    } catch {
      toast.error(t('whatsapp.erro'))
      return null
    }
  }
  return { escolher, salvando }
}

/** Botões "Sou homem" / "Sou mulher". */
export function BotoesEscolha({
  aoEscolher,
  desabilitado,
}: {
  aoEscolher: (g: GrupoWhatsapp) => void
  desabilitado?: boolean
}) {
  const { t } = useTranslation()
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        disabled={desabilitado}
        onClick={() => aoEscolher('homens')}
        className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm disabled:opacity-60`}
      >
        {t('whatsapp.sou_homem')}
      </button>
      <button
        type="button"
        disabled={desabilitado}
        onClick={() => aoEscolher('mulheres')}
        className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm disabled:opacity-60`}
      >
        {t('whatsapp.sou_mulher')}
      </button>
    </div>
  )
}

/** Botão do grupo certo (nova aba, sem referer) + a linha da aprovação. */
export function BotaoGrupo({ url, grupo }: { url: string; grupo: GrupoWhatsapp }) {
  const { t } = useTranslation()
  return (
    <div>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${BOTAO_PRIMARIO} min-h-11 w-full px-4 text-sm`}
      >
        <WhatsappLogo size={18} aria-hidden="true" />
        <span>{grupo === 'homens' ? t('whatsapp.entrar_homens') : t('whatsapp.entrar_mulheres')}</span>
        <ArrowUpRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
        <span className="sr-only">({t('whatsapp.nova_aba')})</span>
      </a>
      <p className="mt-2 text-xs text-[var(--text-2)]">{t('whatsapp.aprovacao')}</p>
    </div>
  )
}
