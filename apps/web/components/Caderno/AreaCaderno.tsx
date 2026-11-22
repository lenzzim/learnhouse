'use client'

import React, { useEffect, useState } from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useTranslation } from 'react-i18next'
import { X } from '@phosphor-icons/react'
import { BOTAO_ICONE } from '@components/Discipulei/Navegacao/estilos'
import { CadernoProvider, useCaderno } from './CadernoContexto'
import { PainelEsquerdo } from './PainelEsquerdo'
import { PainelDireito } from './PainelDireito'
import { ImportarProvider } from './Importar'
import Link from 'next/link'
import { getUriWithOrg } from '@services/config/config'
import { BOTAO_PRIMARIO, SERIF } from './estilos'

/** true quando a media query casa (false no servidor e no 1º render). */
export function useMidia(query: string): boolean {
  const [casa, setCasa] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const atualizar = () => setCasa(mq.matches)
    atualizar()
    mq.addEventListener('change', atualizar)
    return () => mq.removeEventListener('change', atualizar)
  }, [query])
  return casa
}

export const MQ_DESKTOP = '(min-width: 1024px)'
export const MQ_LARGO = '(min-width: 1440px)'

/** Gaveta lateral (celular/tablet): Radix cuida de foco, Esc e aria-modal. */
function Gaveta({
  aberta,
  aoMudar,
  lado,
  titulo,
  children,
}: {
  aberta: boolean
  aoMudar: (v: boolean) => void
  lado: 'inicio' | 'fim'
  titulo: string
  children: React.ReactNode
}) {
  const { t } = useTranslation()
  return (
    <DialogPrimitive.Root open={aberta} onOpenChange={aoMudar}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="lh-modal-overlay fixed inset-0 bg-black/50" style={{ zIndex: 'var(--z-modal-backdrop)' }} />
        <DialogPrimitive.Content
          className={`gaveta-caderno fixed inset-y-0 flex w-[min(22rem,88vw)] flex-col bg-[var(--panel)] text-[var(--text)] ${
            lado === 'inicio' ? 'start-0 border-e' : 'end-0 border-s'
          } border-[var(--line-strong)]`}
          data-lado={lado}
          style={{ zIndex: 'var(--z-modal)', boxShadow: 'var(--sombra-lg)' }}
        >
          <div className="flex items-center justify-between gap-2 border-b border-[var(--line)] ps-4 pe-1">
            <DialogPrimitive.Title className="text-sm font-semibold text-[var(--text)]">{titulo}</DialogPrimitive.Title>
            <DialogPrimitive.Description className="sr-only">{titulo}</DialogPrimitive.Description>
            <DialogPrimitive.Close className={BOTAO_ICONE} aria-label={t('nav.fechar')}>
              <X size={18} aria-hidden="true" />
            </DialogPrimitive.Close>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * Área de 3 painéis do Caderno, no estilo Obsidian:
 * - >= 1440px: esquerda (navegação) + centro (editor) + direita (Bíblia, Strong…).
 * - 1024–1439px: dois por vez; abrir o painel direito recolhe o esquerdo.
 * - < 1024px: só o centro; os painéis viram gavetas. A barra de abas do shell fica.
 */
function Paineis({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const c = useCaderno()
  const desktop = useMidia(MQ_DESKTOP)
  const largo = useMidia(MQ_LARGO)

  // Na tela larga o painel direito começa aberto.
  useEffect(() => {
    if (largo) c.setDireitaAberta(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [largo])

  // Ao virar desktop, as gavetas do celular fecham.
  useEffect(() => {
    if (desktop) c.setEsquerdaAberta(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desktop])

  if (c.statusSessao === 'unauthenticated') {
    return (
      <div className="flex flex-1 flex-col items-start justify-center gap-4 px-6 py-16 sm:mx-auto sm:max-w-md">
        <p className="text-2xl text-[var(--text)]" style={SERIF}>{t('caderno.titulo')}</p>
        <p className="text-sm leading-relaxed text-[var(--text-2)]">{t('caderno.entre_para_usar')}</p>
        <Link href={getUriWithOrg(c.orgslug, '/login')} className={`${BOTAO_PRIMARIO} min-h-11 px-5 text-sm`}>
          {t('auth.login')}
        </Link>
      </div>
    )
  }

  const esquerdaDocada = desktop && (largo || !c.direitaAberta)
  const direitaDocada = desktop && c.direitaAberta

  return (
    <div
      className="caderno-area flex min-h-0 w-full bg-[var(--page)]"
      style={{ height: 'calc(100dvh - var(--altura-topo-caderno) - var(--altura-barra-inferior, 0px))' }}
    >
      {esquerdaDocada && (
        <aside
          aria-label={t('caderno.painel_navegacao')}
          className="flex w-64 shrink-0 flex-col overflow-y-auto border-e border-[var(--line)] bg-[var(--panel)]"
        >
          <PainelEsquerdo />
        </aside>
      )}

      <main className="flex min-w-0 flex-1 flex-col">{children}</main>

      {direitaDocada && (
        <aside
          aria-label={t('caderno.painel_estudo')}
          className="flex w-[22rem] shrink-0 flex-col border-s border-[var(--line)] bg-[var(--panel)]"
        >
          <PainelDireito />
        </aside>
      )}

      {!desktop && (
        <>
          <Gaveta aberta={c.esquerdaAberta} aoMudar={c.setEsquerdaAberta} lado="inicio" titulo={t('caderno.titulo')}>
            <PainelEsquerdo />
          </Gaveta>
          <Gaveta aberta={c.direitaAberta} aoMudar={c.setDireitaAberta} lado="fim" titulo={t('caderno.painel_estudo')}>
            <PainelDireito />
          </Gaveta>
        </>
      )}
    </div>
  )
}

export function AreaCaderno({ orgslug, children }: { orgslug: string; children: React.ReactNode }) {
  return (
    <CadernoProvider orgslug={orgslug}>
      <ImportarProvider>
        <Paineis>{children}</Paineis>
      </ImportarProvider>
    </CadernoProvider>
  )
}

export default AreaCaderno
