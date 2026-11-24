'use client'

/**
 * Conta > Geral: mudar ou apagar a escolha do grupo do WhatsApp (N42).
 * A escolha só aparece para a própria pessoa e para os admins.
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { WhatsappLogo } from '@phosphor-icons/react'
import type { GrupoWhatsapp } from '@services/communities/membros'
import { useEscolherWhatsapp, useMeuWhatsapp } from './comum'

type Opcao = GrupoWhatsapp | 'nenhum'

export function SecaoWhatsappConta() {
  const { t } = useTranslation()
  const { habilitado, dados, carregando } = useMeuWhatsapp()
  const { escolher, salvando } = useEscolherWhatsapp()

  if (!habilitado) return null

  const atual: Opcao = dados?.group ?? 'nenhum'
  const opcoes: { valor: Opcao; rotulo: string }[] = [
    { valor: 'homens', rotulo: t('whatsapp.conta_homens') },
    { valor: 'mulheres', rotulo: t('whatsapp.conta_mulheres') },
    { valor: 'nenhum', rotulo: t('whatsapp.conta_nenhum') },
  ]

  const mudar = async (valor: Opcao) => {
    if (valor === atual) return
    const r = await escolher({ group: valor === 'nenhum' ? null : valor })
    if (r) toast.success(t('whatsapp.conta_salvo'))
  }

  return (
    <section
      aria-labelledby="conta-whatsapp"
      className="mt-6 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-5"
    >
      <div className="flex items-center gap-2">
        <WhatsappLogo size={18} aria-hidden="true" className="text-[var(--text-2)]" />
        <h2 id="conta-whatsapp" className="text-base font-semibold text-[var(--text)]">
          {t('whatsapp.cartao_titulo')}
        </h2>
      </div>
      <p className="mt-1 text-sm text-[var(--text-2)]">{t('whatsapp.privacidade')}</p>
      <fieldset className="mt-4" disabled={carregando || salvando}>
        <legend className="sr-only">{t('whatsapp.cartao_titulo')}</legend>
        <div className="flex flex-col gap-2 sm:flex-row">
          {opcoes.map((o) => (
            <label
              key={o.valor}
              className={`flex min-h-11 flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 text-sm ${
                atual === o.valor
                  ? 'border-[var(--line-strong)] bg-[var(--surface)] font-semibold text-[var(--text)]'
                  : 'border-[var(--line)] text-[var(--text-2)] hover:bg-[var(--surface)]'
              }`}
            >
              <input
                type="radio"
                name="whatsapp-grupo"
                value={o.valor}
                checked={atual === o.valor}
                onChange={() => void mudar(o.valor)}
                className="accent-[var(--text)]"
              />
              {o.rotulo}
            </label>
          ))}
        </div>
      </fieldset>
      {dados?.url && dados.group && (
        <a
          href={dados.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-[var(--text)] underline underline-offset-2"
        >
          {dados.group === 'homens' ? t('whatsapp.entrar_homens') : t('whatsapp.entrar_mulheres')}
        </a>
      )}
    </section>
  )
}

export default SecaoWhatsappConta
