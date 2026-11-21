'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import { migrarCadernoAntigo } from '@services/caderno/notas'
import type { NoTiptap } from '@/lib/caderno/conteudo'

export type AbaDireita = 'biblia' | 'strong' | 'backlinks' | 'sumario'

/** Nota aberta no centro: o painel direito lê daqui (sumário, backlinks). */
export interface NotaAberta {
  note_uuid: string
  title: string
  doc: NoTiptap
}

interface Valor {
  orgslug: string
  orgId: number | undefined
  token: string | undefined
  autenticado: boolean
  statusSessao: 'loading' | 'authenticated' | 'unauthenticated'
  /** Passagem do painel Bíblia/Strong (código "JHN.3.16-18"). */
  passagem: string | null
  abrirPassagem: (codigo: string, aba?: AbaDireita) => void
  /** Define a passagem sem abrir o painel (ex.: 1ª referência da nota). */
  definirPassagem: (codigo: string) => void
  /** Versículo escolhido para o Strong. */
  versoStrong: { codigo: string } | null
  abrirStrong: (codigo: string) => void
  abaDireita: AbaDireita
  setAbaDireita: (aba: AbaDireita) => void
  /** Painéis no celular/tablet (gavetas) e o direito no desktop estreito. */
  esquerdaAberta: boolean
  setEsquerdaAberta: (v: boolean) => void
  direitaAberta: boolean
  setDireitaAberta: (v: boolean) => void
  notaAberta: NotaAberta | null
  setNotaAberta: (n: NotaAberta | null) => void
  /** Rola o editor até o n-ésimo heading (Sumário). */
  irParaTitulo: (indice: number) => void
  registrarIrParaTitulo: (fn: ((indice: number) => void) | null) => void
  invalidar: () => void
}

const Contexto = createContext<Valor | null>(null)

export function useCaderno(): Valor {
  const v = useContext(Contexto)
  if (!v) throw new Error('useCaderno fora do CadernoProvider')
  return v
}

/** Chaves do React Query do caderno (todas começam com 'caderno'). */
export const CHAVES_CADERNO = {
  raiz: ['caderno'] as const,
  lista: (orgId: number | undefined, filtros: object) => ['caderno', 'lista', orgId ?? 0, filtros] as const,
  nota: (uuid: string) => ['caderno', 'nota', uuid] as const,
  colecoes: (orgId: number | undefined) => ['caderno', 'colecoes', orgId ?? 0] as const,
  tags: (orgId: number | undefined) => ['caderno', 'tags', orgId ?? 0] as const,
  calendario: (orgId: number | undefined, mes: string) => ['caderno', 'calendario', orgId ?? 0, mes] as const,
  backlinks: (uuid: string) => ['caderno', 'backlinks', uuid] as const,
  links: (uuid: string) => ['caderno', 'links', uuid] as const,
}

const CHAVE_MIGRACAO = 'discipulei_caderno_migrado'

export function CadernoProvider({ orgslug, children }: { orgslug: string; children: React.ReactNode }) {
  const session = useLHSession() as any
  const org = useOrg() as any
  const queryClient = useQueryClient()
  const token: string | undefined = session?.data?.tokens?.access_token
  const statusSessao = (session?.status ?? 'loading') as Valor['statusSessao']
  const autenticado = statusSessao === 'authenticated'
  const orgId: number | undefined = org?.id

  const [passagem, setPassagem] = useState<string | null>(null)
  const [versoStrong, setVersoStrong] = useState<{ codigo: string } | null>(null)
  const [abaDireita, setAbaDireita] = useState<AbaDireita>('biblia')
  const [esquerdaAberta, setEsquerdaAberta] = useState(false)
  const [direitaAberta, setDireitaAberta] = useState(false)
  const [notaAberta, setNotaAberta] = useState<NotaAberta | null>(null)
  const irRef = useRef<((i: number) => void) | null>(null)

  const invalidar = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: CHAVES_CADERNO.raiz })
    queryClient.invalidateQueries({ queryKey: ['discipulei', 'nav', 'notas'] })
  }, [queryClient])

  // Uma vez por navegador e org: copia o "Meu caderno" antigo (discussões
  // privadas) para o caderno novo. Idempotente no servidor; os originais
  // continuam intactos.
  useEffect(() => {
    if (!autenticado || !orgId || !token) return
    const chave = `${CHAVE_MIGRACAO}_${orgId}`
    try {
      if (window.localStorage.getItem(chave)) return
    } catch {
      /* modo privado: tenta mesmo assim, o servidor não duplica */
    }
    migrarCadernoAntigo(orgId, token)
      .then((r) => {
        try {
          window.localStorage.setItem(chave, '1')
        } catch {
          /* ignora */
        }
        if (r.copied > 0) invalidar()
      })
      .catch(() => {
        /* tenta de novo na próxima visita */
      })
  }, [autenticado, orgId, token, invalidar])

  const valor = useMemo<Valor>(
    () => ({
      orgslug,
      orgId,
      token,
      autenticado,
      statusSessao,
      passagem,
      abrirPassagem: (codigo, aba = 'biblia') => {
        setPassagem(codigo)
        setAbaDireita(aba)
        setDireitaAberta(true)
      },
      definirPassagem: (codigo) => setPassagem(codigo),
      versoStrong,
      abrirStrong: (codigo) => {
        setVersoStrong({ codigo })
        setAbaDireita('strong')
        setDireitaAberta(true)
      },
      abaDireita,
      setAbaDireita,
      esquerdaAberta,
      setEsquerdaAberta,
      direitaAberta,
      setDireitaAberta,
      notaAberta,
      setNotaAberta,
      irParaTitulo: (i) => irRef.current?.(i),
      registrarIrParaTitulo: (fn) => {
        irRef.current = fn
      },
      invalidar,
    }),
    [orgslug, orgId, token, autenticado, statusSessao, passagem, versoStrong, abaDireita, esquerdaAberta, direitaAberta, notaAberta, invalidar]
  )

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>
}
