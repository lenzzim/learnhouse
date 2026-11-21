/**
 * Carrega o texto da BLIVRE (public/biblia-dados/blivre/<ID>.json) no cliente,
 * com cache em memória por livro. O caminho é excluído do proxy de tenancy
 * (ver proxy.ts), então é servido direto do /public.
 */
import { intervaloVersos, livroPorId, type Referencia } from './referencias'

export interface LivroDados {
  id: string
  nome: string
  abrev: string
  /** capitulos[c - 1][v - 1] = texto do versículo v do capítulo c */
  capitulos: string[][]
}

export interface Versiculo {
  numero: number
  texto: string
}

export const CAMINHO_DADOS = '/biblia-dados/blivre'

/** Licença da BLIVRE (CC BY 4.0; o crédito completo está em CREDITO). */
export const LICENCA_URL = 'https://creativecommons.org/licenses/by/4.0/deed.pt-br'

const cache = new Map<string, Promise<LivroDados>>()

export function carregarLivro(livroId: string): Promise<LivroDados> {
  if (!livroPorId(livroId)) return Promise.reject(new Error(`livro desconhecido: ${livroId}`))
  let p = cache.get(livroId)
  if (!p) {
    p = fetch(`${CAMINHO_DADOS}/${livroId}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<LivroDados>
      })
      .catch((e) => {
        // não guarda falha no cache: a próxima tentativa refaz o fetch
        cache.delete(livroId)
        throw e
      })
    cache.set(livroId, p)
  }
  return p
}

/** Versículos cobertos pela referência (capítulo inteiro se não houver versículo). */
export async function versiculosDaReferencia(ref: Referencia): Promise<Versiculo[]> {
  const livro = await carregarLivro(ref.livroId)
  const capitulo = livro.capitulos[ref.capitulo - 1] ?? []
  const intervalo = intervaloVersos(ref)
  if (!intervalo) return []
  const [ini, fim] = intervalo
  const out: Versiculo[] = []
  for (let v = ini; v <= fim && v <= capitulo.length; v++) out.push({ numero: v, texto: capitulo[v - 1] })
  return out
}

/** URL relativa do leitor para uma referência (mesmo host da org). */
export function hrefLeitor(codigo: string): string {
  return `/biblia?ref=${encodeURIComponent(codigo)}`
}
