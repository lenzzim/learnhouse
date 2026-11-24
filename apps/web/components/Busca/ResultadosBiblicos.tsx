'use client'

/**
 * Listas de resultados bíblicos da busca (página Buscar e busca da Bíblia):
 *  - posts que citam uma passagem, com o trecho citado destacado;
 *  - versículos encontrados, com as palavras destacadas.
 *
 * Identidade P&B: só tokens do tema (--text, --panel, --surface, --line).
 * O destaque vem do servidor como intervalos [início, fim) e vira <mark> aqui
 * (nenhum HTML vindo do servidor). Alvos de toque com pelo menos 44 px.
 */
import React from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { BookOpen, MessageCircle } from 'lucide-react'
import { partesDestacadas } from '@/lib/biblia/consulta'

export interface PassagemConsultaApi {
  codigo: string
  tipo: 'livro' | 'capitulo' | 'versiculo' | 'intervalo'
  livro: string
  capitulo?: number | null
  verso_ini?: number | null
  verso_fim?: number | null
  rotulo: string
}

export interface PassagemDiscussaoApi {
  discussion_uuid: string
  community_uuid: string
  title: string
  emoji?: string | null
  label?: string | null
  creation_date: string
  trecho: string
  destaques: [number, number][]
  citacoes: string[]
}

export interface PassagemResultadoApi {
  passagem: PassagemConsultaApi | null
  discussions: PassagemDiscussaoApi[]
  total: number
  page: number
  limit: number
}

export interface VersiculoApi {
  livro: string
  capitulo: number
  verso: number
  codigo: string
  referencia: string
  texto: string
  destaques: [number, number][]
}

export interface BibliaResultadoApi {
  consulta: string
  versao: string
  versao_texto: string
  recuo: boolean
  provedor?: string | null
  referencia?: string | null
  total: number
  page: number
  limit: number
  versiculos: VersiculoApi[]
  fums?: string | null
  copyright?: string | null
}

export const CLASSE_MARCA = 'rounded-sm bg-[var(--surface)] px-0.5 font-semibold text-[var(--text)] underline decoration-[var(--line-strong)] underline-offset-2'

export function TextoDestacado({ texto, destaques }: { texto: string; destaques: [number, number][] }) {
  return (
    <>
      {partesDestacadas(texto, destaques).map((p, i) =>
        p.marcado ? (
          <mark key={i} className={CLASSE_MARCA}>
            {p.texto}
          </mark>
        ) : (
          <React.Fragment key={i}>{p.texto}</React.Fragment>
        )
      )}
    </>
  )
}

function dataCurta(valor: string, idioma: string): string {
  const d = new Date(valor.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(idioma || 'pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function ListaPassagem({
  resultado,
  hrefDiscussao,
  limite,
}: {
  resultado: PassagemResultadoApi
  hrefDiscussao: (d: PassagemDiscussaoApi) => string
  /** mostra só os N primeiros (prévia na aba "Tudo") */
  limite?: number
}) {
  const { t, i18n } = useTranslation()
  const itens = limite ? resultado.discussions.slice(0, limite) : resultado.discussions
  return (
    <ul className="grid gap-3 lg:grid-cols-2">
      {itens.map((d) => {
        const data = dataCurta(d.creation_date, i18n.language)
        return (
          <li key={d.discussion_uuid}>
            <Link
              href={hrefDiscussao(d)}
              className="flex min-h-11 items-start gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] p-3 transition-colors hover:border-[var(--line-strong)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus)]"
            >
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-[var(--surface)] text-base">
                {d.emoji ? <span aria-hidden="true">{d.emoji}</span> : <MessageCircle size={18} className="text-[var(--text-2)]" aria-hidden="true" />}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="line-clamp-2 break-words text-sm font-medium text-[var(--text)]">{d.title}</h3>
                {d.trecho && (
                  <p className="mt-1 line-clamp-3 break-words text-xs leading-relaxed text-[var(--text-2)]">
                    <TextoDestacado texto={d.trecho} destaques={d.destaques} />
                  </p>
                )}
                <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[var(--text-3)]">
                  {data && <time dateTime={d.creation_date}>{data}</time>}
                  {d.citacoes.length > 0 && (
                    <span>{t('busca.cita', { citacoes: d.citacoes.slice(0, 3).join(', ') })}</span>
                  )}
                </p>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function ListaVersiculos({
  resultado,
  hrefVersiculo,
  limite,
}: {
  resultado: BibliaResultadoApi
  hrefVersiculo: (v: VersiculoApi) => string
  limite?: number
}) {
  const { t } = useTranslation()
  const itens = limite ? resultado.versiculos.slice(0, limite) : resultado.versiculos
  const mostrarFonte = resultado.versao_texto !== resultado.versao
  return (
    <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)]">
      {itens.map((v) => (
        <li key={v.codigo}>
          <Link
            href={hrefVersiculo(v)}
            className="block min-h-11 px-4 py-3 transition-colors hover:bg-[var(--surface)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--focus)]"
          >
            <span className="flex items-center gap-2 text-xs font-semibold text-[var(--text)]">
              <BookOpen size={13} aria-hidden="true" className="text-[var(--text-3)]" />
              {v.referencia}
              {mostrarFonte && (
                <span className="font-normal text-[var(--text-3)]">· {t('busca.texto_de', { versao: resultado.versao_texto.toUpperCase() })}</span>
              )}
            </span>
            {v.texto ? (
              <span className="mt-1 block break-words font-serif text-[15px] leading-relaxed text-[var(--text-2)]">
                <TextoDestacado texto={v.texto} destaques={v.destaques} />
              </span>
            ) : (
              <span className="mt-1 block text-xs text-[var(--text-3)]">{t('busca.so_referencia')}</span>
            )}
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Faixa do chip "Passagem: 1 Pedro 1" com o atalho para o leitor. */
export function ChipPassagem({ rotulo, hrefLeitor, regra }: { rotulo: string; hrefLeitor: string; regra?: string }) {
  const { t } = useTranslation()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--panel)] px-3 text-xs font-medium text-[var(--text)]">
        <BookOpen size={13} aria-hidden="true" />
        {t('busca.chip_passagem', { passagem: rotulo })}
      </span>
      <Link
        href={hrefLeitor}
        className="inline-flex min-h-11 items-center px-2 text-xs text-[var(--text-2)] underline decoration-[var(--link-underline)] underline-offset-4 hover:text-[var(--text)]"
      >
        {t('busca.abrir_na_biblia')}
      </Link>
      {regra && <span className="basis-full text-[11px] text-[var(--text-3)] sm:basis-auto">{regra}</span>}
    </div>
  )
}
