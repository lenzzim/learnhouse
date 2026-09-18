'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import AuthenticatedClientElement from '@components/Security/AuthenticatedClientElement'
import TypeOfContentTitle from '@components/Objects/StyledElements/Titles/TypeOfContentTitle'
import GeneralWrapperStyled from '@components/Objects/StyledElements/Wrappers/GeneralWrapper'
import CommunityCard from '@components/Objects/Communities/CommunityCard'
import { CreateCommunityModal } from '@components/Objects/Modals/Communities/CreateCommunityModal'
import { EditCommunityModal } from '@components/Objects/Modals/Communities/EditCommunityModal'
import ContentPlaceHolderIfUserIsNotAdmin from '@components/Objects/ContentPlaceHolder'
import { Users, Plus, Search, LayoutGrid, List, Globe, Lock, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { Community } from '@services/communities/communities'
import { getUriWithOrg } from '@services/config/config'
import FeatureGate from '@components/Dashboard/Shared/FeatureGate/FeatureGate'
import { useTrackView, AnalyticsEvent } from '@services/analytics'

interface CommunitiesClientProps {
  communities: Community[]
  orgslug: string
  org_id: number
}

type Visualizacao = 'grade' | 'lista'
type Ordem = 'recentes' | 'nome'

const CHAVE_VISUALIZACAO = 'lh_communities_view'

const semPrefixo = (uuid: string) => uuid.replace('community_', '')

const CommunitiesClient = ({ communities, orgslug, org_id }: CommunitiesClientProps) => {
  const { t } = useTranslation()
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [editingCommunity, setEditingCommunity] = useState<Community | null>(null)
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState<Ordem>('recentes')
  // Grade é o padrão do upstream; a escolha do visitante fica no navegador.
  const [visualizacao, setVisualizacao] = useState<Visualizacao>('grade')

  useEffect(() => {
    try {
      const guardada = localStorage.getItem(CHAVE_VISUALIZACAO)
      if (guardada === 'grade' || guardada === 'lista') setVisualizacao(guardada)
    } catch { /* modo privado */ }
  }, [])

  const trocarVisualizacao = (nova: Visualizacao) => {
    setVisualizacao(nova)
    try { localStorage.setItem(CHAVE_VISUALIZACAO, nova) } catch { /* modo privado */ }
  }

  useTrackView(AnalyticsEvent.CommunitiesListViewed, {
    communities_count: communities.length,
  })

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    const filtradas = termo
      ? communities.filter((c) =>
          c.name.toLowerCase().includes(termo) ||
          (c.description || '').toLowerCase().includes(termo))
      : communities
    const ordenadas = [...filtradas]
    ordenadas.sort((a, b) => ordem === 'nome'
      ? a.name.localeCompare(b.name)
      : new Date(b.creation_date).getTime() - new Date(a.creation_date).getTime())
    return ordenadas
  }, [communities, busca, ordem])

  const botaoNova = (
    <AuthenticatedClientElement
      ressourceType="communities"
      action="create"
      checkMethod="roles"
      orgId={org_id}
    >
      <button
        onClick={() => setIsCreateModalOpen(true)}
        className="flex items-center gap-2 px-4 py-2 bg-black hover:bg-black/90 text-white rounded-lg transition-colors text-sm font-medium"
      >
        <Plus size={16} />
        {t('communities.new_community')}
      </button>
    </AuthenticatedClientElement>
  )

  return (
    <FeatureGate feature="communities" orgslug={orgslug} context="public">
    <GeneralWrapperStyled>
      <div className="flex flex-col space-y-2 mb-6">
        <div className="flex items-center justify-between">
          <TypeOfContentTitle title={t('communities.title')} type="col" />
          {botaoNova}
        </div>

        {/* Busca, ordenação e alternância de visualização.
            A grade de miniaturas ocupa uma tela inteira por punhado de
            comunidades; a lista mostra muito mais de uma vez. Tudo acontece no
            navegador: a página já recebe as comunidades do servidor. */}
        {communities.length > 0 && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 pb-2">
            <div className="relative flex-1">
              <Search size={15} className="absolute start-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="search"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder={t('communities.search_placeholder', 'Pesquisar comunidades...')}
                aria-label={t('communities.search_placeholder', 'Pesquisar comunidades...')}
                className="w-full bg-white border border-gray-200 rounded-lg ps-9 pe-3 py-2 text-sm outline-none focus:border-gray-400"
              />
            </div>

            <select
              value={ordem}
              onChange={(e) => setOrdem(e.target.value as Ordem)}
              aria-label={t('communities.sort_label', 'Ordenar por')}
              className="bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm outline-none focus:border-gray-400"
            >
              <option value="recentes">{t('communities.sort_recent', 'Mais recentes')}</option>
              <option value="nome">{t('communities.sort_name', 'Nome (A–Z)')}</option>
            </select>

            <div className="flex items-center bg-white border border-gray-200 rounded-lg p-0.5 self-start">
              <button
                type="button"
                onClick={() => trocarVisualizacao('lista')}
                aria-pressed={visualizacao === 'lista'}
                aria-label={t('communities.view_list', 'Ver em lista')}
                title={t('communities.view_list', 'Ver em lista')}
                className={`p-1.5 rounded-md transition-colors ${visualizacao === 'lista' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}`}
              >
                <List size={16} />
              </button>
              <button
                type="button"
                onClick={() => trocarVisualizacao('grade')}
                aria-pressed={visualizacao === 'grade'}
                aria-label={t('communities.view_grid', 'Ver em grade')}
                title={t('communities.view_grid', 'Ver em grade')}
                className={`p-1.5 rounded-md transition-colors ${visualizacao === 'grade' ? 'bg-gray-100 text-gray-900' : 'text-gray-400 hover:text-gray-700'}`}
              >
                <LayoutGrid size={16} />
              </button>
            </div>
          </div>
        )}

        {visualizacao === 'lista' && visiveis.length > 0 && (
          <div className="bg-white rounded-xl nice-shadow overflow-hidden">
            {visiveis.map((community: Community) => (
              <Link
                key={community.community_uuid}
                href={getUriWithOrg(orgslug, `/community/${semPrefixo(community.community_uuid)}`)}
                className="flex items-center gap-4 px-4 py-3 border-b border-gray-100 last:border-b-0 hover:bg-gray-50 transition-colors"
              >
                <span className="shrink-0 text-gray-400">
                  {community.public ? <Globe size={16} /> : <Lock size={16} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-900 truncate">{community.name}</span>
                  {community.description && (
                    <span className="block text-xs text-gray-500 truncate">{community.description}</span>
                  )}
                </span>
                <ChevronRight size={16} className="shrink-0 text-gray-300" />
              </Link>
            ))}
          </div>
        )}

        {visualizacao === 'grade' && visiveis.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {visiveis.map((community: Community) => (
              <div key={community.community_uuid}>
                <CommunityCard
                  community={community}
                  orgslug={orgslug}
                  org_id={org_id}
                  variant="public"
                />
              </div>
            ))}
          </div>
        )}

        {/* Busca sem resultado: a organização tem comunidades, o filtro é que não achou. */}
        {communities.length > 0 && visiveis.length === 0 && (
          <div className="flex flex-col justify-center items-center py-10 px-4 border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/30">
            <p className="text-md text-gray-500">
              {t('communities.no_results', 'Nenhuma comunidade encontrada para esta busca.')}
            </p>
          </div>
        )}

        {communities.length === 0 && (
          <div className="flex flex-col justify-center items-center py-12 px-4 border-2 border-dashed border-gray-100 rounded-2xl bg-gray-50/30">
            <div className="p-4 bg-white rounded-full nice-shadow mb-4">
              <Users className="w-8 h-8 text-gray-300" strokeWidth={1.5} />
            </div>
            <h1 className="text-xl font-bold text-gray-600 mb-2">
              {t('communities.no_communities')}
            </h1>
            <p className="text-md text-gray-400 mb-6 text-center max-w-xs">
              <ContentPlaceHolderIfUserIsNotAdmin
                text={t('communities.no_communities_description')}
              />
            </p>
            <div className="flex justify-center">{botaoNova}</div>
          </div>
        )}
      </div>

      <CreateCommunityModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        orgId={org_id}
        orgSlug={orgslug}
      />

      {editingCommunity && (
        <EditCommunityModal
          isOpen={!!editingCommunity}
          onClose={() => setEditingCommunity(null)}
          community={editingCommunity}
          orgSlug={orgslug}
        />
      )}
    </GeneralWrapperStyled>
    </FeatureGate>
  )
}

export default CommunitiesClient
