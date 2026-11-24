'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Cor } from '@/lib/caderno/cores'
import { atualizarMarcas, marcasDoCapitulo, type MarcaVerso } from '@services/biblia/marcas'

/**
 * Destaques e favoritos do capítulo aberto no leitor (salvos na conta). Sem
 * sessão não busca nada. A mudança aparece na hora (otimista) e volta atrás
 * se o servidor recusar.
 */
export function useMarcas(livroId: string, capitulo: number, acesso: { token?: string | null; logado: boolean }) {
  const [mapa, setMapa] = useState<Map<number, MarcaVerso>>(new Map())
  const tokenRef = useRef(acesso.token)
  tokenRef.current = acesso.token

  useEffect(() => {
    setMapa(new Map())
    if (!acesso.logado || !acesso.token) return
    let vivo = true
    marcasDoCapitulo(livroId, capitulo, acesso.token)
      .then((lista) => vivo && setMapa(new Map(lista.map((m) => [m.verse, m]))))
      .catch(() => {
        /* sem marcas: o leitor continua funcionando */
      })
    return () => {
      vivo = false
    }
  }, [livroId, capitulo, acesso.logado, acesso.token])

  const aplicar = useCallback(
    async (versos: number[], mudanca: { color?: Cor | ''; favorite?: boolean }): Promise<boolean> => {
      if (!versos.length) return false
      let anterior: Map<number, MarcaVerso> | null = null
      setMapa((atual) => {
        anterior = atual
        const novo = new Map(atual)
        for (const v of versos) {
          const m: MarcaVerso = novo.get(v) ?? { book: livroId, chapter: capitulo, verse: v, color: null, favorite: false, updated_at: '' }
          const proxima = {
            ...m,
            color: mudanca.color === undefined ? m.color : mudanca.color || null,
            favorite: mudanca.favorite === undefined ? m.favorite : mudanca.favorite,
          }
          if (!proxima.color && !proxima.favorite) novo.delete(v)
          else novo.set(v, proxima)
        }
        return novo
      })
      try {
        const lista = await atualizarMarcas({ book: livroId, chapter: capitulo, verses: versos, ...mudanca }, tokenRef.current)
        setMapa(new Map(lista.map((m) => [m.verse, m])))
        return true
      } catch {
        if (anterior) setMapa(anterior)
        return false
      }
    },
    [livroId, capitulo]
  )

  return { mapa, aplicar }
}
