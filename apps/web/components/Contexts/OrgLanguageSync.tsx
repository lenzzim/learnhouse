'use client'

import { useEffect } from 'react'
import { useOrg } from './OrgContext'
import i18n, { changeLanguage, LANGUAGE_USER_PICKED_KEY } from '@/lib/i18n'

const USER_PICKED_KEY = LANGUAGE_USER_PICKED_KEY

export default function OrgLanguageSync() {
  const org = useOrg() as any

  const orgDefault: string | undefined =
    org?.config?.config?.customization?.general?.default_language ||
    org?.config?.config?.general?.default_language

  useEffect(() => {
    // Discipulei (N04): the API stores `en` as the implicit default for every
    // org (GeneralCustomization.default_language), so `en` cannot be told apart
    // from "never configured" — treat it as unset and keep Portuguese.
    if (!orgDefault || orgDefault === 'en') return

    let userPicked: string | null = null
    try {
      userPicked = localStorage.getItem(USER_PICKED_KEY)
    } catch {}
    if (userPicked) return

    if (i18n.language.split('-')[0] !== orgDefault) {
      changeLanguage(orgDefault)
    }
  }, [orgDefault])

  return null
}
