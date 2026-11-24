'use client'

/**
 * Regras do espaço (v5, N44/N45), no painel do admin:
 *
 * - Quem pode publicar: todos os membros ou só um grupo de usuários (ex.: o
 *   grupo de autores do "Blog do Discipulei"). Admins e mantenedores sempre
 *   publicam. O servidor aplica (403) e esconde o "Novo post".
 * - Permitir comentários (liga/desliga).
 * - Não compartilhável: posts deste espaço nunca geram link público (use em
 *   "Pedidos de oração"). Espaços restritos, desafios e áreas fechadas por
 *   grupo já nunca são compartilháveis.
 *
 * Grava no `moderation_settings` da comunidade (o PUT que já existe), mandando
 * o objeto completo para não perder as regras de moderação.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Loader2, PenLine, MessageSquare, Share2 } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { useCommunity, useCommunityDispatch } from '@components/Contexts/CommunityContext'
import { updateCommunity } from '@services/communities/communities'
import { getUserGroups } from '@services/usergroups/usergroups'
import type { RegrasEspaco } from '@services/communities/membros'
import { revalidateTags } from '@services/utils/ts/requests'
import { queryKeys } from '@/lib/query/keys'
import { Button } from '@components/ui/button'
import { Label } from '@components/ui/label'
import { Switch } from '@components/ui/switch'

type Regras = Required<Pick<RegrasEspaco, 'post_policy' | 'comments_disabled' | 'not_shareable'>> & {
  post_usergroup_uuid: string
}

function lerRegras(stored: Record<string, any> | null | undefined): Regras {
  return {
    post_policy: stored?.post_policy === 'group' ? 'group' : 'all',
    post_usergroup_uuid: stored?.post_usergroup_uuid || '',
    comments_disabled: !!stored?.comments_disabled,
    not_shareable: !!stored?.not_shareable,
  }
}

const P = 'dashboard.courses.communities.regras_espaco'

export default function CommunityEditRegras() {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const accessToken = session?.data?.tokens?.access_token
  const org = useOrg() as any
  const communityState = useCommunity()
  const dispatch = useCommunityDispatch()
  const community = communityState?.community
  const queryClient = useQueryClient()

  const original = useMemo(() => lerRegras(community?.moderation_settings as any), [community])
  const [regras, setRegras] = useState<Regras>(original)
  const [salvando, setSalvando] = useState(false)
  useEffect(() => setRegras(original), [original])

  const { data: grupos, isLoading: carregandoGrupos } = useQuery({
    queryKey: queryKeys.usergroups.list(org?.id),
    queryFn: () => getUserGroups(org.id, accessToken),
    select: (res: any) => {
      const lista = res?.data ?? res
      return Array.isArray(lista) ? (lista as { usergroup_uuid: string; name: string }[]) : []
    },
    enabled: !!org?.id && !!accessToken,
    staleTime: 60_000,
  })

  if (!community) return null

  const mudou =
    regras.post_policy !== original.post_policy ||
    regras.post_usergroup_uuid !== original.post_usergroup_uuid ||
    regras.comments_disabled !== original.comments_disabled ||
    regras.not_shareable !== original.not_shareable
  const faltaGrupo = regras.post_policy === 'group' && !regras.post_usergroup_uuid

  const salvar = async () => {
    if (faltaGrupo) {
      toast.error(t(`${P}.falta_grupo`))
      return
    }
    setSalvando(true)
    const novo = {
      ...((community.moderation_settings as Record<string, any>) || {}),
      post_policy: regras.post_policy,
      post_usergroup_uuid: regras.post_policy === 'group' ? regras.post_usergroup_uuid : null,
      comments_disabled: regras.comments_disabled,
      not_shareable: regras.not_shareable,
    }
    try {
      await updateCommunity(community.community_uuid, { moderation_settings: novo } as any, accessToken)
      await revalidateTags(['communities'], org.slug)
      queryClient.invalidateQueries({ queryKey: queryKeys.community.list(org.id) })
      queryClient.invalidateQueries({ queryKey: queryKeys.community.detail(community.community_uuid) })
      queryClient.invalidateQueries({ queryKey: queryKeys.community.rights(community.community_uuid) })
      dispatch?.({ type: 'setCommunity', payload: { ...community, moderation_settings: novo } })
      toast.success(t(`${P}.salvo`))
    } catch (err: any) {
      toast.error((typeof err?.detail === 'string' && err.detail) || t(`${P}.erro`))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="mx-4 sm:mx-10 mb-10 space-y-6">
      <section className="rounded-xl bg-white nice-shadow p-5 sm:p-6">
        <div className="flex items-center gap-2 mb-1">
          <PenLine size={16} className="text-gray-600" aria-hidden="true" />
          <h2 className="font-semibold text-gray-900">{t(`${P}.publicar_titulo`)}</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">{t(`${P}.publicar_descricao`)}</p>
        <fieldset className="space-y-2">
          <legend className="sr-only">{t(`${P}.publicar_titulo`)}</legend>
          {(['all', 'group'] as const).map((valor) => (
            <label key={valor} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg border border-gray-200 px-3 py-2">
              <input
                type="radio"
                name="post_policy"
                value={valor}
                checked={regras.post_policy === valor}
                onChange={() => setRegras((r) => ({ ...r, post_policy: valor }))}
                className="h-4 w-4 accent-gray-900"
              />
              <span className="text-sm text-gray-800">{t(`${P}.politica_${valor}`)}</span>
            </label>
          ))}
        </fieldset>
        {regras.post_policy === 'group' && (
          <div className="mt-4">
            <Label htmlFor="regras-grupo" className="block text-sm font-medium text-gray-700 mb-2">
              {t(`${P}.grupo_rotulo`)}
            </Label>
            <select
              id="regras-grupo"
              value={regras.post_usergroup_uuid}
              onChange={(e) => setRegras((r) => ({ ...r, post_usergroup_uuid: e.target.value }))}
              className="min-h-11 w-full max-w-md rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-800"
              disabled={carregandoGrupos}
            >
              <option value="">{t(`${P}.grupo_escolher`)}</option>
              {(grupos || []).map((g) => (
                <option key={g.usergroup_uuid} value={g.usergroup_uuid}>
                  {g.name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-xs text-gray-500">{t(`${P}.grupo_ajuda`)}</p>
          </div>
        )}
      </section>

      <section className="rounded-xl bg-white nice-shadow p-5 sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <MessageSquare size={18} className="mt-0.5 text-gray-500" aria-hidden="true" />
            <div>
              <Label htmlFor="regras-comentarios" className="text-sm font-medium text-gray-900">
                {t(`${P}.comentarios_rotulo`)}
              </Label>
              <p className="text-sm text-gray-500">{t(`${P}.comentarios_descricao`)}</p>
            </div>
          </div>
          <Switch
            id="regras-comentarios"
            checked={!regras.comments_disabled}
            onCheckedChange={(v: boolean) => setRegras((r) => ({ ...r, comments_disabled: !v }))}
          />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <Share2 size={18} className="mt-0.5 text-gray-500" aria-hidden="true" />
            <div>
              <Label htmlFor="regras-compartilhavel" className="text-sm font-medium text-gray-900">
                {t(`${P}.nao_compartilhavel_rotulo`)}
              </Label>
              <p className="text-sm text-gray-500">{t(`${P}.nao_compartilhavel_descricao`)}</p>
            </div>
          </div>
          <Switch
            id="regras-compartilhavel"
            checked={regras.not_shareable}
            onCheckedChange={(v: boolean) => setRegras((r) => ({ ...r, not_shareable: v }))}
          />
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          type="button"
          onClick={salvar}
          disabled={!mudou || salvando}
          className="min-h-11 bg-gray-900 hover:bg-gray-800"
        >
          {salvando && <Loader2 size={16} className="me-2 animate-spin" aria-hidden="true" />}
          {t(`${P}.salvar`)}
        </Button>
      </div>
    </div>
  )
}
