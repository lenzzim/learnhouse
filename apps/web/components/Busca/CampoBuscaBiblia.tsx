'use client'

/**
 * Campo "Buscar na Bíblia" do leitor: leva para /biblia/buscar na versão que
 * está aberta. Referência digitada ("Jo 3:16", "Sl 23") vai direto para a
 * passagem, sem passar pela página de resultados.
 */
import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { Search } from 'lucide-react'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg } from '@services/config/config'
import { codigoLeitor, interpretarConsulta } from '@/lib/biblia/consulta'

export function CampoBuscaBiblia({ versao, className = '' }: { versao: string; className?: string }) {
  const { t } = useTranslation()
  const router = useRouter()
  const org = useOrg() as any
  const [valor, setValor] = useState('')

  const enviar = (e: React.FormEvent) => {
    e.preventDefault()
    const q = valor.trim()
    if (!q) return
    const ref = interpretarConsulta(q)
    const slug = org?.slug ?? ''
    if (ref) {
      router.push(getUriWithOrg(slug, `/biblia?ref=${encodeURIComponent(codigoLeitor(ref))}&v=${encodeURIComponent(versao)}`))
      return
    }
    router.push(getUriWithOrg(slug, `/biblia/buscar?q=${encodeURIComponent(q)}&v=${encodeURIComponent(versao)}`))
  }

  return (
    <form role="search" onSubmit={enviar} className={`relative ${className}`}>
      <label className="sr-only" htmlFor="campo-busca-biblia">
        {t('busca.buscar_na_biblia')}
      </label>
      <input
        id="campo-busca-biblia"
        type="search"
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        placeholder={t('busca.biblia_placeholder_curto')}
        enterKeyHint="search"
        className="h-11 w-full rounded-full border border-[var(--line)] bg-[var(--panel)] pe-12 ps-4 text-base text-[var(--text)] placeholder:text-[var(--text-3)] focus:border-[var(--line-strong)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)] sm:text-sm"
      />
      <button
        type="submit"
        aria-label={t('busca.buscar_na_biblia')}
        className="absolute inset-y-0 end-0 flex w-11 items-center justify-center rounded-full text-[var(--text-2)] hover:text-[var(--text)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
      >
        <Search size={18} aria-hidden="true" />
      </button>
    </form>
  )
}
