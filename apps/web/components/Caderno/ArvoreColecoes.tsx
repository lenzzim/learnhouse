'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { CaretRight, DotsThree, Folder, FolderOpen, Plus } from '@phosphor-icons/react'
import {
  apagarColecao,
  criarColecao,
  editarColecao,
  listarColecoes,
  type Colecao,
} from '@services/caderno/notas'
import { arvoreColecoes, ehDescendente, type NoColecao } from '@/lib/caderno/conteudo'
import { useCaderno, CHAVES_CADERNO } from './CadernoContexto'
import { CAMPO, ICONE_PEQUENO, LINHA, LINHA_ATIVA, LINHA_INATIVA, SECAO, FOCO } from './estilos'
import { hrefCaderno } from './PainelEsquerdo'

export function useColecoes() {
  const c = useCaderno()
  return useQuery({
    queryKey: CHAVES_CADERNO.colecoes(c.orgId),
    queryFn: () => listarColecoes(c.orgId as number, c.token),
    enabled: c.autenticado && !!c.orgId && !!c.token,
    staleTime: 30_000,
  })
}

/** Nome com recuo, para <select> de coleção (mover nota, importar). */
export function opcoesColecoes(lista: Colecao[]): { uuid: string; rotulo: string }[] {
  const out: { uuid: string; rotulo: string }[] = []
  const visitar = (nos: NoColecao<Colecao>[]) => {
    for (const n of nos) {
      out.push({ uuid: n.collection_uuid, rotulo: `${'  '.repeat(n.nivel)}${n.nivel ? '└ ' : ''}${n.name}` })
      visitar(n.filhos)
    }
  }
  visitar(arvoreColecoes(lista))
  return out
}

function CampoNome({
  inicial,
  aoSalvar,
  aoCancelar,
  rotulo,
}: {
  inicial: string
  aoSalvar: (nome: string) => void
  aoCancelar: () => void
  rotulo: string
}) {
  const [valor, setValor] = useState(inicial)
  const ref = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        const nome = valor.trim()
        if (nome) aoSalvar(nome)
        else aoCancelar()
      }}
      className="px-1 py-0.5"
    >
      <input
        ref={ref}
        aria-label={rotulo}
        value={valor}
        maxLength={120}
        onChange={(e) => setValor(e.target.value)}
        onBlur={() => (valor.trim() && valor.trim() !== inicial ? aoSalvar(valor.trim()) : aoCancelar())}
        onKeyDown={(e) => e.key === 'Escape' && aoCancelar()}
        className={`${CAMPO} h-9`}
      />
    </form>
  )
}

/** Coleções aninhadas: abrir, criar, renomear, mover e apagar. */
export function ArvoreColecoes() {
  const { t } = useTranslation()
  const c = useCaderno()
  const pathname = usePathname() || ''
  const params = useSearchParams()
  const ativa = /\/caderno\/?$/.test(pathname) ? params?.get('colecao') : null
  const q = useColecoes()
  const lista = q.data ?? []
  const arvore = useMemo(() => arvoreColecoes(lista), [lista])

  const [abertas, setAbertas] = useState<Record<string, boolean>>({})
  const [menu, setMenu] = useState<string | null>(null)
  const [renomeando, setRenomeando] = useState<string | null>(null)
  const [criandoEm, setCriandoEm] = useState<string | null | undefined>(undefined) // null = raiz
  const [movendo, setMovendo] = useState<string | null>(null)

  useEffect(() => {
    if (!menu) return
    const fechar = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest('[data-menu-colecao]')) setMenu(null)
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(null)
    document.addEventListener('pointerdown', fechar)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', fechar)
      document.removeEventListener('keydown', esc)
    }
  }, [menu])

  const falhou = () => toast.error(t('caderno.erro_salvar_colecao'))

  const criar = async (nome: string, pai: string | null) => {
    setCriandoEm(undefined)
    try {
      await criarColecao(c.orgId as number, nome, pai, c.token)
      if (pai) setAbertas((a) => ({ ...a, [pai]: true }))
      c.invalidar()
    } catch {
      falhou()
    }
  }
  const renomear = async (uuid: string, nome: string) => {
    setRenomeando(null)
    try {
      await editarColecao(uuid, { name: nome }, c.token)
      c.invalidar()
    } catch {
      falhou()
    }
  }
  const mover = async (uuid: string, pai: string) => {
    setMovendo(null)
    try {
      await editarColecao(uuid, { parent_uuid: pai }, c.token)
      c.invalidar()
    } catch {
      falhou()
    }
  }
  const apagar = async (col: Colecao) => {
    setMenu(null)
    if (!window.confirm(t('caderno.confirmar_apagar_colecao', { nome: col.name }))) return
    try {
      await apagarColecao(col.collection_uuid, c.token)
      c.invalidar()
    } catch {
      falhou()
    }
  }

  const renderNo = (no: NoColecao<Colecao>): React.ReactNode => {
    const aberta = !!abertas[no.collection_uuid]
    const atual = ativa === no.collection_uuid
    const temFilhos = no.filhos.length > 0
    const idSub = `col-${no.collection_uuid}`
    return (
      <li key={no.collection_uuid}>
        {renomeando === no.collection_uuid ? (
          <CampoNome
            inicial={no.name}
            rotulo={t('caderno.renomear_colecao')}
            aoSalvar={(nome) => renomear(no.collection_uuid, nome)}
            aoCancelar={() => setRenomeando(null)}
          />
        ) : (
          <div className="group relative flex items-center" style={{ paddingInlineStart: no.nivel * 12 }}>
            {temFilhos ? (
              <button
                type="button"
                onClick={() => setAbertas((a) => ({ ...a, [no.collection_uuid]: !aberta }))}
                aria-expanded={aberta}
                aria-controls={idSub}
                aria-label={t(aberta ? 'caderno.recolher' : 'caderno.expandir', { nome: no.name })}
                className={ICONE_PEQUENO}
              >
                <CaretRight size={12} aria-hidden="true" className={`transition-transform rtl:-scale-x-100 ${aberta ? 'rotate-90 rtl:-rotate-90' : ''}`} />
              </button>
            ) : (
              <span className="w-9 shrink-0 lg:w-8" aria-hidden="true" />
            )}
            <Link
              href={hrefCaderno(c.orgslug, `?colecao=${encodeURIComponent(no.collection_uuid)}`)}
              aria-current={atual ? 'page' : undefined}
              className={`${LINHA} ${atual ? LINHA_ATIVA : LINHA_INATIVA} min-w-0 flex-1 ps-1.5`}
            >
              {aberta ? <FolderOpen size={16} aria-hidden="true" /> : <Folder size={16} aria-hidden="true" />}
              <span className="min-w-0 flex-1 truncate">{no.name}</span>
              <span className="text-xs tabular-nums text-[var(--text-3)]">{no.note_count || ''}</span>
            </Link>
            <div data-menu-colecao className="relative">
              <button
                type="button"
                onClick={() => setMenu(menu === no.collection_uuid ? null : no.collection_uuid)}
                aria-haspopup="menu"
                aria-expanded={menu === no.collection_uuid}
                aria-label={t('caderno.acoes_colecao', { nome: no.name })}
                className={`${ICONE_PEQUENO} lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100 ${menu === no.collection_uuid ? 'lg:opacity-100' : ''}`}
              >
                <DotsThree size={16} weight="bold" aria-hidden="true" />
              </button>
              {menu === no.collection_uuid && (
                <div
                  role="menu"
                  className="absolute end-0 top-full z-10 mt-1 w-48 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] p-1"
                  style={{ boxShadow: 'var(--sombra-md)' }}
                >
                  {[
                    { k: 'nova_subcolecao', f: () => { setMenu(null); setCriandoEm(no.collection_uuid) } },
                    { k: 'renomear', f: () => { setMenu(null); setRenomeando(no.collection_uuid) } },
                    { k: 'mover_para', f: () => { setMenu(null); setMovendo(no.collection_uuid) } },
                    { k: 'apagar_colecao', f: () => apagar(no) },
                  ].map((op) => (
                    <button
                      key={op.k}
                      type="button"
                      role="menuitem"
                      onClick={op.f}
                      className={`flex min-h-9 w-full items-center rounded-md px-2.5 text-start text-sm text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)] ${FOCO}`}
                    >
                      {t(`caderno.${op.k}`)}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
        {movendo === no.collection_uuid && (
          <div className="px-1 py-1" style={{ paddingInlineStart: no.nivel * 12 + 8 }}>
            <label className="sr-only" htmlFor={`mover-${no.collection_uuid}`}>{t('caderno.mover_para')}</label>
            <select
              id={`mover-${no.collection_uuid}`}
              autoFocus
              defaultValue={no.parent_uuid ?? ''}
              onChange={(e) => mover(no.collection_uuid, e.target.value)}
              onBlur={() => setMovendo(null)}
              className={`${CAMPO} h-9`}
            >
              <option value="">{t('caderno.raiz')}</option>
              {opcoesColecoes(lista)
                .filter((o) => !ehDescendente(lista, no.collection_uuid, o.uuid))
                .map((o) => (
                  <option key={o.uuid} value={o.uuid}>{o.rotulo}</option>
                ))}
            </select>
          </div>
        )}
        {(aberta || criandoEm === no.collection_uuid) && (
          <ul id={idSub} className="flex flex-col gap-px">
            {aberta && no.filhos.map(renderNo)}
            {criandoEm === no.collection_uuid && (
              <li style={{ paddingInlineStart: (no.nivel + 1) * 12 }}>
                <CampoNome inicial="" rotulo={t('caderno.nome_colecao')} aoSalvar={(n) => criar(n, no.collection_uuid)} aoCancelar={() => setCriandoEm(undefined)} />
              </li>
            )}
          </ul>
        )}
      </li>
    )
  }

  return (
    <section aria-labelledby="caderno-colecoes" className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <h2 id="caderno-colecoes" className={SECAO}>{t('caderno.colecoes')}</h2>
        <button type="button" onClick={() => setCriandoEm(null)} className={ICONE_PEQUENO} aria-label={t('caderno.nova_colecao')}>
          <Plus size={14} aria-hidden="true" />
        </button>
      </div>
      <ul className="flex flex-col gap-px">
        {arvore.map(renderNo)}
        {criandoEm === null && (
          <li>
            <CampoNome inicial="" rotulo={t('caderno.nome_colecao')} aoSalvar={(n) => criar(n, null)} aoCancelar={() => setCriandoEm(undefined)} />
          </li>
        )}
      </ul>
      {!q.isLoading && lista.length === 0 && criandoEm === undefined && (
        <p className="px-2.5 text-xs leading-snug text-[var(--text-3)]">{t('caderno.colecoes_vazio')}</p>
      )}
    </section>
  )
}

export default ArvoreColecoes
