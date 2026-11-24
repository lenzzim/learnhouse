'use client'

/**
 * Um evento da Agenda: data no fuso de quem lê, tipo, lugar público
 * (região/cidade/bairro), quem organiza, descrição, presença, "Adicionar à
 * agenda" (Google ou .ics), compartilhar e "Entrar" (online).
 *
 * Endereço exato e link online só aparecem se o servidor mandou (quem
 * confirmou "Vou", quem criou, admins/Equipe). Visitante vê o convite
 * "Entrar para se inscrever", que volta para este evento depois do login.
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { ArrowLeft, Copy, LockSimple, MapPin, PencilSimple, Prohibit, Trash, VideoCamera } from '@phosphor-icons/react'
import { getUriWithOrg } from '@services/config/config'
import {
  apagarBatePapo,
  cancelarEvento,
  idCurtoEvento,
  listarConfirmados,
  obterBatePapo,
  situacaoAgora,
  type BatePapo,
  type ListaConfirmados,
} from '@services/communities/batepapos'
import { nomeDaPessoa } from '@services/communities/social'
import { useDadosNav } from '@components/Discipulei/Navegacao/useDadosNav'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, FOCO, SERIF, caminhoDiscussao } from '@components/Discipulei/Navegacao/estilos'
import { FolhaInferior } from '@components/Discipulei/Navegacao/FolhaInferior'
import { AvatarPessoa } from '@components/Discipulei/Social/comum'
import { FormularioEvento } from './FormularioEvento'
import {
  BotaoAgenda,
  BotaoCompartilhar,
  BotaoEntrar,
  CHAVES_BATEPAPO,
  DataEvento,
  LINK_DISCRETO,
  LinhaLocal,
  Presenca,
  ROTA_BATEPAPOS,
  Selos,
  rotaBatePapo,
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
      <p className="mt-1 text-xs text-[var(--text-3)]">{t('agenda.confirmados_so_voce')}</p>
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

/** Endereço/link liberados (só chegam aqui se o servidor mandou). */
function DetalhesPrivados({ ev }: { ev: BatePapo }) {
  const { t } = useTranslation()
  if (!ev.address && !(ev.meeting_url && ev.mode === 'online')) return null
  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto)
      toast.success(t('agenda.copiado'))
    } catch {
      /* sem área de transferência */
    }
  }
  return (
    <div className="rounded-xl border border-[var(--line-strong)] p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-3)]">{t('agenda.so_inscritos')}</p>
      {ev.address && (
        <div className="mt-2 flex items-start gap-2 text-sm text-[var(--text)]">
          <MapPin size={18} aria-hidden="true" className="mt-0.5 shrink-0" />
          <div className="flex-1">
            <p dir="auto" className="break-words">
              {ev.address}
            </p>
            <div className="mt-1 flex flex-wrap gap-x-4">
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  [ev.address, ev.neighborhood, ev.city].filter(Boolean).join(', ')
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className={`${LINK_DISCRETO} inline-flex min-h-11 items-center text-sm`}
              >
                {t('agenda.abrir_mapa')}
                <span className="sr-only"> ({t('batepapos.nova_aba')})</span>
              </a>
              <button type="button" onClick={() => copiar(ev.address || '')} className={`${LINK_DISCRETO} inline-flex min-h-11 items-center gap-1 text-sm`}>
                <Copy size={14} aria-hidden="true" />
                {t('agenda.copiar_endereco')}
              </button>
            </div>
          </div>
        </div>
      )}
      {ev.meeting_url && ev.mode === 'online' && (
        <p className="mt-2 flex items-center gap-2 break-all text-sm text-[var(--text-2)]">
          <VideoCamera size={18} aria-hidden="true" className="shrink-0" />
          {ev.meeting_url}
        </p>
      )}
    </div>
  )
}

export default function DetalheEvento({ id, orgslug }: { id: string; orgslug: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const queryClient = useQueryClient()
  const { autenticado, token, status } = useDadosNav()
  const agora = useAgora()
  const [editando, setEditando] = useState(false)
  const [duplicando, setDuplicando] = useState(false)
  const [confirmar, setConfirmar] = useState<'apagar' | 'cancelar' | null>(null)
  const [origem, setOrigem] = useState('')
  useEffect(() => setOrigem(window.location.origin), [])

  const chave = [...CHAVES_BATEPAPO.um(id), autenticado]
  const q = useQuery<BatePapo>({
    queryKey: chave,
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
      {t('agenda.voltar')}
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
        <p className="mt-6 text-[var(--text-2)]">{t('agenda.nao_encontrado')}</p>
      </main>
    )
  }

  const situacao = agora ? situacaoAgora(ev, agora) : ev.status
  const caminho = rotaBatePapo(ev.event_uuid)
  const linkPublico = origem ? `${origem}${getUriWithOrg(orgslug, caminho).replace(/^https?:\/\/[^/]+/, '')}` : ''
  const quem = ev.host_name || ev.organizer_name

  const apagar = async () => {
    try {
      await apagarBatePapo(ev.event_uuid, token)
      queryClient.invalidateQueries({ queryKey: CHAVES_BATEPAPO.todas })
      toast.success(t('agenda.apagado'))
      router.push(getUriWithOrg(orgslug, ROTA_BATEPAPOS))
    } catch {
      toast.error(t('batepapos.erro'))
    }
  }

  const cancelar = async () => {
    try {
      const novo = await cancelarEvento(ev.event_uuid, token)
      queryClient.setQueryData(chave, novo)
      queryClient.invalidateQueries({ queryKey: CHAVES_BATEPAPO.todas })
      setConfirmar(null)
      toast.success(t('agenda.cancelado_ok'))
    } catch {
      toast.error(t('batepapos.erro'))
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-6 sm:pt-10">
      {voltar}
      <article className={`${PAINEL} mt-4 flex flex-col gap-4 p-5 sm:p-6`}>
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--text-2)]">
          <Selos ev={ev} situacao={situacao} />
          {situacao === 'past' && !ev.cancelled && (
            <span className="rounded-full border border-[var(--line-strong)] px-2 py-0.5 text-xs text-[var(--text-3)]">
              {t('batepapos.encerrado')}
            </span>
          )}
          <DataEvento ev={ev} />
        </div>
        <h1 className={`text-3xl leading-tight text-[var(--text)] ${ev.cancelled ? 'line-through' : ''}`} style={SERIF} dir="auto">
          {ev.title}
        </h1>
        {ev.cancelled && <p className="text-sm font-semibold text-[var(--text)]">{t('agenda.cancelado_aviso')}</p>}
        <p className="text-sm text-[var(--text-2)]">
          <LinhaLocal ev={ev} />
        </p>
        {ev.theme && (
          <p className="text-base text-[var(--text-2)]" dir="auto">
            {ev.theme}
          </p>
        )}
        <dl className="grid gap-2 text-sm">
          {quem && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-[var(--text-3)]">{t('agenda.quem_organiza')}</dt>
              <dd className="text-[var(--text)]" dir="auto">
                {quem}
              </dd>
            </div>
          )}
          {ev.passages && (
            <div className="flex flex-wrap gap-x-2">
              <dt className="text-[var(--text-3)]">{t('batepapos.passagens')}</dt>
              <dd className="text-[var(--text)]" dir="auto">
                {ev.passages}
              </dd>
            </div>
          )}
          <div className="flex flex-wrap gap-x-2">
            <dt className="text-[var(--text-3)]">{t('agenda.confirmados')}</dt>
            <dd className="text-[var(--text)]">
              {t('batepapos.presenca.contagem', { vou: ev.going_count, talvez: ev.maybe_count })}
              {ev.capacity ? ` · ${t('agenda.vagas', { n: ev.spots_left ?? 0, total: ev.capacity })}` : ''}
            </dd>
          </div>
        </dl>
        {ev.description && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--text-2)]" dir="auto">
            {ev.description}
          </p>
        )}

        <DetalhesPrivados ev={ev} />

        {situacao !== 'past' && !ev.cancelled && (
          <div className="flex flex-col gap-3 border-t border-[var(--line)] pt-4">
            {autenticado ? (
              <>
                <Presenca ev={ev} token={token} aoMudar={(novo) => queryClient.setQueryData(chave, novo)} />
                {ev.details_locked && (
                  <p className="flex items-start gap-2 text-xs text-[var(--text-3)]">
                    <LockSimple size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                    {ev.mode === 'in_person' ? t('agenda.endereco_ao_confirmar') : t('agenda.link_ao_confirmar')}
                  </p>
                )}
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <BotaoEntrar ev={ev} agora={agora} />
                  <BotaoAgenda ev={ev} token={token} linkPublico={linkPublico} />
                  <BotaoCompartilhar titulo={ev.title} url={linkPublico} />
                </div>
              </>
            ) : (
              <>
                <Link
                  href={getUriWithOrg(orgslug, `/login?next=${encodeURIComponent(caminho)}`)}
                  className={`${BOTAO_PRIMARIO} min-h-11 px-5 text-sm sm:self-start`}
                >
                  {t('agenda.entrar_para_inscrever')}
                </Link>
                <p className="flex items-start gap-2 text-xs text-[var(--text-3)]">
                  <LockSimple size={14} aria-hidden="true" className="mt-0.5 shrink-0" />
                  {t('agenda.visitante_detalhes')}
                </p>
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
                  <BotaoAgenda ev={ev} token={token} linkPublico={linkPublico} />
                  <BotaoCompartilhar titulo={ev.title} url={linkPublico} />
                </div>
              </>
            )}
          </div>
        )}

        {ev.announcement_discussion_uuid && ev.announcement_community_uuid && (
          <Link
            href={getUriWithOrg(orgslug, caminhoDiscussao(ev.announcement_community_uuid, ev.announcement_discussion_uuid))}
            className={`${LINK_DISCRETO} inline-flex min-h-11 items-center text-sm`}
          >
            {t('batepapos.ver_post')}
          </Link>
        )}

        {ev.can_manage && (
          <div className="flex flex-wrap gap-2 border-t border-[var(--line)] pt-4">
            {!ev.cancelled && (
              <button type="button" onClick={() => setEditando(true)} className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm`}>
                <PencilSimple size={16} aria-hidden="true" />
                {t('batepapos.editar')}
              </button>
            )}
            <button type="button" onClick={() => setDuplicando(true)} className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm`}>
              <Copy size={16} aria-hidden="true" />
              {t('agenda.duplicar')}
            </button>
            {confirmar ? (
              <>
                <button
                  type="button"
                  onClick={confirmar === 'apagar' ? apagar : cancelar}
                  className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm font-semibold`}
                >
                  {confirmar === 'apagar' ? t('batepapos.confirmar_apagar') : t('agenda.confirmar_cancelar')}
                </button>
                <button type="button" onClick={() => setConfirmar(null)} className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm`}>
                  {t('agenda.voltar_acao')}
                </button>
              </>
            ) : (
              <>
                {!ev.cancelled && situacao !== 'past' && (
                  <button type="button" onClick={() => setConfirmar('cancelar')} className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm`}>
                    <Prohibit size={16} aria-hidden="true" />
                    {t('agenda.cancelar_evento')}
                  </button>
                )}
                <button type="button" onClick={() => setConfirmar('apagar')} className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm`}>
                  <Trash size={16} aria-hidden="true" />
                  {t('batepapos.apagar')}
                </button>
              </>
            )}
          </div>
        )}
        {confirmar === 'cancelar' && <p className="text-xs text-[var(--text-3)]">{t('agenda.cancelar_dica')}</p>}
      </article>

      {ev.can_manage && (
        <div className="mt-4">
          <Confirmados ev={ev} token={token} />
        </div>
      )}

      {ev.can_manage && (
        <>
          <FolhaInferior aberta={editando} aoMudar={setEditando} titulo={t('batepapos.editar')} larguraDesktop="md">
            <FormularioEvento
              inicial={ev}
              aoCancelar={() => setEditando(false)}
              aoSalvar={(novo) => {
                setEditando(false)
                queryClient.setQueryData(chave, novo)
                queryClient.invalidateQueries({ queryKey: CHAVES_BATEPAPO.todas })
              }}
            />
          </FolhaInferior>
          <FolhaInferior aberta={duplicando} aoMudar={setDuplicando} titulo={t('agenda.duplicar')} larguraDesktop="md">
            <FormularioEvento
              inicial={ev}
              duplicar
              aoCancelar={() => setDuplicando(false)}
              aoSalvar={(novo) => {
                setDuplicando(false)
                queryClient.invalidateQueries({ queryKey: CHAVES_BATEPAPO.todas })
                router.push(getUriWithOrg(orgslug, `${ROTA_BATEPAPOS}/${idCurtoEvento(novo.event_uuid)}`))
              }}
            />
          </FolhaInferior>
        </>
      )}
    </main>
  )
}
