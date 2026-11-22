'use client'

import React, { forwardRef, useEffect, useId, useImperativeHandle, useState } from 'react'
import type { Editor } from '@tiptap/core'
import { ReactRenderer } from '@tiptap/react'
import type { SuggestionKeyDownProps, SuggestionProps } from '@tiptap/suggestion'
import {
  BookOpenText,
  BracketsSquare,
  CalendarBlank,
  CheckSquare,
  CodeBlock,
  FileDashed,
  Hash,
  Image as IconeImagem,
  Lightbulb,
  ListBullets,
  ListNumbers,
  Minus,
  Question,
  Quotes,
  SlidersHorizontal,
  Table,
  TextHOne,
  TextHThree,
  TextHTwo,
  TextT,
  VideoCamera,
} from '@phosphor-icons/react'
import type { IdComando } from '@/lib/caderno/comandos'
import { fecharMenuComandos, type ItemMenuComando } from './barraComandos'

const ICONES: Record<IdComando, typeof TextT> = {
  texto: TextT,
  titulo1: TextHOne,
  titulo2: TextHTwo,
  titulo3: TextHThree,
  lista: ListBullets,
  lista_numerada: ListNumbers,
  tarefas: CheckSquare,
  citacao: Quotes,
  destaque: Lightbulb,
  divisor: Minus,
  codigo: CodeBlock,
  tabela: Table,
  imagem: IconeImagem,
  video: VideoCamera,
  versiculo: BookOpenText,
  ligacao: BracketsSquare,
  tag: Hash,
  data_hoje: CalendarBlank,
  modelo: FileDashed,
  propriedade: SlidersHorizontal,
  guia: Question,
}

export interface TextosMenuComandos {
  rotulo: string
  vazio: string
  dica: string
}

interface MenuComandosProps extends TextosMenuComandos {
  items: ItemMenuComando[]
  command: (item: ItemMenuComando) => void
  editor: Editor
}

export interface MenuComandosRef {
  onKeyDown: (e: KeyboardEvent) => boolean
}

/**
 * Lista do menu "/": listbox com aria-activedescendant no próprio editor (o
 * foco fica no texto, como num combobox). Teclado: ↑ ↓ Home End, Enter/Tab
 * escolhe, Esc fecha.
 */
export const MenuComandos = forwardRef<MenuComandosRef, MenuComandosProps>(function MenuComandos(
  { items, command, editor, rotulo, vazio, dica },
  ref
) {
  const id = useId().replace(/:/g, '')
  const [indice, setIndice] = useState(0)
  useEffect(() => setIndice(0), [items])

  // O editor (contenteditable) é o "combobox": aponta para a opção ativa.
  useEffect(() => {
    const dom = editor.view.dom as HTMLElement
    dom.setAttribute('aria-haspopup', 'listbox')
    dom.setAttribute('aria-expanded', 'true')
    dom.setAttribute('aria-controls', `${id}-lista`)
    dom.setAttribute('aria-autocomplete', 'list')
    return () => {
      for (const a of ['aria-haspopup', 'aria-expanded', 'aria-controls', 'aria-autocomplete', 'aria-activedescendant']) {
        dom.removeAttribute(a)
      }
    }
  }, [editor, id])

  useEffect(() => {
    const dom = editor.view.dom as HTMLElement
    if (items.length) dom.setAttribute('aria-activedescendant', `${id}-op-${indice}`)
    else dom.removeAttribute('aria-activedescendant')
    const el = document.getElementById(`${id}-op-${indice}`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [editor, id, indice, items.length])

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
      if (e.key === 'Home') {
        setIndice(0)
        return true
      }
      if (e.key === 'End') {
        setIndice(items.length - 1)
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
    <div className="flex flex-col">
      <div
        id={`${id}-lista`}
        role="listbox"
        aria-label={rotulo}
        className="p-1"
      >
        {items.length === 0 ? (
          <p className="px-3 py-2.5 text-sm text-[var(--text-3)]">{vazio}</p>
        ) : (
          items.map((item, i) => {
            const Icone = ICONES[item.id] ?? TextT
            const ativo = i === indice
            return (
              <div
                key={item.id}
                id={`${id}-op-${i}`}
                role="option"
                aria-selected={ativo}
                onMouseEnter={() => setIndice(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  command(item)
                }}
                className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2.5 text-sm lg:min-h-10 ${
                  ativo ? 'bg-[var(--surface)] text-[var(--text)]' : 'text-[var(--text-2)]'
                }`}
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--line)] bg-[var(--page)] text-[var(--text-2)]"
                  aria-hidden="true"
                >
                  <Icone size={16} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-[var(--text)]">{item.rotulo}</span>
                  {item.descricao && <span className="block truncate text-xs text-[var(--text-3)]">{item.descricao}</span>}
                </span>
                {item.atalho && (
                  <kbd className="shrink-0 rounded border border-[var(--line)] px-1.5 py-0.5 font-mono text-[0.7rem] text-[var(--text-3)]">
                    {item.atalho}
                  </kbd>
                )}
              </div>
            )
          })
        )}
      </div>
      <p className="border-t border-[var(--line)] px-3 py-2 text-[0.7rem] text-[var(--text-3)]" aria-hidden="true">
        {dica}
      </p>
    </div>
  )
})

/**
 * Desenho do menu para o Suggestion: portal no <body> com posição fixa (a
 * barra/rolagem do editor não recorta o menu no celular), altura limitada à
 * área visível com o teclado aberto (visualViewport) e virando para cima
 * quando falta espaço embaixo — mesma solução do painel "Inserir versículo".
 */
export function renderizadorMenuComandos(textos: () => TextosMenuComandos) {
  return () => {
    let componente: ReactRenderer<MenuComandosRef, MenuComandosProps> | null = null
    let caixa: HTMLDivElement | null = null
    let ultimo: SuggestionProps<ItemMenuComando, ItemMenuComando> | null = null
    let quadro = 0

    const posicionar = () => {
      const r = ultimo?.clientRect?.()
      if (!r || !caixa) return
      const vw = window.innerWidth
      const vv = window.visualViewport
      const topoVisivel = vv ? vv.offsetTop : 0
      const baseVisivel = vv ? vv.offsetTop + vv.height : window.innerHeight
      const largura = Math.min(320, vw - 32)
      const abaixo = baseVisivel - r.bottom - 12
      const acima = r.top - topoVisivel - 12
      const embaixo = abaixo >= 240 || abaixo >= acima
      const alturaMax = Math.max(140, Math.min(400, embaixo ? abaixo : acima))
      caixa.style.width = `${largura}px`
      caixa.style.left = `${Math.min(Math.max(16, r.left), vw - 16 - largura)}px`
      caixa.style.maxHeight = `${alturaMax}px`
      if (embaixo) caixa.style.top = `${r.bottom + 6}px`
      else caixa.style.top = `${Math.max(topoVisivel + 8, r.top - 6 - Math.min(caixa.scrollHeight, alturaMax))}px`
    }
    const agendar = () => {
      cancelAnimationFrame(quadro)
      quadro = requestAnimationFrame(posicionar)
    }
    const foraDoMenu = (e: PointerEvent) => {
      const alvo = e.target as Node
      if (!ultimo || caixa?.contains(alvo) || (ultimo.editor.view.dom as HTMLElement).contains(alvo)) return
      fecharMenuComandos(ultimo.editor, ultimo.range, ultimo.query)
    }
    const ouvir = (ligar: boolean) => {
      const f = ligar ? 'addEventListener' : 'removeEventListener'
      window[f]('resize', agendar)
      window[f]('scroll', agendar, true)
      window.visualViewport?.[f]('resize', agendar)
      window.visualViewport?.[f]('scroll', agendar)
      document[f]('pointerdown', foraDoMenu as EventListener, true)
    }

    return {
      onStart: (props: SuggestionProps<ItemMenuComando, ItemMenuComando>) => {
        ultimo = props
        componente = new ReactRenderer(MenuComandos, {
          props: { ...props, ...textos() },
          editor: props.editor as any,
        })
        caixa = document.createElement('div')
        caixa.className =
          'caderno-menu-comandos caderno-area overflow-y-auto overscroll-contain rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] text-[var(--text)]'
        caixa.style.position = 'fixed'
        caixa.style.zIndex = 'var(--z-popover)'
        caixa.style.boxShadow = 'var(--sombra-md)'
        caixa.appendChild(componente.element)
        document.body.appendChild(caixa)
        posicionar()
        agendar()
        ouvir(true)
      },
      onUpdate: (props: SuggestionProps<ItemMenuComando, ItemMenuComando>) => {
        ultimo = props
        componente?.updateProps({ ...props, ...textos() })
        agendar()
      },
      onKeyDown: ({ event }: SuggestionKeyDownProps) => {
        if (event.key === 'Escape') {
          if (ultimo) fecharMenuComandos(ultimo.editor, ultimo.range, ultimo.query)
          return true
        }
        return componente?.ref?.onKeyDown(event) ?? false
      },
      onExit: () => {
        ouvir(false)
        cancelAnimationFrame(quadro)
        componente?.destroy()
        componente = null
        caixa?.remove()
        caixa = null
        ultimo = null
      },
    }
  }
}
