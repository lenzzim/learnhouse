'use client'

/**
 * Um bate-papo (N45): data no fuso de quem lê, tema, quem conduz, passagens,
 * presença, "Adicionar à agenda" e "Entrar" (destacado de 10 minutos antes
 * até o fim). O link só vem para membros logados; a lista de confirmados só
 * para admins e o grupo de autores.
 */

import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, PencilSimple, Trash } from '@phosphor-icons/react'
import { getUriWithOrg } from '@services/config/config'
import {
  apagarBatePapo,
  listarConfirmados,
  obterBatePapo,
  situacaoAgora,
  type BatePapo,
  type ListaConfirmados,
} from '@services/communities/batepapos'
import { nomeDaPessoa } from '@services/communities/social'
import { useDadosNav } from '@components/Discipulei/Navegacao/useDadosNav'
import { BOTAO_SECUNDARIO, FOCO, SERIF, caminhoDiscussao } from '@components/Discipulei/Navegacao/estilos'
import { FolhaInferior } from '@components/Discipulei/Navegacao/FolhaInferior'
import { AvatarPessoa } from '@components/Discipulei/Social/comum'
import { FormularioEvento } from './FormularioEvento'
import {
  BotaoAgenda,
  BotaoEntrar,
  CHAVES_BATEPAPO,
  DataEvento,
  LINK_DISCRETO,
  Presenca,
  ROTA_BATEPAPOS,
  useAgora,
} from './comum'

const PAINEL = 'rounded-2xl border border-[var(--line)] bg-[var(--panel)]'

function Confirmados({ ev, token }: { ev: BatePapo; token?: string }) {
  const { t } = useTranslation()
  const q = useQuery<ListaConfirmados>({
    queryKey: [...CHAVES_BATEPAPO.confirmados(ev.event_uuid), ev.going_count, ev.maybe_count],
    queryFn: () => listarConfirmados(ev.event_uuid, token),
    enabled: !!token,
  })
  const grupos: Array<['going' | 'maybe', string]> = [
    ['going', t('batepapos.confirmados.vao')],
    ['maybe', t('batepapos.confirmados.talvez')],
  ]
  return (
    <section aria-labelledby="confirmados-titulo" className={`${PAINEL} p-5`}>
      <h2 id="confirmados-titulo" className="text-lg text-[var(--text)]" style={SERIF}>
        {t('batepapos.confirmados.titulo')}
      </h2>
      <p className="mt-1 text-xs text-[var(--text-3)]">{t('batepapos.confirmados.so_voce')}</p>
      {q.isLoading ? (
        <div className="mt-3 h-16 animate-pulse rounded-lg bg-[var(--surface)]" aria-hidden="true" />
      ) : (
        grupos.map(([chave, rotulo]) => {
          const pessoas = q.data?.[chave] ?? []
          return (
            <div key={chave} className="mt-4">
              <h3 className="text-sm font-semibold text-[var(--text)]">
                {rotulo} ({pessoas.length})
              </h3>
              {pessoas.length === 0 ? (
                <p className="mt-1 text-sm text-[var(--text-3)]">{t('batepapos.confirmados.ninguem')}</p>
              ) : (
                <ul className="mt-2 flex flex-col gap-2">
                  {pessoas.map((p) => (
                    <li key={p.user_uuid} className="flex items-center gap-2 text-sm text-[var(--text-2)]">
                      <AvatarPessoa pessoa={p} tamanho={28} />
                      <span dir="auto">{nomeDaPessoa(p)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )
        })
      )}
    </section>
  )
}

export default function DetalheEvento({ id, orgslug }: { id: string; orgslug: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { autenticado, token, status } = useDadosNav()
  const agora = useAgora()
  const [editando, setEditando] = useState(false)
  const [confirmarApagar, setConfirmarApagar] = useState(false)

  const q = useQuery<BatePapo>({
    queryKey: [...CHAVES_BATEPAPO.um(id), autenticado],
    queryFn: () => obterBatePapo(id, token),
    enabled: status !== 'loading',
    staleTime: 30_000,
  })
  const ev = q.data

  const voltar = (
    <Link
      href={getUriWithOrg(orgslug, ROTA_BATEPAPOS)}
      className={`inline-flex min-h-11 items-center gap-2 text-sm text-[var(--text-2)] hover:text-[var(--text)] ${FOCO}`}
    >
      <ArrowLeft size={16} aria-hidden="true" className="rtl:-scale-x-100" />
      {t('batepapos.voltar')}
    </Link>
  )

  if (q.isLoading || status === 'loading') {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:pt-10">
        {voltar}
        <div className={`${PAINEL} mt-4 h-64 animate-pulse`} aria-hidden="true" />
      </main>
    )
  }

  if (!ev) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:pt-10">
        {voltar}
        <p className="mt-6 text-[var(--text-2)]">{t('batepapos.nao_encontrado')}</p>
      </main>
    )
  }

  const situacao = agora ? situacaoAgora(ev, agora) : ev.status

  const apagar = async () => {
    try {
      await apagarBatePapo(ev.event_uuid, token)
      queryClient.invalidateQueries({ queryKey: CHAVES_BATEPAPO.todas })
      toast.success(t('batepapos.apagado'))
      router.push(getUriWithOrg(orgslug, ROTA_BATEPAPOS))
    } catch {
      toast.error(t('batepapos.erro'))
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:pt-10">
      {voltar}
      <article className={`${PAINEL} mt-4 flex flex-col gap-4 p-5 sm:p-6`}>
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-2)]">
          {situacao === 'live' && (
            <span className="rounded-full border border-[var(--text)] px-2 py-0.5 text-xs font-semibold text-[var(--text)]">
              {t('batepapos.ao_vivo')}
            </span>
          )}
          {situacao === 'past' && (
            <span className="rounded-full border border-[var(--line-strong)] px-2 py-0.5 text-xs text-[var(--text-3)]">
              {t('batepapos.encerrado')}
            </span>
          )}
          <DataEvento ev={ev} />
        </div>
        <h1 className="text-3xl leading-tight text-[var(--text)]" style={SERIF} dir="auto">
          {ev.title}
        </h1>
        {ev.theme && (
          <p className="text-base text-[var(--text-2)]" dir="auto">
            {ev.theme}
          </p>
        )}
        <dl className="grid gap-2 text-sm">
          {ev.host_name && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-[var(--text-3)]">{t('batepapos.quem_conduz')}</dt>
              <dd className="text-[var(--text)]" dir="auto">{ev.host_name}</dd>
            </div>
          )}
          {ev.passages && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-[var(--text-3)]">{t('batepapos.passagens')}</dt>
              <dd className="text-[var(--text)]" dir="auto">{ev.passages}</dd>
            </div>
          )}
        </dl>
        {ev.description && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--text-2)]" dir="auto">
            {ev.description}
          </p>
        )}

        {situacao !== 'past' && (
          <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-4">
            {autenticado ? (
              <>
                <Presenca ev={ev} token={token} aoMudar={(novo) => queryClient.setQueryData([...CHAVES_BATEPAPO.um(id), autenticado], novo)} />
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <BotaoEntrar ev={ev} agora={agora} />
                  <BotaoAgenda ev={ev} token={token} />
                </div>
                {!ev.meeting_url && <p className="text-xs text-[var(--text-3)]">{t('batepapos.sem_link')}</p>}
              </>
            ) : (
              <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
                <BotaoAgenda ev={ev} token={token} />
                <Link
                  href={getUriWithOrg(orgslug, `/login?next=${encodeURIComponent(`/batepapos/${id}`)}`)}
                  className={`${LINK_DISCRETO} text-sm`}
                >
                  {t('batepapos.entre_para_link')}
                </Link>
              </div>
            )}
          </div>
        )}

        {ev.announcement_discussion_uuid && ev.announcement_community_uuid && (
          <Link
            href={getUriWithOrg(orgslug, caminhoDiscussao(ev.announcement_community_uuid, ev.announcement_discussion_uuid))}
            className={`${LINK_DISCRETO} text-sm`}
          >
            {t('batepapos.ver_post')}
          </Link>
        )}

        {ev.can_manage && (
          <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
            <button type="button" onClick={() => setEditando(true)} className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm`}>
              <PencilSimple size={16} aria-hidden="true" />
              {t('batepapos.editar')}
            </button>
            {confirmarApagar ? (
              <>
                <button type="button" onClick={apagar} className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm font-semibold`}>
                  <Trash size={16} aria-hidden="true" />
                  {t('batepapos.confirmar_apagar')}
                </button>
                <button type="button" onClick={() => setConfirmarApagar(false)} className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm`}>
                  {t('batepapos.form.cancelar')}
                </button>
              </>
            ) : (
              <button type="button" onClick={() => setConfirmarApagar(true)} className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm`}>
                <Trash size={16} aria-hidden="true" />
                {t('batepapos.apagar')}
              </button>
            )}
          </div>
        )}
      </article>

      {ev.can_manage && (
        <div className="mt-4">
          <Confirmados ev={ev} token={token} />
        </div>
      )}

      {ev.can_manage && (
        <FolhaInferior aberta={editando} aoMudar={setEditando} titulo={t('batepapos.editar')} larguraDesktop="md">
          <FormularioEvento
            inicial={ev}
            aoCancelar={() => setEditando(false)}
            aoSalvar={(novo) => {
              setEditando(false)
              queryClient.setQueryData([...CHAVES_BATEPAPO.um(id), autenticado], novo)
              queryClient.invalidateQueries({ queryKey: CHAVES_BATEPAPO.todas })
            }}
          />
        </FolhaInferior>
      )}
    </main>
  )
}
