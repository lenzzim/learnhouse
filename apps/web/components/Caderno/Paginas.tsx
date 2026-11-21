'use client'

import React, { useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { abrirTcd, criarNota, idDaNota, obterNota, uuidDaNota, type Nota } from '@services/caderno/notas'
import { dataLocal, dataValida } from '@/lib/caderno/conteudo'
import { useCaderno } from './CadernoContexto'
import { EditorNota } from './EditorNota'
import { hrefCaderno } from './PainelEsquerdo'
import { BOTAO_SECUNDARIO } from './estilos'

type Estado = { tipo: 'carregando' } | { tipo: 'erro'; status?: number } | { tipo: 'pronto'; nota: Nota }

function Carregando() {
  const { t } = useTranslation()
  return (
    <div className="mx-auto w-full max-w-[44rem] px-5 pt-14 sm:px-8" aria-busy="true">
      <span className="sr-only">{t('biblia.carregando')}</span>
      <div className="h-10 w-2/3 animate-pulse rounded-lg bg-[var(--surface)]" />
      <div className="mt-8 flex flex-col gap-3">
        <div className="h-4 w-full animate-pulse rounded bg-[var(--surface)]" />
        <div className="h-4 w-11/12 animate-pulse rounded bg-[var(--surface)]" />
        <div className="h-4 w-4/5 animate-pulse rounded bg-[var(--surface)]" />
      </div>
    </div>
  )
}

function Erro({ status, aoTentar }: { status?: number; aoTentar: () => void }) {
  const { t } = useTranslation()
  const c = useCaderno()
  const router = useRouter()
  return (
    <div className="mx-auto flex w-full max-w-[44rem] flex-col items-start gap-3 px-5 pt-14 sm:px-8">
      <p className="text-lg text-[var(--text)]">{status === 404 ? t('caderno.nota_nao_encontrada') : t('caderno.erro_carregar_nota')}</p>
      <div className="flex gap-2">
        {status !== 404 && (
          <button type="button" onClick={aoTentar} className={`${BOTAO_SECUNDARIO} min-h-10 px-4 text-sm`}>
            {t('biblia.tentar_novamente')}
          </button>
        )}
        <button type="button" onClick={() => router.push(hrefCaderno(c.orgslug))} className={`${BOTAO_SECUNDARIO} min-h-10 px-4 text-sm`}>
          {t('caderno.voltar_notas')}
        </button>
      </div>
    </div>
  )
}

function useCarregar(carregar: (() => Promise<Nota>) | null, chave: string) {
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
  const [tentativa, setTentativa] = useState(0)
  useEffect(() => {
    if (!carregar) return
    let vivo = true
    setEstado({ tipo: 'carregando' })
    carregar()
      .then((nota) => vivo && setEstado({ tipo: 'pronto', nota }))
      .catch((e) => vivo && setEstado({ tipo: 'erro', status: e?.status }))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, tentativa, !!carregar])
  return { estado, tentar: () => setTentativa((n) => n + 1) }
}

/** /caderno/<id> */
export function PaginaNota({ id }: { id: string }) {
  const c = useCaderno()
  const pronto = c.autenticado && !!c.token
  const { estado, tentar } = useCarregar(pronto ? () => obterNota(uuidDaNota(id), c.token) : null, id)
  if (estado.tipo === 'carregando') return <Carregando />
  if (estado.tipo === 'erro') return <Erro status={estado.status} aoTentar={tentar} />
  return <EditorNota key={estado.nota.note_uuid} notaInicial={estado.nota} />
}

/** /caderno/tcd/<YYYY-MM-DD>: abre ou cria o TCD do dia. */
export function PaginaTcd({ data }: { data: string }) {
  const c = useCaderno()
  const router = useRouter()
  const valida = dataValida(data)
  useEffect(() => {
    if (!valida || data > dataLocal(new Date(Date.now() + 86_400_000))) router.replace(hrefCaderno(c.orgslug, `/tcd/${dataLocal()}`))
  }, [valida, data, c.orgslug, router])
  const pronto = c.autenticado && !!c.token && !!c.orgId && valida
  const { estado, tentar } = useCarregar(pronto ? () => abrirTcd(c.orgId as number, data, c.token) : null, data)
  useEffect(() => {
    if (estado.tipo === 'pronto') c.invalidar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado.tipo])
  if (estado.tipo === 'carregando') return <Carregando />
  if (estado.tipo === 'erro') return <Erro status={estado.status} aoTentar={tentar} />
  return <EditorNota key={estado.nota.note_uuid} notaInicial={estado.nota} />
}

/** /caderno/new: cria uma nota (na coleção da URL, se houver) e abre. */
export function NovaNota() {
  const c = useCaderno()
  const router = useRouter()
  const params = useSearchParams()
  const { t } = useTranslation()
  const [erro, setErro] = useState(false)
  const criou = useRef(false)
  useEffect(() => {
    if (!c.autenticado || !c.orgId || !c.token || criou.current) return
    criou.current = true
    criarNota(
      {
        org_id: c.orgId,
        title: (params?.get('titulo') ?? '').slice(0, 300),
        collection_uuid: params?.get('colecao') || null,
      },
      c.token
    )
      .then((n) => {
        c.invalidar()
        router.replace(hrefCaderno(c.orgslug, `/${idDaNota(n.note_uuid)}`))
      })
      .catch(() => setErro(true))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.autenticado, c.orgId, c.token])
  if (erro) {
    return (
      <div className="mx-auto w-full max-w-[44rem] px-5 pt-14 sm:px-8">
        <p className="text-[var(--text)]">{t('caderno.erro_criar_nota')}</p>
      </div>
    )
  }
  return <Carregando />
}
