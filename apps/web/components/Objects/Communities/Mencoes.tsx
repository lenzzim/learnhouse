'use client'

/**
 * Menções @nome (decisão N39) no editor de discussões e na caixa de comentário.
 *
 * Sem dependência nova: no editor (tiptap) usa o `@tiptap/suggestion`, que já
 * está no projeto; na caixa de comentário, um detector simples do "@" antes do
 * cursor. Nos dois casos a menção entra como texto ("@usuario "), então o
 * conteúdo continua legível em qualquer leitor e o servidor encontra as
 * menções no texto. A lista só traz quem pode ler o espaço (o servidor filtra
 * em /social/mentionable) e nunca mostra e-mail.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import Suggestion, { type SuggestionProps, type SuggestionKeyDownProps } from '@tiptap/suggestion'
import { candidatosMencao, nomeDaPessoa, type CandidatoMencao } from '@services/communities/social'

export interface ContextoMencao {
  communityUuid: string
  discussionUuid?: string
}

// Cache curto por espaço + termo: cada tecla não precisa ir ao servidor.
const cache = new Map<string, { quando: number; itens: CandidatoMencao[] }>()
const VALIDADE_MS = 60_000

export async function buscarCandidatos(ctx: ContextoMencao, termo: string, token?: string): Promise<CandidatoMencao[]> {
  if (!token || !ctx.communityUuid) return []
  const chave = `${ctx.communityUuid}|${ctx.discussionUuid ?? ''}|${termo.toLowerCase()}`
  const guardado = cache.get(chave)
  if (guardado && Date.now() - guardado.quando < VALIDADE_MS) return guardado.itens
  try {
    const itens = await candidatosMencao(ctx.communityUuid, termo, ctx.discussionUuid, token)
    cache.set(chave, { quando: Date.now(), itens })
    return itens
  } catch {
    return []
  }
}

// ---------------------------------------------------------------------------
// Lista (popup)
// ---------------------------------------------------------------------------

export interface EstadoLista {
  itens: CandidatoMencao[]
  ativo: number
  /** Retângulo do cursor, em coordenadas da janela. */
  rect: { left: number; top: number; bottom: number } | null
  escolher: (c: CandidatoMencao) => void
}

export function ListaMencoes({ estado, id }: { estado: EstadoLista | null; id: string }) {
  const { t } = useTranslation()
  if (!estado || !estado.rect || typeof document === 'undefined') return null
  const largura = Math.min(288, window.innerWidth - 24)
  const left = Math.max(12, Math.min(estado.rect.left, window.innerWidth - largura - 12))
  const abaixo = estado.rect.bottom + 6
  const cabeAbaixo = abaixo + 240 < window.innerHeight
  const estilo: React.CSSProperties = {
    position: 'fixed',
    left,
    width: largura,
    zIndex: 'var(--z-popover, 1000)' as unknown as number,
    ...(cabeAbaixo ? { top: abaixo } : { bottom: window.innerHeight - estado.rect.top + 6 }),
  }
  return createPortal(
    <div
      style={estilo}
      className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-lg"
    >
      {estado.itens.length === 0 ? (
        <p className="px-3 py-3 text-sm text-[var(--text-2)]">{t('social.mencoes.ninguem')}</p>
      ) : (
        <ul id={id} role="listbox" aria-label={t('social.mencoes.rotulo')} className="max-h-60 overflow-y-auto py-1">
          {estado.itens.map((c, i) => (
            <li key={c.user_uuid} role="option" aria-selected={i === estado.ativo}>
              <button
                type="button"
                // mousedown: escolhe antes de o editor perder o foco.
                onMouseDown={(e) => {
                  e.preventDefault()
                  estado.escolher(c)
                }}
                className={`flex min-h-11 w-full items-center gap-2 px-3 text-start text-sm ${
                  i === estado.ativo ? 'bg-[var(--surface)] text-[var(--text)]' : 'text-[var(--text-2)]'
                }`}
              >
                <span className="truncate font-medium text-[var(--text)]">{nomeDaPessoa(c)}</span>
                <span className="truncate text-xs text-[var(--text-3)]">@{c.username}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>,
    document.body
  )
}

// ---------------------------------------------------------------------------
// Editor tiptap
// ---------------------------------------------------------------------------

const chaveMencoes = new PluginKey('discipuleiMencoes')

/**
 * Extensão de menções para o tiptap. `aoMudar` recebe o estado da lista (ou
 * null quando ela fecha); quem monta o editor desenha <ListaMencoes>.
 */
export function criarExtensaoMencoes(opcoes: {
  buscar: (termo: string) => Promise<CandidatoMencao[]>
  aoMudar: (estado: EstadoLista | null) => void
}) {
  return Extension.create({
    name: 'discipuleiMencoes',
    addProseMirrorPlugins() {
      let atual: { props: SuggestionProps<CandidatoMencao>; ativo: number } | null = null
      const publicar = () => {
        if (!atual) {
          opcoes.aoMudar(null)
          return
        }
        const r = atual.props.clientRect?.()
        const p = atual.props
        opcoes.aoMudar({
          itens: p.items,
          ativo: atual.ativo,
          rect: r ? { left: r.left, top: r.top, bottom: r.bottom } : null,
          escolher: (c) => p.command(c),
        })
      }
      return [
        Suggestion<CandidatoMencao>({
          editor: this.editor,
          pluginKey: chaveMencoes,
          char: '@',
          allowSpaces: false,
          debounce: 150,
          items: ({ query }) => opcoes.buscar(query),
          command: ({ editor, range, props }) => {
            editor.chain().focus().insertContentAt(range, `@${props.username} `).run()
          },
          render: () => ({
            onStart: (props) => {
              atual = { props, ativo: 0 }
              publicar()
            },
            onUpdate: (props) => {
              atual = { props, ativo: Math.min(atual?.ativo ?? 0, Math.max(0, props.items.length - 1)) }
              publicar()
            },
            onKeyDown: ({ event }: SuggestionKeyDownProps) => {
              if (!atual) return false
              const n = atual.props.items.length
              if (event.key === 'Escape') {
                atual = null
                publicar()
                return true
              }
              if (!n) return false
              if (event.key === 'ArrowDown') {
                atual.ativo = (atual.ativo + 1) % n
                publicar()
                return true
              }
              if (event.key === 'ArrowUp') {
                atual.ativo = (atual.ativo - 1 + n) % n
                publicar()
                return true
              }
              if (event.key === 'Enter' || event.key === 'Tab') {
                atual.props.command(atual.props.items[atual.ativo])
                return true
              }
              return false
            },
            onExit: () => {
              atual = null
              publicar()
            },
          }),
        }),
      ]
    },
  })
}

// ---------------------------------------------------------------------------
// Caixa de texto simples (comentários)
// ---------------------------------------------------------------------------

const ANTES_DO_CURSOR = /(^|[\s(])@([A-Za-z0-9_.\-]{0,39})$/

/** Coordenadas aproximadas do cursor numa textarea (espelho invisível). */
function rectDoCursor(el: HTMLTextAreaElement): { left: number; top: number; bottom: number } {
  const estilo = window.getComputedStyle(el)
  const espelho = document.createElement('div')
  for (const prop of ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'padding', 'border', 'boxSizing', 'whiteSpace', 'wordWrap'] as const) {
    ;(espelho.style as any)[prop] = (estilo as any)[prop]
  }
  espelho.style.position = 'absolute'
  espelho.style.visibility = 'hidden'
  espelho.style.whiteSpace = 'pre-wrap'
  espelho.style.width = `${el.clientWidth}px`
  espelho.textContent = el.value.slice(0, el.selectionStart ?? el.value.length)
  const marca = document.createElement('span')
  marca.textContent = '​'
  espelho.appendChild(marca)
  document.body.appendChild(espelho)
  const caixa = el.getBoundingClientRect()
  const top = caixa.top + marca.offsetTop - el.scrollTop
  const left = caixa.left + marca.offsetLeft
  const altura = parseFloat(estilo.lineHeight) || 20
  document.body.removeChild(espelho)
  return { left, top, bottom: top + altura }
}

export function useMencoesTextarea(opcoes: {
  ref: React.RefObject<HTMLTextAreaElement | null>
  valor: string
  setValor: (v: string) => void
  contexto: ContextoMencao | null
  token?: string
}) {
  const { ref, valor, setValor, contexto, token } = opcoes
  const [estado, setEstado] = useState<EstadoLista | null>(null)
  const pedido = useRef(0)
  const inicio = useRef<number | null>(null)

  const fechar = useCallback(() => {
    inicio.current = null
    setEstado(null)
  }, [])

  const escolher = useCallback(
    (c: CandidatoMencao) => {
      const el = ref.current
      if (!el || inicio.current === null) return
      const fim = el.selectionStart ?? valor.length
      const novo = `${valor.slice(0, inicio.current)}@${c.username} ${valor.slice(fim)}`
      const cursor = inicio.current + c.username.length + 2
      setValor(novo)
      fechar()
      requestAnimationFrame(() => {
        el.focus()
        el.setSelectionRange(cursor, cursor)
      })
    },
    [ref, valor, setValor, fechar]
  )

  // Reavalia a cada mudança de texto: há um "@termo" logo antes do cursor?
  const avaliar = useCallback(() => {
    const el = ref.current
    if (!el || !contexto) return
    const pos = el.selectionStart ?? 0
    const m = ANTES_DO_CURSOR.exec(el.value.slice(0, pos))
    if (!m) {
      if (inicio.current !== null) fechar()
      return
    }
    const termo = m[2]
    inicio.current = pos - termo.length - 1
    const meu = ++pedido.current
    buscarCandidatos(contexto, termo, token).then((itens) => {
      if (meu !== pedido.current || inicio.current === null) return
      setEstado((anterior) => ({
        itens,
        ativo: Math.min(anterior?.ativo ?? 0, Math.max(0, itens.length - 1)),
        rect: rectDoCursor(el),
        escolher,
      }))
    })
  }, [ref, contexto, token, fechar, escolher])

  useEffect(() => {
    avaliar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valor])

  // Mantém `escolher` atualizado no estado (fecha sobre o valor atual).
  useEffect(() => {
    setEstado((e) => (e ? { ...e, escolher } : e))
  }, [escolher])

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
      if (!estado) return false
      const n = estado.itens.length
      if (e.key === 'Escape') {
        e.preventDefault()
        fechar()
        return true
      }
      if (!n) return false
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const delta = e.key === 'ArrowDown' ? 1 : -1
        setEstado({ ...estado, ativo: (estado.ativo + delta + n) % n })
        return true
      }
      if ((e.key === 'Enter' && !e.metaKey && !e.ctrlKey) || e.key === 'Tab') {
        e.preventDefault()
        escolher(estado.itens[estado.ativo])
        return true
      }
      return false
    },
    [estado, escolher, fechar]
  )

  return { estado, onKeyDown, fechar }
}
