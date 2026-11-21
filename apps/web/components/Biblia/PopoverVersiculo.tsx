'use client'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { formatarReferencia, lerCodigoReferencia } from '@/lib/biblia/referencias'
import { hrefLeitor, versiculosDaReferencia, type Versiculo } from '@/lib/biblia/dados'
import { VERSAO_PADRAO, versaoPorId } from '@/lib/biblia/versoes'
import { Z_INDEX } from '@/lib/z-index'
import { SeletorVersao } from './SeletorVersao'
import { OutrasTraducoes } from './OutrasTraducoes'

/** Quantos versículos o popover mostra antes de cortar com "…". */
const MAX_VERSOS = 8
const MARGEM = 16
const LARGURA_MAX = 360

interface Props {
  codigo: string
  ancora: HTMLElement
  id: string
  /** recebe o elemento raiz (para o host saber o que é "dentro" do popover) */
  popoverRef: React.RefObject<HTMLDivElement | null>
  onMouseEnter: () => void
  onMouseLeave: () => void
  onNavegar: (href: string, e: React.MouseEvent<HTMLAnchorElement>) => void
}

type Estado = { tipo: 'carregando' } | { tipo: 'erro' } | { tipo: 'pronto'; versos: Versiculo[] }

/**
 * Cartão flutuante com o texto do versículo. Renderizado num portal com
 * position: fixed — não empurra nada na página (sem layout shift). Quem abre,
 * fecha e trata Escape é o host (ReferenciasNoTexto).
 */
export function PopoverVersiculo({ codigo, ancora, id, popoverRef, onMouseEnter, onMouseLeave, onNavegar }: Props) {
  const { t } = useTranslation()
  const ref = lerCodigoReferencia(codigo)
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
  // começa sempre na BLIVRE; o seletor troca só neste popover
  const [versao, setVersao] = useState(VERSAO_PADRAO)
  const [pos, setPos] = useState<{ top: number; left: number; largura: number } | null>(null)
  const localRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const r = lerCodigoReferencia(codigo)
    if (!r) return
    let vivo = true
    setEstado({ tipo: 'carregando' })
    versiculosDaReferencia(r, versao)
      .then((versos) => vivo && setEstado({ tipo: 'pronto', versos }))
      .catch(() => vivo && setEstado({ tipo: 'erro' }))
    return () => {
      vivo = false
    }
  }, [codigo, versao])

  // posiciona abaixo do link (ou acima, se não couber), dentro da viewport
  useLayoutEffect(() => {
    const posicionar = () => {
      const el = localRef.current
      if (!el || !ancora.isConnected) return
      const r = ancora.getBoundingClientRect()
      const largura = Math.min(LARGURA_MAX, window.innerWidth - MARGEM * 2)
      const altura = el.offsetHeight
      const left = Math.max(MARGEM, Math.min(r.left, window.innerWidth - MARGEM - largura))
      let top = r.bottom + 8
      if (top + altura > window.innerHeight - MARGEM && r.top - 8 - altura >= MARGEM) top = r.top - 8 - altura
      setPos({ top, left, largura })
    }
    posicionar()
    window.addEventListener('resize', posicionar)
    window.addEventListener('scroll', posicionar, true)
    return () => {
      window.removeEventListener('resize', posicionar)
      window.removeEventListener('scroll', posicionar, true)
    }
  }, [ancora, estado.tipo])

  if (!ref || typeof document === 'undefined') return null
  const titulo = formatarReferencia(ref)
  const href = hrefLeitor(codigo, versao)
  const info = versaoPorId(versao)
  const versos = estado.tipo === 'pronto' ? estado.versos : []
  const visiveis = versos.slice(0, MAX_VERSOS)
  const mostrarNumeros = versos.length > 1

  return createPortal(
    <div
      ref={(el) => {
        localRef.current = el
        popoverRef.current = el
      }}
      id={id}
      role="dialog"
      aria-label={titulo}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={{
        position: 'fixed',
        top: pos?.top ?? 0,
        left: pos?.left ?? 0,
        width: pos?.largura ?? LARGURA_MAX,
        visibility: pos ? 'visible' : 'hidden',
        zIndex: Z_INDEX.POPOVER,
        boxShadow: 'var(--sombra-md)',
      }}
      className="rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-4 text-[var(--text)]"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{titulo}</p>
        <SeletorVersao
          curto
          rotulo={t('biblia.versao')}
          valor={versao}
          onChange={setVersao}
          className="h-7 rounded-md border border-[var(--line)] bg-[var(--panel)] px-1.5 text-xs text-[var(--text-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        />
      </div>
      <div
        lang={info?.idioma ?? 'pt'}
        className="max-h-60 overflow-y-auto text-[0.975rem] leading-relaxed text-[var(--text)]"
        style={{ fontFamily: "var(--font-serif), Georgia, 'Times New Roman', serif" }}
      >
        {estado.tipo === 'carregando' && <p className="text-sm text-[var(--text-3)]">{t('biblia.carregando')}</p>}
        {estado.tipo === 'erro' && <p className="text-sm text-[var(--text-2)]">{t('biblia.erro_carregar')}</p>}
        {estado.tipo === 'pronto' && (
          <p>
            {visiveis.map((v) => (
              <span key={v.numero}>
                {mostrarNumeros && (
                  <sup className="me-0.5 font-sans text-[0.65rem] text-[var(--text-3)]">{v.numero}</sup>
                )}
                {v.texto}{' '}
              </span>
            ))}
            {versos.length > visiveis.length && <span className="text-[var(--text-3)]">…</span>}
          </p>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-2.5 text-xs">
        <a
          href={href}
          onClick={(e) => onNavegar(href, e)}
          className="font-medium text-[var(--text)] underline decoration-[var(--link-underline)] underline-offset-2"
        >
          {t('biblia.abrir_na_biblia')} →
        </a>
        <a href={href} onClick={(e) => onNavegar(href, e)} className="text-[var(--text-3)] hover:text-[var(--text-2)]">
          {info ? `${info.nome} (${info.sigla})` : ''}
        </a>
      </div>
      <div className="mt-2">
        <OutrasTraducoes referencia={ref} />
      </div>
    </div>,
    document.body
  )
}

export default PopoverVersiculo
