'use client'

import React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useInfiniteQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import {
  ArrowCounterClockwise,
  BookOpenText,
  Hash,
  NotePencil,
  Plus,
  SidebarSimple,
  SunHorizon,
  Trash,
  UploadSimple,
} from '@phosphor-icons/react'
import { apagarDeVez, idDaNota, listarNotas, restaurarNota, type NotaResumo } from '@services/caderno/notas'
import { dataBR, dataLocal } from '@/lib/caderno/conteudo'
import { parseApiDate } from '@/lib/datas'
import { useCaderno, CHAVES_CADERNO } from './CadernoContexto'
import { useColecoes } from './ArvoreColecoes'
import { useImportar } from './Importar'
import { SeloVisibilidade } from './SeloVisibilidade'
import { hrefCaderno } from './PainelEsquerdo'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, FOCO, ICONE_PEQUENO, SERIF } from './estilos'

const POR_PAGINA = 30

/** Centro do /caderno sem nota aberta: lista filtrada por coleção, tag, busca ou lixeira. */
export function ListaNotas() {
  const { t } = useTranslation()
  const c = useCaderno()
  const router = useRouter()
  const params = useSearchParams()
  const { abrirSeletor } = useImportar()
  const colecoes = useColecoes()
  const colecao = params?.get('colecao') || undefined
  const tag = params?.get('tag') || undefined
  const q = params?.get('q') || undefined
  const lixeira = params?.get('lixeira') === '1'
  const filtros = { collection_uuid: colecao, tag, q, trash: lixeira || undefined }

  const consulta = useInfiniteQuery({
    queryKey: CHAVES_CADERNO.lista(c.orgId, filtros),
    queryFn: ({ pageParam }) => listarNotas(c.orgId as number, { ...filtros, page: pageParam, limit: POR_PAGINA }, c.token),
    initialPageParam: 1,
    getNextPageParam: (ultima) => (ultima.page * ultima.limit < ultima.total ? ultima.page + 1 : undefined),
    enabled: c.autenticado && !!c.orgId && !!c.token,
  })
  const itens: NotaResumo[] = consulta.data?.pages.flatMap((p) => p.items) ?? []
  const total = consulta.data?.pages[0]?.total ?? 0

  const nomeColecao = colecao ? (colecoes.data ?? []).find((x) => x.collection_uuid === colecao)?.name : undefined
  const titulo = lixeira
    ? t('caderno.lixeira')
    : q
      ? t('caderno.resultados_busca', { termo: q })
      : tag
        ? `#${tag}`
        : nomeColecao ?? (colecao ? t('caderno.colecao') : t('caderno.todas_notas'))

  const restaurar = async (n: NotaResumo) => {
    try {
      await restaurarNota(n.note_uuid, c.token)
      c.invalidar()
      toast.success(t('caderno.restaurada'))
    } catch (e: any) {
      toast.error(e?.status === 410 ? t('caderno.erro_restaurar_prazo') : t('caderno.erro_restaurar'))
    }
  }
  const apagar = async (n: NotaResumo) => {
    if (!window.confirm(t('caderno.confirmar_apagar_de_vez', { titulo: n.title || t('caderno.sem_titulo') }))) return
    try {
      await apagarDeVez(n.note_uuid, c.token)
      c.invalidar()
    } catch {
      toast.error(t('caderno.erro_apagar'))
    }
  }

  if (c.statusSessao === 'unauthenticated') {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="max-w-sm text-center text-sm text-[var(--text-2)]">{t('caderno.entre_para_usar')}</p>
      </div>
    )
  }

  const vazioGeral = !consulta.isLoading && !itens.length && !colecao && !tag && !q && !lixeira

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-12 items-center gap-1 border-b border-[var(--line)] px-2 sm:px-3 lg:hidden">
        <button type="button" className={ICONE_PEQUENO} onClick={() => c.setEsquerdaAberta(true)} aria-label={t('caderno.abrir_navegacao')}>
          <SidebarSimple size={18} aria-hidden="true" />
        </button>
        <span className="flex-1" />
        <button type="button" className={ICONE_PEQUENO} onClick={() => c.setDireitaAberta(true)} aria-label={t('caderno.painel_estudo')}>
          <BookOpenText size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[44rem] px-5 pb-24 pt-8 sm:px-8 lg:pt-12">
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h1 className="flex items-center gap-2 text-[2rem] font-medium leading-tight tracking-[-0.02em] text-[var(--text)]" style={SERIF}>
                {tag && <Hash size={24} aria-hidden="true" className="text-[var(--text-3)]" />}
                <span className="truncate">{tag ? tag : titulo}</span>
              </h1>
              {!consulta.isLoading && (
                <p className="mt-1 text-sm text-[var(--text-3)]">
                  {lixeira ? t('caderno.lixeira_dica') : t('caderno.n_notas', { count: total })}
                </p>
              )}
            </div>
            {!lixeira && (
              <div className="flex gap-2">
                <button type="button" onClick={abrirSeletor} className={`${BOTAO_SECUNDARIO} min-h-10 px-3 text-sm`}>
                  <UploadSimple size={16} aria-hidden="true" />
                  {t('caderno.importar')}
                </button>
                <Link
                  href={hrefCaderno(c.orgslug, `/new${colecao ? `?colecao=${encodeURIComponent(colecao)}` : ''}`)}
                  className={`${BOTAO_PRIMARIO} min-h-10 px-4 text-sm`}
                >
                  <Plus size={16} weight="bold" aria-hidden="true" />
                  {t('caderno.nova_nota')}
                </Link>
              </div>
            )}
          </div>

          {vazioGeral && (
            <div className="flex flex-col items-start gap-4 border-t border-[var(--line)] pt-8">
              <p className="max-w-md text-lg leading-relaxed text-[var(--text)]" style={SERIF}>{t('caderno.vazio_titulo')}</p>
              <p className="max-w-md text-sm leading-relaxed text-[var(--text-2)]">{t('caderno.vazio_texto')}</p>
              <Link href={hrefCaderno(c.orgslug, `/tcd/${dataLocal()}`)} className={`${BOTAO_PRIMARIO} min-h-11 px-5 text-sm`}>
                <SunHorizon size={18} aria-hidden="true" />
                {t('caderno.comecar_tcd')}
              </Link>
            </div>
          )}

          {!vazioGeral && !consulta.isLoading && !itens.length && (
            <p className="border-t border-[var(--line)] pt-6 text-sm text-[var(--text-2)]">
              {lixeira ? t('caderno.lixeira_vazia') : q ? t('caderno.busca_vazia') : t('caderno.filtro_vazio')}
            </p>
          )}

          {consulta.isLoading && (
            <ul className="flex flex-col gap-3" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <li key={i} className="h-16 animate-pulse rounded-lg bg-[var(--surface)]" />
              ))}
            </ul>
          )}

          {itens.length > 0 && (
            <ul className="flex flex-col border-t border-[var(--line)]">
              {itens.map((n) => {
                const href = hrefCaderno(c.orgslug, n.kind === 'tcd' && n.tcd_date && !lixeira ? `/tcd/${n.tcd_date}` : `/${idDaNota(n.note_uuid)}`)
                return (
                  <li key={n.note_uuid} className="group flex items-start gap-3 border-b border-[var(--line)]">
                    <Link href={href} className={`flex min-w-0 flex-1 items-start gap-3 py-4 ${FOCO}`}>
                      <span className="mt-0.5 shrink-0 text-[var(--text-3)]" aria-hidden="true">
                        {n.kind === 'tcd' ? <SunHorizon size={18} /> : <NotePencil size={18} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate text-base font-medium text-[var(--text)] group-hover:underline group-hover:decoration-[var(--link-underline)] group-hover:underline-offset-4" dir="auto">
                            {n.title || t('caderno.sem_titulo')}
                          </span>
                          {n.visibility !== 'private' && <SeloVisibilidade visibilidade={n.visibility} compacto />}
                        </span>
                        {n.excerpt && (
                          <span className="mt-1 line-clamp-2 block text-sm leading-snug text-[var(--text-2)]">{n.excerpt}</span>
                        )}
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--text-3)]">
                          <span>
                            {n.kind === 'tcd' && n.tcd_date
                              ? dataBR(n.tcd_date)
                              : parseApiDate(n.updated_at).toDate().toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                          {n.tags.slice(0, 4).map((tg) => (
                            <span key={tg}>#{tg}</span>
                          ))}
                        </span>
                      </span>
                    </Link>
                    {lixeira && (
                      <div className="flex shrink-0 items-center gap-1 py-4">
                        <button type="button" onClick={() => restaurar(n)} className={ICONE_PEQUENO} aria-label={t('caderno.restaurar_nota', { titulo: n.title || t('caderno.sem_titulo') })} title={t('caderno.restaurar')}>
                          <ArrowCounterClockwise size={16} aria-hidden="true" />
                        </button>
                        <button type="button" onClick={() => apagar(n)} className={ICONE_PEQUENO} aria-label={t('caderno.apagar_de_vez_nota', { titulo: n.title || t('caderno.sem_titulo') })} title={t('caderno.apagar_de_vez')}>
                          <Trash size={16} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {consulta.hasNextPage && (
            <div className="flex justify-center pt-6">
              <button type="button" onClick={() => consulta.fetchNextPage()} disabled={consulta.isFetchingNextPage} className={`${BOTAO_SECUNDARIO} min-h-10 px-4 text-sm`}>
                {t('caderno.carregar_mais')}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default ListaNotas
