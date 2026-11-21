'use client'

import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { idiomaDiscipulei, type IdiomaDiscipulei } from '@/lib/discipulei/nav'

/**
 * Idioma da interface reduzido a pt | en | es, seguro para a hidratação: no
 * servidor e no primeiro render do cliente devolve 'pt' (o servidor não lê o
 * localStorage); depois de montar, acompanha o i18next e re-renderiza a cada
 * troca de idioma. Use para atributos (href, lang) que o React não corrige na
 * hidratação.
 */
export function useIdiomaDiscipulei(): IdiomaDiscipulei {
  const { i18n } = useTranslation()
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  return montado ? idiomaDiscipulei(i18n.resolvedLanguage || i18n.language) : 'pt'
}

export default useIdiomaDiscipulei
