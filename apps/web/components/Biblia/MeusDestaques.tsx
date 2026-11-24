'use client'
import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { BookmarkSimple } from '@phosphor-icons/react'
import { FolhaInferior } from '@components/Discipulei/Navegacao/FolhaInferior'
import { codigoReferencia, formatarReferencia, type NomesLivros } from '@/lib/biblia/referencias'
import { listarMarcas, type MarcaVerso, type TipoMarca } from '@services/biblia/marcas'

/**
 * "Meus destaques" (P0 do plano do leitor, item 2): os versículos destacados
 * e favoritos da conta, mais recentes primeiro, com filtro e "carregar mais".
 * Cada item abre o leitor no versículo (na versão que estiver em uso).
 */

const POR_PAGINA = 50
type Filtro = 'todos' | TipoMarca

export function MeusDestaques({
  aberto,
  aoMudar,
  token,
  nomes,
  hrefVerso,
}: {
  aberto: boolean
  aoMudar: (v: boolean) => void
  token?: string | null
  nomes?: NomesLivros | null
  /** href do leitor para o código ("JHN.3.16") */
  hrefVerso: (codigo: string) => string
}) {
  const { t } = useTranslation()
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [itens, setItens] = useState<MarcaVerso[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [estado, setEstado] = useState<'carregando' | 'pronto' | 'erro'>('carregando')

  useEffect(() => {
    if (!aberto) return
    let vivo = true
    setEstado('carregando')
    listarMarcas({ tipo: filtro === 'todos' ? undefined : filtro, page: pagina, limit: POR_PAGINA }, token)
      .then((r) => {
        if (!vivo) return
        setItens((atual) => (pagina === 1 ? r.items : [...atual, ...r.items]))
        setTotal(r.total)
        setEstado('pronto')
      })
      .catch(() => vivo && setEstado('erro'))
    return () => {
      vivo = false
    }
  }, [aberto, filtro, pagina, token])

  const trocarFiltro = (f: Filtro) => {
    setFiltro(f)
    setPagina(1)
    setItens([])
  }

  return (
    <FolhaInferior aberta={aberto} aoMudar={aoMudar} titulo={t('biblia.meus_destaques')} descricao={t('biblia.meus_destaques_desc')} larguraDesktop="md">
      <div className="flex max-h-[65dvh] flex-col gap-3">
        <div role="group" aria-label={t('biblia.filtrar')} className="flex gap-1.5">
          {(['todos', 'highlight', 'favorite'] as Filtro[]).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtro === f}
              onClick={() => trocarFiltro(f)}
              className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-sm lg:min-h-9 ${
                filtro === f ? 'border-[var(--text)] bg-[var(--surface)] text-[var(--text)]' : 'border-[var(--line)] text-[var(--text-2)] hover:border-[var(--line-strong)]'
              } focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]`}
            >
              {t(`biblia.filtro_${f}`)}
            </button>
          ))}
        </div>
        <div className="min-h-0 overflow-y-auto overscroll-contain pe-1" aria-live="polite" aria-busy={estado === 'carregando'}>
          {estado === 'erro' && <p className="text-sm text-[var(--text-2)]">{t('biblia.erro_carregar')}</p>}
          {estado === 'carregando' && !itens.length && <p className="text-sm text-[var(--text-3)]">{t('biblia.carregando')}</p>}
          {estado === 'pronto' && !itens.length && <p className="text-sm leading-relaxed text-[var(--text-2)]">{t('biblia.meus_destaques_vazio')}</p>}
          {itens.length > 0 && (
            <ul className="flex flex-col">
              {itens.map((m) => {
                const ref = { livroId: m.book, capitulo: m.chapter, versoIni: m.verse }
                return (
                  <li key={`${m.book}.${m.chapter}.${m.verse}`} className="border-t border-[var(--line)] first:border-t-0">
                    <Link
                      href={hrefVerso(codigoReferencia(ref))}
                      onClick={() => aoMudar(false)}
                      className="flex min-h-11 items-center gap-3 rounded-lg px-2 text-sm text-[var(--text)] hover:bg-[var(--surface)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
                    >
                      <span
                        aria-hidden="true"
                        data-cor={m.color ?? undefined}
                        className={`block h-4 w-4 shrink-0 rounded-full ${m.color ? 'caderno-amostra-marca' : 'border border-dashed border-[var(--line-strong)]'}`}
                      />
                      <span className="min-w-0 flex-1 truncate">{formatarReferencia(ref, false, nomes)}</span>
                      <span className="sr-only">
                        {m.color ? t('biblia.destaque_cor', { cor: t(`caderno_editor.cores.${m.color}`) }) : ''}
                        {m.favorite ? ` ${t('biblia.favorito')}` : ''}
                      </span>
                      {m.favorite && <BookmarkSimple size={16} weight="fill" aria-hidden="true" className="shrink-0 text-[var(--text-2)]" />}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
          {estado === 'pronto' && itens.length < total && (
            <button
              type="button"
              onClick={() => setPagina((n) => n + 1)}
              className="mt-2 inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-[var(--line)] text-sm text-[var(--text-2)] hover:border-[var(--line-strong)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            >
              {t('biblia.carregar_mais')}
            </button>
          )}
        </div>
      </div>
    </FolhaInferior>
  )
}

export default MeusDestaques
