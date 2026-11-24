'use client'

/**
 * Passo único do grupo do WhatsApp (decisão N42): na primeira entrada na
 * comunidade (logo depois do cadastro ou do primeiro login), uma folha
 * discreta pergunta "Sou homem / Sou mulher" e mostra o botão do grupo certo,
 * com "Agora não". Escolher ou dispensar marca `prompted` no servidor, então
 * não volta sozinho; o cartão da tela Hoje e o menu do avatar reabrem pelo
 * evento `discipulei:whatsapp-abrir`.
 *
 * - Só para membros logados da org; nunca em login/cadastro, no painel nem em
 *   telas públicas.
 * - Divide a vez com o convite de instalar e o convite de estudo
 *   (useCantoInferior): nunca aparecem juntos; este vem primeiro.
 *
 * Montado uma vez em app/orgs/[orgslug]/(withmenu)/layout.tsx.
 */

import React, { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { FolhaInferior } from '@components/Discipulei/Navegacao/FolhaInferior'
import { useCantoInferior } from '@components/Discipulei/useCantoInferior'
import type { GrupoWhatsapp } from '@services/communities/membros'
import {
  BotaoGrupo,
  BotoesEscolha,
  EVENTO_ABRIR_WHATSAPP,
  useEscolherWhatsapp,
  useMeuWhatsapp,
} from './comum'

/** Segmentos onde o passo nunca aparece sozinho. */
const SEGMENTOS_BLOQUEADOS = new Set([
  'dash',
  'login',
  'signup',
  'auth',
  'forgot',
  'reset',
  'verify-email',
  'magic',
  'sso',
  'editor',
  'p',
])

/** Espera um instante depois de a tela carregar (não disputa com o conteúdo). */
const ATRASO_MS = 1500

export default function PassoWhatsapp() {
  const { t } = useTranslation()
  const pathname = usePathname()
  const { habilitado, dados } = useMeuWhatsapp()
  const { escolher, salvando } = useEscolherWhatsapp()

  // Aberto pelo menu/cartão (fora da fila do canto).
  const [manual, setManual] = useState(false)
  // Fechado nesta visita (escolheu e fechou, ou "Agora não").
  const [fechado, setFechado] = useState(false)
  const [pronto, setPronto] = useState(false)
  // Escolha feita agora: mostra o botão do grupo antes de fechar.
  const [escolhido, setEscolhido] = useState<GrupoWhatsapp | null>(null)

  useEffect(() => {
    const espera = window.setTimeout(() => setPronto(true), ATRASO_MS)
    return () => window.clearTimeout(espera)
  }, [])

  useEffect(() => {
    const abrir = () => {
      setEscolhido(null)
      setFechado(false)
      setManual(true)
    }
    window.addEventListener(EVENTO_ABRIR_WHATSAPP, abrir)
    return () => window.removeEventListener(EVENTO_ABRIR_WHATSAPP, abrir)
  }, [])

  const segmentos = pathname?.split('/').filter(Boolean) ?? []
  const rotaBloqueada = segmentos.some((s) => SEGMENTOS_BLOQUEADOS.has(s))
  const quer = habilitado && pronto && !fechado && !rotaBloqueada && dados?.prompted === false
  // Depois de aparecer, fica aberto até a pessoa fechar (escolher marca
  // `prompted` no servidor, mas o botão do grupo ainda precisa aparecer).
  const [preso, setPreso] = useState(false)
  const minhaVez = useCantoInferior('whatsapp', (quer || preso) && !manual && !fechado)
  useEffect(() => {
    if (quer && minhaVez) setPreso(true)
  }, [quer, minhaVez])
  const aberto = habilitado && !fechado && (manual || preso)

  const fechar = () => {
    setFechado(true)
    setManual(false)
    setPreso(false)
  }

  const agoraNao = async () => {
    fechar()
    // Só marca no servidor se ainda não tinha sido perguntado.
    if (dados && !dados.prompted) await escolher({ group: null, dismissed: true })
  }

  const aoEscolher = async (g: GrupoWhatsapp) => {
    const r = await escolher({ group: g })
    if (r) setEscolhido(g)
  }

  // Ao fechar pelo X/Esc/fora: igual a "Agora não".
  const aoMudar = (abrir: boolean) => {
    if (!abrir) void agoraNao()
  }

  const grupo = escolhido ?? (manual ? (dados?.group ?? null) : null)
  const url = grupo ? (grupo === 'homens' ? dados?.links.homens : dados?.links.mulheres) : null

  return (
    <FolhaInferior
      aberta={aberto}
      aoMudar={aoMudar}
      titulo={t('whatsapp.titulo')}
      descricao={t('whatsapp.descricao')}
    >
      <div className="flex flex-col gap-4 px-5 pb-2 pt-4">
        {grupo && url ? (
          <>
            <BotaoGrupo url={url} grupo={grupo} />
            {manual && (
              <button
                type="button"
                onClick={() => setEscolhido(null)}
                className="min-h-11 self-start text-sm text-[var(--text-2)] underline underline-offset-2 hover:text-[var(--text)]"
              >
                {t('whatsapp.trocar')}
              </button>
            )}
            <button
              type="button"
              onClick={fechar}
              className="min-h-11 rounded-lg text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
            >
              {t('whatsapp.fechar')}
            </button>
          </>
        ) : (
          <>
            <BotoesEscolha aoEscolher={aoEscolher} desabilitado={salvando} />
            <p className="text-xs text-[var(--text-2)]">{t('whatsapp.privacidade')}</p>
            <button
              type="button"
              onClick={() => void agoraNao()}
              className="min-h-11 rounded-lg text-sm font-medium text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)]"
            >
              {t('whatsapp.agora_nao')}
            </button>
          </>
        )}
      </div>
    </FolhaInferior>
  )
}
