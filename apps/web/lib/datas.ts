import dayjs from 'dayjs'
import { apiDateToIso } from './datas-utc'

export { apiDateToIso }

/**
 * Converte uma data vinda da API em dayjs, tratando como UTC as strings sem fuso.
 * Use no lugar de `dayjs(x.creation_date)` antes de `.fromNow()`/`.format()`.
 */
export function parseApiDate(value: string | number | Date | null | undefined) {
  return dayjs(apiDateToIso(value))
}
