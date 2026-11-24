'use client'

/**
 * Busca dentro da Bíblia (/biblia/buscar?q=&v=&t=&l=&o=&page=).
 *
 * Como nos apps bíblicos de referência: uma caixa só aceita referência
 * ("Jo 3:16" abre direto o leitor) ou palavras; todas as palavras precisam
 * estar no versículo; "frase entre aspas"; -palavra exclui; pala* pega
 * variações; filtros por testamento e livro; relevância ou ordem bíblica; os
 * termos aparecem destacados.
 *
 * Versões abertas: índice do servidor. Licenciadas: só com sessão; NVI pela
 * busca da YouVersion (o texto exibido é o da BLIVRE, com aviso, e o clique
 * abre na NVI); ARA/ARC/NTLH pela busca da API.Bible (texto licenciado
 * exibido com o crédito; FUMS reportado). Sem acesso, recua para a aberta.
 */
import React, { useEffect, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg } from '@services/config/config'
import { searchBible } from '@services/search/search'
import { livrosDoTestamento } from '@/lib/biblia/consulta'
import { VERSOES, VERSOES_LICENCIADAS, versaoPorId } from '@/lib/biblia/versoes'
import { reportarFums } from '@/lib/biblia/fums'
import { useBibliaIdioma } from '@components/Biblia/useBibliaIdioma'
import { ListaVersiculos, type BibliaResultadoApi } from './ResultadosBiblicos'

const POR_PAGINA = 20
// Licenciadas oferecidas na busca (as opcionais da YouVersion ficam de fora)
const LICENCIADAS_BUSCA = new Set(['nvi', 'ara', 'arc', 'ntlh', 'rc69', 'niv', 'nkjv'])

const CAMPO =
  'h-11 min-w-0 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 text-sm text-[var(--text)] focus:border-[var(--line-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]'

export default function BuscaBiblia() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useSearchParams()
  const org = useOrg() as any
  const session = useLHSession() as any
  const { versaoPadrao, montado } = useBibliaIdioma()
  const token = session?.data?.tokens?.access_token

  const q = params.get('q') ?? ''
  const v = params.get('v') || (montado ? versaoPadrao : '')
  const testamento = (params.get('t') ?? '') as '' | 'AT' | 'NT'
  const livro = params.get('l') ?? ''
  const ordem = params.get('o') === 'canonica' ? 'canonica' : 'relevancia'
  const pagina = Math.max(1, parseInt(params.get('page') ?? '1', 10) || 1)

  const [entrada, setEntrada] = useState(q)
  const [res, setRes] = useState<BibliaResultadoApi | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState(false)

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setEntrada(q), [q])

  const slug = org?.slug ?? ''
  const atualizar = (mudancas: Record<string, string | number | null>) => {
    const prox = new URLSearchParams(Array.from(params.entries()))
    for (const [k, val] of Object.entries(mudancas)) {
      if (val === null || val === '') prox.delete(k)
      else prox.set(k, String(val))
    }
    router.push(`?${prox.toString()}`)
  }

  useEffect(() => {
    if (q.trim().length < 2 || !v) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRes(null)
      return
    }
    let cancelado = false
    setCarregando(true)
    setErro(false)
    searchBible({ query: q, versao: v, testamento, livro, ordem, page: pagina, limit: POR_PAGINA }, token)
      .then((r) => {
        if (cancelado) return
        if (!r?.success) {
          setErro(true)
          setRes(null)
          return
        }
        const dados = r.data as BibliaResultadoApi
        if (dados.referencia) {
          // referência: direto para a passagem (sem deixar a busca no histórico)
          router.replace(getUriWithOrg(slug, `/biblia?ref=${encodeURIComponent(dados.referencia)}&v=${encodeURIComponent(v)}`))
          return
        }
        setRes(dados)
      })
      .catch(() => {
        if (!cancelado) setErro(true)
      })
      .finally(() => {
        if (!cancelado) setCarregando(false)
      })
    return () => {
      cancelado = true
    }
  }, [q, v, testamento, livro, ordem, pagina, token, slug, router])

  // FUMS: a API.Bible pede o relatório de cada exibição de texto licenciado
  useEffect(() => {
    if (res?.fums) reportarFums([res.fums])
  }, [res?.fums])

  const livros = useMemo(() => livrosDoTestamento(testamento), [testamento])
  const versaoPedida = versaoPorId(res?.versao ?? v)
  const versaoTexto = versaoPorId(res?.versao_texto ?? v)
  const totalPaginas = res ? Math.max(1, Math.ceil(res.total / POR_PAGINA)) : 1

  const hrefVersiculo = (codigo: string) =>
    getUriWithOrg(slug, `/biblia?ref=${encodeURIComponent(codigo)}&v=${encodeURIComponent(res?.versao ?? v)}`)

  const enviar = (e: React.FormEvent) => {
    e.preventDefault()
    const texto = entrada.trim()
    if (!texto) return
    atualizar({ q: texto, page: null, v })
  }

  return (
    <div className="mx-auto w-full max-w-[760px] px-4 pb-16 pt-6 text-[var(--text)] sm:pt-10">
      <h1 className="mb-1 text-3xl">{t('busca.buscar_na_biblia')}</h1>
      <p className="mb-5 text-sm text-[var(--text-2)]">{t('busca.biblia_dica')}</p>

      <form role="search" onSubmit={enviar} className="flex flex-col gap-3">
        <div className="relative">
          <label htmlFor="busca-biblia" className="sr-only">
            {t('busca.buscar_na_biblia')}
          </label>
          <input
            id="busca-biblia"
            type="search"
            value={entrada}
            onChange={(e) => setEntrada(e.target.value)}
            placeholder={t('busca.biblia_placeholder')}
            enterKeyHint="search"
            className="h-12 w-full rounded-xl border border-[var(--line)] bg-[var(--panel)] pe-14 ps-4 text-base text-[var(--text)] placeholder:text-[var(--text-3)] focus:border-[var(--line-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          />
          <button
            type="submit"
            aria-label={t('busca.buscar')}
            className="absolute inset-y-1 end-1 flex w-11 items-center justify-center rounded-lg bg-black text-white"
          >
            <Search size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-[var(--text-2)]">
            {t('busca.versao')}
            <select className={CAMPO} value={v} onChange={(e) => atualizar({ v: e.target.value, page: null })}>
              <optgroup label={t('busca.versoes_abertas')}>
                {VERSOES.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.sigla} — {x.nome}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t('biblia.grupo_licenciadas')}>
                {VERSOES_LICENCIADAS.filter((x) => LICENCIADAS_BUSCA.has(x.id)).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.sigla} — {x.nome}
                  </option>
                ))}
              </optgroup>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-[var(--text-2)]">
            {t('busca.testamento')}
            <select
              className={CAMPO}
              value={testamento}
              onChange={(e) => atualizar({ t: e.target.value, l: null, page: null })}
            >
              <option value="">{t('busca.toda_biblia')}</option>
              <option value="AT">{t('biblia.antigo_testamento')}</option>
              <option value="NT">{t('biblia.novo_testamento')}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-[var(--text-2)]">
            {t('busca.livro')}
            <select className={CAMPO} value={livro} onChange={(e) => atualizar({ l: e.target.value, page: null })}>
              <option value="">{t('busca.todos_livros')}</option>
              {livros.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-medium uppercase tracking-wider text-[var(--text-2)]">
            {t('busca.ordem')}
            <select className={CAMPO} value={ordem} onChange={(e) => atualizar({ o: e.target.value === 'canonica' ? 'canonica' : null, page: null })}>
              <option value="relevancia">{t('busca.relevancia')}</option>
              <option value="canonica">{t('busca.ordem_biblica')}</option>
            </select>
          </label>
        </div>
      </form>

      <div className="mt-6" aria-live="polite" aria-busy={carregando}>
        {!q.trim() ? null : carregando ? (
          <p className="py-10 text-center text-sm text-[var(--text-2)]">{t('busca.buscando')}</p>
        ) : erro ? (
          <p className="py-10 text-center text-sm text-[var(--text-2)]">{t('busca.erro')}</p>
        ) : res && res.total === 0 ? (
          <p className="py-10 text-center text-sm text-[var(--text-2)]">{t('busca.biblia_vazia', { query: q })}</p>
        ) : res ? (
          <>
            <p className="mb-3 text-xs text-[var(--text-2)]">
              {t('busca.n_versiculos', { count: res.total })}
              {versaoPedida ? ` · ${versaoPedida.sigla}` : ''}
            </p>
            {res.recuo && versaoPedida && versaoTexto && (
              <p className="mb-3 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs text-[var(--text-2)]">
                {t(res.provedor === 'youversion' ? 'busca.recuo_youversion' : 'busca.recuo_aberta', {
                  versao: versaoPedida.sigla,
                  texto: versaoTexto.sigla,
                })}
              </p>
            )}
            <ListaVersiculos resultado={res} hrefVersiculo={(x) => hrefVersiculo(x.codigo)} />

            {totalPaginas > 1 && (
              <nav className="mt-6 flex items-center justify-between gap-2" aria-label={t('busca.paginacao')}>
                <button
                  type="button"
                  disabled={pagina <= 1}
                  onClick={() => atualizar({ page: pagina - 1 })}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm text-[var(--text-2)] hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={16} aria-hidden="true" className="rtl:rotate-180" />
                  {t('search.previous')}
                </button>
                <span className="text-xs text-[var(--text-3)]">
                  {t('busca.pagina_de', { pagina, total: totalPaginas })}
                </span>
                <button
                  type="button"
                  disabled={pagina >= totalPaginas}
                  onClick={() => atualizar({ page: pagina + 1 })}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg px-3 text-sm text-[var(--text-2)] hover:bg-[var(--surface)] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t('search.next')}
                  <ChevronRight size={16} aria-hidden="true" className="rtl:rotate-180" />
                </button>
              </nav>
            )}

            <p className="mt-6 text-[11px] leading-relaxed text-[var(--text-3)]">
              {res.copyright || (versaoTexto ? t(`biblia.creditos.${versaoTexto.id}`, { defaultValue: versaoTexto.credito }) : '')}
            </p>
          </>
        ) : null}
      </div>
    </div>
  )
}
