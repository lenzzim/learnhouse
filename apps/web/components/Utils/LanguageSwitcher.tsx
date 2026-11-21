'use client'

import React from 'react'
import { useTranslation } from 'react-i18next'
import { Languages, ChevronDown, Check } from 'lucide-react'
import { getLanguageByCode, type Language } from '@/lib/languages'
import { IDIOMAS_DISCIPULEI } from '@/lib/discipulei/nav'
import { changeLanguage, LANGUAGE_USER_PICKED_KEY } from '@/lib/i18n'
import { useLHAnalytics, AnalyticsEvent } from '@services/analytics'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@components/ui/dropdown-menu"
import { getMenuColorClasses } from '@services/utils/ts/colorUtils'

/**
 * Discipulei: só os idiomas de IDIOMAS_DISCIPULEI (pt, en, es) aparecem no
 * seletor. Os outros locales continuam no repositório (lib/languages.ts).
 */
export const IDIOMAS_SELETOR: Language[] = IDIOMAS_DISCIPULEI.map((c) => getLanguageByCode(c)).filter(
  (l): l is Language => !!l
)

/**
 * Troca o idioma pela escolha do usuário: marca a escolha, carrega o pacote e
 * troca (o detector grava em 'discipulei_lng'; bindI18nStore re-renderiza).
 */
export function escolherIdioma(code: string) {
  try {
    localStorage.setItem(LANGUAGE_USER_PICKED_KEY, '1')
  } catch { /* ignore */ }
  return changeLanguage(code)
}

const LanguageSwitcher = ({ primaryColor = '' }: { primaryColor?: string }) => {
  const { t, i18n } = useTranslation()
  const { track } = useLHAnalytics()
  const colors = getMenuColorClasses(primaryColor)
  const [mounted, setMounted] = React.useState(false)
  React.useEffect(() => setMounted(true), [])

  const currentLangCode = mounted ? i18n.language.split('-')[0].toUpperCase() : ''

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label={mounted ? `${t('nav.idioma')}: ${currentLangCode}` : undefined} className={`flex items-center space-x-1.5 px-2.5 py-2 rounded-lg transition-colors text-sm font-bold outline-none ${colors.iconBtn}`}>
          <Languages size={16} strokeWidth={2.5} />
          <span suppressHydrationWarning>{currentLangCode}</span>
          <ChevronDown size={12} className="opacity-50" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="min-w-[180px] z-dropdown"
        align="end"
      >
        {IDIOMAS_SELETOR.map((language) => (
          <DropdownMenuItem
            key={language.code}
            className="flex items-center justify-between cursor-pointer"
            onClick={() => {
              track(AnalyticsEvent.LanguageChanged, {
                language_code: language.code,
                source: 'language_switcher',
              })
              escolherIdioma(language.code)
            }}
          >
            <span className="flex items-center space-x-2">
              <span className="text-xs font-mono text-gray-400 w-5">{language.code.toUpperCase()}</span>
              <span>{language.nativeName}</span>
            </span>
            {i18n.language.split('-')[0] === language.code && <Check size={14} className="text-black" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default LanguageSwitcher

