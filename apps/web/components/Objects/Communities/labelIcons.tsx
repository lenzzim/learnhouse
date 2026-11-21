import React from 'react'
import {
  BookOpen,
  HandHeart,
  HelpCircle,
  Lightbulb,
  Megaphone,
  MessageSquare,
  Sparkles,
  Star,
} from 'lucide-react'

// Ícone de cada categoria (DISCUSSION_LABELS[].icon). Centralizado aqui para
// que card, filtro e modais não precisem repetir o mesmo switch.
export function getLabelIcon(iconName: string, size: number = 12) {
  switch (iconName) {
    case 'BookOpen':
      return <BookOpen size={size} />
    case 'Sparkles':
      return <Sparkles size={size} />
    case 'HandHeart':
      return <HandHeart size={size} />
    case 'HelpCircle':
      return <HelpCircle size={size} />
    case 'Lightbulb':
      return <Lightbulb size={size} />
    case 'Megaphone':
      return <Megaphone size={size} />
    case 'Star':
      return <Star size={size} />
    default:
      return <MessageSquare size={size} />
  }
}
