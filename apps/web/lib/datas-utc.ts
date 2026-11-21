/**
 * A API grava datas em UTC, mas as serializa sem fuso ("2026-11-21 19:05:45.732795").
 * Lida como está, essa string vira hora LOCAL no navegador (UTC-3 no Brasil) e uma
 * nota recém-criada aparece "em 3 horas". Esta função devolve uma string ISO 8601
 * com o "Z" explícito quando a data/hora não traz fuso; o resto passa intacto.
 *
 * Sem dependências, para poder ser testada com `node --test`.
 */

// Data e hora (com espaço ou "T"), segundos e frações opcionais.
const DATA_HORA = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/
// "Z" ou deslocamento (+00:00, -0300, +03) no final.
const TEM_FUSO = /(z|[+-]\d{2}(:?\d{2})?)$/i

export function apiDateToIso<T>(value: T): T | string {
  if (typeof value !== 'string') return value
  const s = value.trim()
  if (TEM_FUSO.test(s.slice(10))) return s
  if (!DATA_HORA.test(s)) return value
  return `${s.replace(' ', 'T')}Z`
}

/**
 * Data curta no formato da língua da pessoa: "21 de nov. de 2026" em pt-BR,
 * "Nov 21, 2026" em inglês. Usa Intl, então não depende do locale do dayjs.
 */
export function formatarDataCurta(
  value: string | number | Date | null | undefined,
  idioma: string = 'pt-BR'
): string {
  if (value === null || value === undefined || value === '') return ''
  const data = value instanceof Date ? value : new Date(typeof value === 'string' ? apiDateToIso(value) : value)
  if (Number.isNaN(data.getTime())) return ''
  const locale = idioma === 'pt' ? 'pt-BR' : idioma
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(data)
  } catch {
    return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' }).format(data)
  }
}
