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
 * Versão de onde vêm os nomes dos livros: a própria, se aberta; se licenciada
 * (sem index.json estático), a aberta padrão do idioma dela (ARA -> BLIVRE,
 * NIV -> WEB).
 */
export function versaoDosNomes(versao: string | null | undefined): string | null {
  const info = versaoPorId(versao)
  if (!info) return null
  return info.fonte === 'licenciada' ? versaoPadraoDoIdioma(info.idioma) : info.id
}

/**
 * Nomes dos livros na versão (index.json dela). null até o primeiro carregar
 * ou se falhar — quem usa cai nos nomes em português de LIVROS.
 */
export function useNomesLivros(versaoPedida: string | null | undefined): NomesLivros | null {
  const versao = versaoDosNomes(versaoPedida)
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
