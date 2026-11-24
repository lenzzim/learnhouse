'use client'
import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Editor } from '@tiptap/react'
import { useTranslation } from 'react-i18next'
import { BookOpen } from 'lucide-react'
import { formatarReferencia, interpretarReferencia } from '@/lib/biblia/referencias'
import { type Versiculo } from '@/lib/biblia/dados'
import { VERSAO_PADRAO, versaoPorId } from '@/lib/biblia/versoes'
import { getVersesComRecuo, rotuloVerso, type Capitulo, type Recuo } from '@/lib/biblia/fontes'
import { avaliarCitacao, blocoCitacao, MAX_VERSOS_EMBUTIR, modoValido, textoDoBloco, textoMencao, type ModoCitacao } from '@/lib/biblia/citacao'
import { inserirCitacao, inserirMencao } from './citarNoEditor'
import { AvisoRecuo } from './AvisoRecuo'
import { SeletorVersao } from './SeletorVersao'
import { mensagemErroBiblia, useAcessoBiblia, useFums } from './useFonteBiblia'
import { useBibliaIdioma, useNomesLivros } from './useBibliaIdioma'

/**
 * Botão "Inserir versículo" (Caderno e editor de discussões): o usuário digita
 * uma referência ("Jo 3:16-18"), escolhe a versão e o modo (item 2.2):
 * - Citação completa: um <blockquote>. Versões abertas levam os versículos e,
 *   na última linha, "— João 3:16-18 (BLIVRE)"; licenciadas (NVI, ARA...)
 *   gravam SÓ a linha "— João 3:16-18 (NVI)" e quem lê vê o texto ao vivo
 *   (citacaoViva.ts), com o crédito. O texto licenciado nunca é gravado.
 * - Só a referência (menção): "Jo 3:16-18 (NVI)" no meio do texto, clicável.
 * Só o capítulo ("1 Pe 1", "Sl 23") cita o capítulo inteiro. O limite de
 * MAX_VERSOS_EMBUTIR vale só para embutir o texto de um intervalo de versão
 * aberta (licenciada e menção gravam só a referência).
 * O modo e a versão escolhidos ficam lembrados (localStorage). Sem escolha,
 * a versão é a padrão: NVI para quem está logado (decisão N38).
 * Posição do painel:
 * - dentro de um modal (editor de discussões): fica na árvore do editor, logo
 *   abaixo do botão, para o foco preso do modal continuar valendo;
 * - fora de modal (Caderno): vai para um portal com posição fixa, porque a
 *   barra de formatação rola de lado (overflow) e recortava o painel no
 *   celular. A altura respeita o teclado aberto (visualViewport).
 */

const LARGURA = 352
const CHAVE_MODO = 'discipulei_citar_modo'
const CHAVE_VERSAO = 'discipulei_citar_versao'

export { textoDoBloco }

function ler(chave: string): string | null {
  try {
    return window.localStorage.getItem(chave)
  } catch {
    return null
  }
}
function gravar(chave: string, valor: string) {
  try {
    window.localStorage.setItem(chave, valor)
  } catch {
    /* modo privado */
  }
}

/** Prévia de licenciada: números com o rótulo do combinado ("25-26"). Só exibição, nunca gravado. */
function textoComRotulos(versos: Versiculo[], capitulo: Capitulo): string {
  if (versos.length === 1 && !capitulo.combinados[versos[0].numero]) return versos[0].texto
  return versos.map((v) => `${rotuloVerso(capitulo, v.numero)} ${v.texto}`).join(' ')
}

type Previa =
  | { tipo: 'vazio' }
  | { tipo: 'carregando' }
  | { tipo: 'erro'; erro?: unknown }
  | { tipo: 'pronto'; versos: Versiculo[]; capitulo: Capitulo; recuo?: Recuo }

export function BotaoInserirVersiculo({
  editor,
  abrirSinal = 0,
  rotuloVisivel,
  classeBotao,
}: {
  editor: Editor
  /** Caderno: muda (incrementa) para abrir o painel pelo comando "/versículo". */
  abrirSinal?: number
  /** Texto curto ao lado do ícone (Caderno: "Bíblia"). */
  rotuloVisivel?: string
  /** Classes do botão (o Caderno usa os alvos de 44 px da barra dele). */
  classeBotao?: string
}) {
  const { t } = useTranslation()
  // padrão: a versão do idioma da interface (BLIVRE, WEB ou RV1909) até o
  // usuário escolher outra no seletor; nomes dos livros seguem a versão
  const { idioma, versaoPadrao } = useBibliaIdioma()
  const [escolhida, setEscolhidaState] = useState<string | null>(null)
  const [modo, setModoState] = useState<ModoCitacao>('completa')
  useEffect(() => {
    const salva = ler(CHAVE_VERSAO)
    if (salva && versaoPorId(salva)) setEscolhidaState(salva)
    setModoState(modoValido(ler(CHAVE_MODO)))
  }, [])
  const setEscolhida = (v: string) => {
    setEscolhidaState(v)
    gravar(CHAVE_VERSAO, v)
  }
  const setModo = (m: ModoCitacao) => {
    setModoState(m)
    gravar(CHAVE_MODO, m)
  }
  const versao = escolhida ?? versaoPadrao
  const nomes = useNomesLivros(versao)
  const [aberto, setAberto] = useState(false)
  useEffect(() => {
    if (abrirSinal > 0) setAberto(true)
  }, [abrirSinal])
  const [entrada, setEntrada] = useState('')
  const [previa, setPrevia] = useState<Previa>({ tipo: 'vazio' })
  const info = versaoPorId(versao) ?? versaoPorId(VERSAO_PADRAO)!
  const licenciada = info.fonte === 'licenciada'
  const acesso = useAcessoBiblia()
  const [deslocamento, setDeslocamento] = useState(0)
  const [fixo, setFixo] = useState<{ top: number; left: number; largura: number; alturaMax: number } | null>(null)
  const [emModal, setEmModal] = useState(true)
  const raizRef = useRef<HTMLDivElement | null>(null)
  const painelRef = useRef<HTMLDivElement | null>(null)
  const botaoRef = useRef<HTMLButtonElement | null>(null)
  const idPainel = useId()
  const idEntrada = useId()

  const ref = useMemo(() => interpretarReferencia(entrada, idioma), [entrada, idioma])
  const avaliacao = ref ? avaliarCitacao(ref, { modo, licenciada }) : null
  let aviso: string | null = null
  if (entrada.trim() && !ref) aviso = t('biblia.referencia_invalida')
  else if (avaliacao?.excedeLimite) aviso = t('biblia.limite_versiculos_aberta', { max: MAX_VERSOS_EMBUTIR })
  // a prévia não depende do modo nem do limite: só da referência
  const refValida = !!ref
  const valida = refValida && !aviso

  // prévia do texto (com o cache do loader, repetir a busca é barato)
  useEffect(() => {
    if (!refValida || !ref) {
      setPrevia({ tipo: 'vazio' })
      return
    }
    let vivo = true
    setPrevia({ tipo: 'carregando' })
    getVersesComRecuo(versao, ref, acesso)
      .then(({ versos, capitulo, recuo }) => vivo && setPrevia({ tipo: 'pronto', versos, capitulo, recuo }))
      .catch((erro) => vivo && setPrevia({ tipo: 'erro', erro }))
    return () => {
      vivo = false
    }
    // a referência é derivada de `entrada`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entrada, refValida, versao, acesso.logado])
  useFums(previa.tipo === 'pronto' ? [previa.capitulo.fums] : [])

  // mantém o painel dentro da viewport (a barra pode estar perto da borda)
  useLayoutEffect(() => {
    if (!aberto || !botaoRef.current) {
      setFixo(null)
      return
    }
    const modal = !!raizRef.current?.parentElement?.closest('[role="dialog"],[aria-modal="true"]')
    setEmModal(modal)
    const calcular = () => {
      const botao = botaoRef.current
      if (!botao) return
      const r = botao.getBoundingClientRect()
      const vw = window.innerWidth
      const largura = Math.min(LARGURA, vw - 32)
      if (modal) {
        const excesso = r.left + largura - (vw - 16)
        setDeslocamento(excesso > 0 ? -Math.min(excesso, r.left - 16) : 0)
        return
      }
      const vv = window.visualViewport
      const baseVisivel = vv ? vv.offsetTop + vv.height : window.innerHeight
      const top = Math.max(8, r.bottom + 8)
      setFixo({
        top,
        left: Math.min(Math.max(16, r.left), vw - 16 - largura),
        largura,
        alturaMax: Math.max(180, baseVisivel - top - 12),
      })
    }
    calcular()
    if (modal) return
    const vv = window.visualViewport
    window.addEventListener('resize', calcular)
    window.addEventListener('scroll', calcular, true)
    vv?.addEventListener('resize', calcular)
    vv?.addEventListener('scroll', calcular)
    return () => {
      window.removeEventListener('resize', calcular)
      window.removeEventListener('scroll', calcular, true)
      vv?.removeEventListener('resize', calcular)
      vv?.removeEventListener('scroll', calcular)
    }
  }, [aberto])

  // clique fora fecha (o painel pode estar num portal, fora da raiz)
  useEffect(() => {
    if (!aberto) return
    const onFora = (e: PointerEvent) => {
      const alvo = e.target as Node
      if (!raizRef.current?.contains(alvo) && !painelRef.current?.contains(alvo)) setAberto(false)
    }
    document.addEventListener('pointerdown', onFora)
    return () => document.removeEventListener('pointerdown', onFora)
  }, [aberto])

  const fechar = () => {
    setAberto(false)
    botaoRef.current?.focus()
  }

  // Menção e citação licenciada só gravam a referência: não dependem da
  // prévia. Citação de versão aberta embute o texto (precisa da prévia).
  const prontoAberto = previa.tipo === 'pronto' && previa.versos.length > 0 && !previa.recuo
  const podeInserir = valida && !!ref && (modo === 'mencao' || licenciada || prontoAberto)
  const inserir = () => {
    if (!podeInserir || !ref) return
    if (modo === 'mencao') {
      inserirMencao(editor, textoMencao(formatarReferencia(ref, true, nomes), info.sigla))
    } else {
      inserirCitacao(
        editor,
        blocoCitacao({
          referencia: formatarReferencia(ref, false, nomes),
          sigla: info.sigla,
          licenciada,
          texto: !licenciada && previa.tipo === 'pronto' ? textoDoBloco(previa.versos) : undefined,
        })
      )
    }
    setEntrada('')
    setAberto(false)
  }

  // fora de modal o painel sai da barra (portal), para o overflow dela não recortá-lo
  const envolver = (no: React.ReactElement) =>
    !emModal && fixo && typeof document !== 'undefined' ? createPortal(no, document.body) : no

  return (
    <div ref={raizRef} className="relative">
      <button
        ref={botaoRef}
        type="button"
        onClick={() => setAberto((a) => !a)}
        title={t('biblia.inserir_versiculo')}
        aria-label={t('biblia.inserir_versiculo')}
        aria-haspopup="dialog"
        aria-expanded={aberto}
        aria-controls={aberto ? idPainel : undefined}
        className={
          classeBotao
            ? `${classeBotao} ${aberto ? 'bg-[var(--surface)] text-[var(--text)]' : ''}`
            : `p-1.5 rounded transition-colors ${aberto ? 'bg-gray-200 text-gray-900' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-700'}`
        }
      >
        <BookOpen size={16} aria-hidden="true" />
        {rotuloVisivel && <span>{rotuloVisivel}</span>}
      </button>

      {aberto && (emModal || fixo) && envolver(
        <div
          ref={painelRef}
          id={idPainel}
          role="dialog"
          aria-label={t('biblia.inserir_versiculo')}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation() // não fecha o modal em volta
              fechar()
            }
          }}
          style={
            !emModal && fixo
              ? { position: 'fixed', top: fixo.top, left: fixo.left, width: fixo.largura, maxHeight: fixo.alturaMax, boxShadow: 'var(--sombra-md)' }
              : { left: deslocamento, width: `min(${LARGURA}px, calc(100vw - 32px))`, boxShadow: 'var(--sombra-md)' }
          }
          className={`${
            !emModal && fixo ? 'z-[70] overflow-y-auto overscroll-contain' : 'absolute top-full z-50 mt-2'
          } rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-3 text-[var(--text)]`}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <label htmlFor={idEntrada} className="block text-xs font-medium text-[var(--text-2)]">
              {t('biblia.referencia')}
            </label>
            <SeletorVersao
              curto
              rotulo={t('biblia.versao')}
              valor={versao}
              onChange={setEscolhida}
              className="h-7 rounded-md border border-[var(--line)] bg-[var(--panel)] px-1.5 text-xs text-[var(--text-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
            />
          </div>
          <input
            id={idEntrada}
            autoFocus
            type="text"
            autoComplete="off"
            value={entrada}
            placeholder={t('biblia.referencia_placeholder')}
            onChange={(e) => setEntrada(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault() // o editor fica dentro de um <form>
                inserir()
              }
            }}
            className="h-9 w-full rounded-lg border border-[var(--line-strong)] bg-[var(--page)] px-2.5 text-sm text-[var(--text)] placeholder:text-[var(--text-3)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          />
          <fieldset className="mt-2.5">
            <legend className="mb-1 text-xs font-medium text-[var(--text-2)]">{t('biblia.modo_citar')}</legend>
            <div className="grid grid-cols-2 gap-1.5">
              {(['completa', 'mencao'] as ModoCitacao[]).map((m) => (
                <label
                  key={m}
                  className={`flex min-h-11 cursor-pointer flex-col justify-center rounded-lg border px-2.5 py-1.5 text-xs ${
                    modo === m ? 'border-[var(--text)] bg-[var(--surface)] text-[var(--text)]' : 'border-[var(--line-strong)] text-[var(--text-2)] hover:bg-[var(--surface)]'
                  } has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[var(--focus)]`}
                >
                  <input type="radio" name={`${idPainel}-modo`} value={m} checked={modo === m} onChange={() => setModo(m)} className="sr-only" />
                  <span className="font-medium">{m === 'completa' ? t('biblia.citacao_completa') : t('biblia.mencao')}</span>
                  <span className="text-[0.7rem] text-[var(--text-3)]">{m === 'completa' ? t('biblia.citacao_completa_desc') : t('biblia.mencao_desc')}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="mt-2 min-h-[1.25rem] text-sm" aria-live="polite">
            {aviso && <p className="text-xs text-[var(--text-2)]">{aviso}</p>}
            {!aviso && previa.tipo === 'carregando' && <p className="text-xs text-[var(--text-3)]">{t('biblia.carregando')}</p>}
            {!aviso && previa.tipo === 'erro' && (
              <p className="text-xs text-[var(--text-2)]">{mensagemErroBiblia(previa.erro, t, info.sigla)}</p>
            )}
            {!aviso && previa.tipo === 'pronto' && ref && (
              <blockquote
                className="max-h-40 overflow-y-auto border-s-2 border-[var(--line-strong)] ps-3 leading-relaxed"
                style={{ fontFamily: "var(--font-serif), Georgia, 'Times New Roman', serif" }}
              >
                <p>{licenciada || previa.recuo ? textoComRotulos(previa.versos, previa.capitulo) : textoDoBloco(previa.versos)}</p>
                <p className="mt-1 font-sans text-xs text-[var(--text-3)]">
                  {modo === 'mencao' ? textoMencao(formatarReferencia(ref, true, nomes), info.sigla) : `— ${formatarReferencia(ref, false, nomes)} (${info.sigla})`}
                </p>
                {(licenciada || previa.recuo) && previa.capitulo.copyrightCurto && (
                  <p className="mt-1 font-sans text-[0.7rem] text-[var(--text-3)]">{previa.capitulo.copyrightCurto}</p>
                )}
              </blockquote>
            )}
            {!aviso && previa.tipo === 'pronto' && avaliacao?.capituloInteiro && (
              <p className="mt-2 text-xs text-[var(--text-3)]">{t('biblia.capitulo_inteiro_n', { n: previa.versos.length })}</p>
            )}
            {!aviso && previa.tipo === 'pronto' && <AvisoRecuo recuo={previa.recuo} className="mt-2" />}
            {!aviso && licenciada && modo === 'completa' && previa.tipo === 'pronto' && (
              <p className="mt-2 text-xs text-[var(--text-3)]">{t('biblia.nota_citacao_licenciada')}</p>
            )}
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={fechar}
              className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-2)] hover:text-[var(--text)]"
            >
              {t('biblia.cancelar')}
            </button>
            <button
              type="button"
              onClick={inserir}
              disabled={!podeInserir}
              className="rounded-lg bg-[var(--cta-bg)] px-3 py-1.5 text-xs font-medium text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)] disabled:opacity-50"
            >
              {t('biblia.inserir')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default BotaoInserirVersiculo
