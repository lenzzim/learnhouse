'use client'

/**
 * Painel do admin: Agenda de eventos.
 *
 * - **Grupo de organizadores**: quem (além de admins e da Equipe/autores) cria
 *   eventos. Padrão: o grupo chamado "Discípulos", enquanto nada for salvo.
 * - **Regiões**: lista ordenada (Online primeiro por padrão). Renomear,
 *   reordenar, desativar e criar. Regiões nunca são apagadas (eventos antigos
 *   continuam apontando para elas); desativadas somem dos chips e do formulário.
 */

import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowDown, ArrowUp, CalendarDays, Plus } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUserGroups } from '@services/usergroups/usergroups'
import {
  obterConfigAgenda,
  salvarConfigAgenda,
  type ConfigAgendaAdmin,
  type RegiaoEditada,
} from '@services/communities/batepapos'

const CAMPO =
  'w-full min-h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-black'
const ROTULO = 'block text-sm font-semibold text-gray-800'
const AJUDA = 'mt-1 text-xs text-gray-500'
const BOTAO_ICONE =
  'inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-black outline-none'

interface Grupo {
  usergroup_uuid: string
  name: string
}

type Linha = RegiaoEditada & { chave: string; is_online?: boolean }

export default function AgendaConfigOrg({ orgId }: { orgId: number }) {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const queryClient = useQueryClient()
  const chave = ['discipulei', 'admin', 'agenda', orgId]

  const config = useQuery<ConfigAgendaAdmin>({
    queryKey: chave,
    queryFn: () => obterConfigAgenda(orgId, token),
    enabled: !!orgId && !!token,
  })
  const grupos = useQuery<any, Error, Grupo[]>({
    queryKey: ['discipulei', 'admin', 'usergroups', orgId],
    queryFn: () => getUserGroups(orgId, token as string),
    select: (res: any) => {
      const lista = res?.data ?? res
      return Array.isArray(lista) ? lista : []
    },
    enabled: !!orgId && !!token,
    staleTime: 60_000,
  })

  const [organizadores, setOrganizadores] = useState('')
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    const c = config.data
    if (!c) return
    setOrganizadores(c.organizers_usergroup_uuid ?? '')
    setLinhas(
      c.regions.map((r) => ({
        chave: r.region_uuid,
        region_uuid: r.region_uuid,
        name: r.name,
        active: r.active,
        is_online: r.is_online,
      }))
    )
  }, [config.data])

  const mover = (i: number, d: -1 | 1) => {
    const j = i + d
    if (j < 0 || j >= linhas.length) return
    const nova = [...linhas]
    ;[nova[i], nova[j]] = [nova[j], nova[i]]
    setLinhas(nova)
  }
  const mudar = (i: number, campo: Partial<Linha>) => setLinhas(linhas.map((l, k) => (k === i ? { ...l, ...campo } : l)))

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (linhas.some((l) => !l.name.trim())) {
      toast.error(t('admin_agenda.nome_obrigatorio'))
      return
    }
    setSalvando(true)
    try {
      const novo = await salvarConfigAgenda(
        orgId,
        {
          organizers_usergroup_uuid: organizadores,
          regions: linhas.map((l) => ({ region_uuid: l.region_uuid || null, name: l.name.trim(), active: l.active })),
        },
        token
      )
      queryClient.setQueryData(chave, novo)
      queryClient.invalidateQueries({ queryKey: ['batepapos'] })
      toast.success(t('admin_comunidade.salvo'))
    } catch (err: any) {
      toast.error((typeof err?.detail === 'string' && err.detail) || t('admin_comunidade.erro'))
    } finally {
      setSalvando(false)
    }
  }

  return (
    <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5 nice-shadow" aria-labelledby="config-agenda">
      <div className="flex items-center gap-2">
        <CalendarDays size={18} aria-hidden="true" className="text-gray-500" />
        <h2 id="config-agenda" className="text-lg font-bold text-gray-900">
          {t('admin_agenda.titulo')}
        </h2>
      </div>
      <p className="mt-1 text-sm text-gray-500">{t('admin_agenda.descricao')}</p>

      {config.isLoading ? (
        <div className="mt-4 h-40 animate-pulse rounded-lg bg-gray-100" aria-hidden="true" />
      ) : config.isError ? (
        <p className="mt-4 text-sm text-gray-600">{t('admin_comunidade.erro_carregar')}</p>
      ) : (
        <form onSubmit={salvar} className="mt-5 flex flex-col gap-6">
          <div>
            <label htmlFor="cfg-organizadores" className={ROTULO}>
              {t('admin_agenda.grupo_organizadores')}
            </label>
            <select
              id="cfg-organizadores"
              value={organizadores}
              onChange={(e) => setOrganizadores(e.target.value)}
              className={CAMPO}
            >
              <option value="">{t('admin_agenda.so_equipe')}</option>
              {(grupos.data ?? []).map((g) => (
                <option key={g.usergroup_uuid} value={g.usergroup_uuid}>
                  {g.name}
                </option>
              ))}
            </select>
            <p className={AJUDA}>{t('admin_agenda.grupo_organizadores_ajuda')}</p>
          </div>

          <fieldset>
            <legend className={ROTULO}>{t('admin_agenda.regioes')}</legend>
            <p className={AJUDA}>{t('admin_agenda.regioes_ajuda')}</p>
            <ol className="mt-3 flex flex-col gap-2">
              {linhas.map((l, i) => (
                <li key={l.chave} className="flex flex-wrap items-center gap-2">
                  <span className="w-6 text-end text-xs tabular-nums text-gray-400">{i + 1}.</span>
                  <input
                    aria-label={t('admin_agenda.nome_regiao')}
                    value={l.name}
                    maxLength={80}
                    onChange={(e) => mudar(i, { name: e.target.value })}
                    className={`${CAMPO} min-w-0 flex-1 basis-40 ${l.active ? '' : 'text-gray-400 line-through'}`}
                  />
                  {l.is_online && <span className="text-xs text-gray-500">{t('admin_agenda.online')}</span>}
                  <label className="flex min-h-11 items-center gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={l.active} onChange={(e) => mudar(i, { active: e.target.checked })} className="h-5 w-5" />
                    {t('admin_agenda.ativa')}
                  </label>
                  <button type="button" className={BOTAO_ICONE} onClick={() => mover(i, -1)} disabled={i === 0} aria-label={t('admin_agenda.subir')}>
                    <ArrowUp size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className={BOTAO_ICONE}
                    onClick={() => mover(i, 1)}
                    disabled={i === linhas.length - 1}
                    aria-label={t('admin_agenda.descer')}
                  >
                    <ArrowDown size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ol>
            <button
              type="button"
              onClick={() => setLinhas([...linhas, { chave: `nova-${Date.now()}`, region_uuid: null, name: '', active: true }])}
              className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-lg border border-gray-200 px-4 text-sm font-semibold text-gray-800 hover:bg-gray-50"
            >
              <Plus size={16} aria-hidden="true" />
              {t('admin_agenda.nova_regiao')}
            </button>
          </fieldset>

          <div>
            <button
              type="submit"
              disabled={salvando}
              className="min-h-11 rounded-lg bg-black px-5 text-sm font-bold text-white disabled:opacity-60"
            >
              {salvando ? t('admin_comunidade.salvando') : t('admin_comunidade.salvar')}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
