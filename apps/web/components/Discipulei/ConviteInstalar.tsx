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
 * - Sem o evento (iOS, Safari no Mac, Firefox, ou Chrome que ainda não
 *   disparou): o mesmo aviso, com as instruções manuais da plataforma.
 * - "Agora não" vale por 30 dias, guardado POR CONTA (chave com o id do
 *   usuário, localStorage, sempre em try/catch). Instalou: não volta.
 *
 * Causa do bug de 23/11/2026 (conta nova não viu o convite): (1) a dispensa
 * era por navegador, então quem já tinha tocado "Agora não" com outra conta
 * não via mais nada por 30 dias; (2) não havia service worker, e o Chrome só
 * dispara `beforeinstallprompt` com um service worker que trate `fetch`; sem
 * o evento, fora do iOS, o componente não mostrava nada. Agora há um service
 * worker mínimo (public/sw.js, sem cache nenhum) registrado junto com o
 * manifesto, só para quem está logado.
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
const SERVICE_WORKER = '/sw.js'
/** Por conta: `discipulei_instalar_dispensado_em:<id do usuário>`. */
const CHAVE_DISPENSA = 'discipulei_instalar_dispensado_em:'
const TRINTA_DIAS_MS = 30 * 24 * 60 * 60 * 1000
const PARA_SEMPRE = Number.MAX_SAFE_INTEGER
/** Quanto esperar o `beforeinstallprompt` antes de mostrar as instruções manuais. */
const ESPERA_EVENTO_MS = 4000

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
const SEGMENTOS_COM_BARRA_INFERIOR = new Set(['account'])

function dispensadoRecentemente(conta: string): boolean {
  try {
    const valor = window.localStorage.getItem(CHAVE_DISPENSA + conta)
    if (!valor) return false
    const quando = Number(valor)
    return Number.isFinite(quando) && (quando === PARA_SEMPRE || Date.now() - quando < TRINTA_DIAS_MS)
  } catch {
    return false
  }
}

function registrarDispensa(conta: string, quando: number = Date.now()) {
  try {
    window.localStorage.setItem(CHAVE_DISPENSA + conta, String(quando))
  } catch {
    // Modo privado ou armazenamento bloqueado: o aviso some só nesta visita.
  }
}

type Plataforma = 'ios' | 'safari-mac' | 'firefox-android' | 'firefox-desktop' | 'android' | 'desktop'

/** Onde a pessoa está, para escolher a instrução manual certa. */
function plataformaInstalacao(): Plataforma {
  const ua = window.navigator.userAgent || ''
  if (ehIos()) return 'ios'
  const android = /Android/i.test(ua)
  if (/Firefox\//i.test(ua)) return android ? 'firefox-android' : 'firefox-desktop'
  if (android) return 'android'
  const safari = /Safari\//.test(ua) && !/Chrome\/|Chromium\/|Edg\/|OPR\//.test(ua)
  if (safari && /Macintosh/.test(ua)) return 'safari-mac'
  return 'desktop'
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

  const conta: string | null = autenticado ? String((session as any)?.data?.user?.id ?? '') || null : null
  const [eventoInstalar, setEventoInstalar] = useState<BeforeInstallPromptEvent | null>(null)
  // Instrução manual (sem `beforeinstallprompt`): qual plataforma, ou null.
  const [manual, setManual] = useState<Plataforma | null>(null)
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
    // Service worker mínimo, sem cache (public/sw.js): requisito do Chrome
    // para disparar o pedido de instalação.
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.register(SERVICE_WORKER, { scope: '/' }).catch(() => {})
    }
    return () => {
      document.getElementById(MANIFESTO_ID)?.remove()
    }
  }, [autenticado])

  // 2) Escuta o pedido de instalação (Chromium); sem ele, instruções manuais.
  useEffect(() => {
    if (!conta) return
    // Dentro de iframe (embeds) ou já instalado: nada a oferecer.
    if (window.self !== window.top || emModoStandalone()) return

    setDispensado(dispensadoRecentemente(conta))
    const plataforma = plataformaInstalacao()
    // iOS, Safari no Mac e Firefox nunca disparam o evento: instrução já.
    // Chrome/Edge: espera um pouco pelo evento; se não vier, instrução manual.
    const semEvento = plataforma === 'ios' || plataforma === 'safari-mac' || plataforma.startsWith('firefox')
    let espera: number | null = null
    if (semEvento) setManual(plataforma)
    else espera = window.setTimeout(() => setManual(plataforma), ESPERA_EVENTO_MS)

    const aoPedirInstalacao = (e: Event) => {
      e.preventDefault() // sem a mini-barra automática do Chrome
      if (espera) window.clearTimeout(espera)
      setManual(null)
      setEventoInstalar(e as BeforeInstallPromptEvent)
    }
    const aoInstalar = () => {
      setEventoInstalar(null)
      setManual(null)
      registrarDispensa(conta, PARA_SEMPRE)
      setDispensado(true)
    }

    window.addEventListener('beforeinstallprompt', aoPedirInstalacao)
    window.addEventListener('appinstalled', aoInstalar)
    return () => {
      if (espera) window.clearTimeout(espera)
      window.removeEventListener('beforeinstallprompt', aoPedirInstalacao)
      window.removeEventListener('appinstalled', aoInstalar)
      setEventoInstalar(null)
      setManual(null)
    }
  }, [conta])

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
    if (conta) registrarDispensa(conta)
    setDispensado(true)
  }, [conta])

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

  const podeMostrar = !!eventoInstalar || !!manual
  if (!autenticado || dispensado || rotaBloqueada || podcastAberto || !podeMostrar) return null

  // Barra de ações mobile: ~76px de altura + margem; o aviso fica acima dela.
  // Fica sempre acima da barra de abas do shell (--altura-barra-inferior,
  // que já inclui a área segura) e, na conta, também acima da barra de ações.
  const recuoExtra = temBarraInferior ? '5.5rem' : '0px'

  return (
    <aside
      aria-label={t('instalar.rotulo')}
      className="fixed inset-x-0 mx-auto w-auto max-w-md"
      style={{
        bottom: `calc(max(var(--altura-barra-inferior, 0px), env(safe-area-inset-bottom, 0px)) + ${recuoExtra} + 12px)`,
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
            ) : manual === 'ios' ? (
              <>
                <Share size={12} aria-hidden="true" className="me-1 inline-block align-[-1px]" />
                {t('instalar.ios_instrucoes')}
              </>
            ) : manual === 'safari-mac' ? (
              t('instalar.safari_mac_instrucoes')
            ) : manual === 'firefox-desktop' ? (
              t('instalar.firefox_desktop_instrucoes')
            ) : manual === 'firefox-android' || manual === 'android' ? (
              t('instalar.android_instrucoes')
            ) : (
              t('instalar.desktop_instrucoes')
            )}
          </p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={dispensar}
            className="min-h-11 rounded-full px-3 text-xs font-medium transition-opacity hover:opacity-80 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)]"
            style={{ color: 'var(--text-2)', border: '1px solid var(--line)' }}
          >
            {t('instalar.agora_nao')}
          </button>
          {eventoInstalar && (
            <button
              type="button"
              onClick={instalar}
              className="min-h-11 rounded-full px-3 text-xs font-semibold transition-opacity hover:opacity-90 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--text)]"
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
