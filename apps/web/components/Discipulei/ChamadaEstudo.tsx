'use client'

/* ==========================================================================
   Chamada para a Trilha do Discipulado
   --------------------------------------------------------------------------
   O foco principal da comunidade é levar a pessoa a estudar a Bíblia com a
   equipe Discipulei: oito estudos, de graça, em grupo de 2 ou 3 pessoas,
   online (Google Meet) ou presencial. O agendamento mora na página pública
   do site, que já tem o fluxo completo; aqui só apontamos para lá.

   Atribuição: todo link leva `?o=comunidade-<lugar>`, lido pelo main.js da
   página (params.get('o')). Lugares em uso: menu (avatar), menu-lateral,
   devocional (depois de publicar) e biblia (fim do capítulo). Ver
   lib/discipulei/nav.ts.

   Nova aba (target _blank + rel noopener): o destino é outro site. Na
   comunidade instalada como app (PWA em modo standalone), abrir na mesma aba
   tiraria a pessoa do app sem caminho de volta; em nova aba o site abre no
   navegador do sistema, onde o WhatsApp e o Cal funcionam melhor, e a
   comunidade continua aberta onde ela estava. Sem `noreferrer` de propósito:
   o referer ajuda a conferir a atribuição.

   Arquivo próprio para não conflitar com o upstream: as páginas só ganham
   uma linha de import e uma de uso.
   ========================================================================== */

import React, { useEffect, useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, BookOpen } from 'lucide-react'
import { BookOpen as BookOpenMenu } from '@phosphor-icons/react'
import { URL_DISCIPULADO, urlAgendar, type LugarAgendar } from '@/lib/discipulei/nav'
import { useIdiomaDiscipulei } from './useIdioma'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import {
  avisarAgendamento,
  dispensarConvites,
  podeConvidar,
  registrarAgendamento,
  registrarDiaDeUso,
  registrarExibicao,
  type MomentoConvite,
} from '@/lib/discipulei/convitesEstudo'

export const URL_ESTUDO = URL_DISCIPULADO

export type LugarChamada = LugarAgendar

/** Link para a página do discipulado com a origem para atribuição. */
export function urlEstudo(
  lugar: LugarChamada,
  ancora?: 'agendar' | 'como-funciona',
  idioma?: string | null
): string {
  return urlAgendar(lugar, ancora ?? 'agendar', idioma)
}

const SERIF: React.CSSProperties = {
  fontFamily: "var(--font-serif), Georgia, 'Times New Roman', serif",
}

const FOCO =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]'

const BOTAO_PRIMARIO =
  'inline-flex items-center justify-center gap-1.5 min-h-11 px-5 rounded-full ' +
  'bg-[var(--cta-bg)] text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)] ' +
  'text-sm font-semibold whitespace-nowrap transition-colors ' + FOCO

const LINK_SECUNDARIO =
  'inline-flex items-center justify-center min-h-11 px-2 rounded-md ' +
  'text-sm font-medium text-[var(--text)] underline underline-offset-4 ' +
  'decoration-[var(--link-underline)] hover:decoration-[var(--text)] whitespace-nowrap ' + FOCO

function Titulo({ id, className }: { id: string; className: string }) {
  const { t } = useTranslation()
  return (
    <h2 id={id} className={`text-[var(--text-2)] font-normal leading-tight ${className}`} style={SERIF}>
      {t('chamada_estudo.titulo_inicio')}{' '}
      <em className="italic text-[var(--text)]">{t('chamada_estudo.titulo_destaque')}</em>
    </h2>
  )
}

function Acoes({ lugar, larguraTotal }: { lugar: LugarChamada; larguraTotal?: boolean }) {
  const { t } = useTranslation()
  const idioma = useIdiomaDiscipulei()
  const novaAba = <span className="sr-only"> ({t('chamada_estudo.nova_aba')})</span>
  return (
    <div className={larguraTotal ? 'flex flex-col items-stretch gap-1' : 'flex flex-wrap items-center gap-x-3 gap-y-1'}>
      <a
        href={urlEstudo(lugar, 'agendar', idioma)}
        target="_blank"
        rel="noopener"
        onClick={avisarAgendamento}
        className={`${BOTAO_PRIMARIO} ${larguraTotal ? 'w-full' : ''}`}
      >
        {t('chamada_estudo.cta')}
        <ArrowUpRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
        {novaAba}
      </a>
      <a href={urlEstudo(lugar, 'como-funciona', idioma)} target="_blank" rel="noopener" className={LINK_SECUNDARIO}>
        {t('chamada_estudo.como_funciona')}
        {novaAba}
      </a>
    </div>
  )
}

type Props =
  | { variante: 'faixa'; lugar: 'lista' | 'comunidade' }
  | { variante: 'lateral'; lugar?: 'discussao'; className?: string }

/**
 * - `faixa`: topo de /communities e /community/[uuid]. Traz o próprio
 *   contêiner com a mesma largura do GeneralWrapper, para entrar direto no
 *   page.tsx (server) sem mexer no componente cliente da página.
 * - `lateral`: cartão compacto para a página da discussão.
 */
export default function ChamadaEstudo(props: Props) {
  const { t } = useTranslation()
  // useId: a discussão monta o cartão duas vezes (coluna no desktop, fim da
  // página no celular), e ids repetidos quebrariam o aria-labelledby.
  const id = useId()

  if (props.variante === 'lateral') {
    return (
      <section
        aria-labelledby={id}
        className={`rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--panel)] p-4 ${props.className ?? ''}`}
      >
        <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">
          <BookOpen size={14} aria-hidden="true" />
          {t('chamada_estudo.rotulo')}
        </p>
        <Titulo id={id} className="mt-2 text-xl" />
        <p className="mt-1.5 text-sm leading-snug text-[var(--text-2)]">{t('chamada_estudo.descricao')}</p>
        <div className="mt-3">
          <Acoes lugar={props.lugar ?? 'discussao'} larguraTotal />
        </div>
      </section>
    )
  }

  return (
    <div className="max-w-(--breakpoint-2xl) mx-auto px-4 sm:px-6 lg:px-8 pt-5 relative" style={{ zIndex: 'var(--z-content)' }}>
      <section
        aria-labelledby={id}
        className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 md:gap-6 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--panel)] px-4 py-4 sm:px-6 sm:py-5"
      >
        <div className="min-w-0">
          <Titulo id={id} className="text-xl sm:text-2xl" />
          <p className="mt-1 text-sm sm:text-base leading-snug text-[var(--text-2)]">{t('chamada_estudo.descricao')}</p>
        </div>
        <div className="shrink-0">
          <Acoes lugar={props.lugar} />
        </div>
      </section>
    </div>
  )
}

/**
 * Item do menu principal da organização ("Agendar estudo"), no formato
 * que o OrgMenuLinks renderiza. O rótulo já vem com o destaque (contorno em
 * pílula), para o OrgMenuLinks não precisar de nenhum ramo novo no render.
 */
export function itemMenuChamada(rotulo: string, idioma?: string | null) {
  return {
    key: 'discipulei-estudar',
    label: (
      <span className="inline-flex items-center rounded-full border border-current px-2.5 py-0.5">
        {rotulo}
      </span>
    ),
    Icon: BookOpenMenu,
    href: urlEstudo('menu', 'agendar', idioma),
    external: true,
  }
}

/** Texto de cada momento do convite (N40). */
const TEXTO_CONVITE: Record<MomentoConvite, string> = {
  tcd: 'chamada_estudo.convite_tcd',
  biblia: 'chamada_estudo.convite_titulo',
  hoje: 'chamada_estudo.convite_hoje',
  'primeira-nota': 'chamada_estudo.convite_publicado',
  devocional: 'chamada_estudo.convite_publicado',
}

/**
 * Convite discreto para agendar estudo (decisão N40): uma linha com o texto,
 * "Agendar estudo" e "Agora não". Ele mesmo decide se aparece, pelas regras
 * de lib/discipulei/convitesEstudo.ts (1 por dia, "Agora não" esconde 14 dias,
 * nunca para quem já clicou em "Agendar estudo"). Quem monta só escolhe o
 * momento; o leitor da Bíblia, por exemplo, continua com a mesma linha de uso.
 */
export function ConviteEstudo({
  lugar,
  className = '',
  aoFechar,
}: {
  lugar: MomentoConvite
  className?: string
  aoFechar?: () => void
}) {
  const { t } = useTranslation()
  const idioma = useIdiomaDiscipulei()
  const session = useLHSession() as any
  const id = useId()
  const status: string = session?.status ?? 'loading'
  // Visitante (leitor da Bíblia): as regras valem por navegador.
  const conta: string | null =
    status === 'authenticated' ? String(session?.data?.user?.id ?? '') || null : status === 'unauthenticated' ? 'anon' : null
  const [visivel, setVisivel] = useState(false)

  useEffect(() => {
    if (!conta) return
    if (lugar === 'hoje') registrarDiaDeUso(conta)
    if (podeConvidar(conta, lugar)) {
      registrarExibicao(conta, lugar)
      setVisivel(true)
    } else {
      setVisivel(false)
    }
  }, [conta, lugar])

  if (!visivel) return null

  const fechar = () => {
    setVisivel(false)
    aoFechar?.()
  }
  const lugarAgendar: LugarChamada = lugar

  return (
    <section
      aria-labelledby={id}
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--panel)] px-4 py-2 ${className}`}
    >
      <p id={id} className="min-w-0 flex-1 basis-56 py-2 text-sm leading-snug text-[var(--text-2)]">
        {t(TEXTO_CONVITE[lugar])}
      </p>
      <div className="flex shrink-0 items-center gap-1">
        <a
          href={urlEstudo(lugarAgendar, 'agendar', idioma)}
          target="_blank"
          rel="noopener"
          onClick={() => {
            if (conta) registrarAgendamento(conta)
            avisarAgendamento()
            fechar()
          }}
          className={`inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-[var(--text)] underline decoration-[var(--link-underline)] underline-offset-4 hover:decoration-[var(--text)] ${FOCO}`}
        >
          {t('chamada_estudo.cta')}
          <ArrowUpRight size={14} aria-hidden="true" className="rtl:-scale-x-100" />
          <span className="sr-only"> ({t('chamada_estudo.nova_aba')})</span>
        </a>
        <button
          type="button"
          onClick={() => {
            if (conta) dispensarConvites(conta)
            fechar()
          }}
          className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm text-[var(--text-3)] hover:text-[var(--text)] ${FOCO}`}
        >
          {t('chamada_estudo.agora_nao')}
        </button>
      </div>
    </section>
  )
}
