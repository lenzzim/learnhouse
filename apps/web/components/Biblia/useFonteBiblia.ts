'use client'
import { useEffect, useState } from 'react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { ErroFonte, carregarVersoesLicenciadas, definirTokenPadrao, type EstadoLicenciadas, type OpcoesFonte } from '@/lib/biblia/fontes'
import { reportarFums } from '@/lib/biblia/fums'
import type { TFunction } from 'i18next'

/** Catálogo das licenciadas liberadas pelo servidor (null enquanto carrega). */
export function useVersoesLicenciadas(): EstadoLicenciadas | null {
  const [estado, setEstado] = useState<EstadoLicenciadas | null>(null)
  useEffect(() => {
    let vivo = true
    carregarVersoesLicenciadas().then((e) => vivo && setEstado(e))
    return () => {
      vivo = false
    }
  }, [])
  return estado
}

/** Opções de acesso (token da sessão) para getChapter/getVerses, e se há sessão. */
export function useAcessoBiblia(): OpcoesFonte & { logado: boolean; carregandoSessao: boolean } {
  const sessao = useLHSession()
  const token = sessao?.data?.tokens?.access_token ?? null
  useEffect(() => definirTokenPadrao(token), [token])
  return {
    token,
    logado: sessao?.status === 'authenticated',
    carregandoSessao: !sessao || sessao.status === 'loading',
  }
}

/** Reporta ao FUMS os tokens do texto licenciado exibido (uma vez por exibição). */
export function useFums(tokens: Array<string | null | undefined>): void {
  const chave = tokens.filter(Boolean).join('|')
  useEffect(() => {
    if (chave) reportarFums(chave.split('|'))
  }, [chave])
}

/** Mensagem de erro de carregamento conforme o código do proxy (licenciadas). */
export function mensagemErroBiblia(erro: unknown, t: TFunction, sigla?: string): string {
  if (!(erro instanceof ErroFonte)) return t('biblia.erro_carregar')
  switch (erro.codigo) {
    case 'nao_autenticado':
      return t('biblia.licenciada_entrar', { sigla: sigla ?? '' })
    case 'chave_ausente':
    case 'versao_indisponivel':
      return t('biblia.licenciada_indisponivel', { sigla: sigla ?? '' })
    case 'limite_api':
    case 'limite_usuario':
      return t('biblia.licenciada_limite')
    default:
      return t('biblia.erro_carregar')
  }
}
