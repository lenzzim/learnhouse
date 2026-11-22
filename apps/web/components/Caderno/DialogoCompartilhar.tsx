'use client'

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { Check, Copy, Globe, LinkSimple, Warning } from '@phosphor-icons/react'
import { FolhaInferior } from '@components/Discipulei/Navegacao/FolhaInferior'
import { useDadosNav } from '@components/Discipulei/Navegacao/useDadosNav'
import { caminhoDiscussao } from '@components/Discipulei/Navegacao/estilos'
import { getUriWithOrg } from '@services/config/config'
import {
  criarLink,
  listarLinks,
  publicarNaComunidade,
  revogarLink,
  type EscopoLink,
  type Nota,
} from '@services/caderno/notas'
import { useCaderno, CHAVES_CADERNO } from './CadernoContexto'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, FOCO } from './estilos'

function urlCompartilhada(token: string) {
  return `${window.location.origin}/n/${token}`
}

/**
 * Compartilhar uma nota: link privado (revogável na hora) ou uma cópia
 * publicada numa comunidade. Tudo começa privado; aqui a pessoa decide.
 */
export function DialogoCompartilhar({
  nota,
  aberto,
  aoMudar,
  aoAtualizar,
}: {
  nota: Nota
  aberto: boolean
  aoMudar: (v: boolean) => void
  aoAtualizar: () => void
}) {
  const { t } = useTranslation()
  const c = useCaderno()
  const { comunidades } = useDadosNav()
  const [escopo, setEscopo] = useState<EscopoLink>('anyone_with_link')
  const [novoLink, setNovoLink] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  const [comunidade, setComunidade] = useState('')
  const [confirmou, setConfirmou] = useState(false)
  const [publicada, setPublicada] = useState<{ discussion_uuid: string; community_uuid: string } | null>(null)

  const links = useQuery({
    queryKey: CHAVES_CADERNO.links(nota.note_uuid),
    queryFn: () => listarLinks(nota.note_uuid, c.token),
    enabled: aberto && !!c.token,
  })

  const criar = async () => {
    setOcupado(true)
    try {
      const r = await criarLink(nota.note_uuid, escopo, c.token)
      setNovoLink(urlCompartilhada(r.token))
      setCopiado(false)
      links.refetch()
      aoAtualizar()
    } catch {
      toast.error(t('caderno.erro_link'))
    } finally {
      setOcupado(false)
    }
  }

  const copiar = async () => {
    if (!novoLink) return
    try {
      await navigator.clipboard.writeText(novoLink)
      setCopiado(true)
    } catch {
      toast.error(t('caderno.erro_copiar'))
    }
  }

  const revogar = async (shareUuid: string) => {
    try {
      await revogarLink(nota.note_uuid, shareUuid, c.token)
      setNovoLink(null)
      links.refetch()
      aoAtualizar()
      toast.success(t('caderno.link_revogado'))
    } catch {
      toast.error(t('caderno.erro_link'))
    }
  }

  const publicar = async () => {
    if (!comunidade || !confirmou) return
    setOcupado(true)
    try {
      const r = await publicarNaComunidade(nota.note_uuid, comunidade, c.token)
      setPublicada(r)
      aoAtualizar()
      toast.success(t('caderno.publicada'))
    } catch (e: any) {
      toast.error(typeof e?.message === 'string' && e.status !== 500 ? e.message : t('caderno.erro_publicar'))
    } finally {
      setOcupado(false)
    }
  }

  const nomeComunidade = comunidades.find((x) => x.community_uuid === comunidade)?.name ?? ''
  const ativos = links.data ?? []

  return (
    <FolhaInferior
      aberta={aberto}
      aoMudar={(v) => {
        aoMudar(v)
        if (!v) {
          setNovoLink(null)
          setPublicada(null)
          setConfirmou(false)
        }
      }}
      titulo={t('caderno.compartilhar')}
      descricao={t('caderno.compartilhar_descricao')}
      larguraDesktop="md"
    >
      <section aria-labelledby="comp-link" className="flex flex-col gap-3">
        <h3 id="comp-link" className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
          <LinkSimple size={18} aria-hidden="true" />
          {t('caderno.link_privado')}
        </h3>
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">{t('caderno.quem_abre')}</legend>
          {(['anyone_with_link', 'members'] as EscopoLink[]).map((e) => (
            <label
              key={e}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border px-3.5 py-3 transition-colors ${
                escopo === e ? 'border-[var(--text-2)] bg-[var(--surface)]' : 'border-[var(--line)] hover:border-[var(--line-strong)]'
              }`}
            >
              <input
                type="radio"
                name="escopo"
                value={e}
                checked={escopo === e}
                onChange={() => setEscopo(e)}
                className="mt-1 accent-[var(--text)]"
              />
              <span>
                <span className="block text-sm font-medium text-[var(--text)]">{t(`caderno.escopo_${e}`)}</span>
                <span className="block text-xs leading-snug text-[var(--text-2)]">{t(`caderno.escopo_${e}_dica`)}</span>
              </span>
            </label>
          ))}
        </fieldset>
        <button type="button" onClick={criar} disabled={ocupado} className={`${BOTAO_SECUNDARIO} min-h-11 text-sm disabled:opacity-60`}>
          {t('caderno.criar_link')}
        </button>

        {novoLink && (
          <div className="flex flex-col gap-2 rounded-xl border border-[var(--line-strong)] p-3">
            <div className="flex gap-2">
              <input readOnly value={novoLink} aria-label={t('caderno.link_criado')} className={`${CAMPO} h-10 font-mono text-xs`} onFocus={(e) => e.target.select()} />
              <button type="button" onClick={copiar} className={`${BOTAO_PRIMARIO} min-h-10 shrink-0 px-3 text-sm`}>
                {copiado ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}
                {copiado ? t('caderno.copiado') : t('caderno.copiar')}
              </button>
            </div>
            <p className="text-xs leading-snug text-[var(--text-2)]">{t('caderno.link_so_agora')}</p>
          </div>
        )}

        {ativos.length > 0 && (
          <ul className="flex flex-col gap-1.5" aria-label={t('caderno.links_ativos')}>
            {ativos.map((l) => (
              <li key={l.share_uuid} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 text-[var(--text-2)]">
                  {t(`caderno.escopo_${l.scope}`)} ·{' '}
                  {new Date(l.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                </span>
                <button type="button" onClick={() => revogar(l.share_uuid)} className={`min-h-9 rounded-md px-2.5 text-sm font-medium text-[var(--text)] underline decoration-[var(--link-underline)] underline-offset-2 hover:bg-[var(--surface)] ${FOCO}`}>
                  {t('caderno.revogar')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="my-5 h-px bg-[var(--line)]" role="separator" />

      <section aria-labelledby="comp-pub" className="flex flex-col gap-3">
        <h3 id="comp-pub" className="flex items-center gap-2 text-base font-semibold text-[var(--text)]">
          <Globe size={18} aria-hidden="true" />
          {t('caderno.publicar_comunidade')}
        </h3>
        {publicada ? (
          <p className="text-sm text-[var(--text)]">
            {t('caderno.publicada_em', { comunidade: nomeComunidade })}{' '}
            <a
              href={getUriWithOrg(c.orgslug, caminhoDiscussao(publicada.community_uuid, publicada.discussion_uuid))}
              className="font-medium underline decoration-[var(--link-underline)] underline-offset-2"
            >
              {t('caderno.ver_publicacao')}
            </a>
          </p>
        ) : (
          <>
            <label htmlFor="comp-comunidade" className="text-sm text-[var(--text-2)]">{t('caderno.escolha_comunidade')}</label>
            <select id="comp-comunidade" value={comunidade} onChange={(e) => { setComunidade(e.target.value); setConfirmou(false) }} className={`${CAMPO} h-11`}>
              <option value="">{t('caderno.escolha')}</option>
              {comunidades.map((x) => (
                <option key={x.community_uuid} value={x.community_uuid}>{x.name}</option>
              ))}
            </select>
            {comunidade && (
              <div role="note" className="flex gap-3 rounded-xl border border-[var(--line-strong)] bg-[var(--surface)] p-3.5">
                <Warning size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--text)]" />
                <div className="flex flex-col gap-2">
                  <p className="text-sm leading-snug text-[var(--text)]">{t('caderno.aviso_publicar', { comunidade: nomeComunidade })}</p>
                  <label className="flex items-center gap-2 text-sm text-[var(--text)]">
                    <input type="checkbox" checked={confirmou} onChange={(e) => setConfirmou(e.target.checked)} className="h-4 w-4 accent-[var(--text)]" />
                    {t('caderno.entendi_publicar')}
                  </label>
                </div>
              </div>
            )}
            <button type="button" onClick={publicar} disabled={!comunidade || !confirmou || ocupado} className={`${BOTAO_PRIMARIO} min-h-11 text-sm disabled:cursor-not-allowed disabled:opacity-50`}>
              {t('caderno.publicar_copia')}
            </button>
            {nota.published_discussion_uuid && nota.published_community_uuid && (
              <p className="text-xs text-[var(--text-2)]">
                {t('caderno.ja_publicada')}{' '}
                <a
                  href={getUriWithOrg(c.orgslug, caminhoDiscussao(nota.published_community_uuid, nota.published_discussion_uuid))}
                  className="underline decoration-[var(--link-underline)] underline-offset-2"
                >
                  {t('caderno.ver_publicacao')}
                </a>
              </p>
            )}
          </>
        )}
      </section>
    </FolhaInferior>
  )
}

export default DialogoCompartilhar
