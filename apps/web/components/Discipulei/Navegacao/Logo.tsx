'use client'

import React from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useOrg } from '@components/Contexts/OrgContext'
import { getUriWithOrg } from '@services/config/config'
import { getOrgLogoMediaDirectory } from '@services/media/media'
import { ROTA_INICIAL } from '@/lib/discipulei/nav'
import { FOCO, SERIF } from './estilos'

/** Logo da organização (ou o nome em serifa) levando à tela inicial. */
export function Logo({ orgslug, autenticado }: { orgslug: string; autenticado: boolean }) {
  const { t } = useTranslation()
  const org = useOrg() as any
  const destino = getUriWithOrg(orgslug, autenticado ? ROTA_INICIAL : '/')
  return (
    <Link
      href={destino}
      aria-label={t('nav.ir_inicio', { nome: org?.name || 'Discipulei' })}
      className={`inline-flex h-11 items-center rounded-md ${FOCO}`}
    >
      {org?.logo_image ? (
        <img
          src={getOrgLogoMediaDirectory(org.org_uuid, org.logo_image)}
          alt=""
          className="h-8 w-auto rounded-md"
        />
      ) : (
        <span className="text-xl leading-none text-[var(--text)]" style={SERIF}>
          {org?.name || 'Discipulei'}
        </span>
      )}
    </Link>
  )
}

export default Logo
