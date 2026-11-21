'use client'
import React, { useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { ExternalLink } from 'lucide-react'
import type { Referencia } from '@/lib/biblia/referencias'
import { VERSOES_EXTERNAS, urlYouVersion } from '@/lib/biblia/versoes'

/**
 * "Ler em outra tradução": links para a mesma passagem na YouVersion
 * (NVI, ARA, ARC, NTLH, NAA). Essas versões são protegidas e NÃO são
 * embutidas aqui — só o link, em nova aba.
 * `flutuante`: a lista abre sobre o conteúdo (leitor); senão empurra para
 * baixo (popover, onde não há espaço para outra camada).
 */
export function OutrasTraducoes({ referencia, flutuante = false }: { referencia: Referencia; flutuante?: boolean }) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDetailsElement | null>(null)

  // clique fora fecha (o <details> nativo não fecha sozinho)
  useEffect(() => {
    const onFora = (e: PointerEvent) => {
      const el = ref.current
      if (el?.open && !el.contains(e.target as Node)) el.open = false
    }
    document.addEventListener('pointerdown', onFora)
    return () => document.removeEventListener('pointerdown', onFora)
  }, [])

  return (
    <details ref={ref} className={`group ${flutuante ? 'relative' : ''}`}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-xs text-[var(--text-2)] underline decoration-dotted decoration-[var(--link-underline)] underline-offset-2 hover:text-[var(--text)] [&::-webkit-details-marker]:hidden">
        {t('biblia.outras_traducoes')}
        <span aria-hidden="true" className="transition-transform group-open:rotate-180">▾</span>
      </summary>
      <ul
        className={
          flutuante
            ? 'absolute end-0 z-20 mt-2 w-64 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-1.5 shadow-[var(--sombra-md)]'
            : 'mt-1.5 flex flex-wrap gap-x-3 gap-y-1'
        }
      >
        {VERSOES_EXTERNAS.map((v) => (
          <li key={v.sigla}>
            <a
              href={urlYouVersion(referencia, v)}
              target="_blank"
              rel="noopener noreferrer"
              title={`${v.nome} — ${t('biblia.abre_youversion')}`}
              className={
                flutuante
                  ? 'flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-sm text-[var(--text)] hover:bg-[var(--surface)]'
                  : 'inline-flex items-center gap-1 text-xs text-[var(--text)] underline decoration-[var(--link-underline)] underline-offset-2'
              }
            >
              <span>
                {flutuante ? (
                  <>
                    <span className="font-medium">{v.sigla}</span>{' '}
                    <span className="text-[var(--text-3)]">{v.nome}</span>
                  </>
                ) : (
                  v.sigla
                )}
              </span>
              <ExternalLink size={12} aria-hidden="true" className="shrink-0 text-[var(--text-3)]" />
            </a>
          </li>
        ))}
        {flutuante && (
          <li className="px-2.5 pb-1 pt-1.5 text-[0.7rem] text-[var(--text-3)]">{t('biblia.abre_youversion')}</li>
        )}
      </ul>
    </details>
  )
}

export default OutrasTraducoes
