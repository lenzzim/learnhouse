'use client'

/**
 * Painel do admin: configurações da comunidade para a org inteira (v5).
 *
 * - **Grupo de autores** (N45): publica nos espaços com "quem pode publicar =
 *   grupo" (ex.: Blog) e cria bate-papos. Admins e mantenedores sempre podem.
 * - **Grupos Homens e Mulheres** (N31/N42): usados só para *sugerir* ao admin
 *   em que grupo cada pessoa deveria entrar; ninguém é adicionado
 *   automaticamente — a entrada continua aprovada por um líder.
 * - **Links do WhatsApp**: vazio = padrão (variável de ambiente ou o link fixo).
 * - **Escolhas**: quem escolheu qual grupo (visível só aqui, para admins).
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Settings2 } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUserGroups } from '@services/usergroups/usergroups'
import {
  listarEscolhasWhatsapp,
  obterConfigOrgAdmin,
  salvarConfigOrgAdmin,
  type ConfigOrgAdmin,
  type EscolhaWhatsappAdmin,
} from '@services/communities/membros'

const CAMPO =
  'w-full min-h-11 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none focus-visible:ring-2 focus-visible:ring-black'
const ROTULO = 'block text-sm font-semibold text-gray-800'
const AJUDA = 'mt-1 text-xs text-gray-500'

interface Grupo {
  id: number
  usergroup_uuid: string
  name: string
}

export default function ComunidadeConfigOrg({ orgId }: { orgId: number }) {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const token: string | undefined = session?.data?.tokens?.access_token
  const queryClient = useQueryClient()
  const chave = ['discipulei', 'admin', 'config-org', orgId]

  const config = useQuery<ConfigOrgAdmin>({
    queryKey: chave,
    queryFn: () => obterConfigOrgAdmin(orgId, token),
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

  const [pagina, setPagina] = useState(1)
  const escolhas = useQuery<EscolhaWhatsappAdmin[]>({
    queryKey: ['discipulei', 'admin', 'whatsapp', orgId, pagina],
    queryFn: () => listarEscolhasWhatsapp(orgId, pagina, token),
    enabled: !!orgId && !!token,
  })

  const [autores, setAutores] = useState('')
  const [homens, setHomens] = useState('')
  const [mulheres, setMulheres] = useState('')
  const [linkHomens, setLinkHomens] = useState('')
  const [linkMulheres, setLinkMulheres] = useState('')
  const [salvando, setSalvando] = useState(false)

  useEffect(() => {
    const c = config.data
    if (!c) return
    setAutores(c.authors_usergroup?.usergroup_uuid ?? '')
    setHomens(c.men_usergroup?.usergroup_uuid ?? '')
    setMulheres(c.women_usergroup?.usergroup_uuid ?? '')
    setLinkHomens(c.whatsapp_men_url ?? '')
    setLinkMulheres(c.whatsapp_women_url ?? '')
  }, [config.data])

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setSalvando(true)
    try {
      const novo = await salvarConfigOrgAdmin(
        orgId,
        {
          authors_usergroup_uuid: autores,
          men_usergroup_uuid: homens,
          women_usergroup_uuid: mulheres,
          whatsapp_men_url: linkHomens.trim(),
          whatsapp_women_url: linkMulheres.trim(),
        },
        token
      )
      queryClient.setQueryData(chave, novo)
      queryClient.invalidateQueries({ queryKey: ['discipulei', 'admin', 'whatsapp', orgId] })
      toast.success(t('admin_comunidade.salvo'))
    } catch (err: any) {
      toast.error((typeof err?.detail === 'string' && err.detail) || t('admin_comunidade.erro'))
    } finally {
      setSalvando(false)
    }
  }

  const listaGrupos = grupos.data ?? []
  const seletor = (id: string, valor: string, mudar: (v: string) => void) => (
    <select id={id} value={valor} onChange={(e) => mudar(e.target.value)} className={CAMPO}>
      <option value="">{t('admin_comunidade.nenhum_grupo')}</option>
      {listaGrupos.map((g) => (
        <option key={g.usergroup_uuid} value={g.usergroup_uuid}>
          {g.name}
        </option>
      ))}
    </select>
  )

  const nomePessoa = (p: EscolhaWhatsappAdmin) => `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.username

  return (
    <section className="mb-8 rounded-xl border border-gray-200 bg-white p-5 nice-shadow" aria-labelledby="config-comunidade">
      <div className="flex items-center gap-2">
        <Settings2 size={18} aria-hidden="true" className="text-gray-500" />
        <h2 id="config-comunidade" className="text-lg font-bold text-gray-900">
          {t('admin_comunidade.titulo')}
        </h2>
      </div>
      <p className="mt-1 text-sm text-gray-500">{t('admin_comunidade.descricao')}</p>

      {config.isLoading ? (
        <div className="mt-4 h-40 animate-pulse rounded-lg bg-gray-100" aria-hidden="true" />
      ) : config.isError ? (
        <p className="mt-4 text-sm text-gray-600">{t('admin_comunidade.erro_carregar')}</p>
      ) : (
        <form onSubmit={salvar} className="mt-5 grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <label htmlFor="cfg-autores" className={ROTULO}>
              {t('admin_comunidade.grupo_autores')}
            </label>
            {seletor('cfg-autores', autores, setAutores)}
            <p className={AJUDA}>{t('admin_comunidade.grupo_autores_ajuda')}</p>
          </div>

          <div>
            <label htmlFor="cfg-homens" className={ROTULO}>
              {t('admin_comunidade.grupo_homens')}
            </label>
            {seletor('cfg-homens', homens, setHomens)}
          </div>
          <div>
            <label htmlFor="cfg-mulheres" className={ROTULO}>
              {t('admin_comunidade.grupo_mulheres')}
            </label>
            {seletor('cfg-mulheres', mulheres, setMulheres)}
          </div>
          <p className={`${AJUDA} md:col-span-2 -mt-3`}>{t('admin_comunidade.grupos_genero_ajuda')}</p>

          <div>
            <label htmlFor="cfg-link-homens" className={ROTULO}>
              {t('admin_comunidade.link_homens')}
            </label>
            <input
              id="cfg-link-homens"
              type="url"
              inputMode="url"
              value={linkHomens}
              onChange={(e) => setLinkHomens(e.target.value)}
              placeholder={config.data?.default_whatsapp_men_url}
              className={CAMPO}
            />
            <p className={`${AJUDA} break-all`}>
              {t('admin_comunidade.link_padrao', { url: config.data?.default_whatsapp_men_url ?? '' })}
            </p>
          </div>
          <div>
            <label htmlFor="cfg-link-mulheres" className={ROTULO}>
              {t('admin_comunidade.link_mulheres')}
            </label>
            <input
              id="cfg-link-mulheres"
              type="url"
              inputMode="url"
              value={linkMulheres}
              onChange={(e) => setLinkMulheres(e.target.value)}
              placeholder={config.data?.default_whatsapp_women_url}
              className={CAMPO}
            />
            <p className={`${AJUDA} break-all`}>
              {t('admin_comunidade.link_padrao', { url: config.data?.default_whatsapp_women_url ?? '' })}
            </p>
          </div>

          <div className="md:col-span-2">
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

      <div className="mt-8 border-t border-gray-100 pt-5">
        <h3 className="text-base font-bold text-gray-900">{t('admin_comunidade.escolhas_titulo')}</h3>
        <p className="mt-1 text-xs text-gray-500">{t('admin_comunidade.escolhas_ajuda')}</p>
        {escolhas.isLoading ? (
          <div className="mt-3 h-20 animate-pulse rounded-lg bg-gray-100" aria-hidden="true" />
        ) : (escolhas.data?.length ?? 0) === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            {pagina > 1 ? t('admin_comunidade.escolhas_fim') : t('admin_comunidade.escolhas_vazio')}
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-gray-100 rounded-lg border border-gray-100">
            {escolhas.data!.map((p) => (
              <li key={p.user_uuid} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate font-medium text-gray-900">
                  {nomePessoa(p)} <span className="font-normal text-gray-500">@{p.username}</span>
                </span>
                <span className="text-gray-700">
                  {p.whatsapp_group === 'homens' ? t('admin_comunidade.escolheu_homens') : t('admin_comunidade.escolheu_mulheres')}
                </span>
                <span className="w-full text-xs text-gray-500 sm:w-auto">
                  {!p.suggested_usergroup
                    ? t('admin_comunidade.sem_grupo_configurado')
                    : p.in_suggested_group
                      ? t('admin_comunidade.ja_no_grupo', { grupo: p.suggested_usergroup.name })
                      : t('admin_comunidade.sugerido', { grupo: p.suggested_usergroup.name })}
                </span>
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {pagina > 1 && (
            <button
              type="button"
              onClick={() => setPagina((n) => Math.max(1, n - 1))}
              className="min-h-11 rounded-lg border border-gray-200 px-4 text-sm"
            >
              {t('admin_comunidade.anterior')}
            </button>
          )}
          {(escolhas.data?.length ?? 0) >= 50 && (
            <button
              type="button"
              onClick={() => setPagina((n) => n + 1)}
              className="min-h-11 rounded-lg border border-gray-200 px-4 text-sm"
            >
              {t('admin_comunidade.proxima')}
            </button>
          )}
          <Link
            href="/dash/users/settings/usergroups"
            className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-gray-900 underline underline-offset-2"
          >
            {t('admin_comunidade.abrir_grupos')}
          </Link>
        </div>
      </div>
    </section>
  )
}
