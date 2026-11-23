'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/**
 * 404 do Discipulei: textos do i18n (erros.not_found), tokens P&B e nada da
 * marca LearnHouse. Antes era o 404 do LMS, em inglês e com o logo dele.
 */
export default function NotFound() {
  const { t } = useTranslation()
  const titulo = t('erros.not_found.titulo', { defaultValue: 'Não encontramos isso' })

  useEffect(() => {
    document.title = `${titulo} — Discipulei`
  }, [titulo])

  return (
    <main className="flex min-h-screen w-full flex-col items-center justify-center bg-[var(--page)] px-4 text-center">
      <p className="font-serif text-7xl text-[var(--text)]" aria-hidden="true">
        404
      </p>
      <h1 className="mt-6 text-2xl font-semibold text-[var(--text)]">{titulo}</h1>
      <p className="mt-3 max-w-md text-base leading-relaxed text-[var(--text-2)]">
        {t('erros.not_found.descricao', {
          defaultValue:
            'O que você procura pode ter sido movido, apagado ou não estar disponível para você. Não foi nada que você fez de errado.',
        })}
      </p>
      <Link
        href="/"
        className="mt-8 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--cta-bg)] px-6 text-base font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)]"
      >
        {t('erros.acoes.inicio', { defaultValue: 'Início' })}
        <ArrowRight size={18} aria-hidden="true" className="rtl:rotate-180" />
      </Link>
    </main>
  )
}
