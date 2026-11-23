'use client'

import { useEffect, useState } from 'react'
import { donoDoCanto, ouvirCanto, pedirCanto, soltarCanto, type DonoCanto } from '@/lib/discipulei/cantoInferior'

/**
 * Diz se este aviso pode aparecer agora no canto inferior. Enquanto `quer`
 * for verdadeiro, o aviso fica na fila; quando o outro aviso sai, a vez passa.
 * Ver lib/discipulei/cantoInferior.ts.
 */
export function useCantoInferior(dono: DonoCanto, quer: boolean): boolean {
  const [minhaVez, setMinhaVez] = useState(false)

  useEffect(() => {
    if (!quer) {
      setMinhaVez(false)
      return
    }
    const atualizar = () => setMinhaVez(donoDoCanto() === dono)
    const parar = ouvirCanto(atualizar)
    pedirCanto(dono)
    atualizar()
    return () => {
      parar()
      soltarCanto(dono)
    }
  }, [dono, quer])

  return quer && minhaVez
}
