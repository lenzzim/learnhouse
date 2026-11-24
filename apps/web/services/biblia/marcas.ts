/**
 * Cliente de /api/v1/biblia/marcas: destaques (4 tons do Caderno) e favoritos
 * do leitor, salvos na conta. Por livro, capítulo e versículo, independentes
 * da versão. Só a própria pessoa lê e altera.
 */
import { getAPIUrl } from '@services/config/config'
import { RequestBodyWithAuthHeader, errorHandling } from '@services/utils/ts/requests'
import type { Cor } from '@/lib/caderno/cores'

export interface MarcaVerso {
  book: string
  chapter: number
  verse: number
  color: Cor | null
  favorite: boolean
  updated_at: string
}

export interface ListaMarcas {
  items: MarcaVerso[]
  total: number
  page: number
  limit: number
}

export type TipoMarca = 'highlight' | 'favorite'

const base = () => `${getAPIUrl()}biblia/marcas`

async function chamar<T>(url: string, metodo: string, corpo: unknown, token?: string | null): Promise<T> {
  const res = await fetch(url, RequestBodyWithAuthHeader(metodo, corpo ?? null, null, token ?? undefined))
  return errorHandling(res)
}

export function marcasDoCapitulo(livro: string, capitulo: number, token?: string | null): Promise<MarcaVerso[]> {
  const p = new URLSearchParams({ livro, capitulo: String(capitulo) })
  return chamar(`${base()}?${p}`, 'GET', null, token)
}

export function listarMarcas(
  { tipo, page = 1, limit = 50 }: { tipo?: TipoMarca; page?: number; limit?: number },
  token?: string | null
): Promise<ListaMarcas> {
  const p = new URLSearchParams({ page: String(page), limit: String(limit) })
  if (tipo) p.set('tipo', tipo)
  return chamar(`${base()}/lista?${p}`, 'GET', null, token)
}

/**
 * Aplica a mudança a vários versículos de um capítulo. `color`: tom, `''`
 * para tirar o destaque, ausente para não mexer. Devolve as marcas do capítulo.
 */
export function atualizarMarcas(
  dados: { book: string; chapter: number; verses: number[]; color?: Cor | ''; favorite?: boolean },
  token?: string | null
): Promise<MarcaVerso[]> {
  return chamar(base(), 'PUT', dados, token)
}
