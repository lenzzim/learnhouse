'use client'

/**
 * Convite para instalar o app do Discipulei (PWA), só para quem está logado.
 *
 * Por que assim: o manifesto saiu do layout (commit cb0752af) porque o dono não
 * queria o navegador oferecendo "Instalar" a qualquer visitante. Agora o
 * manifesto é um arquivo estático (public/app.webmanifest) que NENHUMA página
 * referencia por padrão; este componente injeta o <link rel="manifest"> no
 * <head> apenas quando a sessão está autenticada e o remove no logout. Sem o
 * link, o Chrome não dispara `beforeinstallprompt` nem mostra o ícone de
 * instalar para visitantes anônimos.
 *
 * - Chrome/Edge/Android: guarda o `beforeinstallprompt` e mostra um aviso
 *   discreto no rodapé com "Instalar" (chama prompt()) e "Agora não".
 * - iOS (não há `beforeinstallprompt`): o mesmo aviso, com a instrução de
 *   Compartilhar > Adicionar à Tela de Início.
 * - "Agora não" vale por 30 dias (localStorage, sempre em try/catch).
 * - Nunca aparece com o app já aberto em modo standalone, nas telas de
 *   login/cadastro, no painel (/dash) nem com o player de podcast aberto.
 *
 * Montado uma vez em app/orgs/[orgslug]/(withmenu)/layout.tsx, dentro do
 * SessionGate e do PodcastPlayerProvider (usePodcastPlayer exige o provider).
 */

import { useCallback, useEffect, useState } from 'react'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { Share } from 'lucide-react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { usePodcastPlayer } from '@components/Contexts/PodcastPlayerContext'

/** Evento não padronizado do Chromium; não existe nos tipos do DOM. */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[]
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
  prompt: () => Promise<void>
}

const MANIFESTO_ID = 'discipulei-manifesto'
const MANIFESTO_HREF = '/app.webmanifest'
const CHAVE_DISPENSA = 'discipulei_instalar_dispensado_em'
const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000

/** Segmentos de rota onde o convite nunca aparece. */
const SEGMENTOS_BLOQUEADOS = new Set([
  'dash',
  'login',
  'signup',
  'auth',
  'forgot',
  'reset',
  'verify-email',
  'magic',
  'sso',
  'editor',
])

/** Rotas com barra de ações fixa no rodapé (só no mobile, < md). */
const SEGMENTOS_COM_BARRA_INFERIOR = new Set(['community', 'account'])

function dispensadoRecentemente(): boolean {
  try {
    const valor = window.localStorage.getItem(CHAVE_DISPENSA)
    if (!valor) return false
    const quando = Number(valor)
    return Number.isFinite(quando) && Date.now() - quando < TRINTA_DIAS_MS
  } catch {
    return false
  }
}

function registrarDispensa() {
  try {
    window.localStorage.setItem(CHAVE_DISPENSA, String(Date.now()))
  } catch {
    // Modo privado ou armazenamento bloqueado: o aviso some só nesta visita.
  }
}

function emModoStandalone(): boolean {
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  const displayStandalone =
    typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches
  return iosStandalone || displayStandalone
}

function ehIos(): boolean {
  const ua = window.navigator.userAgent || ''
  // iPadOS 13+ se apresenta como Mac; o toque denuncia.
  const ipadComoMac = window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1
  return /iPad|iPhone|iPod/.test(ua) || ipadComoMac
}

export default function ConviteInstalar() {
  const { t } = useTranslation()
  const session = useLHSession()
  const pathname = usePathname()
  const { state: podcast } = usePodcastPlayer()
  const autenticado = session?.status === 'authenticated'

  const [eventoInstalar, setEventoInstalar] = useState<BeforeInstallPromptEvent | null>(null)
  const [modoIos, setModoIos] = useState(false)
  const [dispensado, setDispensado] = useState(true)
  const [telaPequena, setTelaPequena] = useState(false)

  // 1) <link rel="manifest"> só enquanto houver sessão.
  useEffect(() => {
    if (!autenticado) return
    let link = document.getElementById(MANIFESTO_ID) as HTMLLinkElement | null
    if (!link) {
      link = document.createElement('link')
      link.id = MANIFESTO_ID
      link.rel = 'manifest'
      link.href = MANIFESTO_HREF
      document.head.appendChild(link)
    }
    return () => {
      document.getElementById(MANIFESTO_ID)?.remove()
    }
  }, [autenticado])

  // 2) Escuta o pedido de instalação (Chromium) e detecta o iOS.
  useEffect(() => {
    if (!autenticado) return
    // Dentro de iframe (embeds) ou já instalado: nada a oferecer.
    if (window.self !== window.top || emModoStandalone()) return

    setDispensado(dispensadoRecentemente())
    setModoIos(ehIos())

    const aoPedirInstalacao = (e: Event) => {
      e.preventDefault() // sem a mini-barra automática do Chrome
      setEventoInstalar(e as BeforeInstallPromptEvent)
    }
    const aoInstalar = () => {
      setEventoInstalar(null)
      setModoIos(false)
    }

    window.addEventListener('beforeinstallprompt', aoPedirInstalacao)
    window.addEventListener('appinstalled', aoInstalar)
    return () => {
      window.removeEventListener('beforeinstallprompt', aoPedirInstalacao)
      window.removeEventListener('appinstalled', aoInstalar)
      setEventoInstalar(null)
      setModoIos(false)
    }
  }, [autenticado])

  // 3) Largura < md: as barras fixas de comunidade/conta só existem aí.
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia('(max-width: 767px)')
    const atualizar = () => setTelaPequena(mq.matches)
    atualizar()
    mq.addEventListener('change', atualizar)
    return () => mq.removeEventListener('change', atualizar)
  }, [])

  const dispensar = useCallback(() => {
    registrarDispensa()
    setDispensado(true)
  }, [])

  const instalar = useCallback(async () => {
    const evento = eventoInstalar
    if (!evento) return
    // O evento só pode ser usado uma vez.
    setEventoInstalar(null)
    try {
      await evento.prompt()
      const escolha = await evento.userChoice
      if (escolha.outcome === 'dismissed') dispensar()
    } catch {
      // prompt() pode rejeitar se o navegador já tiver consumido o evento.
    }
  }, [eventoInstalar, dispensar])

  const segmentos = pathname?.split('/').filter(Boolean) ?? []
  const rotaBloqueada = segmentos.some((s) => SEGMENTOS_BLOQUEADOS.has(s))
  const temBarraInferior = telaPequena && segmentos.some((s) => SEGMENTOS_COM_BARRA_INFERIOR.has(s))
  const podcastAberto = podcast.isVisible && !!podcast.currentEpisode

  const podeMostrar = !!eventoInstalar || modoIos
  if (!autenticado || dispensado || rotaBloqueada || podcastAberto || !podeMostrar) return null

  // Barra de ações mobile: ~76px de altura + margem; o aviso fica acima dela.
  const recuoExtra = temBarraInferior ? '5.5rem' : '0px'

  return (
    <aside
      aria-label={t('instalar.rotulo')}
      className="fixed inset-x-0 mx-auto w-auto max-w-md"
      style={{
        bottom: `calc(${recuoExtra} + 12px + env(safe-area-inset-bottom, 0px))`,
        // Físico de propósito (rtl-ok): os recuos de área segura são físicos.
        paddingLeft: 'calc(12px + env(safe-area-inset-left, 0px))',
        paddingRight: 'calc(12px + env(safe-area-inset-right, 0px))',
        zIndex: 'var(--z-interactive)',
      }}
    >
      <div
        className="flex items-center gap-3 rounded-2xl p-3"
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          boxShadow: 'var(--sombra-md)',
        }}
      >
        <Image
          src="/icons/icone-192.png"
          alt=""
          width={40}
          height={40}
          className="flex-shrink-0 rounded-xl"
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--text)' }}>
            {t('instalar.titulo')}
          </p>
          <p className="mt-0.5 text-xs leading-snug" style={{ color: 'var(--text-2)' }}>
            {eventoInstalar ? (
              t('instalar.descricao')
            ) : (
              <>
                <Share size={12} aria-hidden="true" className="me-1 inline-block align-[-1px]" />
                {t('instalar.ios_instrucoes')}
              </>
            )}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={dispensar}
            className="rounded-full px-3 py-1.5 text-xs font-medium transition-opacity hover:opacity-80"
            style={{ color: 'var(--text-2)', border: '1px solid var(--line)' }}
          >
            {t('instalar.agora_nao')}
          </button>
          {eventoInstalar && (
            <button
              type="button"
              onClick={instalar}
              className="rounded-full px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-90"
              style={{ background: 'var(--cta-bg)', color: 'var(--cta-fg)' }}
            >
              {t('instalar.botao_instalar')}
            </button>
          )}
        </div>
      </div>
    </aside>
  )
}
