'use client'

import React from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { X } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'
import { BOTAO_ICONE, SERIF } from './estilos'

interface FolhaInferiorProps {
  aberta: boolean
  aoMudar: (aberta: boolean) => void
  titulo: string
  descricao?: string
  children: React.ReactNode
  /** Largura máxima no desktop, onde a folha vira um diálogo centralizado. */
  larguraDesktop?: 'sm' | 'md'
}

/**
 * Folha que sobe de baixo no celular (zona do polegar) e vira um diálogo
 * centralizado a partir de 1024px. Radix cuida do foco preso, do Esc e do
 * aria-modal; o visual é todo dos tokens da marca.
 */
export function FolhaInferior({
  aberta,
  aoMudar,
  titulo,
  descricao,
  children,
  larguraDesktop = 'sm',
}: FolhaInferiorProps) {
  const { t } = useTranslation()
  return (
    <DialogPrimitive.Root open={aberta} onOpenChange={aoMudar}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="lh-modal-overlay fixed inset-0 bg-black/50"
          style={{ zIndex: 'var(--z-modal-backdrop)' }}
        />
        <DialogPrimitive.Content
          className={`folha-inferior fixed inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)] lg:inset-x-auto lg:bottom-auto lg:left-1/2 lg:top-1/2 lg:w-full lg:-translate-x-1/2 lg:-translate-y-1/2 lg:rounded-2xl lg:border ${
            larguraDesktop === 'md' ? 'lg:max-w-lg' : 'lg:max-w-md'
          }`}
          style={{
            zIndex: 'var(--z-modal)',
            boxShadow: 'var(--sombra-lg)',
            paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
          }}
        >
          {/* Alça: só um sinal visual de que a folha é arrastável/fechável. */}
          <div className="flex justify-center pt-2 lg:hidden" aria-hidden="true">
            <span className="h-1 w-10 rounded-full bg-[var(--line-strong)]" />
          </div>
          <div className="flex items-start justify-between gap-3 px-5 pt-3 lg:pt-5">
            <div className="min-w-0">
              <DialogPrimitive.Title className="text-xl leading-tight text-[var(--text)]" style={SERIF}>
                {titulo}
              </DialogPrimitive.Title>
              {descricao ? (
                <DialogPrimitive.Description className="mt-1 text-sm text-[var(--text-2)]">
                  {descricao}
                </DialogPrimitive.Description>
              ) : (
                <DialogPrimitive.Description className="sr-only">{titulo}</DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close className={`${BOTAO_ICONE} -me-2 -mt-1`} aria-label={t('nav.fechar')}>
              <X size={20} aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="px-5 pb-1 pt-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export default FolhaInferior
