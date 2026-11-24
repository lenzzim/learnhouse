'use client'

import React, { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BookOpenText, LinkSimple, ListDashes, Translate } from '@phosphor-icons/react'
import { SeletorVersao } from '@components/Biblia/SeletorVersao'
import { OriginalVerso, FONTE_GREGO, FONTE_HEBRAICO } from '@components/Biblia/OriginalVerso'
import {
  codigoReferencia,
  formatarReferencia,
  interpretarReferencia,
  intervaloVersos,
  lerCodigoReferencia,
} from '@/lib/biblia/referencias'
import { carregarOriginal, carregarVerbete, hrefLeitor, type Versiculo } from '@/lib/biblia/dados'
import { ehLicenciada, versaoPorId, type VersaoInfo } from '@/lib/biblia/versoes'
import { getVerses, getVersesComRecuo, rotuloVerso, type Capitulo, type Recuo } from '@/lib/biblia/fontes'
import { avaliarCitacao, blocoCitacao, MAX_VERSOS_EMBUTIR, textoDoBloco } from '@/lib/biblia/citacao'
import { mensagemErroBiblia, useAcessoBiblia, useFums } from '@components/Biblia/useFonteBiblia'
import { useBibliaIdioma, useNomesLivros } from '@components/Biblia/useBibliaIdioma'
import { AvisoRecuo } from '@components/Biblia/AvisoRecuo'
import {
  CREDITO_STEPBIBLE,
  URL_STEPBIBLE,
  ehNovoTestamento,
  partesDefinicao,
  type PalavraOriginal,
  type Verbete,
} from '@/lib/biblia/original'
import { titulosDoDoc } from '@/lib/caderno/conteudo'
import { backlinks, idDaNota } from '@services/caderno/notas'
import { useCaderno, CHAVES_CADERNO, type AbaDireita } from './CadernoContexto'
import { CAMPO, FOCO, SERIF } from './estilos'
import { hrefCaderno } from './PainelEsquerdo'

const CHAVE_VERSAO = 'discipulei_caderno_versao'
const CHAVE_COMPARAR = 'discipulei_caderno_comparar'

/**
 * Versão conhecida (aberta ou licenciada). As licenciadas (NVI, ARA...) vêm do
 * proxy da API com o token da sessão, como no leitor; o texto só é exibido,
 * nunca gravado na nota, e o crédito fica sempre visível.
 */
function versaoConhecida(id: string | null | undefined): string | null {
  return id && versaoPorId(id) ? id : null
}

/** Crédito exibido sob o texto: licenciada usa o copyright que a API entrega. */
function credito(info: VersaoInfo | undefined, cap: Capitulo | null | undefined): string {
  if (!info) return ''
  if (info.fonte === 'licenciada') return cap?.copyrightCurto || info.credito || info.sigla
  return `${info.sigla} · ${info.licenca}`
}

function lerPreferencia(chave: string, padrao: string): string {
  try {
    return window.localStorage.getItem(chave) ?? padrao
  } catch {
    return padrao
  }
}
function gravarPreferencia(chave: string, valor: string) {
  try {
    window.localStorage.setItem(chave, valor)
  } catch {
    /* modo privado */
  }
}

/* ------------------------------------------------------------ Bíblia */

function CampoReferencia({ inicial, aoIr }: { inicial: string; aoIr: (codigo: string) => void }) {
  const { t } = useTranslation()
  const [valor, setValor] = useState(inicial)
  const [erro, setErro] = useState(false)
  useEffect(() => setValor(inicial), [inicial])
  return (
    <form
      className="flex gap-1.5"
      onSubmit={(e) => {
        e.preventDefault()
        const ref = interpretarReferencia(valor)
        if (!ref) {
          setErro(true)
          return
        }
        setErro(false)
        aoIr(codigoReferencia(ref))
      }}
    >
      <label className="sr-only" htmlFor="painel-ref">{t('caderno.referencia')}</label>
      <input
        id="painel-ref"
        value={valor}
        onChange={(e) => {
          setValor(e.target.value)
          setErro(false)
        }}
        placeholder={t('caderno.referencia_placeholder')}
        aria-invalid={erro}
        aria-describedby={erro ? 'painel-ref-erro' : undefined}
        className={`${CAMPO} h-9`}
      />
      <button type="submit" aria-label={t('caderno.ir')} className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--line)] text-[var(--text-2)] hover:border-[var(--line-strong)] hover:text-[var(--text)] ${FOCO}`}>
        <ArrowRight size={16} aria-hidden="true" className="rtl:-scale-x-100" />
      </button>
      {erro && <span id="painel-ref-erro" className="sr-only">{t('biblia.referencia_invalida')}</span>}
    </form>
  )
}

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; erro?: unknown }
  | { tipo: 'pronto'; versos: Versiculo[]; capitulo: Capitulo; comparar: Versiculo[]; capCmp: Capitulo | null; recuo?: Recuo }

function AbaBiblia() {
  const { t } = useTranslation()
  const c = useCaderno()
  const ref = lerCodigoReferencia(c.passagem)
  // Sem escolha guardada, a padrão: NVI para quem está logado (decisão N38).
  // A versão escolhida no seletor (localStorage) continua mandando.
  const { versaoPadrao, montado } = useBibliaIdioma()
  const [escolhida, setVersao] = useState<string | null>(null)
  const versao = escolhida ?? versaoPadrao
  const [comparar, setComparar] = useState('')
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
  const acesso = useAcessoBiblia()
  const nomes = useNomesLivros(versao)

  useEffect(() => {
    setVersao(versaoConhecida(lerPreferencia(CHAVE_VERSAO, '')))
    setComparar(versaoConhecida(lerPreferencia(CHAVE_COMPARAR, '')) ?? '')
  }, [])

  // Referência clicada com versão citada ("Jo 3:16 NVI"): mostra nessa versão.
  useEffect(() => {
    const pedida = versaoConhecida(c.versaoPedida?.id)
    if (pedida) setVersao(pedida)
  }, [c.versaoPedida])

  const precisaSessao = ehLicenciada(versao) || (!!comparar && ehLicenciada(comparar))
  useEffect(() => {
    if (!ref) return
    // licenciada: espera a sessão para mandar o token (senão o proxy responde 401);
    // sem saber ainda se há sessão, a padrão (NVI ou BLIVRE) não é conhecida
    if (!montado || (precisaSessao && acesso.carregandoSessao)) {
      setEstado({ tipo: 'carregando' })
      return
    }
    let vivo = true
    setEstado({ tipo: 'carregando' })
    // licenciada que não pode ser lida agora: texto da aberta, com aviso
    const principal = getVersesComRecuo(versao, ref, acesso)
    // a comparação falhar (limite, sem login) não derruba o texto principal
    const extra = comparar ? getVerses(comparar, ref, acesso).catch(() => null) : Promise.resolve(null)
    Promise.all([principal, extra])
      .then(([p, cmp]) =>
        vivo &&
        setEstado({ tipo: 'pronto', versos: p.versos, capitulo: p.capitulo, comparar: cmp?.versos ?? [], capCmp: cmp?.capitulo ?? null, recuo: p.recuo })
      )
      .catch((erro) => vivo && setEstado({ tipo: 'erro', erro }))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.passagem, versao, comparar, acesso.token, acesso.carregandoSessao, montado])
  useFums(estado.tipo === 'pronto' ? [estado.capitulo.fums, estado.capCmp?.fums] : [])

  const info = versaoPorId(versao)
  const recuo = estado.tipo === 'pronto' ? estado.recuo : undefined
  const infoTexto = (recuo && versaoPorId(recuo.para)) || info
  const infoCmp = comparar ? versaoPorId(comparar) : undefined

  // "Inserir na nota" (item 2.3, computador): citação completa da passagem
  // no cursor da nota aberta. Licenciada: só a referência (texto ao vivo).
  // Só o capítulo cita o capítulo inteiro; o limite vale só para embutir o
  // texto de um intervalo de versão aberta (como no "Inserir versículo").
  const qtdVersos = estado.tipo === 'pronto' ? estado.versos.length : 0
  const excede = !!ref && !!info && avaliarCitacao(ref, { modo: 'completa', licenciada: info.fonte === 'licenciada' }).excedeLimite
  const podeCitar = !!ref && qtdVersos > 0 && !excede
  const inserirNaNota = () => {
    if (!ref || !info || estado.tipo !== 'pronto' || !podeCitar) return
    const licenciada = info.fonte === 'licenciada'
    // texto embutido só da aberta escolhida (no recuo, a licenciada vai só com a referência)
    c.inserirNaNota(
      blocoCitacao({
        referencia: formatarReferencia(ref, false, nomes),
        sigla: info.sigla,
        licenciada,
        texto: licenciada ? undefined : textoDoBloco(estado.versos),
      }) as any
    )
  }
  const porNumero = useMemo(() => {
    const m = new Map<number, string>()
    if (estado.tipo === 'pronto') for (const v of estado.comparar) m.set(v.numero, v.texto)
    return m
  }, [estado])

  const seletorClasse = `${CAMPO} h-9 px-2 text-xs`

  return (
    <div className="flex flex-col gap-3 p-4">
      <CampoReferencia inicial={ref ? formatarReferencia(ref, true) : ''} aoIr={(codigo) => c.definirPassagem(codigo)} />
      {!ref ? (
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-[var(--line-strong)] p-4">
          <BookOpenText size={22} aria-hidden="true" className="text-[var(--text-3)]" />
          <p className="text-sm leading-relaxed text-[var(--text-2)]">{t('caderno.biblia_vazio')}</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-1.5">
            <SeletorVersao
              curto
              rotulo={t('biblia.versao')}
              valor={versao}
              onChange={(v) => {
                setVersao(v)
                gravarPreferencia(CHAVE_VERSAO, v)
              }}
              className={seletorClasse}
            />
            <SeletorVersao
              curto
              rotulo={t('caderno.comparar_com')}
              opcaoVazia={t('biblia.nao_comparar')}
              excluir={versao}
              valor={comparar}
              onChange={(v) => {
                setComparar(v)
                gravarPreferencia(CHAVE_COMPARAR, v)
              }}
              className={seletorClasse}
            />
          </div>

          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-lg text-[var(--text)]" style={SERIF}>{formatarReferencia(ref)}</h3>
            {ref.versoIni !== undefined && (
              <button
                type="button"
                onClick={() => c.definirPassagem(`${ref.livroId}.${ref.capitulo}`)}
                className={`shrink-0 rounded text-xs text-[var(--text-2)] underline decoration-[var(--link-underline)] underline-offset-2 hover:text-[var(--text)] ${FOCO}`}
              >
                {t('caderno.capitulo_inteiro')}
              </button>
            )}
          </div>

          {estado.tipo === 'carregando' && <p className="text-sm text-[var(--text-3)]">{t('biblia.carregando')}</p>}
          {estado.tipo === 'erro' && <p className="text-sm text-[var(--text-2)]">{mensagemErroBiblia(estado.erro, t, info?.sigla)}</p>}
          <AvisoRecuo recuo={recuo} />
          {estado.tipo === 'pronto' && (
            <ol className="flex flex-col gap-2.5" lang={info?.idioma ?? 'pt'}>
              {estado.versos.map((v) => (
                <li key={v.numero} className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => c.abrirStrong(`${ref.livroId}.${ref.capitulo}.${v.numero}`)}
                    title={t('caderno.estudar_palavras')}
                    aria-label={t('caderno.estudar_verso', { n: v.numero })}
                    className={`mt-1 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded px-1 font-sans text-[0.7rem] tabular-nums text-[var(--text-3)] hover:bg-[var(--surface)] hover:text-[var(--text)] ${FOCO}`}
                  >
                    {rotuloVerso(estado.capitulo, v.numero)}
                  </button>
                  <div className="min-w-0">
                    <p className="text-[1rem] leading-relaxed text-[var(--text)]" style={SERIF}>{v.texto}</p>
                    {comparar && porNumero.get(v.numero) && (
                      <p lang={infoCmp?.idioma} className="mt-1 text-[0.9rem] leading-relaxed text-[var(--text-2)]" style={SERIF}>
                        <span className="me-1 font-sans text-[0.65rem] font-semibold text-[var(--text-3)]">{infoCmp?.sigla}</span>
                        {porNumero.get(v.numero)}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
          <div className="flex items-start justify-between gap-2 border-t border-[var(--line)] pt-2.5 text-xs text-[var(--text-3)]">
            <span className="min-w-0 break-words">
              {credito(infoTexto, estado.tipo === 'pronto' ? estado.capitulo : null)}
              {infoCmp ? ` | ${credito(infoCmp, estado.tipo === 'pronto' ? estado.capCmp : null)}` : ''}
            </span>
            <Link href={hrefLeitor(c.passagem as string, versao)} className="shrink-0 underline decoration-[var(--link-underline)] underline-offset-2 hover:text-[var(--text-2)]">
              {t('biblia.abrir_na_biblia')}
            </Link>
          </div>
          {c.podeInserirNaNota && estado.tipo === 'pronto' && (
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={inserirNaNota}
                disabled={!podeCitar}
                className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[var(--line-strong)] px-3 text-sm text-[var(--text)] hover:bg-[var(--surface)] disabled:opacity-50 lg:min-h-9 ${FOCO}`}
              >
                {t('caderno.inserir_na_nota')}
              </button>
              {excede && (
                <p className="text-xs text-[var(--text-3)]">{t('biblia.limite_versiculos_aberta', { max: MAX_VERSOS_EMBUTIR })}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ Strong */

type EstadoVerbete = { tipo: 'carregando' } | { tipo: 'erro' } | { tipo: 'pronto'; verbete: Verbete | null }

function VerbeteInline({ palavra }: { palavra: PalavraOriginal }) {
  const { t } = useTranslation()
  const [estado, setEstado] = useState<EstadoVerbete>({ tipo: 'carregando' })
  const strong = palavra[2]
  const nt = ehNovoTestamento(palavra)
  useEffect(() => {
    let vivo = true
    setEstado({ tipo: 'carregando' })
    carregarVerbete(strong)
      .then((verbete) => vivo && setEstado({ tipo: 'pronto', verbete }))
      .catch(() => vivo && setEstado({ tipo: 'erro' }))
    return () => {
      vivo = false
    }
  }, [strong])
  const verbete = estado.tipo === 'pronto' ? estado.verbete : null
  return (
    <div className="rounded-xl border border-[var(--line-strong)] p-3.5" aria-live="polite">
      <p className="text-2xl leading-tight text-[var(--text)]" dir={nt ? 'ltr' : 'rtl'} style={{ fontFamily: nt ? FONTE_GREGO : FONTE_HEBRAICO }}>
        {verbete?.lema || palavra[0]}
      </p>
      <p className="mt-0.5 text-sm text-[var(--text-2)]">{verbete?.translit || palavra[1]}</p>
      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-[var(--text-3)]">{t('biblia.strong')}</dt>
        <dd className="font-mono text-xs leading-5 text-[var(--text)]">{strong}</dd>
        <dt className="text-[var(--text-3)]">{t('biblia.morfologia')}</dt>
        <dd className="font-mono text-xs leading-5 text-[var(--text)]">{palavra[3]}</dd>
        <dt className="text-[var(--text-3)]">{t('biblia.glosa')}</dt>
        <dd className="text-[var(--text)]">{palavra[4]}{verbete?.glosa && verbete.glosa !== palavra[4] ? <span className="text-[var(--text-3)]"> · {verbete.glosa}</span> : null}</dd>
      </dl>
      <div className="mt-3 border-t border-[var(--line)] pt-3">
        {estado.tipo === 'carregando' && <p className="text-sm text-[var(--text-3)]">{t('biblia.carregando')}</p>}
        {estado.tipo === 'erro' && <p className="text-sm text-[var(--text-2)]">{t('biblia.erro_carregar')}</p>}
        {estado.tipo === 'pronto' && (
          <p lang="en" className="text-sm leading-relaxed text-[var(--text)]">
            {verbete
              ? partesDefinicao(verbete.def).map((p, i) =>
                  p.tipo === 'quebra' ? <br key={i} /> : (
                    <span key={i} className={`${p.negrito ? 'font-semibold' : ''} ${p.italico ? 'italic' : ''}`}>{p.texto}</span>
                  )
                )
              : t('biblia.original_indisponivel')}
          </p>
        )}
      </div>
    </div>
  )
}

function AbaStrong() {
  const { t } = useTranslation()
  const c = useCaderno()
  const base = lerCodigoReferencia(c.versoStrong?.codigo ?? c.passagem)
  const intervalo = base ? intervaloVersos(base) : null
  const [verso, setVerso] = useState<number | null>(null)
  const [palavras, setPalavras] = useState<PalavraOriginal[] | null>(null)
  const [erro, setErro] = useState(false)
  const [palavra, setPalavra] = useState<PalavraOriginal | null>(null)

  useEffect(() => {
    setVerso(base?.versoIni ?? (intervalo ? intervalo[0] : null))
    setPalavra(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.versoStrong?.codigo, c.passagem])

  useEffect(() => {
    if (!base || !verso) return
    let vivo = true
    setPalavras(null)
    setErro(false)
    carregarOriginal(base.livroId, base.capitulo)
      .then((cap) => vivo && setPalavras(cap[verso] ?? []))
      .catch(() => vivo && setErro(true))
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base?.livroId, base?.capitulo, verso])

  if (!base || !intervalo) {
    return (
      <div className="p-4">
        <div className="flex flex-col items-start gap-2 rounded-xl border border-dashed border-[var(--line-strong)] p-4">
          <Translate size={22} aria-hidden="true" className="text-[var(--text-3)]" />
          <p className="text-sm leading-relaxed text-[var(--text-2)]">{t('caderno.strong_vazio')}</p>
        </div>
      </div>
    )
  }

  const [ini, fim] = intervalo
  const numeros = Array.from({ length: Math.min(fim - ini + 1, 60) }, (_, i) => ini + i)

  return (
    <div className="flex flex-col gap-3 p-4">
      <div>
        <h3 className="text-lg text-[var(--text)]" style={SERIF}>
          {formatarReferencia({ livroId: base.livroId, capitulo: base.capitulo, versoIni: verso ?? undefined })}
        </h3>
        <p className="mt-0.5 text-xs text-[var(--text-3)]">{t('caderno.definicoes_ingles')}</p>
      </div>
      {numeros.length > 1 && (
        <div className="flex flex-wrap gap-1" role="group" aria-label={t('caderno.escolha_versiculo')}>
          {numeros.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => {
                setVerso(n)
                setPalavra(null)
              }}
              aria-pressed={verso === n}
              className={`inline-flex h-8 min-w-8 items-center justify-center rounded-md px-1.5 text-xs tabular-nums ${FOCO} ${
                verso === n ? 'bg-[var(--cta-bg)] text-[var(--cta-fg)]' : 'text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      )}
      {erro && <p className="text-sm text-[var(--text-2)]">{t('biblia.erro_carregar')}</p>}
      {!erro && palavras === null && <p className="text-sm text-[var(--text-3)]">{t('biblia.carregando')}</p>}
      {palavras && <OriginalVerso palavras={palavras} onPalavra={setPalavra} />}
      {palavra ? (
        <VerbeteInline palavra={palavra} />
      ) : (
        palavras && palavras.length > 0 && <p className="text-xs text-[var(--text-3)]">{t('caderno.toque_palavra')}</p>
      )}
      <p className="text-[0.7rem] text-[var(--text-3)]">
        <a href={URL_STEPBIBLE} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-[var(--text-2)]">
          {t('biblia.credito_stepbible', { defaultValue: CREDITO_STEPBIBLE })}
        </a>
      </p>
    </div>
  )
}

/* --------------------------------------------------------- Backlinks */

function AbaBacklinks() {
  const { t } = useTranslation()
  const c = useCaderno()
  const uuid = c.notaAberta?.note_uuid
  const q = useQuery({
    queryKey: CHAVES_CADERNO.backlinks(uuid ?? ''),
    queryFn: () => backlinks(uuid as string, c.token),
    enabled: !!uuid && !!c.token,
    staleTime: 15_000,
  })
  if (!uuid) return <p className="p-4 text-sm text-[var(--text-2)]">{t('caderno.abra_uma_nota')}</p>
  const itens = q.data ?? []
  return (
    <div className="flex flex-col gap-2 p-4">
      {q.isLoading && <p className="text-sm text-[var(--text-3)]">{t('biblia.carregando')}</p>}
      {!q.isLoading && itens.length === 0 && (
        <p className="text-sm leading-relaxed text-[var(--text-2)]">
          {t('caderno.backlinks_vazio', { titulo: c.notaAberta?.title || t('caderno.sem_titulo') })}
        </p>
      )}
      <ul className="flex flex-col gap-1">
        {itens.map((n) => (
          <li key={n.note_uuid}>
            <Link
              href={hrefCaderno(c.orgslug, `/${idDaNota(n.note_uuid)}`)}
              className={`block rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--surface)] ${FOCO}`}
            >
              <span className="block truncate text-sm font-medium text-[var(--text)]" dir="auto">{n.title || t('caderno.sem_titulo')}</span>
              {n.excerpt && <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-[var(--text-2)]">{n.excerpt}</span>}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

/* ----------------------------------------------------------- Sumário */

function AbaSumario() {
  const { t } = useTranslation()
  const c = useCaderno()
  const titulos = useMemo(() => titulosDoDoc(c.notaAberta?.doc), [c.notaAberta?.doc])
  if (!c.notaAberta) return <p className="p-4 text-sm text-[var(--text-2)]">{t('caderno.abra_uma_nota')}</p>
  if (!titulos.length) return <p className="p-4 text-sm leading-relaxed text-[var(--text-2)]">{t('caderno.sumario_vazio')}</p>
  return (
    <nav aria-label={t('caderno.sumario')} className="p-3">
      <ol className="flex flex-col gap-px">
        {titulos.map((ti) => (
          <li key={ti.indice}>
            <button
              type="button"
              onClick={() => {
                c.irParaTitulo(ti.indice)
                if (!window.matchMedia('(min-width: 1024px)').matches) c.setDireitaAberta(false)
              }}
              className={`flex min-h-9 w-full items-center rounded-md px-2.5 text-start text-sm text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)] ${FOCO}`}
              style={{ paddingInlineStart: 10 + (ti.nivel - 1) * 14 }}
            >
              <span className="truncate">{ti.texto || '—'}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  )
}

/* ------------------------------------------------------------- abas */

const ABAS: { id: AbaDireita; Icone: typeof BookOpenText }[] = [
  { id: 'biblia', Icone: BookOpenText },
  { id: 'strong', Icone: Translate },
  { id: 'backlinks', Icone: LinkSimple },
  { id: 'sumario', Icone: ListDashes },
]

/** Painel direito: Bíblia, Strong, Backlinks e Sumário. */
export function PainelDireito() {
  const { t } = useTranslation()
  const c = useCaderno()
  const refs = useRef<(HTMLButtonElement | null)[]>([])

  const aoTeclar = (e: React.KeyboardEvent, i: number) => {
    let prox = -1
    if (e.key === 'ArrowRight') prox = (i + 1) % ABAS.length
    if (e.key === 'ArrowLeft') prox = (i - 1 + ABAS.length) % ABAS.length
    if (e.key === 'Home') prox = 0
    if (e.key === 'End') prox = ABAS.length - 1
    if (prox < 0) return
    e.preventDefault()
    c.setAbaDireita(ABAS[prox].id)
    refs.current[prox]?.focus()
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div role="tablist" aria-label={t('caderno.painel_estudo')} className="flex shrink-0 gap-0.5 border-b border-[var(--line)] px-2 pt-1.5">
        {ABAS.map(({ id, Icone }, i) => {
          const ativa = c.abaDireita === id
          return (
            <button
              key={id}
              ref={(el) => {
                refs.current[i] = el
              }}
              type="button"
              role="tab"
              id={`aba-${id}`}
              aria-selected={ativa}
              aria-controls={`painel-${id}`}
              tabIndex={ativa ? 0 : -1}
              onClick={() => c.setAbaDireita(id)}
              onKeyDown={(e) => aoTeclar(e, i)}
              className={`relative inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-t-md px-2 text-xs font-medium transition-colors ${FOCO} ${
                ativa ? 'text-[var(--text)]' : 'text-[var(--text-3)] hover:text-[var(--text)]'
              }`}
            >
              <Icone size={15} weight={ativa ? 'fill' : 'regular'} aria-hidden="true" />
              <span>{t(`caderno.aba_${id}`)}</span>
              {ativa && <span aria-hidden="true" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--text)]" />}
            </button>
          )
        })}
      </div>
      <div role="tabpanel" id={`painel-${c.abaDireita}`} aria-labelledby={`aba-${c.abaDireita}`} className="min-h-0 flex-1 overflow-y-auto">
        {c.abaDireita === 'biblia' && <AbaBiblia />}
        {c.abaDireita === 'strong' && <AbaStrong />}
        {c.abaDireita === 'backlinks' && <AbaBacklinks />}
        {c.abaDireita === 'sumario' && <AbaSumario />}
      </div>
    </div>
  )
}

export default PainelDireito
