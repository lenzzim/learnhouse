'use client'

import React from 'react'
import { Moon, Sun } from 'lucide-react'
import { getMenuColorClasses } from '@services/utils/ts/colorUtils'

const STORAGE_KEY = 'lh_theme'

/**
 * Dark/light switch.
 *
 * Dark is the default and is applied by public/theme-init.js before first
 * paint; this component only reads back what that script decided and lets the
 * viewer override it. The two must agree on STORAGE_KEY.
 *
 * `mounted` gates the icon because the server render has no access to
 * localStorage — rendering the icon before mount would hydrate-mismatch.
 */
const ThemeSwitcher = ({ primaryColor = '' }: { primaryColor?: string }) => {
  const colors = getMenuColorClasses(primaryColor)
  const [mounted, setMounted] = React.useState(false)
  const [isDark, setIsDark] = React.useState(true)

  React.useEffect(() => {
    setMounted(true)
    setIsDark(document.documentElement.classList.contains('dark'))
  }, [])

  const toggle = () => {
    const next = !isDark
    setIsDark(next)

    const el = document.documentElement
    el.classList.toggle('dark', next)
    el.style.colorScheme = next ? 'dark' : 'light'

    try {
      localStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light')
    } catch { /* private mode / sandboxed iframe */ }
  }

  return (
    <button
      onClick={toggle}
      aria-label={isDark ? 'Ativar tema claro' : 'Ativar tema escuro'}
      title={isDark ? 'Tema claro' : 'Tema escuro'}
      className={`flex items-center px-2.5 py-2 rounded-lg transition-colors outline-none ${colors.iconBtn}`}
    >
      {mounted && (isDark ? <Sun size={16} strokeWidth={2.5} /> : <Moon size={16} strokeWidth={2.5} />)}
      {!mounted && <span className="block w-4 h-4" />}
    </button>
  )
}

export default ThemeSwitcher
