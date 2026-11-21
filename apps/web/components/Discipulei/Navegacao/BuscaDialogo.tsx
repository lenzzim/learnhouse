'use client'

import React, { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { ArrowUpRight, Hash, Lock, MagnifyingGlass, Note } from '@phosphor-icons/react'
import { getUriWithOrg } from '@services/config/config'
import { searchMatchesAny } from '@/lib/search/normalize'
import { useDadosNav } from './useDadosNav'
import { FOCO, caminhoDiscussao, semPrefixo } from './estilos'

interface BuscaDialogoProps {
  orgslug: string
  aberta: boolean
  aoMudar: (aberta: boolean) => void
}

/** "⌘K" no Mac, "Ctrl K" no resto (só para o rótulo do atalho). */
export function rotuloAtalhoBusca(): string {
  if (typeof navigator === 'undefined') return 'Ctrl K'
  const plataforma = (navigator as any).userAgentData?.platform || navigator.platform || ''
  return /mac|iphone|ipad/i.test(plataforma) ? '⌘K' : 'Ctrl K'
}

/**
 * Busca rápida do shell. Enquanto a pessoa digita, filtra no navegador as
 * comunidades e as notas recentes que a navegação já carregou; Enter abre a
 * busca completa que já existe (/search?q=), com discussões e pessoas.
 */
export function BuscaDialogo({ orgslug, aberta, aoMudar }: BuscaDialogoProps) {
  const { t } = useTranslation()
  const router = useRouter()
  const { comunidades, notasRecentes } = useDadosNav()
  const [termo, setTermo] = useState('')

  const fechar = () => {
    aoMudar(false)
    setTermo('')
  }

  const achados = useMemo(() => {
    const q = termo.trim()
    if (!q) return { comunidades: comunidades.slice(0, 5), notas: notasRecentes.slice(0, 3) }
    return {
      comunidades: comunidades.filter((c) => searchMatchesAny([c.name, c.description], q)).slice(0, 5),
      notas: notasRecentes.filter((n) => searchMatchesAny([n.title], q)).slice(0, 3),
    }
  }, [termo, comunidades, notasRecentes])

  const buscarTudo = (e: React.FormEvent) => {
    e.preventDefault()
    const q = termo.trim()
    if (!q) return
    fechar()
    router.push(getUriWithOrg(orgslug, `/search?q=${encodeURIComponent(q)}`))
  }

  const linha =
    `flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm text-[var(--text)] hover:bg-[var(--surface)] ${FOCO}`

  return (
    <DialogPrimitive.Root open={aberta} onOpenChange={(v) => (v ? aoMudar(true) : fechar())}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="lh-modal-overlay fixed inset-0 bg-black/50"
          style={{ zIndex: 'var(--z-modal-backdrop)' }}
        />
        <DialogPrimitive.Content
          className="fixed inset-x-3 top-3 mx-auto max-w-xl overflow-hidden rounded-2xl border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] sm:top-[12vh]"
          style={{ zIndex: 'var(--z-modal)', boxShadow: 'var(--sombra-lg)' }}
        >
          <DialogPrimitive.Title className="sr-only">{t('nav.buscar')}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">{t('nav.busca.descricao')}</DialogPrimitive.Description>
          <form onSubmit={buscarTudo} role="search" className="flex items-center gap-3 border-b border-[var(--line)] px-4 focus-within:border-[var(--line-strong)]">
            <MagnifyingGlass size={20} aria-hidden="true" className="shrink-0 text-[var(--text-3)]" />
            <input
              autoFocus
              type="search"
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder={t('nav.busca.placeholder')}
              aria-label={t('nav.buscar')}
              enterKeyHint="search"
              // O contorno global de foco (discipulei-dark.css) não cabe aqui: o campo
              // é o próprio diálogo e já abre focado.
              style={{ outline: 'none' }}
              className="h-14 min-w-0 flex-1 border-0 bg-transparent text-base text-[var(--text)] placeholder:text-[var(--text-3)] shadow-none outline-none ring-0 focus:border-0 focus:shadow-none focus:outline-none focus:ring-0 focus-visible:outline-none"
            />
            <kbd className="hidden shrink-0 rounded border border-[var(--line-strong)] px-1.5 py-0.5 font-sans text-xs text-[var(--text-3)] sm:inline">
              Esc
            </kbd>
          </form>

          <div className="max-h-[60dvh] overflow-y-auto p-2">
            {termo.trim() && (
              <button type="button" onClick={buscarTudo} className={`${linha} w-full text-start`}>
                <MagnifyingGlass size={18} aria-hidden="true" className="shrink-0 text-[var(--text-2)]" />
                <span className="min-w-0 flex-1 truncate">
                  {t('nav.busca.buscar_por', { termo: termo.trim() })}
                </span>
                <span className="shrink-0 text-xs text-[var(--text-3)]">Enter</span>
              </button>
            )}

            {achados.comunidades.length > 0 && (
              <section aria-label={t('nav.comunidades')} className="mt-1">
                <h2 className="px-3 pb-1 pt-2 font-sans text-xs font-medium text-[var(--text-3)]" style={{ fontFamily: 'inherit' }}>
                  {t('nav.comunidades')}
                </h2>
                <ul>
                  {achados.comunidades.map((c) => (
                    <li key={c.community_uuid}>
                      <Link
                        href={getUriWithOrg(orgslug, `/community/${semPrefixo(c.community_uuid, 'community_')}`)}
                        onClick={fechar}
                        className={linha}
                      >
                        {c.public ? (
                          <Hash size={18} aria-hidden="true" className="shrink-0 text-[var(--text-2)]" />
                        ) : (
                          <Lock size={18} aria-label={t('nav.restrita')} className="shrink-0 text-[var(--text-2)]" />
                        )}
                        <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {achados.notas.length > 0 && (
              <section aria-label={t('nav.notas_recentes')} className="mt-1">
                <h2 className="px-3 pb-1 pt-2 font-sans text-xs font-medium text-[var(--text-3)]" style={{ fontFamily: 'inherit' }}>
                  {t('nav.notas_recentes')}
                </h2>
                <ul>
                  {achados.notas.map((n) => (
                    <li key={n.discussion_uuid}>
                      <Link
                        href={getUriWithOrg(orgslug, caminhoDiscussao(n.community_uuid, n.discussion_uuid))}
                        onClick={fechar}
                        className={linha}
                      >
                        <Note size={18} aria-hidden="true" className="shrink-0 text-[var(--text-2)]" />
                        <span className="min-w-0 flex-1 truncate" dir="auto">{n.title}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {termo.trim() && achados.comunidades.length === 0 && achados.notas.length === 0 && (
              <p className="px-3 py-3 text-sm text-[var(--text-2)]">{t('nav.busca.nada_rapido')}</p>
            )}

            {!termo.trim() && (
              <p className="flex items-center gap-1.5 px-3 pb-2 pt-3 text-xs text-[var(--text-3)]">
                <ArrowUpRight size={14} aria-hidden="true" />
                {t('nav.busca.dica')}
              </p>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export default BuscaDialogo
