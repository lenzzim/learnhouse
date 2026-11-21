'use client'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { VERSOES, versaoPorId, type Idioma, type VersaoInfo } from '@/lib/biblia/versoes'
import { filtrarLicenciadas } from '@/lib/biblia/fontes'
import { useVersoesLicenciadas } from './useFonteBiblia'

const IDIOMAS: Idioma[] = ['pt', 'en', 'es']

/**
 * <select> de versões agrupado por idioma. As licenciadas (API.Bible) liberadas
 * pelo servidor entram num grupo próprio logo depois do idioma delas:
 * "Licenciadas" (português) e "Licenciadas · Inglês". `opcaoVazia` acrescenta
 * uma opção "" no topo.
 */
export function SeletorVersao({
  valor,
  onChange,
  rotulo,
  opcaoVazia,
  excluir,
  className,
  curto = false,
  semLicenciadas = false,
}: {
  valor: string
  onChange: (id: string) => void
  rotulo: string
  opcaoVazia?: string
  excluir?: string
  className?: string
  /** só a sigla nas opções (para espaços pequenos, como o popover) */
  curto?: boolean
  /** esconde as versões licenciadas */
  semLicenciadas?: boolean
}) {
  const { t } = useTranslation()
  const estado = useVersoesLicenciadas()
  let licenciadas: VersaoInfo[] = semLicenciadas ? [] : filtrarLicenciadas(estado)
  // versão licenciada vinda da URL antes do catálogo chegar: mantém a opção para o <select> não mentir
  const atual = versaoPorId(valor)
  if (atual?.fonte === 'licenciada' && !licenciadas.some((v) => v.id === atual.id)) licenciadas = [...licenciadas, atual]
  licenciadas = licenciadas.filter((v) => v.id !== excluir)

  const opcao = (v: VersaoInfo) => (
    <option key={v.id} value={v.id}>
      {curto ? v.sigla : `${v.sigla} — ${v.nome}`}
    </option>
  )
  const grupoLicenciadas = (idioma: Idioma) => {
    const lista = licenciadas.filter((v) => v.idioma === idioma)
    if (!lista.length) return null
    const rotuloGrupo =
      idioma === 'pt'
        ? t('biblia.grupo_licenciadas')
        : t('biblia.grupo_licenciadas_idioma', { idioma: t(`biblia.idioma_${idioma}`) })
    return <optgroup label={rotuloGrupo}>{lista.map(opcao)}</optgroup>
  }

  return (
    <select aria-label={rotulo} title={rotulo} className={className} value={valor} onChange={(e) => onChange(e.target.value)}>
      {opcaoVazia !== undefined && <option value="">{opcaoVazia}</option>}
      {IDIOMAS.map((idioma) => (
        <React.Fragment key={idioma}>
          <optgroup label={t(`biblia.idioma_${idioma}`)}>
            {VERSOES.filter((v) => v.idioma === idioma && v.id !== excluir).map(opcao)}
          </optgroup>
          {grupoLicenciadas(idioma)}
        </React.Fragment>
      ))}
    </select>
  )
}

export default SeletorVersao
