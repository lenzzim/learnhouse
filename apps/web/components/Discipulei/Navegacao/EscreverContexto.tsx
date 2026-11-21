'use client'

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { BookOpen, CaretRight, ChatsCircle, Lock } from '@phosphor-icons/react'
import { getUriWithOrg } from '@services/config/config'
import {
  CommunityOption,
  CreateDiscussionModal,
} from '@components/Objects/Modals/Communities/CreateDiscussionModal'
import { DiscussionWithAuthor } from '@services/communities/discussions'
import { comunidadeDaRota } from '@/lib/discipulei/nav'
import { FolhaInferior } from './FolhaInferior'
import { CHAVES_NAV, useDadosNav } from './useDadosNav'
import { FOCO, caminhoDiscussao } from './estilos'

/** O que a pessoa escolheu escrever. */
export type ModoEscrever = 'nota' | 'devocional' | 'pergunta'

interface EscreverContextoValor {
  /** Abre a folha "Escrever" (sem modo) ou vai direto a um dos formulários. */
  abrirEscrever: (modo?: ModoEscrever) => void
}

const EscreverContexto = createContext<EscreverContextoValor>({ abrirEscrever: () => {} })

export function useEscrever() {
  return useContext(EscreverContexto)
}

// Comunidade sugerida para uma nota: a de devocionais, se existir (igual ao caderno).
const COMUNIDADE_DEVOCIONAL = /devocion|tempos?\s+com\s+deus/i

/**
 * Fluxo "Escrever" do shell: a folha com as três opções e o modal de criação
 * que já existe no caderno (CreateDiscussionModal com communityOptions e
 * lockVisibility). Depois de salvar, abre a nota/discussão criada.
 */
export function EscreverProvider({ orgslug, children }: { orgslug: string; children: React.ReactNode }) {
  const { t } = useTranslation()
  const router = useRouter()
  const pathname = usePathname()
  const queryClient = useQueryClient()
  const { autenticado, comunidades, orgId } = useDadosNav()

  const [folhaAberta, setFolhaAberta] = useState(false)
  const [modo, setModo] = useState<ModoEscrever | null>(null)

  const opcoes = useMemo<CommunityOption[]>(
    () => comunidades.map((c) => ({ community_uuid: c.community_uuid, name: c.name })),
    [comunidades]
  )

  const abrirEscrever = useCallback((novoModo?: ModoEscrever) => {
    if (novoModo) {
      setFolhaAberta(false)
      setModo(novoModo)
    } else {
      setFolhaAberta(true)
    }
  }, [])

  const escolher = (novoModo: ModoEscrever) => {
    setFolhaAberta(false)
    // Deixa a folha fechar antes do modal abrir: dois diálogos Radix ao mesmo
    // tempo disputam o foco.
    window.setTimeout(() => setModo(novoModo), 120)
  }

  // Comunidade inicial: a aberta na página (pergunta), senão a de devocionais.
  const daRota = comunidadeDaRota(pathname)
  const padraoNota = (opcoes.find((c) => COMUNIDADE_DEVOCIONAL.test(c.name)) ?? opcoes[0])?.community_uuid
  const padraoPergunta =
    (daRota && opcoes.some((c) => c.community_uuid === daRota) ? daRota : undefined) ?? opcoes[0]?.community_uuid

  const aoCriar = (discussao: DiscussionWithAuthor, communityUuid: string) => {
    queryClient.invalidateQueries({ queryKey: CHAVES_NAV.notasRecentes(orgId) })
    router.push(getUriWithOrg(orgslug, caminhoDiscussao(communityUuid, discussao.discussion_uuid)))
  }

  const itens: { modo: ModoEscrever; Icone: typeof Lock; titulo: string; descricao: string }[] = [
    { modo: 'nota', Icone: Lock, titulo: t('nav.escrever.nota'), descricao: t('nav.escrever.nota_descricao') },
    { modo: 'devocional', Icone: BookOpen, titulo: t('nav.escrever.devocional'), descricao: t('nav.escrever.devocional_descricao') },
    { modo: 'pergunta', Icone: ChatsCircle, titulo: t('nav.escrever.pergunta'), descricao: t('nav.escrever.pergunta_descricao') },
  ]

  return (
    <EscreverContexto.Provider value={{ abrirEscrever }}>
      {children}

      {autenticado && (
        <>
          <FolhaInferior
            aberta={folhaAberta}
            aoMudar={setFolhaAberta}
            titulo={t('nav.escrever.titulo')}
            descricao={t('nav.escrever.descricao')}
          >
            <ul className="flex flex-col gap-2" data-testid="folha-escrever">
              {itens.map(({ modo: m, Icone, titulo, descricao }) => (
                <li key={m}>
                  <button
                    type="button"
                    onClick={() => escolher(m)}
                    className={`flex w-full items-center gap-4 rounded-xl border border-[var(--line)] bg-[var(--page)] px-4 py-3 text-start transition-colors hover:border-[var(--line-strong)] hover:bg-[var(--surface)] min-h-16 ${FOCO}`}
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--surface)] text-[var(--text)]">
                      <Icone size={20} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-semibold text-[var(--text)]">{titulo}</span>
                      <span className="mt-0.5 block text-sm leading-snug text-[var(--text-2)]">{descricao}</span>
                    </span>
                    <CaretRight size={16} aria-hidden="true" className="shrink-0 text-[var(--text-3)] rtl:-scale-x-100" />
                  </button>
                </li>
              ))}
            </ul>
          </FolhaInferior>

          {/* key: o modal lê a categoria inicial só ao montar. */}
          {modo && (
            <CreateDiscussionModal
              key={modo}
              isOpen
              onClose={() => setModo(null)}
              orgSlug={orgslug}
              communityOptions={opcoes}
              defaultCommunityUuid={modo === 'pergunta' ? padraoPergunta : padraoNota}
              lockVisibility={modo === 'pergunta' ? 'public' : 'private'}
              initialLabel={modo === 'devocional' ? 'devocional' : modo === 'pergunta' ? 'question' : 'general'}
              dialogTitle={
                modo === 'pergunta'
                  ? t('nav.escrever.pergunta')
                  : modo === 'devocional'
                    ? t('nav.escrever.devocional')
                    : t('communities.notebook.new_note')
              }
              dialogDescription={
                modo === 'pergunta'
                  ? t('nav.escrever.pergunta_modal_descricao')
                  : t('communities.notebook.new_note_description')
              }
              communityHint={modo === 'pergunta' ? t('nav.escrever.pergunta_comunidade_dica') : undefined}
              onCreated={aoCriar}
            />
          )}
        </>
      )}
    </EscreverContexto.Provider>
  )
}
