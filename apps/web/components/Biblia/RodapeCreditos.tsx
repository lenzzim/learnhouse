'use client'
import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { chaveCreditos, lerTextosExibidos, montarCreditos, type LinhaCredito } from '@/lib/biblia/creditos'

/**
 * Rodapé único de créditos das traduções (decisão N43): no fim da nota, da
 * leitura por link (/n/<token>) e do post publicado, em vez de um crédito em
 * cada citação. Lê do DOM o que de fato aparece:
 *  - citações vivas de licenciadas (.biblia-citacao-viva[data-credito-versao],
 *    marcadas por citacaoViva.ts quando o texto chega; no recuo, a aberta);
 *  - citações de versão aberta com o texto embutido (blockquote com o texto
 *    e a linha "— João 3:16 (BLIVRE)").
 * Menções ("Jo 3:16 (NVI)") não exibem texto: não entram.
 */

/** Observa `raiz` e devolve as linhas do rodapé (recalcula com atraso a cada mudança). */
export function useCreditosExibidos(raizRef: React.RefObject<HTMLElement | null>, ativo = true): LinhaCredito[] {
  const { t } = useTranslation()
  const [linhas, setLinhas] = useState<LinhaCredito[]>([])
  useEffect(() => {
    const raiz = raizRef.current
    if (!ativo || !raiz || typeof MutationObserver === 'undefined') return
    let chave = ''
    let timer: ReturnType<typeof setTimeout> | undefined
    const ler = () => {
      const novas = montarCreditos(lerTextosExibidos(raiz), t('biblia.dominio_publico_curto'))
      const k = chaveCreditos(novas)
      if (k === chave) return
      chave = k
      setLinhas(novas)
    }
    ler()
    const obs = new MutationObserver(() => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(ler, 250)
    })
    obs.observe(raiz, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['data-credito-versao'] })
    return () => {
      obs.disconnect()
      if (timer) clearTimeout(timer)
    }
  }, [raizRef, ativo, t])
  return linhas
}

export function RodapeCreditos({ linhas, className = '' }: { linhas: LinhaCredito[]; className?: string }) {
  const { t } = useTranslation()
  if (!linhas.length) return null
  return (
    <footer
      aria-label={t('biblia.creditos_rotulo')}
      className={`biblia-rodape-creditos mt-10 border-t border-[var(--line)] pt-3 font-sans text-xs leading-relaxed text-[var(--text-3)] ${className}`}
    >
      <p>
        {t('biblia.textos_biblicos')} {linhas.map((l) => l.curto).join('; ')}.
      </p>
      <details className="group mt-0.5">
        <summary className="inline-flex min-h-8 cursor-pointer list-none items-center text-[var(--text-2)] underline decoration-dotted decoration-[var(--link-underline)] underline-offset-2 hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] [&::-webkit-details-marker]:hidden">
          {t('biblia.ver_creditos_completos')}
        </summary>
        <ul className="mt-1 flex flex-col gap-1.5">
          {linhas.map((l) => (
            <li key={l.versao.id}>
              <span className="font-medium text-[var(--text-2)]">{l.versao.sigla}</span> — {l.completo}
              {l.versao.fonte === 'licenciada' && (
                <> {t(l.versao.provedor === 'youversion' ? 'biblia.fornecido_youversion' : 'biblia.fornecido_api_bible')}</>
              )}
              {l.versao.fonte !== 'licenciada' && l.versao.licencaUrl && (
                <>
                  {' '}
                  <a
                    href={l.versao.licencaUrl}
                    target="_blank"
                    rel="noopener noreferrer license"
                    className="underline decoration-dotted decoration-[var(--link-underline)] underline-offset-2 hover:text-[var(--text-2)]"
                  >
                    {t('biblia.licenca_n', { licenca: l.versao.licenca })}
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      </details>
    </footer>
  )
}

export default RodapeCreditos
