'use client'
import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import {
  LIVROS,
  CREDITO,
  capituloVizinho,
  codigoReferencia,
  formatarReferencia,
  lerCodigoReferencia,
  livroPorId,
  type Referencia,
} from '@/lib/biblia/referencias'
import { carregarLivro, LICENCA_URL, type LivroDados } from '@/lib/biblia/dados'

/**
 * Leitor da Bíblia Livre. Esquema de URL único em todo o app:
 *   /biblia?ref=JHN.3          capítulo
 *   /biblia?ref=JHN.3.16       capítulo com o versículo 16 destacado
 *   /biblia?ref=JHN.3.16-18    capítulo com o intervalo destacado
 * Cada versículo tem âncora #v<n>; sem `ref`, abre o último capítulo lido
 * (localStorage) ou Gênesis 1.
 */

const CHAVE_ULTIMO = 'discipulei_biblia_ultimo'
const AT = LIVROS.filter((l) => l.testamento === 'AT')
const NT = LIVROS.filter((l) => l.testamento === 'NT')

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro' }
  | { tipo: 'pronto'; livro: LivroDados }

const campoClasse =
  'h-10 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-3 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]'
const botaoNavClasse =
  'inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--text-2)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]'

function hrefRef(ref: Referencia): string {
  return `?ref=${codigoReferencia(ref)}`
}

export default function LeitorBiblia() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useSearchParams()
  const refParam = params.get('ref')
  const ref = useMemo(() => lerCodigoReferencia(refParam), [refParam])

  const [padrao, setPadrao] = useState<Referencia>({ livroId: 'GEN', capitulo: 1 })
  useEffect(() => {
    if (ref) return
    try {
      const salvo = lerCodigoReferencia(window.localStorage.getItem(CHAVE_ULTIMO))
      if (salvo) setPadrao({ livroId: salvo.livroId, capitulo: salvo.capitulo })
    } catch {
      // armazenamento indisponível (aba anônima, bloqueio): segue com Gênesis 1
    }
  }, [ref])

  const atual: Referencia = ref ?? padrao
  const livroInfo = livroPorId(atual.livroId) ?? LIVROS[0]

  useEffect(() => {
    if (!ref) return
    try {
      window.localStorage.setItem(CHAVE_ULTIMO, `${ref.livroId}.${ref.capitulo}`)
    } catch {
      // idem
    }
  }, [ref])

  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
  const [tentativa, setTentativa] = useState(0)
  useEffect(() => {
    let vivo = true
    setEstado({ tipo: 'carregando' })
    carregarLivro(atual.livroId)
      .then((livro) => vivo && setEstado({ tipo: 'pronto', livro }))
      .catch(() => vivo && setEstado({ tipo: 'erro' }))
    return () => {
      vivo = false
    }
  }, [atual.livroId, tentativa])

  const versos = estado.tipo === 'pronto' ? estado.livro.capitulos[atual.capitulo - 1] ?? [] : []
  const ini = atual.versoIni
  const fim = atual.versoFim ?? atual.versoIni

  // Depois de carregar: rola até o versículo destacado (ou o #v<n> da URL)
  useEffect(() => {
    if (estado.tipo !== 'pronto') return
    let alvo = ini
    if (alvo === undefined) {
      const m = /^#v(\d+)$/.exec(window.location.hash)
      if (m) alvo = Number(m[1])
    }
    const el = alvo !== undefined ? document.getElementById(`v${alvo}`) : null
    if (el) {
      // clicar num versículo já visível só destaca, sem pular a página
      const r = el.getBoundingClientRect()
      const visivel = r.top >= 80 && r.bottom <= window.innerHeight
      if (!visivel) el.scrollIntoView({ block: 'center' })
    }
  }, [estado.tipo, atual.livroId, atual.capitulo, ini])

  const anterior = capituloVizinho(livroInfo.id, atual.capitulo, -1)
  const proximo = capituloVizinho(livroInfo.id, atual.capitulo, 1)

  const irPara = (r: Referencia) => router.push(hrefRef(r))

  return (
    <div className="mx-auto w-full max-w-[680px] px-4 pb-16 pt-6 text-[var(--text)] sm:pt-10">
      <header className="mb-6 flex flex-col gap-4">
        <h1 className="text-3xl">
          {livroInfo.nome} {atual.capitulo}
        </h1>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label={t('biblia.livro')}
            className={`${campoClasse} min-w-0 flex-1 sm:flex-none`}
            value={livroInfo.id}
            onChange={(e) => irPara({ livroId: e.target.value, capitulo: 1 })}
          >
            <optgroup label={t('biblia.antigo_testamento')}>
              {AT.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </optgroup>
            <optgroup label={t('biblia.novo_testamento')}>
              {NT.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </optgroup>
          </select>
          <select
            aria-label={t('biblia.capitulo')}
            className={campoClasse}
            value={atual.capitulo}
            onChange={(e) => irPara({ livroId: livroInfo.id, capitulo: Number(e.target.value) })}
          >
            {livroInfo.versos.map((_, i) => (
              <option key={i} value={i + 1}>
                {t('biblia.capitulo_n', { n: i + 1 })}
              </option>
            ))}
          </select>
        </div>
      </header>

      <article
        lang="pt-BR"
        aria-busy={estado.tipo === 'carregando'}
        className="min-h-[50vh] text-[1.1875rem] leading-[1.8]"
        style={{ fontFamily: "var(--font-serif), Georgia, 'Times New Roman', serif" }}
      >
        {estado.tipo === 'carregando' && <p className="text-base text-[var(--text-3)]">{t('biblia.carregando')}</p>}
        {estado.tipo === 'erro' && (
          <div className="text-base text-[var(--text-2)]">
            <p>{t('biblia.erro_carregar')}</p>
            <button type="button" className={`${botaoNavClasse} mt-3`} onClick={() => setTentativa((n) => n + 1)}>
              {t('biblia.tentar_novamente')}
            </button>
          </div>
        )}
        {estado.tipo === 'pronto' && (
          <p>
            {versos.map((texto, i) => {
              const n = i + 1
              const destacado = ini !== undefined && fim !== undefined && n >= ini && n <= fim
              // clicar no número destaca o versículo (de novo: volta ao capítulo)
              const alvo: Referencia =
                destacado && ini === fim
                  ? { livroId: livroInfo.id, capitulo: atual.capitulo }
                  : { livroId: livroInfo.id, capitulo: atual.capitulo, versoIni: n }
              return (
                <span
                  key={n}
                  id={`v${n}`}
                  className={`scroll-mt-28 ${destacado ? 'rounded-[3px] bg-[var(--surface)] [box-decoration-break:clone] [-webkit-box-decoration-break:clone]' : ''}`}
                >
                  <Link
                    href={hrefRef(alvo)}
                    replace
                    scroll={false}
                    aria-label={formatarReferencia({ livroId: livroInfo.id, capitulo: atual.capitulo, versoIni: n })}
                    className="me-1 select-none align-super font-sans text-[0.68rem] font-medium text-[var(--text-3)] no-underline hover:text-[var(--text)]"
                  >
                    {n}
                  </Link>
                  {texto}{' '}
                </span>
              )
            })}
          </p>
        )}
      </article>

      <nav className="mt-10 flex items-center justify-between gap-3" aria-label={t('biblia.titulo')}>
        {anterior ? (
          <Link href={hrefRef(anterior)} className={botaoNavClasse} aria-label={`${t('biblia.anterior')}: ${formatarReferencia(anterior)}`}>
            <ChevronLeft size={16} aria-hidden="true" />
            <span>{formatarReferencia(anterior, true)}</span>
          </Link>
        ) : (
          <span />
        )}
        {proximo ? (
          <Link href={hrefRef(proximo)} className={botaoNavClasse} aria-label={`${t('biblia.proximo')}: ${formatarReferencia(proximo)}`}>
            <span>{formatarReferencia(proximo, true)}</span>
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        ) : (
          <span />
        )}
      </nav>

      <footer className="mt-12 border-t border-[var(--line)] pt-4 text-xs leading-relaxed text-[var(--text-3)]">
        <p>{CREDITO}</p>
        <p className="mt-1">
          <a
            href={LICENCA_URL}
            target="_blank"
            rel="noopener noreferrer license"
            className="text-[var(--text-2)] underline decoration-dotted decoration-[var(--link-underline)] underline-offset-2 hover:text-[var(--text)]"
          >
            {t('biblia.licenca')}
          </a>
        </p>
      </footer>
    </div>
  )
}
