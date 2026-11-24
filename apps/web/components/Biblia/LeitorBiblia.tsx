'use client'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { ChevronLeft, ChevronRight, Languages } from 'lucide-react'
import { BookmarkSimple, Highlighter } from '@phosphor-icons/react'
import toast from 'react-hot-toast'
import {
  LIVROS,
  capituloVizinho,
  codigoReferencia,
  formatarReferencia,
  lerCodigoReferencia,
  livroPorId,
  type Referencia,
} from '@/lib/biblia/referencias'
import { VERSOES, versaoPorId, type VersaoInfo } from '@/lib/biblia/versoes'
import {
  alternarVerso as alternarSelecao,
  codigoSelecao,
  copiaPermitida,
  estenderSelecao,
  limiteCopia,
  referenciasDosTrechos,
  rotuloSelecao,
  textoCopia,
} from '@/lib/biblia/selecao'
import { blocoCitacao, textoDoBloco } from '@/lib/biblia/citacao'
import { guardarCitacaoPendente } from '@/lib/caderno/citacaoPendente'
import { dataLocal } from '@/lib/caderno/conteudo'
import type { Cor } from '@/lib/caderno/cores'
import { CREDITO_STEPBIBLE, URL_STEPBIBLE, type CapituloOriginal, type PalavraOriginal } from '@/lib/biblia/original'
import { carregarOriginal } from '@/lib/biblia/dados'
import { ErroFonte, getChapterComRecuo, rotuloVerso, versoIncluidoEm, type Capitulo, type Recuo } from '@/lib/biblia/fontes'
import { AvisoRecuo, DicaEntrarNvi } from './AvisoRecuo'
import { mensagemErroBiblia, useAcessoBiblia, useFums } from './useFonteBiblia'
import { SeletorVersao } from './SeletorVersao'
import { useBibliaIdioma, useNomesLivros } from './useBibliaIdioma'
import { OutrasTraducoes } from './OutrasTraducoes'
import { OriginalVerso } from './OriginalVerso'
import { PainelVerbete } from './PainelVerbete'
import { ConviteEstudo } from '@components/Discipulei/ChamadaEstudo'
import { BarraVersiculos } from './BarraVersiculos'
import { MeusDestaques } from './MeusDestaques'
import { useMarcas } from './useMarcas'
import { CHAVE_ULTIMO_CAPITULO } from '@/lib/discipulei/nav'
import { CampoBuscaBiblia } from '@components/Busca/CampoBuscaBiblia'
import { useCantoInferior } from '@components/Discipulei/useCantoInferior'

/**
 * Leitor da Bíblia. Esquema de URL único em todo o app:
 *   /biblia?ref=JHN.3              capítulo
 *   /biblia?ref=JHN.3.16-18        capítulo com o intervalo destacado
 *   &v=kjv                         versão (padrão: a do idioma da interface —
 *                                  blivre/web/rv1909 —, omitida na URL)
 *   &c=web                         modo comparar com uma segunda versão
 * Cada versículo tem âncora #v<n>. Sem `ref`/`v`, usa o último capítulo e a
 * última versão escolhidos (localStorage) ou Gênesis 1 na versão do idioma.
 *
 * Seleção (P0 do plano do leitor): tocar no texto ou no número do versículo
 * liga e desliga a seleção (vários, fora de sequência); Shift+clique estende;
 * no teclado, os números são uma lista (setas, Home/End; Espaço/Enter
 * seleciona; Shift+seta estende; Esc limpa). A barra de ações (BarraVersiculos)
 * destaca, copia, compartilha, anota, favorita, compara e abre o original.
 * Destaques e favoritos ficam na conta (useMarcas), independentes da versão.
 */

// Também lida pela tela Hoje ("Continue lendo").
const CHAVE_ULTIMO = CHAVE_ULTIMO_CAPITULO
const CHAVE_VERSAO = 'discipulei_biblia_versao'
const CHAVE_ORIGINAL = 'discipulei_biblia_original'
const AT = LIVROS.filter((l) => l.testamento === 'AT')
const NT = LIVROS.filter((l) => l.testamento === 'NT')

function lerArmazenado(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave)
  } catch {
    return null // aba anônima, bloqueio etc.
  }
}
function gravarArmazenado(chave: string, valor: string) {
  try {
    window.localStorage.setItem(chave, valor)
  } catch {
    // idem
  }
}

type Estado<T> = { tipo: 'carregando' } | { tipo: 'erro'; erro?: unknown } | { tipo: 'pronto'; dados: T }

/** Carrega `carregar()` sempre que `chave` muda; `chave` null = nada a carregar. */
function useCarregar<T>(chave: string | null, carregar: () => Promise<T>, tentativa: number): Estado<T> | null {
  const [estado, setEstado] = useState<Estado<T> | null>(null)
  useEffect(() => {
    if (!chave) {
      setEstado(null)
      return
    }
    let vivo = true
    setEstado({ tipo: 'carregando' })
    carregar()
      .then((dados) => vivo && setEstado({ tipo: 'pronto', dados }))
      .catch((erro) => vivo && setEstado({ tipo: 'erro', erro }))
    return () => {
      vivo = false
    }
    // `carregar` é derivado de `chave`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chave, tentativa])
  return estado
}

// 44 px de alvo no celular (auditoria v4), 40 px no computador
const campoClasse =
  'h-11 lg:h-10 rounded-lg border border-[var(--line-strong)] bg-[var(--panel)] px-3 text-sm text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]'
const botaoClasse =
  'inline-flex items-center gap-1.5 rounded-lg border border-[var(--line)] px-3 py-2 text-sm text-[var(--text-2)] transition-colors hover:border-[var(--line-strong)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]'
const chipClasse =
  'ms-1 inline-flex items-center rounded-md border border-[var(--line)] px-1.5 align-middle font-sans text-xs text-[var(--text-2)] hover:border-[var(--line-strong)] hover:text-[var(--text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]'
const FONTE_TEXTO = "var(--font-serif), Georgia, 'Times New Roman', serif"

function Credito({ versao, copyright }: { versao: VersaoInfo; copyright?: string | null }) {
  const { t } = useTranslation()
  if (versao.fonte === 'licenciada') {
    // termos da API.Bible e da YouVersion: crédito oficial da versão junto do texto + sigla
    return (
      <p className="mt-1">
        <span className="font-medium text-[var(--text-2)]">{versao.sigla}</span> — {copyright || versao.credito}{' '}
        {t(versao.provedor === 'youversion' ? 'biblia.fornecido_youversion' : 'biblia.fornecido_api_bible')}
      </p>
    )
  }
  return (
    <p className="mt-1">
      {t(`biblia.creditos.${versao.id}`, { defaultValue: versao.credito })}
      {versao.licencaUrl && (
        <>
          {' '}
          <a
            href={versao.licencaUrl}
            target="_blank"
            rel="noopener noreferrer license"
            className="text-[var(--text-2)] underline decoration-dotted decoration-[var(--link-underline)] underline-offset-2 hover:text-[var(--text)]"
          >
            {t('biblia.licenca_n', { licenca: versao.licenca })}
          </a>
        </>
      )}
    </p>
  )
}

export default function LeitorBiblia() {
  const { t } = useTranslation()
  const router = useRouter()
  const params = useSearchParams()
  const refParam = params.get('ref')
  const vParam = params.get('v')
  const cParam = params.get('c')
  const ref = useMemo(() => lerCodigoReferencia(refParam), [refParam])
  const { versaoPadrao, versaoAberta, idioma, logado, montado } = useBibliaIdioma()

  // preferências guardadas (lidas depois de montar, para não quebrar a hidratação)
  const [padrao, setPadrao] = useState<Referencia>({ livroId: 'GEN', capitulo: 1 })
  const [versaoSalva, setVersaoSalva] = useState<string | null>(null)
  const [mostrarOriginal, setMostrarOriginal] = useState(false)
  useEffect(() => {
    const salvo = lerCodigoReferencia(lerArmazenado(CHAVE_ULTIMO))
    if (salvo) setPadrao({ livroId: salvo.livroId, capitulo: salvo.capitulo })
    setVersaoSalva(lerArmazenado(CHAVE_VERSAO))
    setMostrarOriginal(lerArmazenado(CHAVE_ORIGINAL) === '1')
  }, [])

  const atual: Referencia = ref ?? padrao
  const livroInfo = livroPorId(atual.livroId) ?? LIVROS[0]
  const versaoA = versaoPorId(vParam) ?? versaoPorId(versaoSalva) ?? (versaoPorId(versaoPadrao) as VersaoInfo)
  // nomes dos livros na versão escolhida (WEB/KJV em inglês, RV1909/VBL em espanhol)
  const nomes = useNomesLivros(montado ? versaoA.id : null)
  const nomeLivro = (l: { id: string; nome: string }) => nomes?.[l.id]?.nome ?? l.nome
  const versaoB = cParam && cParam !== versaoA.id ? versaoPorId(cParam) ?? null : null

  useEffect(() => {
    if (ref) gravarArmazenado(CHAVE_ULTIMO, `${ref.livroId}.${ref.capitulo}`)
  }, [ref])

  const montarHref = useCallback(
    (r: Referencia, versao: string = versaoA.id, comparar: string = versaoB?.id ?? '') => {
      const q = new URLSearchParams()
      q.set('ref', codigoReferencia(r))
      if (versao !== versaoPadrao) q.set('v', versao)
      if (comparar && comparar !== versao) q.set('c', comparar)
      return `?${q.toString()}`
    },
    [versaoA.id, versaoB, versaoPadrao]
  )
  const irPara = (href: string) => router.push(href)

  const [tentativa, setTentativa] = useState(0)
  // só depois de montar: antes disso o idioma e a versão salva ainda não são
  // conhecidos, e carregaria a BLIVRE à toa para quem lê em inglês/espanhol.
  // Licenciadas: espera a sessão (o proxy exige login) e recarrega ao entrar/sair.
  const acesso = useAcessoBiblia()
  const chaveCapitulo = (v: VersaoInfo | null) => {
    if (!v || !montado) return null
    if (v.fonte !== 'licenciada') return `${v.id}/${livroInfo.id}/${atual.capitulo}`
    if (acesso.carregandoSessao) return null
    return `${v.id}/${livroInfo.id}/${atual.capitulo}/${acesso.logado ? 1 : 0}`
  }
  // Licenciada que não pode ser lida agora (sem sessão, limite diário, chave
  // ausente): o texto vem da aberta do idioma, com aviso (decisão N38).
  const estadoA = useCarregar<Capitulo & { recuo?: Recuo }>(
    chaveCapitulo(versaoA),
    () => getChapterComRecuo(versaoA.id, livroInfo.id, atual.capitulo, acesso),
    tentativa
  )
  const estadoB = useCarregar<Capitulo & { recuo?: Recuo }>(
    chaveCapitulo(versaoB),
    () => getChapterComRecuo(versaoB?.id ?? '', livroInfo.id, atual.capitulo, acesso),
    tentativa
  )

  // original: global ("Mostrar original") ou por versículo
  const [abertos, setAbertos] = useState<Set<number>>(new Set())
  useEffect(() => setAbertos(new Set()), [livroInfo.id, atual.capitulo])
  const precisaOriginal = mostrarOriginal || abertos.size > 0
  const estadoOriginal = useCarregar<CapituloOriginal>(
    precisaOriginal ? `${livroInfo.id}/${atual.capitulo}` : null,
    () => carregarOriginal(livroInfo.id, atual.capitulo),
    tentativa
  )
  const [palavra, setPalavra] = useState<PalavraOriginal | null>(null)
  const fecharPalavra = useCallback(() => setPalavra(null), [])

  const alternarOriginalGlobal = () => {
    const novo = !mostrarOriginal
    setMostrarOriginal(novo)
    gravarArmazenado(CHAVE_ORIGINAL, novo ? '1' : '0')
  }
  const alternarVerso = (n: number) =>
    setAbertos((s) => {
      const novo = new Set(s)
      if (novo.has(n)) novo.delete(n)
      else novo.add(n)
      return novo
    })

  const prontoA = estadoA?.tipo === 'pronto' ? estadoA.dados : null
  const prontoB = estadoB?.tipo === 'pronto' ? estadoB.dados : null
  const versosA = prontoA?.versos ?? []
  const versosB = prontoB?.versos ?? []
  const total = Math.max(versosA.length, versosB.length)
  const original = estadoOriginal?.tipo === 'pronto' ? estadoOriginal.dados : null
  const ini = atual.versoIni
  const fim = atual.versoFim ?? atual.versoIni
  const destacado = (n: number) => ini !== undefined && fim !== undefined && n >= ini && n <= fim

  // ---- seleção de versículos, destaques e favoritos (P0 do plano do leitor)
  const [selecao, setSelecao] = useState<number[]>([])
  // A barra de seleção ocupa o canto inferior: os convites (instalar, estudo)
  // saem enquanto há versículos selecionados e voltam depois.
  useCantoInferior('selecao', selecao.length > 0)
  const [ancora, setAncora] = useState<number | null>(null)
  const [foco, setFoco] = useState<number | null>(null)
  const [listaAberta, setListaAberta] = useState(false)
  const artigoRef = useRef<HTMLElement | null>(null)
  useEffect(() => {
    setSelecao([])
    setAncora(null)
    setFoco(null)
  }, [livroInfo.id, atual.capitulo])
  const marcas = useMarcas(livroInfo.id, atual.capitulo, acesso)
  const existeVerso = (n: number) => !!versosA[n - 1] || (!!versaoB && !!versosB[n - 1])
  const selecionado = (n: number) => selecao.includes(n)
  const tocarVerso = (n: number, estender: boolean) => {
    setSelecao((sel) => (estender ? estenderSelecao(sel, ancora, n, existeVerso) : alternarSelecao(sel, n)))
    setAncora(n)
    setFoco(n)
  }
  const limparSelecao = () => {
    setSelecao([])
    setAncora(null)
  }
  const primeiroVerso = versosA.findIndex(Boolean) + 1 || 1
  const focoAtual = foco ?? (ini !== undefined && existeVerso(ini) ? ini : primeiroVerso)
  /** Setas/Home/End nos números (lista com um só ponto de Tab); Shift+seta estende. */
  const teclaVerso = (n: number) => (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const botoes = Array.from(artigoRef.current?.querySelectorAll<HTMLButtonElement>('button[data-verso]') ?? [])
    const i = botoes.findIndex((b) => Number(b.dataset.verso) === n)
    let j = -1
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = Math.min(botoes.length - 1, i + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = Math.max(0, i - 1)
    else if (e.key === 'Home') j = 0
    else if (e.key === 'End') j = botoes.length - 1
    else if (e.key === 'Escape' && selecao.length) {
      e.preventDefault()
      limparSelecao()
      return
    }
    if (j < 0 || i < 0) return
    e.preventDefault()
    const alvo = botoes[j]
    const m = Number(alvo.dataset.verso)
    setFoco(m)
    alvo.focus()
    if (e.shiftKey && (e.key.startsWith('Arrow'))) {
      setSelecao((sel) => estenderSelecao(sel, ancora ?? n, m, existeVerso))
      if (ancora === null) setAncora(n)
    }
  }
  /** Clique no texto do versículo (não em botão/link nem arrastando para selecionar texto). */
  const cliqueNoVerso = (n: number) => (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a')) return
    const sel = typeof window !== 'undefined' ? window.getSelection() : null
    if (sel && !sel.isCollapsed) return
    tocarVerso(n, e.shiftKey)
  }
  const corDe = (n: number): Cor | null => marcas.mapa.get(n)?.color ?? null
  const favoritoDe = (n: number) => !!marcas.mapa.get(n)?.favorite
  const estiloMarca = (n: number): React.CSSProperties | undefined => {
    const cor = corDe(n)
    return cor ? { backgroundColor: `var(--marca-${cor})` } : undefined
  }

  // Depois de carregar: rola até o versículo destacado (ou o #v<n> da URL), se não estiver visível
  useEffect(() => {
    if (!prontoA) return
    let alvo = ini
    if (alvo === undefined) {
      const m = /^#v(\d+)$/.exec(window.location.hash)
      if (m) alvo = Number(m[1])
    }
    const el = alvo !== undefined ? document.getElementById(`v${alvo}`) : null
    if (el) {
      const r = el.getBoundingClientRect()
      if (!(r.top >= 80 && r.bottom <= window.innerHeight)) el.scrollIntoView({ block: 'center' })
    }
  }, [prontoA, atual.livroId, atual.capitulo, ini])

  const anterior = capituloVizinho(livroInfo.id, atual.capitulo, -1)
  const proximo = capituloVizinho(livroInfo.id, atual.capitulo, 1)

  const numeroVerso = (n: number, cap: Capitulo | null = prontoA) => {
    const cor = corDe(n)
    const descricao = [
      formatarReferencia({ livroId: livroInfo.id, capitulo: atual.capitulo, versoIni: n }, false, nomes),
      cor ? t('biblia.destaque_cor', { cor: t(`caderno_editor.cores.${cor}`) }) : '',
      favoritoDe(n) ? t('biblia.favorito') : '',
    ]
      .filter(Boolean)
      .join(', ')
    return (
      <button
        type="button"
        data-verso={n}
        tabIndex={n === focoAtual ? 0 : -1}
        aria-pressed={selecionado(n)}
        aria-label={descricao}
        onClick={(e) => tocarVerso(n, e.shiftKey)}
        onKeyDown={teclaVerso(n)}
        onFocus={() => setFoco(n)}
        className={`-my-2 me-0.5 inline-block select-none rounded px-1 py-2 align-super font-sans text-xs font-medium leading-none no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] ${
          selecionado(n) ? 'text-[var(--text)]' : 'text-[var(--text-3)] hover:text-[var(--text)]'
        }`}
      >
        {rotuloVerso(cap, n)}
        {favoritoDe(n) && <BookmarkSimple size={10} weight="fill" aria-hidden="true" className="ms-0.5 inline-block align-baseline" />}
      </button>
    )
  }
  const blocoOriginal = (n: number) => {
    if (estadoOriginal?.tipo === 'erro') {
      return <p className="my-2 font-sans text-xs text-[var(--text-2)]">{t('biblia.erro_carregar')}</p>
    }
    if (!original) return <p className="my-2 font-sans text-xs text-[var(--text-3)]">{t('biblia.carregando')}</p>
    return (
      <OriginalVerso
        palavras={original[n] ?? []}
        titulo={n === 1 ? original[0] : undefined}
        onPalavra={setPalavra}
      />
    )
  }
  const originalVisivel = (n: number) => mostrarOriginal || abertos.has(n)
  // títulos de seção (ARA, NTLH...): pequenos, em sans, fora do texto do versículo
  const classeTituloSecao = 'mb-1 mt-6 font-sans text-sm font-semibold leading-snug tracking-normal text-[var(--text-2)] first:mt-0'
  const ausente = (cap: Capitulo | null, n: number) => {
    const ini = versoIncluidoEm(cap, n)
    return (
      <span className="font-sans text-sm text-[var(--text-3)]" title={ini ? undefined : t('biblia.verso_ausente')}>
        {ini ? t('biblia.verso_incluido', { n: rotuloVerso(cap, ini) }) : '—'}
      </span>
    )
  }
  const classeDestaque = (n: number) => {
    const partes = ['cursor-pointer rounded-[3px] [box-decoration-break:clone] [-webkit-box-decoration-break:clone]']
    if (selecionado(n)) partes.push('underline decoration-[var(--text)] decoration-2 underline-offset-[6px]')
    if (!corDe(n) && (destacado(n) || selecionado(n))) partes.push('bg-[var(--surface)]')
    return partes.join(' ')
  }

  // ---- texto: uma versão (parágrafo corrido, quebrado onde o original abre)
  const textoSimples = () => {
    const blocos: React.ReactNode[] = []
    let trecho: React.ReactNode[] = []
    const fecharTrecho = (chave: string) => {
      if (trecho.length) blocos.push(<p key={chave}>{trecho}</p>)
      trecho = []
    }
    versosA.forEach((texto, i) => {
      const n = i + 1
      if (!texto) return // versículo ausente nesta versão (versificação)
      const tituloSecao = prontoA?.titulos[n]
      if (tituloSecao) {
        fecharTrecho(`p-antes-t${n}`)
        blocos.push(
          <h2 key={`t${n}`} className={classeTituloSecao}>
            {tituloSecao}
          </h2>
        )
      }
      trecho.push(
        <span key={n} id={`v${n}`} className={`scroll-mt-28 ${classeDestaque(n)}`} style={estiloMarca(n)} onClick={cliqueNoVerso(n)}>
          {numeroVerso(n)}
          {texto}
          {destacado(n) && !mostrarOriginal && (
            <button type="button" className={chipClasse} aria-expanded={abertos.has(n)} onClick={() => alternarVerso(n)}>
              {t('biblia.original')}
            </button>
          )}{' '}
        </span>
      )
      if (originalVisivel(n)) {
        fecharTrecho(`p${n}`)
        blocos.push(<div key={`o${n}`}>{blocoOriginal(n)}</div>)
      }
    })
    fecharTrecho('fim')
    return blocos
  }

  // ---- texto: duas versões (colunas no desktop, intercalado no celular)
  const textoComparado = () => {
    const linhas: React.ReactNode[] = []
    for (let n = 1; n <= total; n++) {
      const a = versosA[n - 1]
      const b = versosB[n - 1]
      if (!a && !b) continue
      const tA = prontoA?.titulos[n]
      const tB = prontoB?.titulos[n]
      if (tA || tB) {
        linhas.push(
          <div key={`t${n}`} className="grid gap-x-8 pt-5 md:grid-cols-2">
            <h2 lang={versaoA.idioma} className={`${classeTituloSecao} mt-0`}>{tA}</h2>
            <h2 lang={versaoB?.idioma} className={`${classeTituloSecao} mt-0`}>
              {tB && <span className="me-1.5 text-xs font-medium text-[var(--text-3)] md:hidden">{versaoB?.sigla}</span>}
              {tB}
            </h2>
          </div>
        )
      }
      linhas.push(
        <div
          key={n}
          id={`v${n}`}
          onClick={cliqueNoVerso(n)}
          style={estiloMarca(n)}
          className={`scroll-mt-28 cursor-pointer border-b border-[var(--line-2)] py-2 ${!corDe(n) && (destacado(n) || selecionado(n)) ? 'bg-[var(--surface)]' : ''} ${
            selecionado(n) ? 'shadow-[inset_3px_0_0_var(--text)] rtl:shadow-[inset_-3px_0_0_var(--text)]' : ''
          }`}
        >
          <div className="grid gap-x-8 gap-y-1 md:grid-cols-2">
            <p lang={versaoA.idioma}>
              {numeroVerso(n)}
              {a || ausente(prontoA, n)}
              {!mostrarOriginal && (
                <button type="button" className={chipClasse} aria-expanded={abertos.has(n)} onClick={() => alternarVerso(n)}>
                  {t('biblia.original')}
                </button>
              )}
            </p>
            <p lang={versaoB?.idioma} className="text-[var(--text-2)] md:text-[var(--text)]">
              <span className="me-1.5 font-sans text-xs font-medium text-[var(--text-3)] md:hidden">{versaoB?.sigla}</span>
              {b ? (
                <>
                  {prontoB?.combinados[n] && (
                    <span className="me-1 font-sans text-xs text-[var(--text-3)]">{rotuloVerso(prontoB, n)}</span>
                  )}
                  {b}
                </>
              ) : (
                ausente(prontoB, n)
              )}
            </p>
          </div>
          {originalVisivel(n) && blocoOriginal(n)}
        </div>
      )
    }
    return linhas
  }

  const estadoTexto = versaoB && estadoB?.tipo !== 'pronto' && estadoA?.tipo === 'pronto' ? estadoB : estadoA
  const versaoComErro = estadoTexto === estadoB && versaoB ? versaoB : versaoA
  // FUMS (só API.Bible; na YouVersion o token vem null): reporta cada exibição de texto licenciado
  useFums(estadoTexto?.tipo === 'pronto' ? [prontoA?.fums, versaoB ? prontoB?.fums : null] : [])
  const temLicenciada = versaoA.fonte === 'licenciada' || versaoB?.fonte === 'licenciada'
  const refPassagem: Referencia = { livroId: livroInfo.id, capitulo: atual.capitulo, versoIni: ini, versoFim: fim !== ini ? fim : undefined }

  // ---- ações da seleção
  const infoExibida = versaoPorId(prontoA?.recuo?.para) ?? versaoA
  const rotuloSel = rotuloSelecao(livroInfo.id, atual.capitulo, selecao, nomes)
  const hrefEntrar = `/login?next=${encodeURIComponent(`/biblia${montarHref(atual)}`)}`
  const linkSelecao = (versao: string) => {
    const q = new URLSearchParams({ ref: codigoSelecao(livroInfo.id, atual.capitulo, selecao), v: versao })
    return `${typeof window !== 'undefined' ? window.location.origin : ''}/biblia?${q.toString()}`
  }
  const versosSelecionados = (lista: number[] = selecao) =>
    lista.filter((n) => !!versosA[n - 1]).map((n) => ({ numero: n, texto: versosA[n - 1], rotulo: rotuloVerso(prontoA, n) }))
  const cores = selecao.map(corDe)
  const corComum = cores.length && cores.every((c) => c && c === cores[0]) ? cores[0] : null
  const todosFavoritos = selecao.length > 0 && selecao.every(favoritoDe)
  const originalAberto = mostrarOriginal || (selecao.length > 0 && selecao.every((n) => abertos.has(n)))

  const copiar = async () => {
    const versos = versosSelecionados()
    if (!versos.length) return
    if (!copiaPermitida(infoExibida.id, versos.length)) {
      toast.error(t('biblia.limite_copia', { max: limiteCopia(infoExibida.id), sigla: infoExibida.sigla }))
      return
    }
    const texto = textoCopia({ versos, referencia: rotuloSel, sigla: infoExibida.sigla, link: linkSelecao(infoExibida.id) })
    try {
      await navigator.clipboard.writeText(texto)
      toast.success(t('biblia.copiado'))
    } catch {
      toast.error(t('biblia.erro_copiar'))
    }
  }
  const compartilhar = async () => {
    // só o link da passagem (nunca o texto licenciado)
    const url = linkSelecao(versaoA.id)
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ title: `${rotuloSel} (${versaoA.sigla})`, url })
        return
      }
      await navigator.clipboard.writeText(url)
      toast.success(t('biblia.link_copiado'))
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') toast.error(t('biblia.erro_copiar'))
    }
  }
  const destacar = async (cor: Cor | null) => {
    const ok = await marcas.aplicar(selecao, { color: cor ?? '' })
    if (!ok) toast.error(t('biblia.erro_salvar_marca'))
    else limparSelecao()
  }
  const favoritar = async () => {
    const ok = await marcas.aplicar(selecao, { favorite: !todosFavoritos })
    if (!ok) toast.error(t('biblia.erro_salvar_marca'))
    else limparSelecao()
  }
  const anotar = (destino: 'nota' | 'tcd') => {
    // uma citação por trecho contíguo; licenciada guarda só a referência
    const licenciada = versaoA.fonte === 'licenciada'
    const blocos = referenciasDosTrechos(livroInfo.id, atual.capitulo, selecao).map((r) => {
      const de = r.versoIni ?? 0
      const ate = r.versoFim ?? de
      return blocoCitacao({
        referencia: formatarReferencia(r, false, nomes),
        sigla: versaoA.sigla,
        licenciada,
        texto: licenciada ? undefined : textoDoBloco(versosSelecionados(selecao.filter((n) => n >= de && n <= ate))),
      })
    })
    let armazenamento: Storage | null = null
    try {
      armazenamento = window.sessionStorage
    } catch {
      armazenamento = null
    }
    const hoje = dataLocal()
    const ok = guardarCitacaoPendente(armazenamento, {
      destino: destino === 'tcd' ? { tipo: 'tcd', data: hoje } : { tipo: 'nota' },
      blocos,
      titulo: rotuloSel,
    })
    if (!ok) {
      toast.error(t('biblia.erro_anotar'))
      return
    }
    router.push(destino === 'tcd' ? `/caderno/tcd/${hoje}` : `/caderno/new?titulo=${encodeURIComponent(rotuloSel)}`)
  }
  const comparar = () => {
    const ordenada = [...selecao].sort((a, b) => a - b)
    const alvo: Referencia = {
      livroId: livroInfo.id,
      capitulo: atual.capitulo,
      versoIni: ordenada[0],
      versoFim: ordenada.length > 1 ? ordenada[ordenada.length - 1] : undefined,
    }
    if (versaoB) {
      router.replace(montarHref(alvo, versaoA.id, ''), { scroll: false })
      return
    }
    const segunda =
      versaoA.fonte === 'licenciada'
        ? versaoAberta
        : logado && idioma === 'pt'
          ? 'nvi'
          : VERSOES.find((v) => v.idioma === versaoA.idioma && v.id !== versaoA.id)?.id ?? 'kjv'
    router.replace(montarHref(alvo, versaoA.id, segunda), { scroll: false })
  }
  const alternarOriginalSelecao = () => {
    setAbertos((s) => {
      const novo = new Set(s)
      if (selecao.every((n) => novo.has(n))) selecao.forEach((n) => novo.delete(n))
      else selecao.forEach((n) => novo.add(n))
      return novo
    })
  }

  return (
    <div
      className={`mx-auto w-full px-4 pt-6 text-[var(--text)] sm:pt-10 ${versaoB ? 'max-w-[1040px]' : 'max-w-[680px]'} ${
        selecao.length ? 'pb-72 lg:pb-32' : 'pb-16'
      }`}
    >
      <header className="mb-6 flex flex-col gap-4">
        <h1 className="text-3xl">
          {nomeLivro(livroInfo)} {atual.capitulo}
        </h1>
        <CampoBuscaBiblia versao={versaoA.id} />
        <div className="flex flex-wrap gap-2">
          <select
            aria-label={t('biblia.livro')}
            className={`${campoClasse} min-w-0 flex-1 sm:flex-none`}
            value={livroInfo.id}
            onChange={(e) => irPara(montarHref({ livroId: e.target.value, capitulo: 1 }))}
          >
            <optgroup label={t('biblia.antigo_testamento')}>
              {AT.map((l) => (
                <option key={l.id} value={l.id}>
                  {nomeLivro(l)}
                </option>
              ))}
            </optgroup>
            <optgroup label={t('biblia.novo_testamento')}>
              {NT.map((l) => (
                <option key={l.id} value={l.id}>
                  {nomeLivro(l)}
                </option>
              ))}
            </optgroup>
          </select>
          <select
            aria-label={t('biblia.capitulo')}
            className={campoClasse}
            value={atual.capitulo}
            onChange={(e) => irPara(montarHref({ livroId: livroInfo.id, capitulo: Number(e.target.value) }))}
          >
            {livroInfo.versos.map((_, i) => (
              <option key={i} value={i + 1}>
                {t('biblia.capitulo_n', { n: i + 1 })}
              </option>
            ))}
          </select>
          <SeletorVersao
            rotulo={t('biblia.versao')}
            className={`${campoClasse} min-w-0 max-w-full`}
            valor={versaoA.id}
            onChange={(id) => {
              gravarArmazenado(CHAVE_VERSAO, id)
              setVersaoSalva(id)
              router.replace(montarHref(atual, id), { scroll: false })
            }}
          />
          <SeletorVersao
            rotulo={t('biblia.comparar_com')}
            className={`${campoClasse} min-w-0 max-w-full`}
            valor={versaoB?.id ?? ''}
            opcaoVazia={t('biblia.nao_comparar')}
            excluir={versaoA.id}
            onChange={(id) => router.replace(montarHref(atual, versaoA.id, id), { scroll: false })}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            aria-pressed={mostrarOriginal}
            onClick={alternarOriginalGlobal}
            className={`${botaoClasse} ${mostrarOriginal ? 'border-[var(--line-strong)] bg-[var(--surface)] text-[var(--text)]' : ''}`}
          >
            <Languages size={16} aria-hidden="true" />
            {t('biblia.mostrar_original')}
          </button>
          <div className="flex flex-wrap items-center gap-2">
            {montado && logado && (
              <button type="button" onClick={() => setListaAberta(true)} className={botaoClasse}>
                <Highlighter size={16} aria-hidden="true" />
                {t('biblia.meus_destaques')}
              </button>
            )}
            <OutrasTraducoes referencia={refPassagem} flutuante />
          </div>
        </div>
        <p className="-mt-1 text-xs text-[var(--text-3)]">{t('biblia.dica_selecionar')}</p>
        {temLicenciada && <p className="-mt-1 text-xs text-[var(--text-3)]">{t('biblia.nota_licenciadas')}</p>}
        <DicaEntrarNvi
          className="-mt-1"
          mostrar={montado && !logado && idioma === 'pt' && versaoA.id === versaoAberta && !vParam && !versaoSalva}
        />
      </header>

      {versaoB && (
        <div className="mb-2 hidden grid-cols-2 gap-x-8 border-b border-[var(--line)] pb-2 font-sans text-xs font-medium text-[var(--text-3)] md:grid">
          <span>{versaoA.sigla} — {versaoA.nome}</span>
          <span>{versaoB.sigla} — {versaoB.nome}</span>
        </div>
      )}

      <article
        ref={artigoRef}
        lang={versaoA.idioma}
        aria-busy={estadoTexto?.tipo === 'carregando'}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && selecao.length) limparSelecao()
        }}
        className="min-h-[50vh] text-[1.1875rem] leading-[1.8]"
        style={{ fontFamily: FONTE_TEXTO }}
      >
        {/* O aviso de recuo chega junto com o texto: fica dentro do artigo para
            não empurrar a página quando aparece (layout shift). */}
        <AvisoRecuo recuo={prontoA?.recuo ?? prontoB?.recuo} className="mb-3 font-sans" />
        {(!estadoTexto || estadoTexto.tipo === 'carregando') && (
          <p className="text-base text-[var(--text-3)]">{t('biblia.carregando')}</p>
        )}
        {estadoTexto?.tipo === 'erro' && (
          <div className="text-base text-[var(--text-2)]">
            <p>{mensagemErroBiblia(estadoTexto.erro, t, versaoComErro.sigla)}</p>
            {estadoTexto.erro instanceof ErroFonte && estadoTexto.erro.codigo === 'nao_autenticado' ? (
              <Link href={`/login?next=${encodeURIComponent(`/biblia${montarHref(atual)}`)}`} className={`${botaoClasse} mt-3`}>
                {t('biblia.entrar')}
              </Link>
            ) : (
              <button type="button" className={`${botaoClasse} mt-3`} onClick={() => setTentativa((n) => n + 1)}>
                {t('biblia.tentar_novamente')}
              </button>
            )}
          </div>
        )}
        {estadoTexto?.tipo === 'pronto' && (versaoB ? textoComparado() : textoSimples())}
      </article>

      {/* Navegação e créditos só depois do texto: se aparecessem durante o
          carregamento, o texto chegando os empurraria para baixo (layout shift). */}
      {estadoTexto && estadoTexto.tipo !== 'carregando' && (<>
      <nav className="mt-10 flex items-center justify-between gap-3" aria-label={t('biblia.titulo')}>
        {anterior ? (
          <Link href={montarHref(anterior)} className={botaoClasse} aria-label={`${t('biblia.anterior')}: ${formatarReferencia(anterior, false, nomes)}`}>
            <ChevronLeft size={16} aria-hidden="true" />
            <span>{formatarReferencia(anterior, true, nomes)}</span>
          </Link>
        ) : (
          <span />
        )}
        {proximo ? (
          <Link href={montarHref(proximo)} className={botaoClasse} aria-label={`${t('biblia.proximo')}: ${formatarReferencia(proximo, false, nomes)}`}>
            <span>{formatarReferencia(proximo, true, nomes)}</span>
            <ChevronRight size={16} aria-hidden="true" />
          </Link>
        ) : (
          <span />
        )}
      </nav>

      {/* Discipulei: no fim do capítulo, convite para estudar com alguém. */}
      {estadoTexto?.tipo === 'pronto' && <ConviteEstudo lugar="biblia" className="mt-10" />}

      <footer className="mt-12 border-t border-[var(--line)] pt-4 text-xs leading-relaxed text-[var(--text-3)]">
        <Credito versao={versaoPorId(prontoA?.recuo?.para) ?? versaoA} copyright={prontoA?.copyright} />
        {versaoB && <Credito versao={versaoPorId(prontoB?.recuo?.para) ?? versaoB} copyright={prontoB?.copyright} />}
        {precisaOriginal && (
          <p className="mt-1">
            <a href={URL_STEPBIBLE} target="_blank" rel="noopener noreferrer" className="underline decoration-dotted underline-offset-2 hover:text-[var(--text-2)]">
              {t('biblia.credito_stepbible', { defaultValue: CREDITO_STEPBIBLE })}
            </a>
          </p>
        )}
      </footer>
      </>)}

      {palavra && <PainelVerbete palavra={palavra} onFechar={fecharPalavra} />}

      {selecao.length > 0 && estadoTexto?.tipo === 'pronto' && (
        <BarraVersiculos
          rotulo={rotuloSel}
          quantidade={selecao.length}
          corAtual={corComum}
          algumDestaque={cores.some(Boolean)}
          todosFavoritos={todosFavoritos}
          logado={logado}
          hrefEntrar={hrefEntrar}
          comparando={!!versaoB}
          originalAberto={originalAberto}
          aoDestacar={destacar}
          aoCopiar={copiar}
          aoCompartilhar={compartilhar}
          aoAnotar={anotar}
          aoFavoritar={favoritar}
          aoComparar={comparar}
          aoOriginal={alternarOriginalSelecao}
          aoFechar={limparSelecao}
        />
      )}
      {logado && (
        <MeusDestaques
          aberto={listaAberta}
          aoMudar={setListaAberta}
          token={acesso.token}
          nomes={nomes}
          hrefVerso={(codigo) => {
            const r = lerCodigoReferencia(codigo)
            return r ? montarHref(r) : '?'
          }}
        />
      )}
    </div>
  )
}
