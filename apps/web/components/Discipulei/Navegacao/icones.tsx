'use client'

import { BookOpen, ChatsCircle, House, Notebook } from '@phosphor-icons/react'
import type { AbaId } from '@/lib/discipulei/nav'

/** Ícone de cada item principal (contorno quando inativo, cheio quando ativo). */
export const ICONE_ABA: Record<AbaId, typeof House> = {
  inicio: House,
  biblia: BookOpen,
  caderno: Notebook,
  comunidades: ChatsCircle,
}
