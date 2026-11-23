'use client'
import React from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { Recuo } from '@/lib/biblia/fontes'
import { versaoPorId } from '@/lib/biblia/versoes'

/** Texto do aviso de recuo ("Entre para ler na NVI. Mostrando a BLIVRE."). */
export function textoRecuo(recuo: Recuo, t: TFunction): string {
  const sigla = versaoPorId(recuo.de)?.sigla ?? recuo.de.toUpperCase()
  const para = versaoPorId(recuo.para)?.sigla ?? recuo.para.toUpperCase()
  const chave =
    recuo.motivo === 'nao_autenticado'
      ? 'biblia.recuo_entrar'
      : recuo.motivo === 'limite_api' || recuo.motivo === 'limite_usuario'
        ? 'biblia.recuo_limite'
        : 'biblia.recuo_indisponivel'
  return t(chave, { sigla, recuo: para })
}

/**
 * Aviso discreto quando a versão pedida (NVI, ARA...) não pôde ser lida e o
 * texto veio da aberta do idioma (BLIVRE). Sem sessão, oferece entrar.
 */
export function AvisoRecuo({ recuo, className = '' }: { recuo: Recuo | null | undefined; className?: string }) {
  const { t } = useTranslation()
  if (!recuo) return null
  return (
    <p role="note" className={`text-xs leading-snug text-[var(--text-3)] ${className}`}>
      {textoRecuo(recuo, t)}
      {recuo.motivo === 'nao_autenticado' && typeof window !== 'undefined' && (
        <>
          {' '}
          <a
            href={`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`}
            className="underline decoration-[var(--link-underline)] underline-offset-2 hover:text-[var(--text-2)]"
          >
            {t('biblia.entrar')}
          </a>
        </>
      )}
    </p>
  )
}

/**
 * Visitante lendo na aberta padrão (BLIVRE) em português: lembra que, com a
 * conta, o padrão é a NVI (decisão N38). Discreto, uma linha.
 */
export function DicaEntrarNvi({ mostrar, className = '' }: { mostrar: boolean; className?: string }) {
  const { t } = useTranslation()
  if (!mostrar) return null
  return (
    <p className={`text-xs leading-snug text-[var(--text-3)] ${className}`}>
      {typeof window !== 'undefined' ? (
        <a
          href={`/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`}
          className="underline decoration-[var(--link-underline)] underline-offset-2 hover:text-[var(--text-2)]"
        >
          {t('biblia.entre_para_nvi')}
        </a>
      ) : (
        t('biblia.entre_para_nvi')
      )}
    </p>
  )
}
