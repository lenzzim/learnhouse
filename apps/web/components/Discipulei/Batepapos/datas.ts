/**
 * Datas da Agenda, sem dependência: Date + Intl no fuso do navegador.
 * Dias são chaves "AAAA-MM-DD" locais (para agrupar e marcar o calendário).
 */

/** "AAAA-MM-DD" do instante no fuso local. */
export function chaveDia(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dia}`
}

export const chaveDiaIso = (iso: string) => chaveDia(new Date(iso))

export function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function somarDias(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

export function inicioDoMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function somarMeses(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + n, 1)
}

/** Primeiro dia da semana (domingo, como no calendário brasileiro). */
export function inicioDaSemana(d: Date): Date {
  return somarDias(inicioDoDia(d), -d.getDay())
}

/** 6 semanas cobrindo o mês (grade fixa, sem pular de altura). */
export function diasDaGrade(mes: Date): Date[] {
  const ini = inicioDaSemana(inicioDoMes(mes))
  return Array.from({ length: 42 }, (_, i) => somarDias(ini, i))
}

/** "Hoje", "Amanhã" ou "terça, 1 de dezembro". */
export function rotuloDia(chave: string, hoje: Date, locale: string, t: (k: string) => string): string {
  if (chave === chaveDia(hoje)) return t('agenda.hoje')
  if (chave === chaveDia(somarDias(hoje, 1))) return t('agenda.amanha')
  const [a, m, d] = chave.split('-').map(Number)
  const data = new Date(a, m - 1, d)
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      ...(a !== hoje.getFullYear() ? { year: 'numeric' } : {}),
    }).format(data)
  } catch {
    return data.toDateString()
  }
}

/** Agrupa (em ordem) por dia local. */
export function agruparPorDia<T extends { starts_at: string }>(itens: T[]): Array<[string, T[]]> {
  const grupos = new Map<string, T[]>()
  for (const it of itens) {
    const k = chaveDiaIso(it.starts_at)
    const lista = grupos.get(k)
    if (lista) lista.push(it)
    else grupos.set(k, [it])
  }
  return Array.from(grupos.entries())
}

/** Nomes curtos dos dias da semana (dom..sáb) no idioma. */
export function nomesDaSemana(locale: string): string[] {
  const dom = new Date(2026, 10, 1) // um domingo
  return Array.from({ length: 7 }, (_, i) => {
    try {
      return new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(somarDias(dom, i))
    } catch {
      return ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][i]
    }
  })
}

export function nomeDoMes(d: Date, locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(d)
  } catch {
    return `${d.getMonth() + 1}/${d.getFullYear()}`
  }
}
