'use client'

import Link from 'next/link'
import { Lock, SearchX } from 'lucide-react'

export type AcaoSemAcesso = {
  label: string
  href?: string
  onClick?: () => void
  principal?: boolean
}

/**
 * Estado de "sem acesso" ou "não encontrado" do Aprender (curso e aula).
 * Substitui o esqueleto de carregamento quando a busca falha, para a pessoa
 * nunca ficar olhando um esqueleto sem fim. P&B, só com os tokens da marca.
 */
export default function SemAcesso({
  titulo,
  texto,
  acoes,
  tipo = 'acesso',
}: {
  titulo: string
  texto: string
  acoes: AcaoSemAcesso[]
  tipo?: 'acesso' | 'erro'
}) {
  const Icone = tipo === 'acesso' ? Lock : SearchX
  const classe = (principal?: boolean) =>
    principal
      ? 'inline-flex min-h-11 items-center justify-center rounded-full bg-[var(--cta-bg)] px-5 text-sm font-semibold text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)]'
      : 'inline-flex min-h-11 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--panel)] px-5 text-sm font-semibold text-[var(--text)] hover:bg-[var(--surface)]'
  return (
    <div
      role="alert"
      data-sem-acesso={tipo}
      className="mx-auto my-12 max-w-xl rounded-[var(--radius-card)] border border-[var(--line)] bg-[var(--panel)] p-8 text-center"
    >
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface)]">
        <Icone className="text-[var(--text-2)]" size={24} aria-hidden="true" />
      </div>
      <h1 className="mb-2 text-xl font-semibold text-[var(--text)]">{titulo}</h1>
      <p className="mb-6 text-sm leading-relaxed text-[var(--text-2)]">{texto}</p>
      <div className="flex flex-col justify-center gap-2 sm:flex-row">
        {acoes.map((a) =>
          a.href ? (
            <Link key={a.label} href={a.href} className={classe(a.principal)}>
              {a.label}
            </Link>
          ) : (
            <button key={a.label} type="button" onClick={a.onClick} className={classe(a.principal)}>
              {a.label}
            </button>
          )
        )}
      </div>
    </div>
  )
}
