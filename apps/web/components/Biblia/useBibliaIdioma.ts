'use client'
import { useEffect, useState } from 'react'
import { versaoPadraoDoIdioma, versaoPorId } from '@/lib/biblia/versoes'
import { carregarNomesLivros } from '@/lib/biblia/dados'
import type { IdiomaReferencia, NomesLivros } from '@/lib/biblia/referencias'
import { useIdiomaDiscipulei } from '@components/Discipulei/useIdioma'

/**
 * Bíblia no idioma da interface:
 *  - `idioma`: pt | en | es (seguro para a hidratação: 'pt' até montar);
 *  - `versaoPadrao`: versão usada quando o usuário não escolheu outra
 *    (pt -> BLIVRE, en -> WEB, es -> RV1909);
 *  - `montado`: false no servidor e no primeiro render (o idioma real ainda
 *    não é conhecido; quem carrega texto pode esperar para não buscar duas
 *    versões).
 */
export function useBibliaIdioma(): { idioma: IdiomaReferencia; versaoPadrao: string; montado: boolean } {
  const idioma = useIdiomaDiscipulei()
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  return { idioma, versaoPadrao: versaoPadraoDoIdioma(idioma), montado }
}

/**
 * Nomes dos livros na versão (index.json dela). null até o primeiro carregar
 * ou se falhar — quem usa cai nos nomes em português de LIVROS.
 */
export function useNomesLivros(versao: string | null | undefined): NomesLivros | null {
  const [nomes, setNomes] = useState<{ versao: string; nomes: NomesLivros } | null>(null)
  useEffect(() => {
    if (!versao || !versaoPorId(versao)) return
    let vivo = true
    carregarNomesLivros(versao)
      .then((n) => vivo && setNomes({ versao, nomes: n }))
      .catch(() => {
        /* fica com os nomes em português */
      })
    return () => {
      vivo = false
    }
  }, [versao])
  // ao trocar de versão, mantém os nomes anteriores até os novos chegarem
  // (evita piscar os nomes em português no seletor)
  return nomes ? nomes.nomes : null
}
