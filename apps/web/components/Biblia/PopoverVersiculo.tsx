'use client'
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTranslation } from 'react-i18next'
import { formatarReferencia, lerCodigoReferencia } from '@/lib/biblia/referencias'
import { hrefLeitor, type Versiculo } from '@/lib/biblia/dados'
import { versaoPadraoDoIdioma, versaoPadraoPara, versaoPorId, type VersaoInfo } from '@/lib/biblia/versoes'
import { getVersesComRecuo, rotuloVerso, type Capitulo, type Recuo } from '@/lib/biblia/fontes'
import { AvisoRecuo, DicaEntrarNvi } from './AvisoRecuo'
import { idiomaDiscipulei } from '@/lib/discipulei/nav'
import { mensagemErroBiblia, useAcessoBiblia, useFums } from './useFonteBiblia'
import { useNomesLivros } from './useBibliaIdioma'
import { Z_INDEX } from '@/lib/z-index'
import { SeletorVersao } from './SeletorVersao'
import { OutrasTraducoes } from './OutrasTraducoes'

/** Quantos versículos o popover mostra antes de cortar com "…". */
const MAX_VERSOS = 8
const MARGEM = 16
const LARGURA_MAX = 360

interface Props {
  codigo: string
  ancora: HTMLElement
  id: string
  /** recebe o elemento raiz (para o host saber o que é "dentro" do popover) */
  popoverRef: React.RefObject<HTMLDivElement | null>
  onMouseEnter: () => void
  onMouseLeave: () => void
  onNavegar: (href: string, e: React.MouseEvent<HTMLAnchorElement>) => void
  /** versão citada no texto ("— Jo 3:16 (ARA)"); senão a padrão (NVI logado, BLIVRE visitante) */
  versaoInicial?: string
  /**
   * Referência escrita num editor aberto para edição (Caderno): o pop-up
   * ganha "Inserir passagem completa" e "Trocar versão" (item 2.3) e, no
   * celular, vira uma folha presa embaixo, com alvos de toque maiores.
   */
  edicao?: AcoesEdicao
}

export interface AcoesEdicao {
  /** Troca a menção pela citação completa (no lugar). */
  inserirCompleta: (dados: { versao: VersaoInfo; versos: Versiculo[]; titulo: string }) => void
  /** Troca (ou acrescenta) a sigla da versão depois da referência no texto. */
  trocarVersao: (versao: VersaoInfo) => void
}

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'erro'; erro?: unknown }
  | { tipo: 'pronto'; versos: Versiculo[]; capitulo: Capitulo; recuo?: Recuo }

/** Celular/tablet: o pop-up com ações de edição vira folha presa embaixo. */
function useFolha(ativo: boolean): boolean {
  const [folha, setFolha] = useState(false)
  useEffect(() => {
    if (!ativo || typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(max-width: 1023px)')
    const ver = () => setFolha(mq.matches)
    ver()
    mq.addEventListener?.('change', ver)
    return () => mq.removeEventListener?.('change', ver)
  }, [ativo])
  return ativo && folha
}

/**
 * Cartão flutuante com o texto do versículo. Renderizado num portal com
 * position: fixed — não empurra nada na página (sem layout shift). Quem abre,
 * fecha e trata Escape é o host (ReferenciasNoTexto).
 */
export function PopoverVersiculo({ codigo, ancora, id, popoverRef, onMouseEnter, onMouseLeave, onNavegar, versaoInicial, edicao }: Props) {
  const { t, i18n } = useTranslation()
  const ref = lerCodigoReferencia(codigo)
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })
  // começa na versão citada no texto ("— Jo 3:16 (ARA)") ou, sem citação, na
  // padrão: NVI para quem está logado em português (decisão N38), senão a do
  // idioma da interface (pt BLIVRE, en WEB, es RV1909); o seletor troca só
  // neste popover. O popover só existe no cliente, depois de uma interação,
  // então ler o idioma direto do i18next não quebra a hidratação.
  const acesso = useAcessoBiblia()
  const idioma = idiomaDiscipulei(i18n.language)
  const padrao = versaoPadraoPara(idioma, acesso.logado)
  const aberta = versaoPadraoDoIdioma(idioma)
  const [escolhida, setVersao] = useState<string | null>(versaoPorId(versaoInicial) ? (versaoInicial as string) : null)
  const versao = escolhida ?? padrao
  const nomes = useNomesLivros(versao)
  const folha = useFolha(!!edicao)
  const info = versaoPorId(versao)
  const esperaSessao = info?.fonte === 'licenciada' && acesso.carregandoSessao
  const [pos, setPos] = useState<{ top: number; left: number; largura: number } | null>(null)
  const localRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const r = lerCodigoReferencia(codigo)
    if (!r || esperaSessao) return
    let vivo = true
    setEstado({ tipo: 'carregando' })
    getVersesComRecuo(versao, r, acesso)
      .then(({ versos, capitulo, recuo }) => vivo && setEstado({ tipo: 'pronto', versos, capitulo, recuo }))
      .catch((erro) => vivo && setEstado({ tipo: 'erro', erro }))
    return () => {
      vivo = false
    }
    // o token entra pela chave `acesso.logado`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codigo, versao, esperaSessao, acesso.logado])
  const recuo = estado.tipo === 'pronto' ? estado.recuo : undefined
  useFums(estado.tipo === 'pronto' ? [estado.capitulo.fums] : [])

  // posiciona abaixo do link (ou acima, se não couber), dentro da viewport
  useLayoutEffect(() => {
    const posicionar = () => {
      if (folha) {
        setPos({ top: 0, left: 0, largura: window.innerWidth })
        return
      }
      const el = localRef.current
      if (!el || !ancora.isConnected) return
      const r = ancora.getBoundingClientRect()
      const largura = Math.min(LARGURA_MAX, window.innerWidth - MARGEM * 2)
      const altura = el.offsetHeight
      const left = Math.max(MARGEM, Math.min(r.left, window.innerWidth - MARGEM - largura))
      let top = r.bottom + 8
      if (top + altura > window.innerHeight - MARGEM && r.top - 8 - altura >= MARGEM) top = r.top - 8 - altura
      setPos({ top, left, largura })
    }
    posicionar()
    window.addEventListener('resize', posicionar)
    window.addEventListener('scroll', posicionar, true)
    return () => {
      window.removeEventListener('resize', posicionar)
      window.removeEventListener('scroll', posicionar, true)
    }
  }, [ancora, estado.tipo, folha])

  if (!ref || typeof document === 'undefined') return null
  const titulo = formatarReferencia(ref, false, nomes)
  const href = hrefLeitor(codigo, versao, padrao)
  const capitulo = estado.tipo === 'pronto' ? estado.capitulo : null
  const versos = estado.tipo === 'pronto' ? estado.versos : []
  const visiveis = versos.slice(0, MAX_VERSOS)
  const mostrarNumeros = versos.length > 1

  return createPortal(
    <div
      ref={(el) => {
        localRef.current = el
        popoverRef.current = el
      }}
      id={id}
      role="dialog"
      aria-label={titulo}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      style={
        folha
          ? {
              position: 'fixed',
              left: 0,
              right: 0,
              bottom: 0,
              maxHeight: '75dvh',
              zIndex: Z_INDEX.POPOVER,
              boxShadow: 'var(--sombra-lg)',
              paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
            }
          : {
              position: 'fixed',
              top: pos?.top ?? 0,
              left: pos?.left ?? 0,
              width: pos?.largura ?? LARGURA_MAX,
              visibility: pos ? 'visible' : 'hidden',
              zIndex: Z_INDEX.POPOVER,
              boxShadow: 'var(--sombra-md)',
            }
      }
      className={`border border-[var(--line-strong)] bg-[var(--panel)] p-4 text-[var(--text)] ${
        folha ? 'overflow-y-auto overscroll-contain rounded-t-2xl border-b-0' : 'rounded-xl'
      }`}
    >
      {folha && <div className="mx-auto -mt-1 mb-3 h-1 w-10 rounded-full bg-[var(--line-strong)]" aria-hidden="true" />}
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{titulo}</p>
        <SeletorVersao
          curto
          rotulo={t('biblia.versao')}
          valor={versao}
          onChange={setVersao}
          className="h-7 rounded-md border border-[var(--line)] bg-[var(--panel)] px-1.5 text-xs text-[var(--text-2)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
        />
      </div>
      <div
        lang={info?.idioma ?? 'pt'}
        className="max-h-60 overflow-y-auto text-[0.975rem] leading-relaxed text-[var(--text)]"
        style={{ fontFamily: "var(--font-serif), Georgia, 'Times New Roman', serif" }}
      >
        {estado.tipo === 'carregando' && <p className="text-sm text-[var(--text-3)]">{t('biblia.carregando')}</p>}
        {estado.tipo === 'erro' && (
          <p className="text-sm text-[var(--text-2)]">{mensagemErroBiblia(estado.erro, t, info?.sigla)}</p>
        )}
        {estado.tipo === 'pronto' && (
          <p>
            {visiveis.map((v) => (
              <span key={v.numero}>
                {mostrarNumeros && (
                  <sup className="me-0.5 font-sans text-xs text-[var(--text-3)]">{rotuloVerso(capitulo, v.numero)}</sup>
                )}
                {v.texto}{' '}
              </span>
            ))}
            {versos.length > visiveis.length && <span className="text-[var(--text-3)]">…</span>}
          </p>
        )}
        {estado.tipo === 'pronto' && (info?.fonte === 'licenciada' || recuo) && capitulo?.copyrightCurto && (
          <p className="mt-2 font-sans text-[0.7rem] leading-snug text-[var(--text-3)]">{capitulo.copyrightCurto}</p>
        )}
      </div>
      <AvisoRecuo recuo={recuo} className="mt-2 font-sans" />
      <DicaEntrarNvi
        className="mt-2 font-sans"
        mostrar={!acesso.logado && !acesso.carregandoSessao && idioma === 'pt' && versao === aberta && !escolhida}
      />
      {edicao && info && (
        <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
          <button
            type="button"
            disabled={estado.tipo !== 'pronto' || (info.fonte !== 'licenciada' && !versos.length)}
            onClick={() => edicao.inserirCompleta({ versao: info, versos, titulo })}
            className={`inline-flex items-center justify-center rounded-lg bg-[var(--cta-bg)] px-3 text-xs font-medium text-[var(--cta-fg)] hover:bg-[var(--cta-bg-hover)] disabled:opacity-50 ${
              folha ? 'min-h-11 flex-1' : 'min-h-9'
            }`}
          >
            {t('biblia.inserir_passagem_completa')}
          </button>
          {versaoInicial !== versao && (
            <button
              type="button"
              onClick={() => edicao.trocarVersao(info)}
              className={`inline-flex items-center justify-center rounded-lg border border-[var(--line-strong)] px-3 text-xs text-[var(--text)] hover:bg-[var(--surface)] ${
                folha ? 'min-h-11 flex-1' : 'min-h-9'
              }`}
            >
              {t('biblia.trocar_versao_nota', { sigla: info.sigla })}
            </button>
          )}
        </div>
      )}
      <div className="mt-3 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-2.5 text-xs">
        <a
          href={href}
          onClick={(e) => onNavegar(href, e)}
          className="font-medium text-[var(--text)] underline decoration-[var(--link-underline)] underline-offset-2"
        >
          {t('biblia.abrir_na_biblia')} →
        </a>
        <a href={href} onClick={(e) => onNavegar(href, e)} className="text-[var(--text-3)] hover:text-[var(--text-2)]">
          {info ? `${info.nome} (${info.sigla})` : ''}
        </a>
      </div>
      <div className="mt-2">
        <OutrasTraducoes referencia={ref} />
      </div>
    </div>,
    document.body
  )
}

export default PopoverVersiculo
