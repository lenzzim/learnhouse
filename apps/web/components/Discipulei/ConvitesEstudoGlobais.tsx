'use client'

/**
 * Convites de estudo que nascem de eventos (decisão N40), fora das páginas:
 *
 * - **Fim de um TCD salvo**: o Caderno salva sozinho enquanto a pessoa
 *   escreve. O serviço do Caderno (services/caderno/notas.ts) avisa com o
 *   evento `discipulei:tcd-salvo`; o convite só aparece quando ela para de
 *   escrever (45 s sem novo salvamento) ou sai da página do TCD.
 * - **Nota publicada** (`discipulei:nota-publicada`): vale como "1ª nota
 *   publicada"; as regras só deixam aparecer uma vez.
 * - **Agendar estudo** clicado em qualquer lugar (`discipulei:agendar-estudo`):
 *   grava o marcador "já agendou" da conta.
 *
 * Fica como uma linha fixa acima da barra de abas, no mesmo canto do convite
 * de instalar. Os dois nunca aparecem juntos (useCantoInferior): quem chegou
 * primeiro fica, o outro espera; se chegarem juntos, instalar vem antes. O
 * momento só entra na fila se as regras deixarem convidar, para não segurar o
 * canto sem mostrar nada.
 */

import React, { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { ConviteEstudo } from './ChamadaEstudo'
import {
  EVENTO_AGENDOU,
  EVENTO_NOTA_PUBLICADA,
  EVENTO_TCD_SALVO,
  podeConvidar,
  registrarAgendamento,
  type MomentoConvite,
} from '@/lib/discipulei/convitesEstudo'
import { useCantoInferior } from './useCantoInferior'

const ESPERA_TCD_MS = 45_000

export default function ConvitesEstudoGlobais() {
  const session = useLHSession() as any
  const pathname = usePathname() || ''
  const autenticado = session?.status === 'authenticated'
  const userId: string | null = autenticado ? String(session?.data?.user?.id ?? '') || null : null

  const [momento, setMomento] = useState<MomentoConvite | null>(null)
  const tcdPendente = useRef(false)
  const timer = useRef<number | null>(null)
  const naPaginaTcd = pathname.includes('/caderno/tcd/')

  // Só entra na fila (e segura o canto) se as regras deixam convidar agora;
  // decidido uma vez, no evento, porque o próprio convite registra a exibição.
  const userIdRef = useRef(userId)
  userIdRef.current = userId
  const definirMomento = (m: MomentoConvite) => {
    const id = userIdRef.current
    if (id && podeConvidar(id, m)) setMomento(m)
  }

  useEffect(() => {
    if (!userId) return
    const aoAgendar = () => registrarAgendamento(userId)
    const aoSalvarTcd = () => {
      tcdPendente.current = true
      if (timer.current) window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        if (tcdPendente.current) {
          tcdPendente.current = false
          definirMomento('tcd')
        }
      }, ESPERA_TCD_MS)
    }
    const aoPublicar = () => definirMomento('primeira-nota')
    window.addEventListener(EVENTO_AGENDOU, aoAgendar)
    window.addEventListener(EVENTO_TCD_SALVO, aoSalvarTcd)
    window.addEventListener(EVENTO_NOTA_PUBLICADA, aoPublicar)
    return () => {
      window.removeEventListener(EVENTO_AGENDOU, aoAgendar)
      window.removeEventListener(EVENTO_TCD_SALVO, aoSalvarTcd)
      window.removeEventListener(EVENTO_NOTA_PUBLICADA, aoPublicar)
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [userId])

  // Saiu da página do TCD depois de salvar: é o "fim do TCD".
  useEffect(() => {
    if (!naPaginaTcd && tcdPendente.current) {
      tcdPendente.current = false
      if (timer.current) window.clearTimeout(timer.current)
      definirMomento('tcd')
    }
  }, [naPaginaTcd])

  const quer = !!userId && !!momento
  const minhaVez = useCantoInferior('estudo', quer)
  if (!quer || !minhaVez || !momento) return null

  return (
    <div
      className="fixed inset-x-0 mx-auto w-auto max-w-md"
      style={{
        bottom: 'calc(max(var(--altura-barra-inferior, 0px), env(safe-area-inset-bottom, 0px)) + 12px)',
        // Físico de propósito (rtl-ok): os recuos de área segura são físicos.
        paddingLeft: 'calc(12px + env(safe-area-inset-left, 0px))',
        paddingRight: 'calc(12px + env(safe-area-inset-right, 0px))',
        zIndex: 'var(--z-interactive)',
      }}
      data-convite-estudo=""
    >
      <ConviteEstudo
        key={momento}
        lugar={momento}
        className="shadow-[var(--sombra-md)]"
        aoFechar={() => setMomento(null)}
      />
    </div>
  )
}
