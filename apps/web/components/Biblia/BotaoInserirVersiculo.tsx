'use client'
import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { BookOpen } from 'lucide-react'
import { formatarReferencia, interpretarReferencia } from '@/lib/biblia/referencias'
import { versaoPorId } from '@/lib/biblia/versoes'
import { useBibliaIdioma, useNomesLivros } from './useBibliaIdioma'
import { versiculosDaReferencia, type Versiculo } from '@/lib/biblia/dados'

/**
 * Botão da barra do editor de discussões: o usuário digita uma referência
 * ("Jo 3:16-18"), vê o texto e insere um <blockquote> com os versículos e,
 * na última linha, "— João 3:16-18 (BLIVRE)". O painel fica dentro da árvore
 * do editor (não em portal) para funcionar dentro do modal (foco preso).
 */

const MAX_VERSOS = 30
const LARGURA = 352
const SOBRESCRITO = '⁰¹²³⁴⁵⁶⁷⁸⁹'

function sobrescrito(n: number): string {
  return String(n)
    .split('')
    .map((d) => SOBRESCRITO[Number(d)])
    .join('')
}

/** Texto do bloco: um versículo sem número; vários com números sobrescritos. */
export function textoDoBloco(versos: Versiculo[]): string {
  if (versos.length === 1) return versos[0].texto
  return versos.map((v) => `${sobrescrito(v.numero)} ${v.texto}`).join(' ')
}

type Previa = { tipo: 'vazio' } | { tipo: 'carregando' } | { tipo: 'erro' } | { tipo: 'pronto'; versos: Versiculo[] }

export function BotaoInserirVersiculo({ editor }: { editor: Editor }) {
  const { t } = useTranslation()
  // texto e nomes na versão do idioma da interface (BLIVRE, WEB ou RV1909)
  const { idioma, versaoPadrao: versao } = useBibliaIdioma()
  const sigla = versaoPorId(versao)?.sigla ?? ''
  const nomes = useNomesLivros(versao)
  const [aberto, setAberto] = useState(false)
  const [entrada, setEntrada] = useState('')
  const [previa, setPrevia] = useState<Previa>({ tipo: 'vazio' })
  const [deslocamento, setDeslocamento] = useState(0)
  const raizRef = useRef<HTMLDivElement | null>(null)
  const botaoRef = useRef<HTMLButtonElement | null>(null)
  const idPainel = useId()
  const idEntrada = useId()

  const ref = useMemo(() => interpretarReferencia(entrada, idioma), [entrada, idioma])
  const quantidade = ref && ref.versoIni !== undefined ? (ref.versoFim ?? ref.versoIni) - ref.versoIni + 1 : 0
  let aviso: string | null = null
  if (entrada.trim() && !ref) aviso = t('biblia.referencia_invalida')
  else if (ref && ref.versoIni === undefined) aviso = t('biblia.informe_versiculo')
  else if (quantidade > MAX_VERSOS) aviso = t('biblia.limite_versiculos', { max: MAX_VERSOS })
  const valida = !!ref && !aviso

  // prévia do texto (com o cache do loader, repetir a busca é barato)
  useEffect(() => {
    if (!valida || !ref) {
      setPrevia({ tipo: 'vazio' })
      return
    }
    let vivo = true
    setPrevia({ tipo: 'carregando' })
    versiculosDaReferencia(ref, versao)
      .then((versos) => vivo && setPrevia({ tipo: 'pronto', versos }))
      .catch(() => vivo && setPrevia({ tipo: 'erro' }))
    return () => {
      vivo = false
    }
    // a referência é derivada de `entrada`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrada, valida, versao])

  // mantém o painel dentro da viewport (a barra pode estar perto da borda)
  useLayoutEffect(() => {
    if (!aberto || !botaoRef.current) return
    const r = botaoRef.current.getBoundingClientRect()
    const largura = Math.min(LARGURA, window.innerWidth - 32)
    const excesso = r.left + largura - (window.innerWidth - 16)
    setDeslocamento(excesso > 0 ? -Math.min(excesso, r.left - 16) : 0)
  }, [aberto])

  // clique fora fecha
  useEffect(() => {
    if (!aberto) return
    const onFora = (e: PointerEvent) => {
      if (!raizRef.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('pointerdown', onFora)
    return () => document.removeEventListener('pointerdown', onFora)
  }, [aberto])

  const fechar = () => {
    setAberto(false)
    botaoRef.current?.focus()
  }

  const inserir = () => {
    if (!valida || !ref || previa.tipo !== 'pronto' || !previa.versos.length) return
    editor
      .chain()
      .focus()
      .insertContent([
        {
          type: 'blockquote',
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: textoDoBloco(previa.versos) }] },
            { type: 'paragraph', content: [{ type: 'text', text: `— ${formatarReferencia(ref, false, nomes)} (${sigla})` }] },
          ],
        },
        { type: 'paragraph' },
      ])
      .run()
    setEntrada('')
    setAberto(false)
  }

  return (
    <div ref={raizRef} className="relative">
      <button
        ref={botaoRef}
        type="button"
        onClick={() => setAberto((a) => !a)}
        title={t('biblia.inserir_versiculo')}
        aria-label={t('biblia.inserir_versiculo')}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto ? idPainel : undefined}
        className={`p-1.5 rounded transition-colors ${
          aberto ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'
        }`}
      >
        <BookOpen size={16} />
      </button>

      {aberto && (
        <div
          id={idPainel}
          role="dialog"
          aria-label={t('biblia.inserir_versiculo')}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation() // não fecha o modal em volta
              fechar()
            }
          }}
          style={{ left: deslocamento, width: `min(${LARGURA}px, calc(100vw - 32px))`, boxShadow: 'var(--sombra-md)' }}
          className="absolute top-full z-50 mt-2 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-3 text-[var(--text)]"
        >
          <label htmlFor={idEntrada} className="mb-1 block text-xs font-medium text-[var(--text-2)]">
            {t('biblia.referencia')}
          </label>
          <input
            id={idEntrada}
            autoFocus
            type="text"
            autoComplete="off"
            value={entrada}
            placeholder={t('biblia.referencia_placeholder')}
            onChange={(e) => setEntrada(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault() // o editor fica dentro de um <form>
                inserir()
              }
            }}
            className="h-9 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--page)] px-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          />
          <div className="mt-2 min-h-[1.25rem] text-sm" aria-live="polite">
            {aviso && <p className="text-xs text-[var(--text-2)]">{aviso}</p>}
            {!aviso && previa.tipo === 'carregando' && <p className="text-xs text-[var(--text-3)]">{t('biblia.carregando')}</p>}
            {!aviso && previa.tipo === 'erro' && <p className="text-xs text-[var(--text-2)]">{t('biblia.erro_carregar')}</p>}
            {!aviso && previa.tipo === 'pronto' && ref && (
              <blockquote
                className="max-h-40 overflow-y-auto border-s-2 border-[var(--line-strong)] ps-3 leading-relaxed"
                style={{ fontFamily: "var(--font-serif), Georgia, 'Times New Roman', serif" }}
              >
                <p>{textoDoBloco(previa.versos)}</p>
                <p className="mt-1 font-sans text-xs text-[var(--text-3)]">
                  — {formatarReferencia(ref, false, nomes)} ({sigla})
                </p>
              </blockquote>
            )}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={fechar}
              className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-2)] hover:text-[var(--text)]"
            >
              {t('biblia.cancelar')}
            </button>
            <button
              type="button"
              onClick={inserir}
              disabled={!valida || previa.tipo !== 'pronto'}
              className="rounded-lg bg-[var(--cta-bg)] px-3 py-1.5 text-xs font-medium text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)] disabled:opacity-50"
            >
              {t('biblia.inserir')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default BotaoInserirVersiculo
