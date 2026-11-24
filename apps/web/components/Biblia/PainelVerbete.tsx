'use client'
import React, { useEffect, useRef, useState } from 'react'
import { useCantoInferior } from '@components/Discipulei/useCantoInferior'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'
import {
  CREDITO_STEPBIBLE,
  URL_STEPBIBLE,
  ehNovoTestamento,
  partesDefinicao,
  type PalavraOriginal,
  type Verbete,
} from '@/lib/biblia/original'
import { carregarVerbete } from '@/lib/biblia/dados'
import { Z_INDEX } from '@/lib/z-index'
import { FONTE_GREGO, FONTE_HEBRAICO } from './OriginalVerso'

type Estado = { tipo: 'carregando' } | { tipo: 'erro' } | { tipo: 'pronto'; verbete: Verbete | null }

/**
 * Verbete de uma palavra do original: lema, transliteração, Strong,
 * morfologia, glosa e definição (em inglês), com o crédito do STEPBible.
 * Folha inferior no celular, cartão à direita no desktop. Escape fecha.
 */
export function PainelVerbete({ palavra, onFechar }: { palavra: PalavraOriginal; onFechar: () => void }) {
  const { t } = useTranslation()
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
  // Aberto, o painel ocupa o canto inferior: o convite de instalar sai.
  useCantoInferior('verbete', true)
  const fecharRef = useRef<HTMLButtonElement | null>(null)
  const strong = palavra[2]
  // narrowing explícito: só o NT tem glosa em espanhol [5] e marca [6]
  const grc = ehNovoTestamento(palavra) ? palavra : null
  const nt = grc !== null

  useEffect(() => {
    let vivo = true
    setEstado({ tipo: 'carregando' })
    carregarVerbete(strong)
      .then((verbete) => vivo && setEstado({ tipo: 'pronto', verbete }))
      .catch(() => vivo && setEstado({ tipo: 'erro' }))
    return () => {
      vivo = false
    }
  }, [strong])

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    fecharRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFechar()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      anterior?.focus?.()
    }
  }, [onFechar])

  const verbete = estado.tipo === 'pronto' ? estado.verbete : null
  const fonte = nt ? FONTE_GREGO : FONTE_HEBRAICO

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`${t('biblia.strong')} ${strong}`}
      style={{ zIndex: Z_INDEX.POPOVER, boxShadow: 'var(--sombra-lg)' }}
      className="fixed inset-x-0 bottom-0 max-h-[75vh] overflow-y-auto rounded-t-2xl border border-[var(--line-strong)] bg-[var(--panel)] p-5 text-[var(--text)] sm:inset-x-auto sm:bottom-6 sm:end-6 sm:w-[26rem] sm:rounded-2xl"
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="text-3xl leading-tight" dir={nt ? 'ltr' : 'rtl'} style={{ fontFamily: fonte }}>
            {verbete?.lema || palavra[0]}
          </p>
          <p className="mt-1 text-sm text-[var(--text-2)]">{verbete?.translit || palavra[1]}</p>
        </div>
        <button
          ref={fecharRef}
          type="button"
          onClick={onFechar}
          aria-label={t('biblia.fechar')}
          className="rounded-lg p-1.5 text-[var(--text-3)] hover:bg-[var(--surface)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        >
          <X size={18} />
        </button>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-[var(--text-3)]">{t('biblia.no_texto')}</dt>
        <dd dir={nt ? 'ltr' : 'rtl'} className="text-start" style={{ fontFamily: fonte }}>
          {palavra[0]}
        </dd>
        <dt className="text-[var(--text-3)]">{t('biblia.strong')}</dt>
        <dd className="font-mono text-xs leading-5">{strong}</dd>
        <dt className="text-[var(--text-3)]">{t('biblia.morfologia')}</dt>
        <dd className="font-mono text-xs leading-5">
          {palavra[3]}
          {verbete?.morf ? <span className="text-[var(--text-3)]"> · {verbete.morf}</span> : null}
        </dd>
        <dt className="text-[var(--text-3)]">{t('biblia.glosa')}</dt>
        <dd>
          {palavra[4]}
          {verbete?.glosa && verbete.glosa !== palavra[4] ? (
            <span className="text-[var(--text-3)]"> · {verbete.glosa}</span>
          ) : null}
        </dd>
        {grc?.[5] ? (
          <>
            <dt className="text-[var(--text-3)]">{t('biblia.glosa_espanhol')}</dt>
            <dd lang="es">{grc[5]}</dd>
          </>
        ) : null}
        {grc?.[6] ? (
          <>
            <dt className="text-[var(--text-3)]">{t('biblia.texto_base')}</dt>
            <dd>{grc[6] === 'N' ? t('biblia.so_na') : t('biblia.so_tr')}</dd>
          </>
        ) : null}
      </dl>

      <div className="mt-4 border-t border-[var(--line)] pt-3">
        <p className="mb-1 text-xs font-medium text-[var(--text-2)]">{t('biblia.definicao_ingles')}</p>
        {estado.tipo === 'carregando' && <p className="text-sm text-[var(--text-3)]">{t('biblia.carregando')}</p>}
        {estado.tipo === 'erro' && <p className="text-sm text-[var(--text-2)]">{t('biblia.erro_carregar')}</p>}
        {estado.tipo === 'pronto' && (
          <p lang="en" className="text-sm leading-relaxed text-[var(--text)]">
            {verbete
              ? partesDefinicao(verbete.def).map((p, i) =>
                  p.tipo === 'quebra' ? (
                    <br key={i} />
                  ) : (
                    <span key={i} className={`${p.negrito ? 'font-semibold' : ''} ${p.italico ? 'italic' : ''}`}>
                      {p.texto}
                    </span>
                  )
                )
              : t('biblia.original_indisponivel')}
          </p>
        )}
      </div>

      <p className="mt-4 text-[0.7rem] text-[var(--text-3)]">
        <a href={URL_STEPBIBLE} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-[var(--text-2)]">
          {t('biblia.credito_stepbible', { defaultValue: CREDITO_STEPBIBLE })}
        </a>
      </p>
    </div>
  )
}

export default PainelVerbete
