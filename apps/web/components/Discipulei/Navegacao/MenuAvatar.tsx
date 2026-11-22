'use client'

import React from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import {
  ArrowUpRight,
  CalendarCheck,
  CaretUpDown,
  Globe,
  GraduationCap,
  SignOut,
  SquaresFour,
  UserCircle,
} from '@phosphor-icons/react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@components/ui/dropdown-menu'
import UserAvatar from '@components/Objects/UserAvatar'
import { signOut } from '@components/Contexts/AuthContext'
import { ROTA_APRENDER, urlAgendar } from '@/lib/discipulei/nav'
import { IDIOMAS_SELETOR, escolherIdioma } from '@components/Utils/LanguageSwitcher'
import { useDadosNav } from './useDadosNav'
import { useIdiomaDiscipulei } from '../useIdioma'
import { FOCO } from './estilos'

const ITEM =
  'flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 text-sm text-[var(--text)] ' +
  'focus:bg-[var(--surface)] data-[highlighted]:bg-[var(--surface)] outline-none'

/**
 * Menu do avatar: Perfil/Conta, Aprender (só no celular; no computador está
 * na barra lateral), Agendar estudo (site), Painel admin (só admin), Idioma
 * (PT/EN/ES) e Sair. `variante="completa"` é a linha do rodapé da barra lateral;
 * `compacta` é só o avatar, na barra superior do celular.
 */
export function MenuAvatar({ variante }: { variante: 'completa' | 'compacta' }) {
  const { t } = useTranslation()
  const idioma = useIdiomaDiscipulei()
  const { usuario, ehAdmin } = useDadosNav()

  const nome =
    `${usuario?.first_name || ''} ${usuario?.last_name || ''}`.trim() || usuario?.username || ''

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {variante === 'compacta' ? (
          <button
            type="button"
            aria-label={t('nav.menu_conta')}
            className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-[var(--surface)] ${FOCO}`}
          >
            <UserAvatar width={30} rounded="rounded-full" shadow="shadow-none" borderColor="border-transparent" />
          </button>
        ) : (
          <button
            type="button"
            aria-label={t('nav.menu_conta')}
            className={`flex min-h-12 w-full items-center gap-3 rounded-lg px-2 text-start hover:bg-[var(--surface)] ${FOCO}`}
          >
            <UserAvatar width={32} rounded="rounded-full" shadow="shadow-none" borderColor="border-transparent" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-[var(--text)]">{nome}</span>
              {usuario?.email && (
                <span className="block truncate text-xs text-[var(--text-3)]">{usuario.email}</span>
              )}
            </span>
            <CaretUpDown size={16} aria-hidden="true" className="shrink-0 text-[var(--text-3)]" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={variante === 'compacta' ? 'end' : 'start'}
        side={variante === 'compacta' ? 'bottom' : 'top'}
        sideOffset={8}
        className="w-64 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-1.5 text-[var(--text)]"
        style={{ zIndex: 'var(--z-dropdown)' as any, boxShadow: 'var(--sombra-md)' }}
      >
        <DropdownMenuLabel className="px-3 py-2">
          <span className="block truncate text-sm font-semibold text-[var(--text)]">{nome}</span>
          {usuario?.email && (
            <span className="block truncate text-xs font-normal text-[var(--text-3)]">{usuario.email}</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="my-1 bg-[var(--line)]" />
        <DropdownMenuItem asChild className={ITEM}>
          <Link href="/account/general">
            <UserCircle size={18} aria-hidden="true" />
            {t('nav.perfil_conta')}
          </Link>
        </DropdownMenuItem>
        {variante === 'compacta' && (
          <DropdownMenuItem asChild className={ITEM}>
            <Link href={ROTA_APRENDER}>
              <GraduationCap size={18} aria-hidden="true" />
              {t('nav.aprender')}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild className={ITEM}>
          <a href={urlAgendar('menu', 'agendar', idioma)} target="_blank" rel="noopener">
            <CalendarCheck size={18} aria-hidden="true" />
            <span className="flex-1">{t('nav.agendar_estudo')}</span>
            <ArrowUpRight size={14} aria-hidden="true" className="text-[var(--text-3)] rtl:-scale-x-100" />
            <span className="sr-only">({t('chamada_estudo.nova_aba')})</span>
          </a>
        </DropdownMenuItem>
        {ehAdmin && (
          <DropdownMenuItem asChild className={ITEM}>
            <Link href="/dash">
              <SquaresFour size={18} aria-hidden="true" />
              {t('nav.painel_admin')}
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator className="my-1 bg-[var(--line)]" />
        <DropdownMenuLabel className="flex items-center gap-2 px-3 pb-1 pt-1.5 text-xs font-medium text-[var(--text-3)]">
          <Globe size={14} aria-hidden="true" />
          {t('nav.idioma')}
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={idioma}
          onValueChange={(code) => {
            escolherIdioma(code)
          }}
          className="flex gap-1 px-1.5 pb-1"
        >
          {IDIOMAS_SELETOR.map((l) => (
            <DropdownMenuRadioItem
              key={l.code}
              value={l.code}
              lang={l.code === 'pt' ? 'pt-BR' : l.code}
              // não fecha o menu: a troca aparece na hora, ainda com o menu aberto
              onSelect={(e) => e.preventDefault()}
              className={
                'min-h-11 flex-1 cursor-pointer justify-center rounded-md border border-[var(--line)] px-1 ps-1 text-sm ' +
                'text-[var(--text-2)] outline-none [&>span:first-child]:hidden ' +
                'focus:bg-[var(--surface)] data-[highlighted]:bg-[var(--surface)] ' +
                'data-[state=checked]:border-[var(--line-strong)] data-[state=checked]:bg-[var(--surface)] ' +
                'data-[state=checked]:font-semibold data-[state=checked]:text-[var(--text)]'
              }
            >
              {l.nativeName}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator className="my-1 bg-[var(--line)]" />
        <DropdownMenuItem
          className={ITEM}
          onSelect={() => {
            signOut({ callbackUrl: '/' })
          }}
        >
          <SignOut size={18} aria-hidden="true" data-dir-flip />
          {t('nav.sair')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default MenuAvatar
