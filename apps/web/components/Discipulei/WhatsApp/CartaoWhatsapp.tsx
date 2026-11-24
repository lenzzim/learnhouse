'use client'

/**
 * Cartão fixo "Grupo do WhatsApp" da tela Hoje (decisão N42). Com escolha
 * registrada, mostra o botão do grupo certo; sem escolha, pergunta de novo ali
 * mesmo (Sou homem / Sou mulher). Altura mínima estável para não empurrar a
 * tela quando os dados chegam (CLS).
 */

import React from 'react'
import { useTranslation } from 'react-i18next'
import { WhatsappLogo } from '@phosphor-icons/react'
import { SERIF } from '@components/Discipulei/Navegacao/estilos'
import { BotaoGrupo, BotoesEscolha, useEscolherWhatsapp, useMeuWhatsapp } from './comum'

const PAINEL = 'rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5'

export function CartaoWhatsapp() {
  const { t } = useTranslation()
  const { habilitado, dados, carregando } = useMeuWhatsapp()
  const { escolher, salvando } = useEscolherWhatsapp()

  if (!habilitado) return null

  return (
    <section aria-labelledby="hoje-whatsapp" className={`${PAINEL} min-h-[10.5rem]`}>
      <div className="flex items-center gap-2">
        <WhatsappLogo size={20} aria-hidden="true" className="text-[var(--text-2)]" />
        <h2 id="hoje-whatsapp" className="text-xl leading-tight text-[var(--text)]" style={SERIF}>
          {t('whatsapp.cartao_titulo')}
        </h2>
      </div>
      <div className="mt-3">
        {carregando || !dados ? (
          <div className="h-[4.5rem] animate-pulse rounded-lg bg-[var(--surface)]" aria-hidden="true" />
        ) : dados.group ? (
          <BotaoGrupo url={dados.url} grupo={dados.group} />
        ) : (
          <>
            <p className="mb-3 text-sm text-[var(--text-2)]">{t('whatsapp.cartao_pergunta')}</p>
            <BotoesEscolha aoEscolher={(g) => void escolher({ group: g })} desabilitado={salvando} />
          </>
        )}
      </div>
    </section>
  )
}

export default CartaoWhatsapp
