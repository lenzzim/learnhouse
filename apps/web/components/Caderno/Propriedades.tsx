'use client'

import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Plus, SlidersHorizontal, X } from '@phosphor-icons/react'
import { LIVROS } from '@/lib/biblia/referencias'
import {
  CHAVES_SUGERIDAS,
  STATUS_SUGERIDOS,
  TIPOS_SUGERIDOS,
  chaveValida,
  PROPRIEDADES_MAX,
  VALOR_MAX,
  CHAVE_MAX,
  type Propriedade,
} from '@/lib/caderno/propriedades'
import type { ValoresPropriedade } from '@services/caderno/notas'
import { FOCO } from './estilos'

const SUGERIDAS = new Set<string>(CHAVES_SUGERIDAS)

/** Nome da chave na tela: as sugeridas são traduzidas; as livres, como foram escritas. */
export function useRotuloChave() {
  const { t } = useTranslation()
  return (chave: string) =>
    SUGERIDAS.has(chave.toLowerCase()) ? t(`caderno_editor.prop.chave.${chave.toLowerCase()}`) : chave
}

function sugestoesDoValor(chave: string, usados: ValoresPropriedade[]): string[] {
  const k = chave.toLowerCase()
  const base =
    k === 'tipo' ? TIPOS_SUGERIDOS : k === 'status' ? STATUS_SUGERIDOS : k === 'livro' ? LIVROS.map((l) => l.nome) : []
  const deles = usados.find((u) => u.key === k)?.values.map((v) => v.value) ?? []
  return Array.from(new Set([...base, ...deles])).slice(0, 120)
}

/**
 * Propriedades da nota (estilo Obsidian), no topo, abaixo do título:
 * chave → valor, com sugestões (tipo, livro, tema, autor, data, status) e
 * chaves livres. Fica escondido enquanto a nota não tem propriedades; o
 * comando "/propriedade" ou o botão "+ Propriedade" abre o formulário.
 */
export function BlocoPropriedades({
  propriedades,
  aoMudar,
  usados,
  somenteLeitura,
  sinalAdicionar,
}: {
  propriedades: Propriedade[]
  aoMudar: (lista: Propriedade[]) => void
  usados: ValoresPropriedade[]
  somenteLeitura?: boolean
  /** Muda (incrementa) para abrir "adicionar" e focar a chave. */
  sinalAdicionar?: number
}) {
  const { t } = useTranslation()
  const rotuloChave = useRotuloChave()
  const id = useId()
  const [adicionando, setAdicionando] = useState(false)
  const [novaChave, setNovaChave] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const entradaChave = useRef<HTMLInputElement | null>(null)
  const focarValor = useRef<string | null>(null)
  const raiz = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!sinalAdicionar) return
    setAdicionando(true)
    window.setTimeout(() => entradaChave.current?.focus(), 30)
  }, [sinalAdicionar])

  // depois de adicionar, o foco vai para o valor da nova propriedade
  useEffect(() => {
    if (!focarValor.current) return
    const alvo = raiz.current?.querySelector<HTMLInputElement>(`[data-prop-valor="${CSS.escape(focarValor.current)}"]`)
    focarValor.current = null
    alvo?.focus()
  }, [propriedades])

  const chavesLivres = useMemo(() => {
    const ja = new Set(propriedades.map((p) => p.key.toLowerCase()))
    const todas = [...CHAVES_SUGERIDAS, ...usados.map((u) => u.key)]
    return Array.from(new Set(todas)).filter((k) => !ja.has(k.toLowerCase()))
  }, [propriedades, usados])

  const adicionar = (chave: string) => {
    const k = chave.trim()
    if (!chaveValida(k)) {
      setErro(t('caderno_editor.prop.chave_invalida', { max: CHAVE_MAX }))
      return
    }
    if (propriedades.some((p) => p.key.toLowerCase() === k.toLowerCase())) {
      focarValor.current = propriedades.find((p) => p.key.toLowerCase() === k.toLowerCase())!.key
      setAdicionando(false)
      setNovaChave('')
      aoMudar([...propriedades])
      return
    }
    if (propriedades.length >= PROPRIEDADES_MAX) {
      setErro(t('caderno_editor.prop.limite', { max: PROPRIEDADES_MAX }))
      return
    }
    focarValor.current = k
    setErro(null)
    setNovaChave('')
    setAdicionando(false)
    aoMudar([...propriedades, { key: k, value: k.toLowerCase() === 'data' ? new Date().toISOString().slice(0, 10) : '' }])
  }

  if (somenteLeitura && !propriedades.length) return null

  return (
    <div ref={raiz} className="mt-4">
      {propriedades.length > 0 && (
        <dl className="flex flex-col border-y border-[var(--line)] py-1" aria-label={t('caderno_editor.prop.titulo')}>
          {propriedades.map((p, i) => {
            const k = p.key.toLowerCase()
            const lista = `${id}-v-${i}`
            const sugestoes = somenteLeitura ? [] : sugestoesDoValor(p.key, usados)
            return (
              <div key={p.key} className="grid min-h-10 grid-cols-[minmax(6rem,9rem)_minmax(0,1fr)_auto] items-center gap-2">
                <dt className="truncate text-sm text-[var(--text-3)]" title={p.key}>
                  {rotuloChave(p.key)}
                </dt>
                <dd className="min-w-0">
                  {somenteLeitura ? (
                    <span className="block truncate text-sm text-[var(--text)]">{p.value || '—'}</span>
                  ) : (
                    <>
                      <input
                        data-prop-valor={p.key}
                        type={k === 'data' && (!p.value || /^\d{4}-\d{2}-\d{2}$/.test(p.value)) ? 'date' : 'text'}
                        value={p.value}
                        maxLength={VALOR_MAX}
                        list={sugestoes.length ? lista : undefined}
                        aria-label={t('caderno_editor.prop.valor_de', { chave: rotuloChave(p.key) })}
                        placeholder={t('caderno_editor.prop.vazio')}
                        onChange={(e) => aoMudar(propriedades.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                        className={`h-10 w-full rounded-md bg-transparent px-2 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] hover:bg-[var(--surface)] focus:bg-[var(--surface)] ${FOCO}`}
                      />
                      {sugestoes.length > 0 && (
                        <datalist id={lista}>
                          {sugestoes.map((s) => (
                            <option key={s} value={s} />
                          ))}
                        </datalist>
                      )}
                    </>
                  )}
                </dd>
                {!somenteLeitura && (
                  <button
                    type="button"
                    onClick={() => aoMudar(propriedades.filter((_, j) => j !== i))}
                    aria-label={t('caderno_editor.prop.remover', { chave: rotuloChave(p.key) })}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-md text-[var(--text-3)] hover:bg-[var(--surface)] hover:text-[var(--text)] ${FOCO}`}
                  >
                    <X size={14} aria-hidden="true" />
                  </button>
                )}
              </div>
            )
          })}
        </dl>
      )}

      {!somenteLeitura &&
        (adicionando ? (
          <form
            className="mt-2 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              adicionar(novaChave)
            }}
          >
            <label htmlFor={`${id}-chave`} className="sr-only">
              {t('caderno_editor.prop.nova_chave')}
            </label>
            <input
              ref={entradaChave}
              id={`${id}-chave`}
              value={novaChave}
              maxLength={CHAVE_MAX}
              list={`${id}-chaves`}
              onChange={(e) => {
                setNovaChave(e.target.value)
                setErro(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.preventDefault()
                  setAdicionando(false)
                  setNovaChave('')
                }
              }}
              placeholder={t('caderno_editor.prop.nova_chave')}
              aria-invalid={!!erro}
              className={`h-10 min-w-0 flex-1 rounded-lg border border-[var(--line)] bg-[var(--page)] px-3 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] ${FOCO}`}
            />
            <datalist id={`${id}-chaves`}>
              {chavesLivres.map((k) => (
                <option key={k} value={k}>
                  {rotuloChave(k)}
                </option>
              ))}
            </datalist>
            <button type="submit" className={`inline-flex min-h-10 items-center rounded-lg border border-[var(--line-strong)] px-3 text-sm text-[var(--text)] hover:bg-[var(--surface)] ${FOCO}`}>
              {t('caderno_editor.prop.adicionar')}
            </button>
            {/* atalhos para as chaves sugeridas que faltam */}
            <div className="flex w-full flex-wrap gap-1.5">
              {chavesLivres
                .filter((k) => SUGERIDAS.has(k))
                .map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => adicionar(k)}
                    className={`inline-flex min-h-10 items-center gap-1 rounded-full border border-[var(--line)] px-3 text-xs text-[var(--text-2)] hover:border-[var(--line-strong)] hover:text-[var(--text)] ${FOCO}`}
                  >
                    <Plus size={11} aria-hidden="true" />
                    {rotuloChave(k)}
                  </button>
                ))}
            </div>
            {erro && (
              <p role="alert" className="w-full text-xs text-[var(--text)]">
                {erro}
              </p>
            )}
          </form>
        ) : (
          <button
            type="button"
            onClick={() => {
              setAdicionando(true)
              window.setTimeout(() => entradaChave.current?.focus(), 30)
            }}
            className={`mt-1 inline-flex min-h-10 items-center gap-1.5 rounded-md px-1 text-xs text-[var(--text-3)] hover:text-[var(--text)] ${FOCO}`}
          >
            <SlidersHorizontal size={13} aria-hidden="true" />
            {propriedades.length ? t('caderno_editor.prop.adicionar_outra') : t('caderno_editor.prop.adicionar_primeira')}
          </button>
        ))}
    </div>
  )
}
