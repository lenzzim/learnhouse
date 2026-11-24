'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { CalendarBlank, CalendarCheck, CaretRight, GraduationCap, Hash, Lock, MagnifyingGlass, Plus, Users } from '@phosphor-icons/react'
import { getUriWithOrg } from '@services/config/config'
import { useIdiomaDiscipulei } from '../useIdioma'
import {
  NAV_PRINCIPAL,
  ROTA_APRENDER,
  abaAtiva,
  comunidadeDaRota,
  rotaAprender,
  urlAgendar,
  type AbaId,
} from '@/lib/discipulei/nav'
import { avisarAgendamento } from '@/lib/discipulei/convitesEstudo'
import { useDadosNav } from './useDadosNav'
import { agruparEmSecoes, audienciaDe } from '@/lib/communities/audiencia'
import { rotuloAudiencia, tituloSecao } from '@components/Objects/Communities/AudienciaSelo'
import { MenuAvatar } from './MenuAvatar'
import { Logo } from './Logo'
import { ICONE_ABA } from './icones'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, FOCO, caminhoNota, semPrefixo } from './estilos'
import { rotuloAtalhoBusca } from './BuscaDialogo'

const CHAVE_EXPANDIDOS = 'discipulei_nav_expandidos'

/** Lista expandida de Caderno/Comunidades: preferência do navegador. */
function useExpandidos() {
  const [expandidos, setExpandidos] = useState<Record<string, boolean>>({ caderno: true, comunidades: true })
  useEffect(() => {
    try {
      const salvo = window.localStorage.getItem(CHAVE_EXPANDIDOS)
      if (salvo) setExpandidos((atual) => ({ ...atual, ...JSON.parse(salvo) }))
    } catch {
      /* modo privado */
    }
  }, [])
  const alternar = (id: string) =>
    setExpandidos((atual) => {
      const novo = { ...atual, [id]: !atual[id] }
      try {
        window.localStorage.setItem(CHAVE_EXPANDIDOS, JSON.stringify(novo))
      } catch {
        /* modo privado */
      }
      return novo
    })
  return { expandidos, alternar }
}

const ITEM_BASE =
  'flex min-h-11 flex-1 items-center gap-3 rounded-lg px-3 text-sm transition-colors ' + FOCO

const SUBITEM =
  'flex min-h-9 items-center gap-2.5 rounded-md ps-3 pe-2 text-sm transition-colors ' + FOCO

/**
 * Barra lateral do desktop (>= 1024px), no estilo Notion/Discord: Buscar,
 * + Nova nota, Início, Bíblia, Caderno (5 notas recentes), Comunidades (como
 * canais, cadeado nas restritas), Aprender (cursos e desafios, discreto),
 * Agendar estudo e o avatar no rodapé.
 */
export function BarraLateral({
  orgslug,
  topo,
  aoBuscar,
}: {
  orgslug: string
  topo: number
  aoBuscar: () => void
}) {
  const { t, i18n } = useTranslation()
  const idioma = useIdiomaDiscipulei()
  const pathname = usePathname()
  const { autenticado, status, comunidades, notasRecentes, carregandoNotas } = useDadosNav()
  const secoesComunidades = agruparEmSecoes(comunidades)
  const { expandidos, alternar } = useExpandidos()
  const [atalho, setAtalho] = useState('Ctrl K')
  useEffect(() => setAtalho(rotuloAtalhoBusca()), [])

  const ativa = abaAtiva(pathname)
  const comunidadeAberta = comunidadeDaRota(pathname)
  const aprenderAtivo = rotaAprender(pathname)
  // Agenda (antes Bate-papos, N45): eventos online e presenciais, perto de Aprender.
  const batepaposAtivo = (pathname ?? '').split('/').some((p) => p === 'agenda' || p === 'batepapos')

  const classeItem = (id: AbaId) =>
    `${ITEM_BASE} ${
      ativa === id
        ? 'bg-[var(--surface)] font-semibold text-[var(--text)]'
        : 'font-medium text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
    }`

  // Para quem não entrou: só o que é público.
  const itens = autenticado ? NAV_PRINCIPAL : NAV_PRINCIPAL.filter((i) => i.id === 'biblia' || i.id === 'comunidades')

  return (
    <div
      className="fixed bottom-0 start-0 hidden w-64 flex-col border-e border-[var(--line)] bg-[var(--panel)] lg:flex"
      style={{ top: topo, zIndex: 'var(--z-nav)' }}
    >
      <div className="flex items-center px-4 pb-2 pt-3">
        <Logo orgslug={orgslug} autenticado={autenticado} />
      </div>

      <div className="flex flex-col gap-2 px-3 pb-3">
        <button
          type="button"
          onClick={aoBuscar}
          aria-keyshortcuts="Control+K Meta+K"
          className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg border border-[var(--line)] bg-[var(--page)] px-3 text-sm text-[var(--text-3)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text-2)] ${FOCO}`}
        >
          <MagnifyingGlass size={16} aria-hidden="true" />
          <span className="flex-1 text-start">{t('nav.buscar')}</span>
          <kbd className="rounded border border-[var(--line-strong)] px-1.5 py-px font-sans text-xs text-[var(--text-3)]">
            {atalho}
          </kbd>
        </button>
        {autenticado && (
          <Link href={getUriWithOrg(orgslug, '/caderno/new')} className={`${BOTAO_PRIMARIO} min-h-10 w-full text-sm`}>
            <Plus size={16} weight="bold" aria-hidden="true" />
            {t('nav.nova_nota')}
          </Link>
        )}
      </div>

      <nav aria-label={t('nav.navegacao_principal')} className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <ul className="flex flex-col gap-0.5">
          {itens.map((item) => {
            const Icone = ICONE_ABA[item.id]
            const ehAtiva = ativa === item.id
            const temLista = autenticado && (item.id === 'caderno' || item.id === 'comunidades')
            const aberto = temLista && expandidos[item.id]
            const idLista = `nav-lista-${item.id}`
            return (
              <li key={item.id}>
                <div className="flex items-center gap-0.5">
                  <Link
                    href={getUriWithOrg(orgslug, item.rota)}
                    aria-current={ehAtiva ? 'page' : undefined}
                    className={classeItem(item.id)}
                  >
                    <Icone size={20} weight={ehAtiva ? 'fill' : 'regular'} aria-hidden="true" />
                    <span>{t(item.rotulo)}</span>
                  </Link>
                  {temLista && (
                    <button
                      type="button"
                      onClick={() => alternar(item.id)}
                      aria-expanded={!!aberto}
                      aria-controls={idLista}
                      aria-label={t(aberto ? 'nav.recolher' : 'nav.expandir', { item: t(item.rotulo) })}
                      className={`inline-flex h-11 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--text-3)] hover:bg-[var(--surface)] hover:text-[var(--text)] ${FOCO}`}
                    >
                      <CaretRight
                        size={14}
                        aria-hidden="true"
                        className={`transition-transform duration-200 rtl:-scale-x-100 ${aberto ? 'rotate-90 rtl:-rotate-90' : ''}`}
                      />
                    </button>
                  )}
                </div>

                {item.id === 'caderno' && aberto && (
                  <ul id={idLista} className="ms-5 mt-0.5 flex flex-col gap-px border-s border-[var(--line)] ps-2">
                    {notasRecentes.map((n) => {
                      const caminho = caminhoNota(n)
                      const href = getUriWithOrg(orgslug, caminho)
                      const atual = !!pathname?.endsWith(caminho)
                      return (
                        <li key={n.note_uuid}>
                          <Link
                            href={href}
                            aria-current={atual ? 'page' : undefined}
                            className={`${SUBITEM} ${atual ? 'bg-[var(--surface)] text-[var(--text)]' : 'text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)]'}`}
                          >
                            <span className="min-w-0 flex-1 truncate" dir="auto">{n.title || t('caderno.sem_titulo')}</span>
                          </Link>
                        </li>
                      )
                    })}
                    {!carregandoNotas && notasRecentes.length === 0 && (
                      <li className="px-3 py-2 text-xs leading-snug text-[var(--text-3)]">{t('nav.caderno_vazio')}</li>
                    )}
                  </ul>
                )}

                {item.id === 'comunidades' && aberto && (
                  <ul id={idLista} className="ms-5 mt-0.5 flex flex-col gap-px border-s border-[var(--line)] ps-2">
                    {/* Seções: "Comunidade" e uma por grupo restrito que a
                        pessoa lê (ex.: "Área dos Discípulos"); a API já não
                        devolve espaços de grupos alheios. Título só com mais
                        de uma seção; fixados no topo de cada uma. */}
                    {secoesComunidades.map((secao, i) => (
                      <li key={secao.chave}>
                        {secoesComunidades.length > 1 && (
                          <p
                            id={`nav-secao-${i}`}
                            className="px-3 pb-0.5 pt-2 text-xs font-semibold text-[var(--text-3)]"
                          >
                            {tituloSecao(secao.grupos, t, i18n.language)}
                          </p>
                        )}
                        <ul
                          aria-labelledby={secoesComunidades.length > 1 ? `nav-secao-${i}` : undefined}
                          className="flex flex-col gap-px"
                        >
                          {secao.itens.map((c) => {
                            const atual = comunidadeAberta === c.community_uuid
                            const aud = audienciaDe(c)
                            const Icone = aud.kind === 'open' ? Hash : aud.kind === 'members' ? Users : Lock
                            return (
                              <li key={c.community_uuid}>
                                <Link
                                  href={getUriWithOrg(orgslug, `/community/${semPrefixo(c.community_uuid, 'community_')}`)}
                                  aria-current={atual ? 'page' : undefined}
                                  className={`${SUBITEM} ${atual ? 'bg-[var(--surface)] text-[var(--text)]' : 'text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)]'}`}
                                >
                                  <Icone size={14} aria-hidden="true" className="shrink-0 text-[var(--text-3)]" />
                                  <span className="min-w-0 flex-1 truncate">{c.name}</span>
                                  <span className="sr-only">({rotuloAudiencia(aud, t, i18n.language)})</span>
                                </Link>
                              </li>
                            )
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
          {autenticado && (
            <li>
              <Link
                href={getUriWithOrg(orgslug, ROTA_APRENDER)}
                aria-current={aprenderAtivo ? 'page' : undefined}
                className={`${ITEM_BASE} ${
                  aprenderAtivo
                    ? 'bg-[var(--surface)] font-semibold text-[var(--text)]'
                    : 'font-medium text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
                }`}
              >
                <GraduationCap size={20} weight={aprenderAtivo ? 'fill' : 'regular'} aria-hidden="true" />
                <span>{t('nav.aprender')}</span>
              </Link>
            </li>
          )}
          {/* Agenda é aberta: aparece também para visitantes. */}
          {(
            <li>
              <Link
                href={getUriWithOrg(orgslug, '/agenda')}
                aria-current={batepaposAtivo ? 'page' : undefined}
                className={`${ITEM_BASE} ${
                  batepaposAtivo
                    ? 'bg-[var(--surface)] font-semibold text-[var(--text)]'
                    : 'font-medium text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
                }`}
              >
                <CalendarBlank size={20} weight={batepaposAtivo ? 'fill' : 'regular'} aria-hidden="true" />
                <span>{t('agenda.nav')}</span>
              </Link>
            </li>
          )}
        </ul>

        <div className="my-3 h-px bg-[var(--line)]" role="separator" />

        <a
          href={urlAgendar('menu-lateral', 'agendar', idioma)}
          target="_blank"
          rel="noopener"
          onClick={avisarAgendamento}
          className={`${ITEM_BASE} font-medium text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)]`}
        >
          <CalendarCheck size={20} aria-hidden="true" />
          <span className="flex-1">{t('nav.agendar_estudo')}</span>
          <span className="sr-only">({t('chamada_estudo.nova_aba')})</span>
        </a>
      </nav>

      <div className="border-t border-[var(--line)] p-3">
        {autenticado ? (
          <MenuAvatar variante="completa" />
        ) : status === 'unauthenticated' ? (
          <div className="flex flex-col gap-2">
            <Link href={getUriWithOrg(orgslug, '/login')} className={`${BOTAO_PRIMARIO} min-h-10 text-sm`}>
              {t('auth.login')}
            </Link>
            <Link href={getUriWithOrg(orgslug, '/signup')} className={`${BOTAO_SECUNDARIO} min-h-10 text-sm`}>
              {t('auth.sign_up')}
            </Link>
          </div>
        ) : (
          <div className="h-12" aria-hidden="true" />
        )}
      </div>
    </div>
  )
}

export default BarraLateral
