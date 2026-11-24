'use client'
import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import {
  ArrowsLeftRight,
  BookmarkSimple,
  Copy,
  Eraser,
  NotePencil,
  ShareNetwork,
  Translate,
  X,
} from '@phosphor-icons/react'
import { CORES, type Cor } from '@/lib/caderno/cores'

/**
 * Barra de ações da seleção de versículos (P0 do plano do leitor, item 1):
 * folha presa embaixo no celular (acima da barra de abas) e barra flutuante
 * no computador. Destacar (4 tons do Caderno e remover), copiar, compartilhar
 * (só o link), anotar (nota nova ou TCD de hoje), favorito, comparar e
 * original. Destacar, favoritar e anotar pedem sessão.
 */

const ALVO =
  'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-1.5 rounded-lg px-2 text-xs text-[var(--text-2)] transition-colors hover:bg-[var(--surface)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] disabled:opacity-40 lg:min-h-9 lg:min-w-9'

export interface PropsBarraVersiculos {
  /** "João 3:16-17, 19" */
  rotulo: string
  quantidade: number
  /** tom comum a todos os selecionados (null = nenhum ou misturado) */
  corAtual: Cor | null
  algumDestaque: boolean
  todosFavoritos: boolean
  logado: boolean
  hrefEntrar: string
  comparando: boolean
  originalAberto: boolean
  aoDestacar: (cor: Cor | null) => void
  aoCopiar: () => void
  aoCompartilhar: () => void
  aoAnotar: (destino: 'nota' | 'tcd') => void
  aoFavoritar: () => void
  aoComparar: () => void
  aoOriginal: () => void
  aoFechar: () => void
}

export function BarraVersiculos(p: PropsBarraVersiculos) {
  const { t } = useTranslation()
  const [menuAnotar, setMenuAnotar] = useState(false)
  const anotarRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!menuAnotar) return
    const fora = (e: PointerEvent) => {
      if (!anotarRef.current?.contains(e.target as Node)) setMenuAnotar(false)
    }
    document.addEventListener('pointerdown', fora)
    return () => document.removeEventListener('pointerdown', fora)
  }, [menuAnotar])

  const pedeEntrar = !p.logado

  return (
    <div
      role="toolbar"
      aria-label={t('biblia.acoes_selecao', { ref: p.rotulo })}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          if (menuAnotar) setMenuAnotar(false)
          else p.aoFechar()
        }
      }}
      className="fixed inset-x-0 z-40 border-t border-[var(--line-strong)] bg-[var(--panel)] px-3 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 font-sans text-[var(--text)] lg:inset-x-auto lg:left-1/2 lg:w-max lg:max-w-[calc(100vw-2rem)] lg:-translate-x-1/2 lg:rounded-2xl lg:border lg:px-2 lg:py-1.5"
      style={{ bottom: 'var(--altura-barra-inferior, 0px)', boxShadow: 'var(--sombra-lg)' }}
    >
      <div className="mx-auto flex max-w-[680px] flex-col gap-1.5 lg:max-w-none lg:flex-row lg:items-center lg:gap-1">
        {/* referência + fechar */}
        <div className="flex items-center justify-between gap-2 lg:order-last">
          <p className="min-w-0 truncate text-sm font-medium lg:hidden" aria-live="polite">
            {p.rotulo}
            <span className="ms-1.5 text-xs font-normal text-[var(--text-3)]">{t('biblia.n_selecionados', { count: p.quantidade })}</span>
          </p>
          <button type="button" onClick={p.aoFechar} className={ALVO} aria-label={t('biblia.limpar_selecao')} title={t('biblia.limpar_selecao')}>
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="sr-only hidden lg:block" aria-live="polite">
          {p.rotulo} — {t('biblia.n_selecionados', { count: p.quantidade })}
        </p>

        {/* destacar */}
        <div role="group" aria-label={t('biblia.destacar')} className="flex items-center gap-1 overflow-x-auto [scrollbar-width:none]">
          {pedeEntrar ? (
            <Link href={p.hrefEntrar} className={`${ALVO} underline decoration-[var(--link-underline)] underline-offset-2`}>
              {t('biblia.entrar_para_destacar')}
            </Link>
          ) : (
            <>
              {CORES.map((cor) => (
                <button
                  key={cor}
                  type="button"
                  onClick={() => p.aoDestacar(cor)}
                  aria-pressed={p.corAtual === cor}
                  aria-label={t('biblia.destacar_cor', { cor: t(`caderno_editor.cores.${cor}`) })}
                  title={t(`caderno_editor.cores.${cor}`)}
                  className={`${ALVO} px-0`}
                >
                  <span
                    aria-hidden="true"
                    data-cor={cor}
                    className={`caderno-amostra-marca block h-7 w-7 rounded-full lg:h-6 lg:w-6 ${p.corAtual === cor ? 'ring-2 ring-[var(--text)] ring-offset-2 ring-offset-[var(--panel)]' : ''}`}
                  />
                </button>
              ))}
              <button
                type="button"
                onClick={() => p.aoDestacar(null)}
                disabled={!p.algumDestaque}
                className={ALVO}
                aria-label={t('biblia.remover_destaque')}
                title={t('biblia.remover_destaque')}
              >
                <Eraser size={18} aria-hidden="true" />
              </button>
            </>
          )}
          <span className="mx-1 hidden h-5 w-px shrink-0 bg-[var(--line)] lg:block" aria-hidden="true" />
        </div>

        {/* ações */}
        <div className="grid grid-cols-3 gap-1 sm:grid-cols-6 lg:flex lg:items-center">
          <button type="button" onClick={p.aoCopiar} className={ALVO}>
            <Copy size={18} aria-hidden="true" />
            <span>{t('biblia.copiar')}</span>
          </button>
          <button type="button" onClick={p.aoCompartilhar} className={ALVO}>
            <ShareNetwork size={18} aria-hidden="true" />
            <span>{t('biblia.compartilhar')}</span>
          </button>
          <div ref={anotarRef} className="relative grid">
            <button
              type="button"
              onClick={() => setMenuAnotar((m) => !m)}
              aria-haspopup="menu"
              aria-expanded={menuAnotar}
              className={ALVO}
            >
              <NotePencil size={18} aria-hidden="true" />
              <span>{t('biblia.anotar')}</span>
            </button>
            {menuAnotar && (
              <div
                role="menu"
                aria-label={t('biblia.anotar')}
                className="absolute bottom-full start-0 z-10 mb-2 w-60 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-1"
                style={{ boxShadow: 'var(--sombra-md)' }}
              >
                {pedeEntrar ? (
                  <Link role="menuitem" href={p.hrefEntrar} className="flex min-h-11 items-center rounded-lg px-3 text-sm text-[var(--text)] hover:bg-[var(--surface)]">
                    {t('biblia.entrar_para_anotar')}
                  </Link>
                ) : (
                  (['nota', 'tcd'] as const).map((d) => (
                    <button
                      key={d}
                      type="button"
                      role="menuitem"
                      autoFocus={d === 'nota'}
                      onClick={() => {
                        setMenuAnotar(false)
                        p.aoAnotar(d)
                      }}
                      className="flex min-h-11 w-full items-center rounded-lg px-3 text-start text-sm text-[var(--text)] hover:bg-[var(--surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                    >
                      {d === 'nota' ? t('biblia.anotar_nova_nota') : t('biblia.anotar_tcd_hoje')}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={p.aoFavoritar}
            aria-pressed={p.todosFavoritos}
            disabled={pedeEntrar}
            title={pedeEntrar ? t('biblia.entrar_para_destacar') : undefined}
            className={`${ALVO} ${p.todosFavoritos ? 'text-[var(--text)]' : ''}`}
          >
            <BookmarkSimple size={18} weight={p.todosFavoritos ? 'fill' : 'regular'} aria-hidden="true" />
            <span>{p.todosFavoritos ? t('biblia.desmarcar_favorito') : t('biblia.favorito')}</span>
          </button>
          <button type="button" onClick={p.aoComparar} aria-pressed={p.comparando} className={ALVO}>
            <ArrowsLeftRight size={18} aria-hidden="true" />
            <span>{t('biblia.comparar')}</span>
          </button>
          <button type="button" onClick={p.aoOriginal} aria-pressed={p.originalAberto} className={ALVO}>
            <Translate size={18} aria-hidden="true" />
            <span>{t('biblia.original')}</span>
          </button>
        </div>
      </div>
    </div>
  )
}

export default BarraVersiculos
