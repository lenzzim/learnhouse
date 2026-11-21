'use client'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { ehNovoTestamento, type PalavraOriginal } from '@/lib/biblia/original'

// Pilhas de fontes do sistema com bom suporte a sinais (não baixamos fontes).
export const FONTE_HEBRAICO =
  "'SBL Hebrew', 'Ezra SIL', 'Taamey Frank CLM', 'Noto Serif Hebrew', 'Frank Ruehl CLM', 'David', 'Times New Roman', serif"
export const FONTE_GREGO =
  "'SBL Greek', 'Gentium Plus', 'Gentium', 'Noto Serif', 'Palatino Linotype', var(--font-serif), 'Times New Roman', serif"

/**
 * Palavras de um versículo no original: hebraico (RTL) ou grego, com
 * transliteração e glosa embaixo. Cada palavra é um botão que abre o verbete.
 */
export function OriginalVerso({
  palavras,
  titulo,
  onPalavra,
}: {
  palavras: PalavraOriginal[]
  /** palavras do título do salmo (versículo 0), mostradas antes */
  titulo?: PalavraOriginal[]
  onPalavra: (p: PalavraOriginal) => void
}) {
  const { t } = useTranslation()
  if (!palavras.length && !titulo?.length) {
    return <p className="my-2 text-xs text-[var(--text-3)]">{t('biblia.original_indisponivel')}</p>
  }
  const nt = palavras.length ? ehNovoTestamento(palavras[0]) : false
  const lista = (ps: PalavraOriginal[]) => (
    <div
      dir={nt ? 'ltr' : 'rtl'}
      lang={nt ? 'grc' : 'hbo'}
      className="flex flex-wrap gap-x-1 gap-y-1.5"
    >
      {ps.map((p, i) => {
        const marca = ehNovoTestamento(p) ? p[6] : ''
        return (
          <button
            key={i}
            type="button"
            onClick={() => onPalavra(p)}
            title={marca === 'N' ? t('biblia.so_na') : marca === 'K' ? t('biblia.so_tr') : `${p[2]} · ${p[4]}`}
            className={`flex min-w-[2.5rem] flex-col items-center rounded-lg px-1.5 py-1 text-center transition-colors hover:bg-[var(--surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${
              marca ? 'border border-dashed border-[var(--line-strong)]' : ''
            }`}
          >
            <span className="text-[1.35rem] leading-snug text-[var(--text)]" style={{ fontFamily: nt ? FONTE_GREGO : FONTE_HEBRAICO }}>
              {p[0]}
            </span>
            <span dir="ltr" className="font-sans text-[0.7rem] text-[var(--text-2)]">
              {p[1]}
            </span>
            <span dir="ltr" className="max-w-[9rem] font-sans text-[0.7rem] leading-tight text-[var(--text-3)]">
              {p[4]}
              {marca && <sup className="ms-0.5">{marca === 'N' ? 'NA' : 'TR'}</sup>}
            </span>
          </button>
        )
      })}
    </div>
  )
  return (
    <div className="my-3 rounded-xl border border-[var(--line)] bg-[var(--panel)] p-2.5">
      <p className="mb-1.5 font-sans text-[0.7rem] uppercase tracking-wide text-[var(--text-3)]">
        {nt ? t('biblia.grego') : t('biblia.hebraico')}
      </p>
      {titulo && titulo.length > 0 && (
        <div className="mb-2 border-b border-[var(--line)] pb-2">
          <p className="mb-1 font-sans text-[0.7rem] text-[var(--text-3)]">{t('biblia.titulo_salmo')}</p>
          {lista(titulo)}
        </div>
      )}
      {lista(palavras)}
    </div>
  )
}

export default OriginalVerso
