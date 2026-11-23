'use client'

import React, { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BookOpen, Lock, PencilSimple } from '@phosphor-icons/react'
import { getUriWithOrg } from '@services/config/config'
import { getDiscussions, getLabelInfo, DiscussionWithAuthor } from '@services/communities/discussions'
import { getLabelIcon } from '@components/Objects/Communities/labelIcons'
import { parseApiDate } from '@/lib/datas'
import { formatarReferencia, lerCodigoReferencia, codigoReferencia, type Referencia } from '@/lib/biblia/referencias'
import { CHAVE_ULTIMO_CAPITULO } from '@/lib/discipulei/nav'
import { useBibliaIdioma, useNomesLivros } from '@components/Biblia/useBibliaIdioma'
import { primeiroNome, useDadosNav } from '@components/Discipulei/Navegacao/useDadosNav'
import { useEscrever } from '@components/Discipulei/Navegacao/EscreverContexto'
import { CartaoDesafio } from '@components/Discipulei/Aprender/CartaoDesafio'
import { ConviteEstudo } from '@components/Discipulei/ChamadaEstudo'
import { feedSeguindo } from '@services/communities/social'
import { ROTA_PESSOAS } from '@components/Discipulei/Social/comum'
import {
  BOTAO_PRIMARIO,
  BOTAO_SECUNDARIO,
  FOCO,
  SERIF,
  caminhoDiscussao,
  caminhoNota,
} from '@components/Discipulei/Navegacao/estilos'

/** Quantas comunidades e itens entram em "Nas suas comunidades". */
const MAX_COMUNIDADES = 3
const MAX_ITENS = 6

type ItemFeed = DiscussionWithAuthor & { community_uuid: string; community_name: string }

function saudacao(hora: number): 'bom_dia' | 'boa_tarde' | 'boa_noite' {
  if (hora >= 5 && hora < 12) return 'bom_dia'
  if (hora >= 12 && hora < 18) return 'boa_tarde'
  return 'boa_noite'
}

/** Último capítulo aberto no leitor (localStorage do próprio leitor). */
function useUltimoCapitulo(): Referencia | null | undefined {
  // undefined = ainda lendo (evita piscar o estado vazio no primeiro render).
  const [ref, setRef] = useState<Referencia | null | undefined>(undefined)
  useEffect(() => {
    try {
      setRef(lerCodigoReferencia(window.localStorage.getItem(CHAVE_ULTIMO_CAPITULO)))
    } catch {
      setRef(null)
    }
  }, [])
  return ref
}

const PAINEL = 'rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-5'

function TituloSecao({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="text-xl leading-tight text-[var(--text)]" style={SERIF}>
      {children}
    </h2>
  )
}

export default function HojeClient({ orgslug }: { orgslug: string }) {
  const { t, i18n } = useTranslation()
  const { status, autenticado, token, orgId, usuario, comunidades, carregandoComunidades, notasRecentes, carregandoNotas } =
    useDadosNav()
  // Filtro "Pessoas que sigo" (N39): só um recorte do que a pessoa já lê.
  const [filtroFeed, setFiltroFeed] = useState<'todas' | 'seguindo'>('todas')
  const { abrirEscrever } = useEscrever()
  const ultimo = useUltimoCapitulo()
  // nome do livro no idioma da interface (index.json da versão padrão dele)
  const { versaoPadrao, montado } = useBibliaIdioma()
  const nomesLivros = useNomesLivros(montado ? versaoPadrao : null)

  const [agora, setAgora] = useState<Date | null>(null)
  useEffect(() => setAgora(new Date()), [])

  const idioma = i18n.language?.startsWith('pt') ? 'pt-BR' : i18n.language || 'pt-BR'
  const dataExtenso = agora
    ? new Intl.DateTimeFormat(idioma, { weekday: 'long', day: 'numeric', month: 'long' }).format(agora)
    : ''
  const nome = primeiroNome(usuario)

  // Feed: as primeiras comunidades acessíveis, discussões públicas recentes.
  const alvo = useMemo(() => comunidades.slice(0, MAX_COMUNIDADES), [comunidades])
  const feedQuery = useQuery<ItemFeed[]>({
    queryKey: ['discipulei', 'hoje', 'feed', alvo.map((c) => c.community_uuid).join(',')],
    queryFn: async () => {
      const listas = await Promise.all(
        alvo.map(async (c) => {
          try {
            const itens = await getDiscussions(c.community_uuid, 'recent', 1, MAX_ITENS, null, token)
            return (Array.isArray(itens) ? itens : []).map((d) => ({
              ...d,
              community_uuid: c.community_uuid,
              community_name: c.name,
            }))
          } catch {
            return []
          }
        })
      )
      return listas
        .flat()
        .filter((d) => d.visibility !== 'private')
        .sort((a, b) => parseApiDate(b.creation_date).valueOf() - parseApiDate(a.creation_date).valueOf())
        .slice(0, MAX_ITENS)
    },
    enabled: autenticado && alvo.length > 0,
    staleTime: 60_000,
  })

  const seguindoQuery = useQuery<ItemFeed[]>({
    queryKey: ['social', 'feed-seguindo', orgId ?? 0],
    queryFn: async () => {
      const itens = await feedSeguindo(orgId as number, MAX_ITENS, token)
      return Array.isArray(itens) ? itens : []
    },
    enabled: autenticado && !!orgId && !!token && filtroFeed === 'seguindo',
    staleTime: 60_000,
  })
  const feedAtual = filtroFeed === 'seguindo' ? seguindoQuery : feedQuery
  const carregandoFeed = filtroFeed === 'seguindo' ? seguindoQuery.isLoading : carregandoComunidades || feedQuery.isLoading

  const rascunho = notasRecentes[0]
  const pessoaNova = ultimo === null && !carregandoNotas && notasRecentes.length === 0

  if (status === 'unauthenticated') {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 pb-12 pt-8 sm:pt-12">
        <h1 className="text-3xl leading-tight text-[var(--text)]" style={SERIF}>
          {t('hoje.anonimo_titulo')}
        </h1>
        <p className="mt-2 max-w-prose text-base text-[var(--text-2)]">{t('hoje.anonimo_descricao')}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={getUriWithOrg(orgslug, '/login?next=/hoje')} className={`${BOTAO_PRIMARIO} min-h-11 px-5 text-sm`}>
            {t('auth.login')}
          </Link>
          <Link href={getUriWithOrg(orgslug, '/biblia')} className={`${BOTAO_SECUNDARIO} min-h-11 px-5 text-sm`}>
            {t('hoje.abrir_biblia')}
          </Link>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto w-full max-w-3xl px-4 pb-12 pt-6 sm:pt-10">
      <header>
        <h1 className="text-3xl leading-tight text-[var(--text)] sm:text-4xl" style={SERIF} suppressHydrationWarning>
          {(() => {
            const chave = agora ? saudacao(agora.getHours()) : 'ola'
            return nome ? t(`hoje.${chave}`, { nome }) : t(`hoje.${chave}_sem_nome`)
          })()}
        </h1>
        <p className="mt-1 text-sm text-[var(--text-2)] first-letter:uppercase" suppressHydrationWarning>
          {dataExtenso || ' '}
        </p>
      </header>

      {/* Pessoa nova: dois começos possíveis, sem painéis vazios. */}
      {pessoaNova ? (
        <section aria-labelledby="hoje-comecar" className="mt-8">
          <TituloSecao id="hoje-comecar">{t('hoje.comecar_titulo')}</TituloSecao>
          <p className="mt-1 max-w-prose text-sm text-[var(--text-2)]">{t('hoje.comecar_descricao')}</p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <Link
              href={getUriWithOrg(orgslug, '/biblia?ref=JHN.1')}
              className={`${PAINEL} group flex flex-1 items-start gap-4 transition-colors hover:border-[var(--line-strong)] ${FOCO}`}
            >
              <BookOpen size={24} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--text)]" />
              <span className="min-w-0">
                <span className="block text-base font-semibold text-[var(--text)]">{t('hoje.comece_biblia')}</span>
                <span className="mt-1 block text-sm leading-snug text-[var(--text-2)]">{t('hoje.comece_biblia_descricao')}</span>
              </span>
            </Link>
            <button
              type="button"
              onClick={() => abrirEscrever('nota')}
              className={`${PAINEL} group flex flex-1 items-start gap-4 text-start transition-colors hover:border-[var(--line-strong)] ${FOCO}`}
            >
              <PencilSimple size={24} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--text)]" />
              <span className="min-w-0">
                <span className="block text-base font-semibold text-[var(--text)]">{t('hoje.primeira_nota')}</span>
                <span className="mt-1 block text-sm leading-snug text-[var(--text-2)]">{t('hoje.primeira_nota_descricao')}</span>
              </span>
            </button>
          </div>
        </section>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2">
          <section aria-labelledby="hoje-lendo" className={`${PAINEL} flex flex-col`}>
            <TituloSecao id="hoje-lendo">{t('hoje.continue_lendo')}</TituloSecao>
            {ultimo ? (
              <>
                <p className="mt-2 text-base font-medium text-[var(--text)]">{formatarReferencia(ultimo, false, nomesLivros)}</p>
                <p className="mt-0.5 text-sm text-[var(--text-2)]">{t('hoje.continue_lendo_descricao')}</p>
                <div className="mt-auto pt-4">
                  <Link
                    href={getUriWithOrg(orgslug, `/biblia?ref=${codigoReferencia({ livroId: ultimo.livroId, capitulo: ultimo.capitulo })}`)}
                    className={`${BOTAO_PRIMARIO} min-h-11 px-5 text-sm`}
                  >
                    {t('hoje.continuar_leitura')}
                    <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
                  </Link>
                </div>
              </>
            ) : ultimo === null ? (
              <>
                <p className="mt-2 text-sm text-[var(--text-2)]">{t('hoje.sem_leitura')}</p>
                <div className="mt-auto pt-4">
                  <Link href={getUriWithOrg(orgslug, '/biblia?ref=JHN.1')} className={`${BOTAO_SECUNDARIO} min-h-11 px-5 text-sm`}>
                    {t('hoje.abrir_biblia')}
                  </Link>
                </div>
              </>
            ) : (
              <div className="mt-3 h-16 animate-pulse rounded-lg bg-[var(--surface)]" aria-hidden="true" />
            )}
          </section>

          <section aria-labelledby="hoje-rascunho" className={`${PAINEL} flex flex-col`}>
            <TituloSecao id="hoje-rascunho">{t('hoje.ultimo_rascunho')}</TituloSecao>
            {rascunho ? (
              <>
                <p className="mt-2 line-clamp-2 text-base font-medium text-[var(--text)]" dir="auto">
                  {rascunho.title || t('caderno.sem_titulo')}
                </p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-[var(--text-2)]">
                  <Lock size={12} aria-hidden="true" />
                  <span>{t('caderno.no_seu_caderno')}</span>
                  <span aria-hidden="true">·</span>
                  <span>{parseApiDate(rascunho.updated_at).fromNow()}</span>
                </p>
                <div className="mt-auto pt-4">
                  <Link
                    href={getUriWithOrg(orgslug, caminhoNota(rascunho))}
                    className={`${BOTAO_PRIMARIO} min-h-11 px-5 text-sm`}
                  >
                    {t('hoje.continuar')}
                    <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
                  </Link>
                </div>
              </>
            ) : carregandoNotas ? (
              <div className="mt-3 h-16 animate-pulse rounded-lg bg-[var(--surface)]" aria-hidden="true" />
            ) : (
              <>
                <p className="mt-2 text-sm text-[var(--text-2)]">{t('hoje.sem_rascunho')}</p>
                <div className="mt-auto pt-4">
                  <button type="button" onClick={() => abrirEscrever('nota')} className={`${BOTAO_SECUNDARIO} min-h-11 px-5 text-sm`}>
                    {t('hoje.primeira_nota')}
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* Convite discreto para agendar estudo (N40): a cada 3 dias de uso. */}
      <ConviteEstudo lugar="hoje" className="mt-8" />

      {/* Desafio atual: apoio discreto, some quando não há desafio aberto. */}
      <CartaoDesafio orgslug={orgslug} />

      <section aria-labelledby="hoje-comunidades" className="mt-10">
        <div className="flex items-baseline justify-between gap-3">
          <TituloSecao id="hoje-comunidades">{t('hoje.nas_comunidades')}</TituloSecao>
          <Link
            href={getUriWithOrg(orgslug, '/communities')}
            className={`inline-flex min-h-11 items-center text-sm font-medium text-[var(--text-2)] underline decoration-[var(--link-underline)] underline-offset-4 hover:text-[var(--text)] ${FOCO}`}
          >
            {t('hoje.ver_comunidades')}
          </Link>
        </div>

        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={t('social.feed.filtro')}>
          {(['todas', 'seguindo'] as const).map((f) => (
            <button
              key={f}
              type="button"
              aria-pressed={filtroFeed === f}
              onClick={() => setFiltroFeed(f)}
              className={`min-h-11 rounded-full border px-4 text-sm transition-colors ${FOCO} ${
                filtroFeed === f
                  ? 'border-[var(--text)] bg-[var(--text)] text-[var(--page)]'
                  : 'border-[var(--line)] text-[var(--text-2)] hover:bg-[var(--surface)]'
              }`}
            >
              {f === 'todas' ? t('social.feed.todas') : t('social.feed.seguindo')}
            </button>
          ))}
        </div>

        {carregandoFeed && (
          <ul className="mt-3 flex flex-col gap-px overflow-hidden rounded-2xl border border-[var(--line)]" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <li key={i} className="flex flex-col gap-2 bg-[var(--panel)] px-4 py-4">
                <span className="h-4 w-3/4 animate-pulse rounded bg-[var(--surface)]" />
                <span className="h-3 w-1/3 animate-pulse rounded bg-[var(--surface)]" />
              </li>
            ))}
          </ul>
        )}

        {!carregandoFeed && (feedAtual.data?.length ?? 0) === 0 && (
          <p className="mt-3 rounded-2xl border border-dashed border-[var(--line-strong)] px-4 py-6 text-sm text-[var(--text-2)]">
            {filtroFeed === 'seguindo' ? (
              <>
                {t('social.feed.vazio_seguindo')}{' '}
                <Link href={ROTA_PESSOAS} className="font-medium text-[var(--text)] underline underline-offset-4">
                  {t('social.pessoas.titulo')}
                </Link>
              </>
            ) : comunidades.length === 0 ? (
              t('hoje.sem_comunidades')
            ) : (
              t('hoje.comunidades_quietas')
            )}
          </p>
        )}

        {!carregandoFeed && (feedAtual.data?.length ?? 0) > 0 && (
          <ul className="mt-3 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
            {feedAtual.data!.map((d) => {
              const rotulo = getLabelInfo(d.label || 'general')
              const autor = d.author
                ? `${d.author.first_name || ''} ${d.author.last_name || ''}`.trim() || d.author.username
                : t('common.unknown')
              return (
                <li key={d.discussion_uuid} className="border-b border-[var(--line)] last:border-b-0">
                  <Link
                    href={getUriWithOrg(orgslug, caminhoDiscussao(d.community_uuid, d.discussion_uuid))}
                    className={`flex items-start gap-3 px-4 py-3.5 transition-colors hover:bg-[var(--surface)] ${FOCO} focus-visible:outline-offset-[-2px]`}
                  >
                    <span
                      className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface)]"
                      style={{ color: rotulo.color }}
                      aria-hidden="true"
                    >
                      {d.emoji ? <span className="text-base">{d.emoji}</span> : getLabelIcon(rotulo.icon, 14)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-base font-medium leading-snug text-[var(--text)]" dir="auto">
                        {d.title}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-[var(--text-2)]">
                        <span>{d.community_name}</span>
                        <span aria-hidden="true">·</span>
                        <span>{t(`communities.labels.${rotulo.id}`)}</span>
                        <span aria-hidden="true">·</span>
                        <span>{autor}</span>
                        <span aria-hidden="true">·</span>
                        <span>{parseApiDate(d.creation_date).fromNow()}</span>
                      </span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </main>
  )
}
