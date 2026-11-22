'use client'

import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react'
import { Hash, NotePencil, Plus } from '@phosphor-icons/react'

export interface ItemSugestao {
  id: string
  rotulo: string
  detalhe?: string
  /** "Criar …": item que cria em vez de escolher um existente */
  criar?: boolean
}

export interface MenuSugestaoProps {
  items: ItemSugestao[]
  tipo: 'ligacao' | 'tag'
  vazio: string
  command: (item: ItemSugestao) => void
}

export interface MenuSugestaoRef {
  onKeyDown: (e: KeyboardEvent) => boolean
}

/** Lista flutuante de sugestões de [[nota]] e #tag (teclado: ↑ ↓ Enter Esc). */
export const MenuSugestao = forwardRef<MenuSugestaoRef, MenuSugestaoProps>(function MenuSugestao(
  { items, tipo, vazio, command },
  ref
) {
  const [indice, setIndice] = useState(0)
  useEffect(() => setIndice(0), [items])

  useImperativeHandle(ref, () => ({
    onKeyDown: (e) => {
      if (!items.length) return false
      if (e.key === 'ArrowDown') {
        setIndice((i) => (i + 1) % items.length)
        return true
      }
      if (e.key === 'ArrowUp') {
        setIndice((i) => (i - 1 + items.length) % items.length)
        return true
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        command(items[indice])
        return true
      }
      return false
    },
  }))

  return (
    <div
      role="listbox"
      className="w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-1 text-[var(--text)]"
      style={{ boxShadow: 'var(--sombra-md)' }}
    >
      {items.length === 0 ? (
        <p className="px-3 py-2 text-sm text-[var(--text-3)]">{vazio}</p>
      ) : (
        items.map((item, i) => {
          const Icone = item.criar ? Plus : tipo === 'tag' ? Hash : NotePencil
          return (
            <button
              key={item.id}
              type="button"
              role="option"
              aria-selected={i === indice}
              onMouseEnter={() => setIndice(i)}
              onMouseDown={(e) => {
                e.preventDefault()
                command(item)
              }}
              className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-start text-sm ${
                i === indice ? 'bg-[var(--surface)] text-[var(--text)]' : 'text-[var(--text-2)]'
              }`}
            >
              <Icone size={15} aria-hidden="true" className="shrink-0 text-[var(--text-3)]" />
              <span className="min-w-0 flex-1 truncate">{item.rotulo}</span>
              {item.detalhe && <span className="shrink-0 text-xs text-[var(--text-3)]">{item.detalhe}</span>}
            </button>
          )
        })
      )}
    </div>
  )
})

export default MenuSugestao
