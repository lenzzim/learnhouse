'use client'

/**
 * "Minha agenda Discipulei": assinatura pessoal (feed ICS com link secreto,
 * só com os eventos em que a pessoa tocou "Vou") e lembretes por e-mail.
 *
 * O servidor guarda só o hash do token: o link aparece uma vez, logo depois de
 * gerar. Depois disso, "Gerar novo link" troca o token (o antigo para de
 * funcionar) e "Desligar" apaga a assinatura.
 */

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CalendarCheck, Copy, GoogleLogo, Link as LinkIcon } from '@phosphor-icons/react'
import {
  desligarFeed,
  gerarFeed,
  obterPreferencias,
  salvarPreferencias,
  urlAssinarGoogle,
  urlFeed,
  type PreferenciasAgenda,
} from '@services/communities/batepapos'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, FOCO, SERIF } from '@components/Discipulei/Navegacao/estilos'
import { CHAVES_BATEPAPO } from './comum'

export function MinhaAgenda({ orgId, token }: { orgId: number; token?: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const chave = CHAVES_BATEPAPO.preferencias(orgId)
  const [link, setLink] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const prefs = useQuery<PreferenciasAgenda>({
    queryKey: chave,
    queryFn: () => obterPreferencias(orgId, token),
    enabled: !!token,
    staleTime: 60_000,
  })

  const gerar = async () => {
    setOcupado(true)
    try {
      const r = await gerarFeed(orgId, token)
      setLink(urlFeed(r.path))
      queryClient.invalidateQueries({ queryKey: chave })
    } catch {
      toast.error(t('batepapos.erro'))
    } finally {
      setOcupado(false)
    }
  }

  const desligar = async () => {
    setOcupado(true)
    try {
      const r = await desligarFeed(orgId, token)
      setLink(null)
      queryClient.setQueryData(chave, r)
      toast.success(t('agenda.minha.desligada'))
    } catch {
      toast.error(t('batepapos.erro'))
    } finally {
      setOcupado(false)
    }
  }

  const copiar = async () => {
    if (!link) return
    try {
      await navigator.clipboard.writeText(link)
      toast.success(t('agenda.link_copiado'))
    } catch {
      toast.error(t('batepapos.erro'))
    }
  }

  const mudarEmail = async (ligado: boolean) => {
    try {
      queryClient.setQueryData(chave, await salvarPreferencias(orgId, { email_reminders: ligado }, token))
    } catch {
      toast.error(t('batepapos.erro'))
    }
  }

  const p = prefs.data
  return (
    <section aria-labelledby="minha-agenda" className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5">
      <h2 id="minha-agenda" className="flex items-center gap-2 text-lg text-[var(--text)]" style={SERIF}>
        <CalendarCheck size={20} aria-hidden="true" className="text-[var(--text-2)]" />
        {t('agenda.minha.titulo')}
      </h2>
      <p className="mt-1 text-sm text-[var(--text-2)]">{t('agenda.minha.descricao')}</p>

      {link ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-xs text-[var(--text-3)]">{t('agenda.minha.secreto')}</p>
          <code className="block break-all rounded-lg bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text)]">{link}</code>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <a
              href={urlAssinarGoogle(link)}
              target="_blank"
              rel="noopener noreferrer"
              className={`${BOTAO_PRIMARIO} min-h-11 px-4 text-sm`}
            >
              <GoogleLogo size={18} aria-hidden="true" />
              {t('agenda.minha.assinar_google')}
            </a>
            <a href={link.replace(/^https?:\/\//, 'webcal://')} className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm`}>
              <LinkIcon size={18} aria-hidden="true" />
              {t('agenda.minha.assinar_apple')}
            </a>
            <button type="button" onClick={copiar} className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm`}>
              <Copy size={18} aria-hidden="true" />
              {t('agenda.minha.copiar')}
            </button>
          </div>
        </div>
      ) : p?.feed_active ? (
        <div className="mt-4 flex flex-col gap-2">
          <p className="text-sm text-[var(--text-2)]">{t('agenda.minha.ativa')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={ocupado} onClick={gerar} className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm disabled:opacity-60`}>
              {t('agenda.minha.gerar_novo')}
            </button>
            <button type="button" disabled={ocupado} onClick={desligar} className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm disabled:opacity-60`}>
              {t('agenda.minha.desligar')}
            </button>
          </div>
          <p className="text-xs text-[var(--text-3)]">{t('agenda.minha.gerar_novo_dica')}</p>
        </div>
      ) : (
        <div className="mt-4">
          <button type="button" disabled={ocupado || !p} onClick={gerar} className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm disabled:opacity-60`}>
            <LinkIcon size={18} aria-hidden="true" />
            {t('agenda.minha.gerar')}
          </button>
        </div>
      )}

      {p?.email_available && (
        <label className="mt-5 flex min-h-11 cursor-pointer items-center gap-3 border-t border-[var(--line)] pt-4 text-sm text-[var(--text)]">
          <input
            type="checkbox"
            className={`h-5 w-5 accent-[var(--text)] ${FOCO}`}
            checked={p.email_reminders}
            onChange={(e) => void mudarEmail(e.target.checked)}
          />
          <span>
            {t('agenda.minha.email')}
            <span className="block text-xs text-[var(--text-3)]">{t('agenda.minha.email_dica')}</span>
          </span>
        </label>
      )}
      {!p?.email_available && p && <p className="mt-4 text-xs text-[var(--text-3)]">{t('agenda.minha.lembretes_app')}</p>}
    </section>
  )
}

export default MinhaAgenda
