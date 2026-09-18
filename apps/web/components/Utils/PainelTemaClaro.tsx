'use client'

import { useEffect } from 'react'

/**
 * O painel (/dash) abre sempre no tema claro.
 *
 * O tema escuro do Discipulei é uma sobreposição sobre as classes claras do
 * Tailwind (styles/discipulei-dark.css). As telas de configuração da
 * organização usam fundos claros fixos que a sobreposição não cobre, e o
 * resultado é texto claro sobre fundo claro — ilegível.
 *
 * O `public/theme-init.js` já resolve o primeiro carregamento, antes da
 * primeira pintura. Este componente cobre a navegação interna do App Router,
 * em que aquele script não roda de novo, e devolve a preferência do visitante
 * ao sair do painel.
 */
export default function PainelTemaClaro() {
  useEffect(() => {
    const raiz = document.documentElement
    const estavaEscuro = raiz.classList.contains('dark')

    raiz.classList.remove('dark')
    raiz.style.colorScheme = 'light'

    return () => {
      if (estavaEscuro) {
        raiz.classList.add('dark')
        raiz.style.colorScheme = 'dark'
      }
    }
  }, [])

  return null
}
