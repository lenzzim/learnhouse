'use client'

/**
 * Mostrar/ocultar senha (Discipulei, item 1.7). Envolve o campo e põe um botão
 * de olho por cima, à direita (à esquerda em RTL), com `aria-pressed` e rótulo
 * acessível. Render-prop para servir tanto ao `Form.Control asChild` do Radix
 * (login, cadastro, redefinição) quanto aos campos do Formik (troca de senha):
 *
 *   <VerSenha>{(tipo) => <input type={tipo} className="... pe-12" />}</VerSenha>
 *
 * O campo precisa de `pe-12` para o texto não passar por baixo do botão.
 */

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Eye, EyeSlash } from '@phosphor-icons/react'

export function VerSenha({
  children,
  className = '',
}: {
  children: (tipo: 'text' | 'password') => React.ReactNode
  className?: string
}) {
  const { t } = useTranslation()
  const [visivel, setVisivel] = useState(false)
  return (
    <div className={`relative ${className}`}>
      {children(visivel ? 'text' : 'password')}
      <button
        type="button"
        onClick={() => setVisivel((v) => !v)}
        aria-pressed={visivel}
        aria-label={visivel ? t('auth.ocultar_senha') : t('auth.mostrar_senha')}
        title={visivel ? t('auth.ocultar_senha') : t('auth.mostrar_senha')}
        className="absolute end-0 top-0 inline-flex h-[44px] w-11 items-center justify-center rounded-e-lg text-neutral-500 hover:text-neutral-900 outline-none focus-visible:ring-2 focus-visible:ring-black/30"
      >
        {visivel ? <EyeSlash size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
      </button>
    </div>
  )
}

export default VerSenha
