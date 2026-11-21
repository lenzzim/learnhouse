'use client'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { VERSOES, type Idioma } from '@/lib/biblia/versoes'

const IDIOMAS: Idioma[] = ['pt', 'en', 'es']

/** <select> de versões agrupado por idioma. `opcaoVazia` acrescenta uma opção "" no topo. */
export function SeletorVersao({
  valor,
  onChange,
  rotulo,
  opcaoVazia,
  excluir,
  className,
  curto = false,
}: {
  valor: string
  onChange: (id: string) => void
  rotulo: string
  opcaoVazia?: string
  excluir?: string
  className?: string
  /** só a sigla nas opções (para espaços pequenos, como o popover) */
  curto?: boolean
}) {
  const { t } = useTranslation()
  return (
    <select aria-label={rotulo} title={rotulo} className={className} value={valor} onChange={(e) => onChange(e.target.value)}>
      {opcaoVazia !== undefined && <option value="">{opcaoVazia}</option>}
      {IDIOMAS.map((idioma) => (
        <optgroup key={idioma} label={t(`biblia.idioma_${idioma}`)}>
          {VERSOES.filter((v) => v.idioma === idioma && v.id !== excluir).map((v) => (
            <option key={v.id} value={v.id}>
              {curto ? v.sigla : `${v.sigla} — ${v.nome}`}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  )
}

export default SeletorVersao
