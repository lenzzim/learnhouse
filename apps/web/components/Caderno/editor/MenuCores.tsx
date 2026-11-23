'use client'

import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Check } from '@phosphor-icons/react'
import { CORES, type Cor } from '@/lib/caderno/cores'
import { FOCO } from '../estilos'

/**
 * Botão da barra que abre a paleta (marca-texto ou cor do texto).
 *
 * A paleta vai para um portal com posição fixa: a barra do celular rola de
 * lado (overflow) e recortaria o menu, como acontecia com o painel do
 * versículo. Cada tom tem nome visível e para leitor de tela; "Sem marca" /
 * "Sem cor" tira a marca.
 */
export function MenuCores({
  tipo,
  ativa,
  aoEscolher,
  rotulo,
  icone,
  abrirSinal = 0,
  classeBotao,
}: {
  tipo: 'marca' | 'cor'
  /** Tom aplicado na seleção (null = nenhum). */
  ativa: Cor | null
  aoEscolher: (cor: Cor | null) => void
  rotulo: string
  icone: React.ReactNode
  /** Muda (incrementa) para abrir pelo menu "/". */
  abrirSinal?: number
  classeBotao: string
}) {
  const { t } = useTranslation()
  const [aberto, setAberto] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const botaoRef = useRef<HTMLButtonElement | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const id = useId()

  useEffect(() => {
    if (abrirSinal > 0) setAberto(true)
  }, [abrirSinal])

  useLayoutEffect(() => {
    if (!aberto) {
      setPos(null)
      return
    }
    const calcular = () => {
      const r = botaoRef.current?.getBoundingClientRect()
      if (!r) return
      const largura = 216
      setPos({ top: r.bottom + 6, left: Math.max(12, Math.min(r.left, window.innerWidth - 12 - largura)) })
    }
    calcular()
    window.addEventListener('resize', calcular)
    window.addEventListener('scroll', calcular, true)
    return () => {
      window.removeEventListener('resize', calcular)
      window.removeEventListener('scroll', calcular, true)
    }
  }, [aberto])

  useEffect(() => {
    if (!aberto) return
    const fora = (e: PointerEvent) => {
      const alvo = e.target as Node
      if (!menuRef.current?.contains(alvo) && !botaoRef.current?.contains(alvo)) setAberto(false)
    }
    document.addEventListener('pointerdown', fora)
    return () => document.removeEventListener('pointerdown', fora)
  }, [aberto])

  // foco no tom ativo (ou no primeiro) ao abrir
  useEffect(() => {
    if (!aberto || !pos) return
    const alvo = menuRef.current?.querySelector<HTMLButtonElement>('[aria-checked="true"]') ?? menuRef.current?.querySelector<HTMLButtonElement>('button')
    alvo?.focus()
  }, [aberto, pos])

  const fechar = (devolverFoco = true) => {
    setAberto(false)
    if (devolverFoco) botaoRef.current?.focus()
  }

  const escolher = (cor: Cor | null) => {
    aoEscolher(cor)
    fechar(false)
  }

  const nomeTom = (cor: Cor) => t(`caderno_editor.cores.${cor}`)
  const opcoes: (Cor | null)[] = [...CORES, null]

  return (
    <>
      <button
        ref={botaoRef}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => setAberto((a) => !a)}
        aria-label={ativa ? `${rotulo}: ${nomeTom(ativa)}` : rotulo}
        title={rotulo}
        aria-haspopup="menu"
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        className={`${classeBotao} relative ${ativa ? 'bg-[var(--surface)] text-[var(--text)]' : ''}`}
      >
        {icone}
        <span
          aria-hidden="true"
          data-cor={ativa ?? undefined}
          className={`absolute inset-x-2.5 bottom-1.5 h-[3px] rounded-full ${tipo === 'marca' ? 'caderno-amostra-marca' : 'caderno-amostra-cor'} ${ativa ? '' : 'opacity-0'}`}
        />
      </button>
      {aberto &&
        pos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            id={id}
            role="menu"
            aria-label={rotulo}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault()
                e.stopPropagation()
                fechar()
              } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                const itens = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])
                const i = itens.indexOf(document.activeElement as HTMLButtonElement)
                itens[(i + (e.key === 'ArrowDown' ? 1 : -1) + itens.length) % itens.length]?.focus()
              }
            }}
            style={{ position: 'fixed', top: pos.top, left: pos.left, width: 216, boxShadow: 'var(--sombra-md)' }}
            className="z-[70] rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-1 text-[var(--text)]"
          >
            {opcoes.map((cor) => {
              const marcada = cor === ativa || (cor === null && ativa === null)
              const nome = cor ? nomeTom(cor) : tipo === 'marca' ? t('caderno_editor.sem_marca') : t('caderno_editor.sem_cor')
              return (
                <button
                  key={cor ?? 'nenhuma'}
                  type="button"
                  role="menuitemradio"
                  aria-checked={marcada}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => escolher(cor)}
                  className={`flex min-h-11 w-full items-center gap-2.5 rounded-lg px-2.5 text-start text-sm text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)] lg:min-h-9 ${FOCO}`}
                >
                  {cor ? (
                    tipo === 'marca' ? (
                      <mark data-cor={cor} className="caderno-marca-amostra rounded px-1.5 font-serif text-[0.95rem] text-[var(--text)]" aria-hidden="true">
                        Aa
                      </mark>
                    ) : (
                      <span data-cor={cor} className="caderno-cor-amostra w-[2.1rem] text-center font-serif text-[0.95rem] font-semibold" aria-hidden="true">
                        Aa
                      </span>
                    )
                  ) : (
                    <span className="w-[2.1rem] text-center font-serif text-[0.95rem] text-[var(--text-3)] line-through" aria-hidden="true">
                      Aa
                    </span>
                  )}
                  <span className="flex-1">{nome}</span>
                  {marcada && <Check size={14} aria-hidden="true" />}
                </button>
              )
            })}
          </div>,
          document.body
        )}
    </>
  )
}

export default MenuCores
