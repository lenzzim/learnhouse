'use client'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Languages } from 'lucide-react'
import {
  LIVROS,
  capituloVizinho,
  codigoReferencia,
  formatarReferencia,
  lerCodigoReferencia,
  livroPorId,
  type Referencia,
} from '@/lib/biblia/referencias'
import { VERSAO_PADRAO, versaoPorId, type VersaoInfo } from '@/lib/biblia/versoes'
import { CREDITO_STEPBIBLE, URL_STEPBIBLE, type CapituloOriginal, type PalavraOriginal } from '@/lib/biblia/original'
import { carregarLivro, carregarOriginal, type LivroDados } from '@/lib/biblia/dados'
import { SeletorVersao } from './SeletorVersao'
import { OutrasTraducoes } from './OutrasTraducoes'
import { OriginalVerso } from './OriginalVerso'
import { PainelVerbete } from './PainelVerbete'
import { ConviteEstudo } from '@components/Discipulei/ChamadaEstudo'
import { CHAVE_ULTIMO_CAPITULO } from '@/lib/discipulei/nav'

/**
 * Leitor da Bíblia. Esquema de URL único em todo o app:
 *   /biblia?ref=JHN.3              capítulo
 *   /biblia?ref=JHN.3.16-18        capítulo com o intervalo destacado
 *   &v=kjv                         versão (padrão: blivre; omitida na URL)
 *   &c=web                         modo comparar com uma segunda versão
 * Cada versículo tem âncora #v<n>. Sem `ref`/`v`, usa o último capítulo e a
 * última versão escolhidos (localStorage) ou Gênesis 1 na BLIVRE.
 */

// Também lida pela tela Hoje ("Continue lendo").
const CHAVE_ULTIMO = CHAVE_ULTIMO_CAPITULO
const CHAVE_VERSAO = 'discipulei_biblia_versao'
const CHAVE_ORIGINAL = 'discipulei_biblia_original'
const AT = LIVROS.filter((l) => l.testamento === 'AT')
const NT = LIVROS.filter((l) => l.testamento === 'NT')

function lerArmazenado(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave)
  } catch {
    return null // aba anônima, bloqueio etc.
  }
}
function gravarArmazenado(chave: string, valor: string) {
  try {
    window.localStorage.setItem(chave, valor)
  } catch {
    // idem
  }
}

type Estado<T> = { tipo: 'carregando' } | { tipo: 'erro' } | { tipo: 'pronto'; dados: T }

/** Carrega `carregar()` sempre que `chave` muda; `chave` null = nada a carregar. */
function useCarregar<T>(chave: string | null, carregar: () => Promise<T>, tentativa: number): Estado<T> | null {
  const [estado, setEstado] = useState<Estado<T> | null>(null)
  useEffect(() => {
    if (!chave) {
      setEstado(null)
      return
    }
    let vivo = true
    setEstado({ tipo: 'carregando' })
    carregar()
      .then((dados) => vivo && setEstado({ tipo: 'pronto', dados }))
      .catch(() => vivo && setEstado({ tipo: 'erro' }))
    return () => {
      vivo = false
    }
    // `carregar` é derivado de `chave`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, tentativa])
  return estado
}

const campoClasse =
  'h-10 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-3 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]'
const botaoClasse =
  'inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--text-2)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]'
const chipClasse =
  'ms-1 inline-flex items-center rounded-md border border-[var(--line)] px-1.5 align-middle font-sans text-xs text-[var(--text-2)] hover:border-[var(--line-strong)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]'
const FONTE_TEXTO = "var(--font-serif), Georgia, 'Times New Roman', serif"

function Credito({ versao }: { versao: VersaoInfo }) {
  const { t } = useTranslation()
  return (
    <p className="mt-1">
      {versao.credito}
      {versao.licencaUrl && (
        <>
          {' '}
          <a
            href={versao.licencaUrl}
            target="_blank"
            rel="noopener noreferrer license"
            className="text-[var(--text-2)] underline decoration-dotted decoration-[var(--link-underline)] underline-offset-2 hover:text-[var(--text)]"
          >
            {t('biblia.licenca_n', { licenca: versao.licenca })}
          </a>
        </>
      )}
    </p>
  )
}

export default function LeitorBiblia() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useSearchParams()
  const refParam = params.get('ref')
  const vParam = params.get('v')
  const cParam = params.get('c')
  const ref = useMemo(() => lerCodigoReferencia(refParam), [refParam])

  // preferências guardadas (lidas depois de montar, para não quebrar a hidratação)
  const [padrao, setPadrao] = useState<Referencia>({ livroId: 'GEN', capitulo: 1 })
  const [versaoSalva, setVersaoSalva] = useState<string | null>(null)
  const [mostrarOriginal, setMostrarOriginal] = useState(false)
  useEffect(() => {
    const salvo = lerCodigoReferencia(lerArmazenado(CHAVE_ULTIMO))
    if (salvo) setPadrao({ livroId: salvo.livroId, capitulo: salvo.capitulo })
    setVersaoSalva(lerArmazenado(CHAVE_VERSAO))
    setMostrarOriginal(lerArmazenado(CHAVE_ORIGINAL) === '1')
  }, [])

  const atual: Referencia = ref ?? padrao
  const livroInfo = livroPorId(atual.livroId) ?? LIVROS[0]
  const versaoA = versaoPorId(vParam) ?? versaoPorId(versaoSalva) ?? (versaoPorId(VERSAO_PADRAO) as VersaoInfo)
  const versaoB = cParam && cParam !== versaoA.id ? versaoPorId(cParam) ?? null : null

  useEffect(() => {
    if (ref) gravarArmazenado(CHAVE_ULTIMO, `${ref.livroId}.${ref.capitulo}`)
  }, [ref])

  const montarHref = useCallback(
    (r: Referencia, versao: string = versaoA.id, comparar: string = versaoB?.id ?? '') => {
      const q = new URLSearchParams()
      q.set('ref', codigoReferencia(r))
      if (versao !== VERSAO_PADRAO) q.set('v', versao)
      if (comparar && comparar !== versao) q.set('c', comparar)
      return `?${q.toString()}`
    },
    [versaoA.id, versaoB]
  )
  const irPara = (href: string) => router.push(href)

  const [tentativa, setTentativa] = useState(0)
  const estadoA = useCarregar<LivroDados>(
    `${versaoA.id}/${livroInfo.id}`,
    () => carregarLivro(livroInfo.id, versaoA.id),
    tentativa
  )
  const estadoB = useCarregar<LivroDados>(
    versaoB ? `${versaoB.id}/${livroInfo.id}` : null,
    () => carregarLivro(livroInfo.id, versaoB?.id),
    tentativa
  )

  // original: global ("Mostrar original") ou por versículo
  const [abertos, setAbertos] = useState<Set<number>>(new Set())
  useEffect(() => setAbertos(new Set()), [livroInfo.id, atual.capitulo])
  const precisaOriginal = mostrarOriginal || abertos.size > 0
  const estadoOriginal = useCarregar<CapituloOriginal>(
    precisaOriginal ? `${livroInfo.id}/${atual.capitulo}` : null,
    () => carregarOriginal(livroInfo.id, atual.capitulo),
    tentativa
  )
  const [palavra, setPalavra] = useState<PalavraOriginal | null>(null)
  const fecharPalavra = useCallback(() => setPalavra(null), [])

  const alternarOriginalGlobal = () => {
    const novo = !mostrarOriginal
    setMostrarOriginal(novo)
    gravarArmazenado(CHAVE_ORIGINAL, novo ? '1' : '0')
  }
  const alternarVerso = (n: number) =>
    setAbertos((s) => {
      const novo = new Set(s)
      if (novo.has(n)) novo.delete(n)
      else novo.add(n)
      return novo
    })

  const prontoA = estadoA?.tipo === 'pronto' ? estadoA.dados : null
  const prontoB = estadoB?.tipo === 'pronto' ? estadoB.dados : null
  const versosA = prontoA?.capitulos[atual.capitulo - 1] ?? []
  const versosB = prontoB?.capitulos[atual.capitulo - 1] ?? []
  const total = Math.max(versosA.length, versosB.length)
  const original = estadoOriginal?.tipo === 'pronto' ? estadoOriginal.dados : null
  const ini = atual.versoIni
  const fim = atual.versoFim ?? atual.versoIni
  const destacado = (n: number) => ini !== undefined && fim !== undefined && n >= ini && n <= fim

  // Depois de carregar: rola até o versículo destacado (ou o #v<n> da URL), se não estiver visível
  useEffect(() => {
    if (!prontoA) return
    let alvo = ini
    if (alvo === undefined) {
      const m = /^#v(\d+)$/.exec(window.location.hash)
      if (m) alvo = Number(m[1])
    }
    const el = alvo !== undefined ? document.getElementById(`v${alvo}`) : null
    if (el) {
      const r = el.getBoundingClientRect()
      if (!(r.top >= 80 && r.bottom <= window.innerHeight)) el.scrollIntoView({ block: 'center' })
    }
  }, [prontoA, atual.livroId, atual.capitulo, ini])

  const anterior = capituloVizinho(livroInfo.id, atual.capitulo, -1)
  const proximo = capituloVizinho(livroInfo.id, atual.capitulo, 1)

  const numeroVerso = (n: number) => {
    const alvo: Referencia =
      destacado(n) && ini === fim
        ? { livroId: livroInfo.id, capitulo: atual.capitulo }
        : { livroId: livroInfo.id, capitulo: atual.capitulo, versoIni: n }
    return (
      <Link
        href={montarHref(alvo)}
        replace
        scroll={false}
        aria-label={formatarReferencia({ livroId: livroInfo.id, capitulo: atual.capitulo, versoIni: n })}
        className="-my-2 me-0.5 inline-block select-none rounded px-1 py-2 align-super font-sans text-xs font-medium leading-none text-[var(--text-3)] no-underline hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
      >
        {n}
      </Link>
    )
  }
  const blocoOriginal = (n: number) => {
    if (estadoOriginal?.tipo === 'erro') {
      return <p className="my-2 font-sans text-xs text-[var(--text-2)]">{t('biblia.erro_carregar')}</p>
    }
    if (!original) return <p className="my-2 font-sans text-xs text-[var(--text-3)]">{t('biblia.carregando')}</p>
    return (
      <OriginalVerso
        palavras={original[n] ?? []}
        titulo={n === 1 ? original[0] : undefined}
        onPalavra={setPalavra}
      />
    )
  }
  const originalVisivel = (n: number) => mostrarOriginal || abertos.has(n)
  const classeDestaque = (n: number) =>
    destacado(n) ? 'rounded-[3px] bg-[var(--surface)] [box-decoration-break:clone] [-webkit-box-decoration-break:clone]' : ''

  // ---- texto: uma versão (parágrafo corrido, quebrado onde o original abre)
  const textoSimples = () => {
    const blocos: React.ReactNode[] = []
    let trecho: React.ReactNode[] = []
    const fecharTrecho = (chave: string) => {
      if (trecho.length) blocos.push(<p key={chave}>{trecho}</p>)
      trecho = []
    }
    versosA.forEach((texto, i) => {
      const n = i + 1
      if (!texto) return // versículo ausente nesta versão (versificação)
      trecho.push(
        <span key={n} id={`v${n}`} className={`scroll-mt-28 ${classeDestaque(n)}`}>
          {numeroVerso(n)}
          {texto}
          {destacado(n) && !mostrarOriginal && (
            <button type="button" className={chipClasse} aria-expanded={abertos.has(n)} onClick={() => alternarVerso(n)}>
              {t('biblia.original')}
            </button>
          )}{' '}
        </span>
      )
      if (originalVisivel(n)) {
        fecharTrecho(`p${n}`)
        blocos.push(<div key={`o${n}`}>{blocoOriginal(n)}</div>)
      }
    })
    fecharTrecho('fim')
    return blocos
  }

  // ---- texto: duas versões (colunas no desktop, intercalado no celular)
  const textoComparado = () => {
    const linhas: React.ReactNode[] = []
    for (let n = 1; n <= total; n++) {
      const a = versosA[n - 1]
      const b = versosB[n - 1]
      if (!a && !b) continue
      linhas.push(
        <div key={n} id={`v${n}`} className={`scroll-mt-28 border-b border-[var(--line-2)] py-2 ${destacado(n) ? 'bg-[var(--surface)]' : ''}`}>
          <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
            <p lang={versaoA.idioma}>
              {numeroVerso(n)}
              {a || <span className="text-[var(--text-3)]">—</span>}
              {!mostrarOriginal && (
                <button type="button" className={chipClasse} aria-expanded={abertos.has(n)} onClick={() => alternarVerso(n)}>
                  {t('biblia.original')}
                </button>
              )}
            </p>
            <p lang={versaoB?.idioma} className="text-[var(--text-2)] md:text-[var(--text)]">
              <span className="me-1.5 font-sans text-xs font-medium text-[var(--text-3)] md:hidden">{versaoB?.sigla}</span>
              {b || <span className="text-[var(--text-3)]">—</span>}
            </p>
          </div>
          {originalVisivel(n) && blocoOriginal(n)}
        </div>
      )
    }
    return linhas
  }

  const estadoTexto = versaoB && estadoB?.tipo !== 'pronto' && estadoA?.tipo === 'pronto' ? estadoB : estadoA
  const refPassagem: Referencia = { livroId: livroInfo.id, capitulo: atual.capitulo, versoIni: ini, versoFim: fim !== ini ? fim : undefined }

  return (
    <div className={`mx-auto w-full px-4 pb-16 pt-6 text-[var(--text)] sm:pt-10 ${versaoB ? 'max-w-[1040px]' : 'max-w-[680px]'}`}>
      <header className="mb-6 flex flex-col gap-4">
        <h1 className="text-3xl">
          {livroInfo.nome} {atual.capitulo}
        </h1>
        <div className="flex flex-wrap gap-2">
          <select
            aria-label={t('biblia.livro')}
            className={`${campoClasse} min-w-0 flex-1 sm:flex-none`}
            value={livroInfo.id}
            onChange={(e) => irPara(montarHref({ livroId: e.target.value, capitulo: 1 }))}
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
            onChange={(e) => irPara(montarHref({ livroId: livroInfo.id, capitulo: Number(e.target.value) }))}
          >
            {livroInfo.versos.map((_, i) => (
              <option key={i} value={i + 1}>
                {t('biblia.capitulo_n', { n: i + 1 })}
              </option>
            ))}
          </select>
          <SeletorVersao
            rotulo={t('biblia.versao')}
            className={`${campoClasse} min-w-0 max-w-full`}
            valor={versaoA.id}
            onChange={(id) => {
              gravarArmazenado(CHAVE_VERSAO, id)
              setVersaoSalva(id)
              router.replace(montarHref(atual, id), { scroll: false })
            }}
          />
          <SeletorVersao
            rotulo={t('biblia.comparar_com')}
            className={`${campoClasse} min-w-0 max-w-full`}
            valor={versaoB?.id ?? ''}
            opcaoVazia={`${t('biblia.comparar_com')}…`}
            excluir={versaoA.id}
            onChange={(id) => router.replace(montarHref(atual, versaoA.id, id), { scroll: false })}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            aria-pressed={mostrarOriginal}
            onClick={alternarOriginalGlobal}
            className={`${botaoClasse} ${mostrarOriginal ? 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text)]' : ''}`}
          >
            <Languages size={16} aria-hidden="true" />
            {t('biblia.mostrar_original')}
          </button>
          <OutrasTraducoes referencia={refPassagem} flutuante />
        </div>
      </header>

      {versaoB && (
        <div className="mb-2 hidden grid-cols-2 gap-x-8 border-b border-[var(--line)] pb-2 font-sans text-xs font-medium text-[var(--text-3)] md:grid">
          <span>{versaoA.sigla} — {versaoA.nome}</span>
          <span>{versaoB.sigla} — {versaoB.nome}</span>
        </div>
      )}

      <article
        lang={versaoA.idioma}
        aria-busy={estadoTexto?.tipo === 'carregando'}
        className="min-h-[50vh] text-[1.1875rem] leading-[1.8]"
        style={{ fontFamily: FONTE_TEXTO }}
      >
        {(!estadoTexto || estadoTexto.tipo === 'carregando') && (
          <p className="text-base text-[var(--text-3)]">{t('biblia.carregando')}</p>
        )}
        {estadoTexto?.tipo === 'erro' && (
          <div className="text-base text-[var(--text-2)]">
            <p>{t('biblia.erro_carregar')}</p>
            <button type="button" className={`${botaoClasse} mt-3`} onClick={() => setTentativa((n) => n + 1)}>
              {t('biblia.tentar_novamente')}
            </button>
          </div>
        )}
        {estadoTexto?.tipo === 'pronto' && (versaoB ? textoComparado() : textoSimples())}
      </article>

      <nav className="mt-10 flex items-center justify-between gap-3" aria-label={t('biblia.titulo')}>
        {anterior ? (
          <Link href={montarHref(anterior)} className={botaoClasse} aria-label={`${t('biblia.anterior')}: ${formatarReferencia(anterior)}`}>
            <ChevronLeft size={16} aria-hidden="true" />
            <span>{formatarReferencia(anterior, true)}</span>
          </Link>
        ) : (
          <span />
        )}
        {proximo ? (
          <Link href={montarHref(proximo)} className={botaoClasse} aria-label={`${t('biblia.proximo')}: ${formatarReferencia(proximo)}`}>
            <span>{formatarReferencia(proximo, true)}</span>
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        ) : (
          <span />
        )}
      </nav>

      {/* Discipulei: no fim do capítulo, convite para estudar com alguém. */}
      {estadoTexto?.tipo === 'pronto' && <ConviteEstudo lugar="biblia" className="mt-10" />}

      <footer className="mt-12 border-t border-[var(--line)] pt-4 text-xs leading-relaxed text-[var(--text-3)]">
        <Credito versao={versaoA} />
        {versaoB && <Credito versao={versaoB} />}
        {precisaOriginal && (
          <p className="mt-1">
            <a href={URL_STEPBIBLE} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-[var(--text-2)]">
              {t('biblia.credito_stepbible', { defaultValue: CREDITO_STEPBIBLE })}
            </a>
          </p>
        )}
      </footer>

      {palavra && <PainelVerbete palavra={palavra} onFechar={fecharPalavra} />}
    </div>
  )
}
