'use client'
import { useEffect, useState } from 'react'
import { versaoPadraoDoIdioma, versaoPadraoPara, versaoPorId } from '@/lib/biblia/versoes'
import { carregarNomesLivros } from '@/lib/biblia/dados'
import type { IdiomaReferencia, NomesLivros } from '@/lib/biblia/referencias'
import { useIdiomaDiscipulei } from '@components/Discipulei/useIdioma'
import { useLHSession } from '@components/Contexts/LHSessionContext'

/**
 * Bíblia no idioma da interface:
 *  - `idioma`: pt | en | es (seguro para a hidratação: 'pt' até montar);
 *  - `versaoPadrao`: versão usada quando o usuário não escolheu outra.
 *    Logado em português: NVI (decisão N38, 23/11/2026). Visitante e link
 *    privado: a aberta do idioma (pt -> BLIVRE, en -> WEB, es -> RV1909);
 *  - `versaoAberta`: a aberta do idioma (recuo quando a NVI falha);
 *  - `logado`: há sessão;
 *  - `montado`: false no servidor, no primeiro render e enquanto a sessão
 *    carrega (o idioma e a sessão ainda não são conhecidos; quem carrega
 *    texto espera para não buscar duas versões).
 */
export function useBibliaIdioma(): {
  idioma: IdiomaReferencia
  versaoPadrao: string
  versaoAberta: string
  logado: boolean
  montado: boolean
} {
  const idioma = useIdiomaDiscipulei()
  const sessao = useLHSession()
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  // sem provedor de sessão (páginas públicas) = visitante
  const carregandoSessao = !!sessao && sessao.status === 'loading'
  const logado = sessao?.status === 'authenticated'
  return {
    idioma,
    versaoPadrao: versaoPadraoPara(idioma, logado),
    versaoAberta: versaoPadraoDoIdioma(idioma),
    logado,
    montado: montado && !carregandoSessao,
  }
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
