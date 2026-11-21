import type { MetadataRoute } from 'next'

/**
 * Manifesto do app instalável (Discipulei, decisão N20).
 *
 * O Next serve isto em /manifest.webmanifest e injeta o <link rel="manifest">
 * em todas as páginas. Sem service worker de propósito: o objetivo é só
 * "Instalar app" / "Adicionar à Tela de Início", sem offline nem push.
 *
 * start_url é /communities porque é para lá que o proxy manda quem já entrou
 * (raiz e /home redirecionam para lá em tenancy single). Quem abrir o app sem
 * sessão vê a mesma página que veria no navegador.
 *
 * Ícones em public/icons/ (arte em 02. Mídia/01. Branding/01. Logo/icones).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'Discipulei · Comunidade',
    short_name: 'Discipulei',
    description: 'A comunidade do Discipulei: conversas e conteúdos, direto na tela do celular.',
    lang: 'pt-BR',
    start_url: '/communities',
    scope: '/',
    display: 'standalone',
    background_color: '#121211',
    theme_color: '#121211',
    icons: [
      {
        src: '/icons/icone-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icone-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icons/icone-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
