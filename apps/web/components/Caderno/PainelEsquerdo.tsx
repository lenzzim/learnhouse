'use client'

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { MagnifyingGlass, Notebook, Plus, SunHorizon, Trash, UploadSimple, Hash } from '@phosphor-icons/react'
import { getUriWithOrg } from '@services/config/config'
import { listarTags } from '@services/caderno/notas'
import { dataLocal } from '@/lib/caderno/conteudo'
import { useCaderno, CHAVES_CADERNO } from './CadernoContexto'
import { Calendario } from './Calendario'
import { ArvoreColecoes } from './ArvoreColecoes'
import { CAMPO, LINHA, LINHA_ATIVA, LINHA_INATIVA, SECAO, BOTAO_PRIMARIO } from './estilos'
import { useImportar } from './Importar'

export function hrefCaderno(orgslug: string, caminho = '') {
  return getUriWithOrg(orgslug, `/caderno${caminho}`)
}

/** Painel esquerdo: busca, Hoje (TCD), calendário, coleções e tags. */
export function PainelEsquerdo() {
  const { t } = useTranslation()
  const c = useCaderno()
  const router = useRouter()
  const pathname = usePathname() || ''
  const params = useSearchParams()
  const hoje = dataLocal()
  const naLista = /\/caderno\/?$/.test(pathname)
  const filtroTag = naLista ? params?.get('tag') : null
  const lixeira = naLista && params?.get('lixeira') === '1'
  const semFiltro = naLista && !params?.get('tag') && !params?.get('colecao') && !params?.get('q') && !lixeira
  const { abrirSeletor } = useImportar()

  const [busca, setBusca] = useState(params?.get('q') ?? '')
  const primeiro = useRef(true)
  useEffect(() => {
    if (primeiro.current) {
      primeiro.current = false
      return
    }
    const id = window.setTimeout(() => {
      const q = busca.trim()
      if (!q && !naLista) return
      router.replace(hrefCaderno(c.orgslug, q ? `?q=${encodeURIComponent(q)}` : ''))
    }, 300)
    return () => window.clearTimeout(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca])

  const tagsQuery = useQuery({
    queryKey: CHAVES_CADERNO.tags(c.orgId),
    queryFn: () => listarTags(c.orgId as number, c.token),
    enabled: c.autenticado && !!c.orgId && !!c.token,
    staleTime: 30_000,
  })

  const fecharGaveta = () => c.setEsquerdaAberta(false)
  const ativoTcd = pathname.includes(`/caderno/tcd/${hoje}`)

  return (
    <div className="flex flex-col gap-5 px-3 py-4" onClick={(e) => {
      // Na gaveta do celular, navegar fecha o painel.
      if ((e.target as HTMLElement).closest('a')) fecharGaveta()
    }}>
      <div className="flex flex-col gap-2">
        <label className="relative block">
          <span className="sr-only">{t('caderno.buscar')}</span>
          <MagnifyingGlass size={16} aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t('caderno.buscar_placeholder')}
            className={`${CAMPO} h-10 ps-9`}
          />
        </label>
        <Link
          href={hrefCaderno(c.orgslug, '/new')}
          className={`${BOTAO_PRIMARIO} min-h-10 w-full text-sm`}
        >
          <Plus size={16} weight="bold" aria-hidden="true" />
          {t('caderno.nova_nota')}
        </Link>
      </div>

      <nav aria-label={t('caderno.atalhos')} className="flex flex-col gap-px">
        <Link
          href={hrefCaderno(c.orgslug, `/tcd/${hoje}`)}
          aria-current={ativoTcd ? 'page' : undefined}
          className={`${LINHA} ${ativoTcd ? LINHA_ATIVA : LINHA_INATIVA}`}
        >
          <SunHorizon size={18} aria-hidden="true" />
          <span className="flex-1">{t('caderno.hoje_tcd')}</span>
        </Link>
        <Link
          href={hrefCaderno(c.orgslug)}
          aria-current={semFiltro ? 'page' : undefined}
          className={`${LINHA} ${semFiltro ? LINHA_ATIVA : LINHA_INATIVA}`}
        >
          <Notebook size={18} aria-hidden="true" />
          <span className="flex-1">{t('caderno.todas_notas')}</span>
        </Link>
        <button type="button" onClick={() => { fecharGaveta(); abrirSeletor() }} className={`${LINHA} ${LINHA_INATIVA}`}>
          <UploadSimple size={18} aria-hidden="true" />
          <span className="flex-1 text-start">{t('caderno.importar')}</span>
        </button>
      </nav>

      <Calendario />

      <ArvoreColecoes />

      <section aria-labelledby="caderno-tags" className="flex flex-col gap-1">
        <h2 id="caderno-tags" className={SECAO}>{t('caderno.tags')}</h2>
        {(tagsQuery.data ?? []).length === 0 ? (
          <p className="px-2.5 text-xs leading-snug text-[var(--text-3)]">{t('caderno.tags_vazio')}</p>
        ) : (
          <ul className="flex flex-wrap gap-1 px-1.5">
            {(tagsQuery.data ?? []).map((tag) => {
              const ativa = filtroTag?.toLowerCase() === tag.name.toLowerCase()
              return (
                <li key={tag.tag_uuid}>
                  <Link
                    href={hrefCaderno(c.orgslug, `?tag=${encodeURIComponent(tag.name)}`)}
                    aria-current={ativa ? 'page' : undefined}
                    className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 text-xs transition-colors ${
                      ativa
                        ? 'border-[var(--text-2)] bg-[var(--surface)] text-[var(--text)]'
                        : 'border-[var(--line)] text-[var(--text-2)] hover:border-[var(--line-strong)] hover:text-[var(--text)]'
                    }`}
                  >
                    <Hash size={11} aria-hidden="true" />
                    {tag.name}
                    <span className="tabular-nums text-[var(--text-3)]">{tag.count}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <Link
        href={hrefCaderno(c.orgslug, '?lixeira=1')}
        aria-current={lixeira ? 'page' : undefined}
        className={`${LINHA} ${lixeira ? LINHA_ATIVA : LINHA_INATIVA} mt-auto`}
      >
        <Trash size={18} aria-hidden="true" />
        <span className="flex-1">{t('caderno.lixeira')}</span>
      </Link>
    </div>
  )
}

export default PainelEsquerdo
