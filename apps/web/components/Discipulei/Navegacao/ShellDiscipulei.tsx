'use client'

import React, { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { getUriWithOrg } from '@services/config/config'
import { useJoinBannerVisible, JOIN_BANNER_HEIGHT } from '@components/Objects/Banners/OrgJoinBanner'
import { ROTA_INICIAL, rotaAprender, rotaOculta } from '@/lib/discipulei/nav'
import { useDadosNav } from './useDadosNav'
import { EscreverProvider } from './EscreverContexto'
import { BarraLateral } from './BarraLateral'
import { BarraInferior, BarraSuperior } from './BarrasCelular'
import { BuscaDialogo } from './BuscaDialogo'

/**
 * Shell de app da comunidade Discipulei, no lugar do OrgMenu do upstream no
 * layout (withmenu). O OrgMenu continua intacto no repositório.
 *
 * - < 1024px: barra superior + barra de abas embaixo.
 * - >= 1024px: barra lateral fixa à esquerda (256px).
 * - Ctrl/⌘+K abre a busca em qualquer tela.
 * - Rotas do LMS escondidas (lib/discipulei/nav.ts) levam quem não é admin
 *   para a tela inicial.
 * - Na área "Aprender" (cursos, aulas, certificados) o conteúdo ganha
 *   `data-area="aprender"`, que o styles/discipulei-dark.css usa para trazer
 *   as cores do LMS para o preto e branco da marca.
 */
export function ShellDiscipulei({ orgslug, children }: { orgslug: string; children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { isVisible: faixaVisivel } = useJoinBannerVisible()
  const { autenticado, ehAdmin, papelPendente } = useDadosNav()
  const [buscaAberta, setBuscaAberta] = useState(false)
  const topo = faixaVisivel ? JOIN_BANNER_HEIGHT : 0

  // Atalho da busca. Não rouba o Ctrl+K de quem está digitando num editor.
  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'k') return
      const alvo = e.target as HTMLElement | null
      if (alvo?.isContentEditable) return
      e.preventDefault()
      setBuscaAberta((aberta) => !aberta)
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [])

  // Áreas do LMS que a comunidade não usa: só admin entra.
  useEffect(() => {
    if (papelPendente || ehAdmin || !rotaOculta(pathname)) return
    router.replace(getUriWithOrg(orgslug, autenticado ? ROTA_INICIAL : '/'))
  }, [papelPendente, ehAdmin, pathname, autenticado, orgslug, router])

  return (
    <EscreverProvider orgslug={orgslug}>
      {topo > 0 && <div style={{ height: topo }} aria-hidden="true" />}
      <BarraSuperior orgslug={orgslug} topo={topo} aoBuscar={() => setBuscaAberta(true)} />
      <BarraLateral orgslug={orgslug} topo={topo} aoBuscar={() => setBuscaAberta(true)} />
      <div
        data-area={rotaAprender(pathname) ? 'aprender' : undefined}
        className="flex min-w-0 flex-1 flex-col lg:ps-64"
        style={{ paddingBottom: 'var(--altura-barra-inferior, 0px)' }}
      >
        {children}
      </div>
      <BarraInferior orgslug={orgslug} />
      <BuscaDialogo orgslug={orgslug} aberta={buscaAberta} aoMudar={setBuscaAberta} />
    </EscreverProvider>
  )
}

export default ShellDiscipulei
