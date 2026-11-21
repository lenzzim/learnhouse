'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { MagnifyingGlass, PencilSimple } from '@phosphor-icons/react'
import { getUriWithOrg } from '@services/config/config'
import { NAV_PRINCIPAL, abaAtiva, type ItemNav } from '@/lib/discipulei/nav'
import { useDadosNav } from './useDadosNav'
import { useEscrever } from './EscreverContexto'
import { MenuAvatar } from './MenuAvatar'
import { Logo } from './Logo'
import { ICONE_ABA } from './icones'
import { BOTAO_ICONE, BOTAO_PRIMARIO, FOCO } from './estilos'

/**
 * Barra superior do celular e do tablet (< 1024px): logo, busca e avatar.
 * Fica grudada no topo (sticky), abaixo da faixa "Entrar na organização"
 * quando ela aparece.
 */
export function BarraSuperior({ orgslug, topo, aoBuscar }: { orgslug: string; topo: number; aoBuscar: () => void }) {
  const { t } = useTranslation()
  const { autenticado, status } = useDadosNav()
  return (
    <header
      className="sticky flex h-14 items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--panel)] ps-4 pe-2 lg:hidden"
      style={{
        top: topo,
        zIndex: 'var(--z-nav)',
        // O <body> já desce o conteúdo pela área segura (discipulei-dark.css).
        // A barra sobe por cima desse recuo e o preenche com o próprio fundo,
        // para o conteúdo rolado não aparecer atrás do relógio no app instalado.
        marginTop: 'calc(-1 * env(safe-area-inset-top, 0px))',
        paddingTop: 'env(safe-area-inset-top, 0px)',
        boxSizing: 'content-box',
      }}
    >
      <Logo orgslug={orgslug} autenticado={autenticado} />
      <div className="flex items-center gap-1">
        <button type="button" onClick={aoBuscar} aria-label={t('nav.buscar')} className={BOTAO_ICONE}>
          <MagnifyingGlass size={22} aria-hidden="true" />
        </button>
        {autenticado ? (
          <MenuAvatar variante="compacta" />
        ) : status === 'unauthenticated' ? (
          <Link href={getUriWithOrg(orgslug, '/login')} className={`${BOTAO_PRIMARIO} ms-1 me-2 min-h-11 px-4 text-sm`}>
            {t('auth.login')}
          </Link>
        ) : (
          <span className="h-11 w-11" aria-hidden="true" />
        )}
      </div>
    </header>
  )
}

function Aba({ item, ativa, orgslug }: { item: ItemNav; ativa: boolean; orgslug: string }) {
  const { t } = useTranslation()
  const Icone = ICONE_ABA[item.id]
  return (
    <li className="flex-1">
      <Link
        href={getUriWithOrg(orgslug, item.rota)}
        aria-current={ativa ? 'page' : undefined}
        className={`group flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl px-1 ${FOCO} ${
          ativa ? 'text-[var(--text)]' : 'text-[var(--text-2)]'
        }`}
      >
        <span
          className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors duration-200 ${
            ativa ? 'bg-[var(--surface)]' : 'group-active:bg-[var(--surface)]'
          }`}
        >
          <Icone size={22} weight={ativa ? 'fill' : 'regular'} aria-hidden="true" />
        </span>
        <span className={`text-xs leading-none ${ativa ? 'font-semibold' : 'font-medium'}`}>{t(item.rotulo)}</span>
      </Link>
    </li>
  )
}

/**
 * Barra de abas do celular e do tablet: Início, Bíblia, Escrever (no meio),
 * Caderno e Comunidades. Rótulos sempre visíveis, alvos de 56px de altura e
 * recuo da área segura (home indicator do iPhone).
 */
export function BarraInferior({ orgslug }: { orgslug: string }) {
  const { t } = useTranslation()
  const pathname = usePathname()
  const { autenticado } = useDadosNav()
  const { abrirEscrever } = useEscrever()
  const ativa = abaAtiva(pathname)

  const itens = autenticado ? NAV_PRINCIPAL : NAV_PRINCIPAL.filter((i) => i.id === 'biblia' || i.id === 'comunidades')
  const metade = Math.ceil(itens.length / 2)

  return (
    <nav
      aria-label={t('nav.navegacao_principal')}
      className="barra-inferior fixed inset-x-0 bottom-0 border-t border-[var(--line)] bg-[var(--panel)] lg:hidden"
      style={{
        zIndex: 'var(--z-nav)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      <ul className="mx-auto flex h-16 max-w-lg items-center px-1">
        {itens.slice(0, metade).map((item) => (
          <Aba key={item.id} item={item} ativa={ativa === item.id} orgslug={orgslug} />
        ))}
        {autenticado && (
          <li className="flex-1">
            <button
              type="button"
              onClick={() => abrirEscrever()}
              aria-haspopup="dialog"
              className={`group flex min-h-14 w-full flex-col items-center justify-center gap-1 rounded-xl px-1 text-[var(--text)] ${FOCO}`}
            >
              <span className="flex h-8 w-14 items-center justify-center rounded-full bg-[var(--cta-bg)] text-[var(--cta-fg)] transition-colors group-hover:bg-[var(--cta-bg-hover)]">
                <PencilSimple size={20} weight="bold" aria-hidden="true" />
              </span>
              <span className="text-xs font-medium leading-none">{t('nav.escrever.rotulo')}</span>
            </button>
          </li>
        )}
        {itens.slice(metade).map((item) => (
          <Aba key={item.id} item={item} ativa={ativa === item.id} orgslug={orgslug} />
        ))}
      </ul>
    </nav>
  )
}
