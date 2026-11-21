'use client'
import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { codigoReferencia, encontrarReferencias } from '@/lib/biblia/referencias'
import { hrefLeitor } from '@/lib/biblia/dados'
import { versaoCitadaApos } from './extensaoReferencias'
import { useAcessoBiblia } from './useFonteBiblia'
import { PopoverVersiculo } from './PopoverVersiculo'
import { CLASSE_REF } from './extensaoReferencias'

/**
 * Referências bíblicas em posts e comentários.
 *
 * - <ReferenciasNoTexto> envolve um conteúdo e dá comportamento aos links
 *   `a[data-biblia-ref]` dentro dele: hover (desktop) ou toque (mobile) abre o
 *   popover com o texto; foco pelo teclado também abre; Escape fecha e devolve
 *   o foco ao link; clique (desktop) ou segundo toque leva ao leitor.
 * - Os links vêm de <TextoComReferencias> (texto puro, ex.: comentários) ou da
 *   extensão TipTap ReferenciasBiblicas (decorações, ex.: discussões).
 * Nada disso altera o conteúdo salvo.
 */

const SELETOR = 'a[data-biblia-ref]'
const ATRASO_ABRIR = 250
const ATRASO_FECHAR = 200

/** Texto puro → nós React com as referências virando links. */
export function TextoComReferencias({ texto }: { texto: string }) {
  const achados = encontrarReferencias(texto)
  if (!achados.length) return <>{texto}</>
  const partes: React.ReactNode[] = []
  let cursor = 0
  for (const r of achados) {
    if (r.inicio > cursor) partes.push(texto.slice(cursor, r.inicio))
    const codigo = codigoReferencia(r)
    const versao = versaoCitadaApos(texto, r.fim)
    partes.push(
      <a key={r.inicio} href={hrefLeitor(codigo, versao)} className={CLASSE_REF} data-biblia-ref={codigo} data-biblia-versao={versao}>
        {r.texto}
      </a>
    )
    cursor = r.fim
  }
  if (cursor < texto.length) partes.push(texto.slice(cursor))
  return <>{partes}</>
}

type Aberto = { codigo: string; ancora: HTMLAnchorElement; versao?: string }

export function ReferenciasNoTexto({ children, className }: { children: React.ReactNode; className?: string }) {
  const router = useRouter()
  useAcessoBiblia() // deixa o token da sessão para as citações vivas (versões licenciadas)
  const raizRef = useRef<HTMLDivElement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const [aberto, setAbertoState] = useState<Aberto | null>(null)
  const abertoRef = useRef<Aberto | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ultimoToque = useRef(0)
  const popoverId = useId()

  const setAberto = useCallback((a: Aberto | null) => {
    abertoRef.current = a
    setAbertoState(a)
  }, [])
  const limparTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])
  const agendar = useCallback(
    (fn: () => void, ms: number) => {
      limparTimer()
      timer.current = setTimeout(fn, ms)
    },
    [limparTimer]
  )
  const abrir = useCallback(
    (ancora: HTMLAnchorElement) => {
      limparTimer()
      const codigo = ancora.getAttribute('data-biblia-ref')
      if (!codigo) return
      if (abertoRef.current?.ancora === ancora) return
      setAberto({ codigo, ancora, versao: ancora.getAttribute('data-biblia-versao') || undefined })
    },
    [limparTimer, setAberto]
  )
  const fechar = useCallback(() => {
    limparTimer()
    setAberto(null)
  }, [limparTimer, setAberto])

  const navegar = useCallback(
    (href: string, e: { preventDefault: () => void; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; button: number }) => {
      if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return // nova aba etc.
      e.preventDefault()
      fechar()
      router.push(href)
    },
    [router, fechar]
  )

  const tocouAgora = () => Date.now() - ultimoToque.current < 800

  // Eventos nativos na raiz. Em captura para mousedown/mouseup/click: impede
  // que o ProseMirror (que escuta no .ProseMirror, dentro desta raiz) trate o
  // clique no link — quem decide a navegação é este componente.
  useEffect(() => {
    const raiz = raizRef.current
    if (!raiz) return
    const linkDe = (t: EventTarget | null) =>
      t instanceof Element ? (t.closest(SELETOR) as HTMLAnchorElement | null) : null

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'touch') ultimoToque.current = Date.now()
    }
    const pararSeLink = (e: MouseEvent) => {
      if (linkDe(e.target)) e.stopPropagation()
    }
    const onClick = (e: MouseEvent) => {
      const link = linkDe(e.target)
      if (!link) return
      e.stopPropagation()
      if (tocouAgora() && abertoRef.current?.ancora !== link) {
        // primeiro toque: mostra o versículo; o segundo (ou "Abrir na Bíblia") navega
        e.preventDefault()
        abrir(link)
        return
      }
      navegar(link.getAttribute('href') || '/biblia', e)
    }
    const onMouseOver = (e: MouseEvent) => {
      if (tocouAgora()) return
      const link = linkDe(e.target)
      if (link) agendar(() => abrir(link), ATRASO_ABRIR)
    }
    const onMouseOut = (e: MouseEvent) => {
      const link = linkDe(e.target)
      if (!link || link.contains(e.relatedTarget as Node | null)) return
      if (abertoRef.current) agendar(fechar, ATRASO_FECHAR)
      else limparTimer()
    }
    const onFocusIn = (e: FocusEvent) => {
      if (tocouAgora()) return
      const link = linkDe(e.target)
      if (link) abrir(link)
    }
    const onFocusOut = (e: FocusEvent) => {
      const para = e.relatedTarget as Node | null
      if (para && popoverRef.current?.contains(para)) return
      if (linkDe(e.target) && abertoRef.current) agendar(fechar, ATRASO_FECHAR)
    }

    raiz.addEventListener('pointerdown', onPointerDown, true)
    raiz.addEventListener('mousedown', pararSeLink, true)
    raiz.addEventListener('mouseup', pararSeLink, true)
    raiz.addEventListener('click', onClick, true)
    raiz.addEventListener('mouseover', onMouseOver)
    raiz.addEventListener('mouseout', onMouseOut)
    raiz.addEventListener('focusin', onFocusIn)
    raiz.addEventListener('focusout', onFocusOut)
    return () => {
      raiz.removeEventListener('pointerdown', onPointerDown, true)
      raiz.removeEventListener('mousedown', pararSeLink, true)
      raiz.removeEventListener('mouseup', pararSeLink, true)
      raiz.removeEventListener('click', onClick, true)
      raiz.removeEventListener('mouseover', onMouseOver)
      raiz.removeEventListener('mouseout', onMouseOut)
      raiz.removeEventListener('focusin', onFocusIn)
      raiz.removeEventListener('focusout', onFocusOut)
    }
  }, [abrir, agendar, fechar, limparTimer, navegar])

  // Com o popover aberto: Escape fecha (foco volta ao link); toque/clique fora fecha.
  useEffect(() => {
    if (!aberto) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      const ancora = abertoRef.current?.ancora
      fechar()
      ancora?.focus()
    }
    const onFora = (e: PointerEvent) => {
      const alvo = e.target as Node
      if (popoverRef.current?.contains(alvo) || abertoRef.current?.ancora.contains(alvo)) return
      fechar()
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('pointerdown', onFora)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onFora)
    }
  }, [aberto, fechar])

  // Foco saindo do popover para fora dele e do link: fecha.
  const onFocusOutPopover = (e: React.FocusEvent) => {
    const para = e.relatedTarget as Node | null
    if (para && (popoverRef.current?.contains(para) || abertoRef.current?.ancora.contains(para))) return
    agendar(fechar, ATRASO_FECHAR)
  }

  useEffect(() => limparTimer, [limparTimer])

  return (
    <div ref={raizRef} className={className}>
      {children}
      {aberto && (
        <div onBlur={onFocusOutPopover} onFocus={limparTimer}>
          <PopoverVersiculo
            key={aberto.codigo + aberto.ancora.textContent}
            codigo={aberto.codigo}
            ancora={aberto.ancora}
            versaoInicial={aberto.versao}
            id={popoverId}
            popoverRef={popoverRef}
            onMouseEnter={limparTimer}
            onMouseLeave={() => {
              // com o foco dentro (seletor de versão aberto, menu de traduções), não fecha
              if (!popoverRef.current?.contains(document.activeElement)) agendar(fechar, ATRASO_FECHAR)
            }}
            onNavegar={navegar}
          />
        </div>
      )}
      <style jsx global>{`
        a.biblia-ref {
          color: var(--text);
          font-weight: inherit;
          text-decoration-line: underline;
          text-decoration-style: dotted;
          text-decoration-color: var(--link-underline);
          text-decoration-thickness: 1px;
          text-underline-offset: 3px;
          cursor: pointer;
        }
        a.biblia-ref:hover {
          text-decoration-style: solid;
        }
        a.biblia-ref:focus-visible {
          outline: 2px solid var(--focus);
          outline-offset: 2px;
          border-radius: 2px;
        }
      `}</style>
    </div>
  )
}

export default ReferenciasNoTexto
