'use client'

/**
 * Página Pessoas (decisão N39): só para membros logados da org.
 *
 * - "Seu perfil": interruptor "Aparecer na página Pessoas" (desligado por
 *   padrão) e uma bio curta. Nada de e-mail.
 * - Lista de quem ligou o perfil, com busca e o filtro "Que sigo".
 * - Seguir só serve para filtrar o que você já lê; não dá acesso a nada.
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { MagnifyingGlass, UsersThree } from '@phosphor-icons/react'
import { useDadosNav } from '@components/Discipulei/Navegacao/useDadosNav'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, FOCO, SERIF } from '@components/Discipulei/Navegacao/estilos'
import {
  deixarDeSeguir,
  listarPessoas,
  nomeDaPessoa,
  obterMeuPerfil,
  salvarMeuPerfil,
  seguir,
  type MeuPerfil,
  type Pessoa,
} from '@services/communities/social'
import { AvatarPessoa, PAINEL, rotaPessoa } from './comum'

const BIO_MAX = 280

export const CHAVE_MEU_PERFIL = (orgId: number | undefined) => ['social', 'perfil', orgId ?? 0]

export function BotaoSeguir({
  pessoa,
  orgId,
  token,
  aoMudar,
}: {
  pessoa: Pessoa
  orgId: number
  token?: string
  aoMudar: (p: Pessoa) => void
}) {
  const { t } = useTranslation()
  const [ocupado, setOcupado] = useState(false)
  if (pessoa.is_self) return null
  const nome = nomeDaPessoa(pessoa)
  const alternar = async () => {
    setOcupado(true)
    try {
      if (pessoa.is_following) {
        await deixarDeSeguir(orgId, pessoa.user_uuid, token)
        aoMudar({ ...pessoa, is_following: false })
      } else {
        const r = await seguir(orgId, pessoa.user_uuid, token)
        aoMudar({ ...pessoa, ...r, is_following: true })
      }
    } catch (err: any) {
      toast.error(err?.status === 429 ? t('social.reacoes.devagar') : t('social.pessoas.erro_seguir'))
    } finally {
      setOcupado(false)
    }
  }
  return (
    <button
      type="button"
      onClick={alternar}
      disabled={ocupado}
      aria-pressed={pessoa.is_following}
      aria-label={pessoa.is_following ? t('social.pessoas.deixar_de_seguir_nome', { nome }) : t('social.pessoas.seguir_nome', { nome })}
      className={`${pessoa.is_following ? BOTAO_SECUNDARIO : BOTAO_PRIMARIO} min-h-11 shrink-0 rounded-full px-4 text-sm disabled:opacity-60`}
    >
      {pessoa.is_following ? t('social.pessoas.seguindo') : t('social.pessoas.seguir')}
    </button>
  )
}

function CartaoMeuPerfil({ orgId, token }: { orgId: number; token?: string }) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const perfil = useQuery<MeuPerfil>({
    queryKey: CHAVE_MEU_PERFIL(orgId),
    queryFn: () => obterMeuPerfil(orgId, token),
    enabled: !!token,
  })
  const [bio, setBio] = useState('')
  const [salvando, setSalvando] = useState(false)
  useEffect(() => {
    if (perfil.data) setBio(perfil.data.bio)
  }, [perfil.data])

  const salvar = async (dados: { visible?: boolean; bio?: string }) => {
    setSalvando(true)
    try {
      const novo = await salvarMeuPerfil(orgId, dados, token)
      queryClient.setQueryData(CHAVE_MEU_PERFIL(orgId), novo)
      queryClient.invalidateQueries({ queryKey: ['social', 'pessoas'] })
      toast.success(t('social.perfil.salvo'))
    } catch {
      toast.error(t('social.perfil.erro'))
    } finally {
      setSalvando(false)
    }
  }

  if (!perfil.data) {
    return <div className={`${PAINEL} h-32 animate-pulse`} aria-hidden="true" />
  }
  const visivel = perfil.data.visible
  return (
    <section aria-labelledby="meu-perfil" className={`${PAINEL} p-5`}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="meu-perfil" className="text-lg text-[var(--text)]" style={SERIF}>
            {t('social.perfil.titulo')}
          </h2>
          <p className="mt-1 text-sm leading-snug text-[var(--text-2)]">
            {visivel ? t('social.perfil.visivel_descricao') : t('social.perfil.oculto_descricao')}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={visivel}
          aria-label={t('social.perfil.aparecer')}
          disabled={salvando}
          onClick={() => salvar({ visible: !visivel })}
          className={`relative inline-flex h-11 w-16 shrink-0 items-center rounded-full border transition-colors ${FOCO} ${
            visivel ? 'border-[var(--text)] bg-[var(--text)]' : 'border-[var(--line-strong)] bg-[var(--surface)]'
          }`}
        >
          <span
            aria-hidden="true"
            className={`absolute h-7 w-7 rounded-full transition-all ${
              visivel ? 'start-[calc(100%-2rem)] bg-[var(--page)]' : 'start-1 bg-[var(--text-3)]'
            }`}
          />
        </button>
      </div>
      <p className="mt-1 text-xs font-medium text-[var(--text-3)]">{t('social.perfil.aparecer')}</p>

      <label htmlFor="bio-perfil" className="mt-4 block text-sm font-medium text-[var(--text)]">
        {t('social.perfil.bio')}
      </label>
      <textarea
        id="bio-perfil"
        dir="auto"
        value={bio}
        maxLength={BIO_MAX}
        rows={2}
        onChange={(e) => setBio(e.target.value)}
        placeholder={t('social.perfil.bio_placeholder')}
        className="mt-1 w-full resize-none rounded-lg border border-[var(--line)] bg-[var(--page)] px-3 py-2 text-base text-[var(--text)] outline-none focus:border-[var(--line-strong)] sm:text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-[var(--text-3)] tabular-nums">
          {bio.length}/{BIO_MAX}
        </span>
        <div className="flex flex-wrap items-center gap-3">
          {/* Contagem visível só para o dono (N22). */}
          <span className="text-sm text-[var(--text-2)]">
            {t('social.perfil.seguidores', { count: perfil.data.follower_count })}
          </span>
          <button
            type="button"
            onClick={() => salvar({ bio })}
            disabled={salvando || bio === perfil.data.bio}
            className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm disabled:opacity-50`}
          >
            {t('social.perfil.salvar_bio')}
          </button>
        </div>
      </div>
      <p className="mt-3 text-xs leading-snug text-[var(--text-3)]">{t('social.perfil.privacidade')}</p>
    </section>
  )
}

export default function PaginaPessoas() {
  const { t } = useTranslation()
  const { autenticado, orgId, token, status } = useDadosNav()
  const [busca, setBusca] = useState('')
  const [termo, setTermo] = useState('')
  const [seguindo, setSeguindo] = useState(false)
  const queryClient = useQueryClient()

  useEffect(() => {
    const id = window.setTimeout(() => setTermo(busca.trim()), 300)
    return () => window.clearTimeout(id)
  }, [busca])

  const chave = ['social', 'pessoas', orgId ?? 0, termo, seguindo]
  const lista = useQuery<Pessoa[]>({
    queryKey: chave,
    queryFn: () => listarPessoas(orgId as number, { q: termo || undefined, seguindo, limit: 50 }, token),
    enabled: autenticado && !!orgId && !!token,
  })

  const atualizarPessoa = (p: Pessoa) => {
    queryClient.setQueryData<Pessoa[]>(chave, (atual) => atual?.map((x) => (x.user_uuid === p.user_uuid ? p : x)))
    queryClient.invalidateQueries({ queryKey: ['social', 'feed-seguindo'] })
  }

  if (status !== 'loading' && !autenticado) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-10">
        <p className="text-[var(--text-2)]">{t('social.pessoas.so_membros')}</p>
      </main>
    )
  }

  const erro = lista.error as any
  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:pt-10">
      <h1 className="text-3xl leading-tight text-[var(--text)]" style={SERIF}>
        {t('social.pessoas.titulo')}
      </h1>
      <p className="mt-1 text-sm text-[var(--text-2)]">{t('social.pessoas.descricao')}</p>

      {orgId && token && (
        <div className="mt-6">
          <CartaoMeuPerfil orgId={orgId} token={token} />
        </div>
      )}

      <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <MagnifyingGlass size={16} aria-hidden="true" className="absolute start-3 top-1/2 -translate-y-1/2 text-[var(--text-3)]" />
          <input
            type="search"
            dir="auto"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder={t('social.pessoas.buscar')}
            aria-label={t('social.pessoas.buscar')}
            className="min-h-11 w-full rounded-lg border border-[var(--line)] bg-[var(--page)] ps-9 pe-3 text-base text-[var(--text)] outline-none focus:border-[var(--line-strong)] sm:text-sm"
          />
        </div>
        <div className="flex gap-2" role="group" aria-label={t('social.pessoas.filtro')}>
          {[false, true].map((v) => (
            <button
              key={String(v)}
              type="button"
              aria-pressed={seguindo === v}
              onClick={() => setSeguindo(v)}
              className={`min-h-11 rounded-full border px-4 text-sm transition-colors ${FOCO} ${
                seguindo === v
                  ? 'border-[var(--text)] bg-[var(--text)] text-[var(--page)]'
                  : 'border-[var(--line)] text-[var(--text-2)] hover:bg-[var(--surface)]'
              }`}
            >
              {v ? t('social.pessoas.que_sigo') : t('social.pessoas.todas')}
            </button>
          ))}
        </div>
      </div>

      <section aria-live="polite" className="mt-4">
        {lista.isLoading && (
          <ul className={`${PAINEL} divide-y divide-[var(--line)]`} aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex items-center gap-3 p-4">
                <span className="h-10 w-10 animate-pulse rounded-full bg-[var(--surface)]" />
                <span className="h-4 w-1/3 animate-pulse rounded bg-[var(--surface)]" />
              </li>
            ))}
          </ul>
        )}
        {erro && <p className="text-sm text-[var(--text-2)]">{t('social.pessoas.so_membros')}</p>}
        {!lista.isLoading && !erro && (lista.data?.length ?? 0) === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-[var(--line-strong)] px-4 py-10 text-center">
            <UsersThree size={28} aria-hidden="true" className="text-[var(--text-3)]" />
            <p className="text-sm text-[var(--text-2)]">
              {seguindo ? t('social.pessoas.vazio_seguindo') : termo ? t('social.pessoas.vazio_busca') : t('social.pessoas.vazio')}
            </p>
          </div>
        )}
        {(lista.data?.length ?? 0) > 0 && (
          <ul className={`${PAINEL} divide-y divide-[var(--line)] overflow-hidden`}>
            {lista.data!.map((p) => (
              <li key={p.user_uuid} className="flex items-center gap-3 px-4 py-3">
                <Link
                  href={rotaPessoa(p.user_uuid)}
                  className={`flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg ${FOCO}`}
                >
                  <AvatarPessoa pessoa={p} />
                  <span className="min-w-0">
                    <span className="block truncate text-base font-medium text-[var(--text)]">
                      {nomeDaPessoa(p)}
                      {p.is_self && <span className="ms-2 text-xs font-normal text-[var(--text-3)]">{t('social.pessoas.voce')}</span>}
                    </span>
                    {p.bio && <span className="block truncate text-sm text-[var(--text-2)]" dir="auto">{p.bio}</span>}
                  </span>
                </Link>
                {orgId && <BotaoSeguir pessoa={p} orgId={orgId} token={token} aoMudar={atualizarPessoa} />}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  )
}
