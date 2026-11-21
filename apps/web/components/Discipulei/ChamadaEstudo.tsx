'use client'

/* ==========================================================================
   Chamada para a Trilha do Discipulado
   --------------------------------------------------------------------------
   O foco principal da comunidade é levar a pessoa a estudar a Bíblia com a
   equipe Discipulei: oito estudos, de graça, em grupo de 2 ou 3 pessoas,
   online (Google Meet) ou presencial. O agendamento mora na página pública
   do site, que já tem o fluxo completo; aqui só apontamos para lá.

   Atribuição: todo link leva `?o=comunidade-<lugar>`, lido pelo main.js da
   página (params.get('o')). Lugares em uso: lista, comunidade, discussao,
   menu.

   Nova aba (target _blank + rel noopener): o destino é outro site. Na
   comunidade instalada como app (PWA em modo standalone), abrir na mesma aba
   tiraria a pessoa do app sem caminho de volta; em nova aba o site abre no
   navegador do sistema, onde o WhatsApp e o Cal funcionam melhor, e a
   comunidade continua aberta onde ela estava. Sem `noreferrer` de propósito:
   o referer ajuda a conferir a atribuição.

   Arquivo próprio para não conflitar com o upstream: as páginas só ganham
   uma linha de import e uma de uso.
   ========================================================================== */

import React, { useId } from 'react'
import { useTranslation } from 'react-i18next'
import { ArrowUpRight, BookOpen } from 'lucide-react'
import { BookOpen as BookOpenMenu } from '@phosphor-icons/react'

export const URL_ESTUDO = 'https://www.discipulei.com.br/discipulado-biblico/'

export type LugarChamada = 'lista' | 'comunidade' | 'discussao' | 'menu'

/** Link para a página do discipulado com a origem para atribuição. */
export function urlEstudo(lugar: LugarChamada, ancora?: 'agendar' | 'como-funciona'): string {
  return `${URL_ESTUDO}?o=comunidade-${lugar}${ancora ? `#${ancora}` : ''}`
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
  const novaAba = <span className="sr-only"> ({t('chamada_estudo.nova_aba')})</span>
  return (
    <div className={larguraTotal ? 'flex flex-col items-stretch gap-1' : 'flex flex-wrap items-center gap-x-3 gap-y-1'}>
      <a
        href={urlEstudo(lugar, 'agendar')}
        target="_blank"
        rel="noopener"
        className={`${BOTAO_PRIMARIO} ${larguraTotal ? 'w-full' : ''}`}
      >
        {t('chamada_estudo.cta')}
        <ArrowUpRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
        {novaAba}
      </a>
      <a href={urlEstudo(lugar, 'como-funciona')} target="_blank" rel="noopener" className={LINK_SECUNDARIO}>
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
 * Item do menu principal da organização ("Estudar com a equipe"), no formato
 * que o OrgMenuLinks renderiza. O rótulo já vem com o destaque (contorno em
 * pílula), para o OrgMenuLinks não precisar de nenhum ramo novo no render.
 */
export function itemMenuChamada(rotulo: string) {
  return {
    key: 'discipulei-estudar',
    label: (
      <span className="inline-flex items-center rounded-full border border-current px-2.5 py-0.5">
        {rotulo}
      </span>
    ),
    Icon: BookOpenMenu,
    href: urlEstudo('menu', 'agendar'),
    external: true,
  }
}
