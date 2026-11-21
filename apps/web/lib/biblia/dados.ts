/**
 * Carrega textos da Bíblia no cliente, com cache em memória:
 *  - traduções: public/biblia-dados/<versão>/<ID>.json
 *  - original (STEPBible): public/biblia-dados/original/<ID>/<cap>.json
 *  - léxico (STEPBible): public/biblia-dados/lexico/<H|G>/<bloco>.json
 * O caminho /biblia-dados/ é excluído do proxy de tenancy (ver proxy.ts),
 * então tudo é servido direto do /public.
 */
import { intervaloVersos, livroPorId, type Referencia } from './referencias'
import { VERSAO_PADRAO, versaoPorId } from './versoes'
import { caminhoLexico, type CapituloOriginal, type Verbete } from './original'

export interface LivroDados {
  id: string
  nome: string
  abrev: string
  /** capitulos[c - 1][v - 1] = texto do versículo v do capítulo c ("" quando a versão não tem o versículo) */
  capitulos: string[][]
}

export interface Versiculo {
  numero: number
  texto: string
}

const RAIZ = '/biblia-dados'

const cacheJson = new Map<string, Promise<unknown>>()

function buscarJson<T>(url: string): Promise<T> {
  let p = cacheJson.get(url) as Promise<T> | undefined
  if (!p) {
    p = fetch(url)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<T>
      })
      .catch((e) => {
        // não guarda falha no cache: a próxima tentativa refaz o fetch
        cacheJson.delete(url)
        throw e
      })
    cacheJson.set(url, p)
  }
  return p
}

export function carregarLivro(livroId: string, versao: string = VERSAO_PADRAO): Promise<LivroDados> {
  if (!livroPorId(livroId)) return Promise.reject(new Error(`livro desconhecido: ${livroId}`))
  if (!versaoPorId(versao)) return Promise.reject(new Error(`versão desconhecida: ${versao}`))
  return buscarJson<LivroDados>(`${RAIZ}/${versao}/${livroId}.json`)
}

/** Versículos cobertos pela referência (capítulo inteiro se não houver versículo); vazios ficam de fora. */
export async function versiculosDaReferencia(ref: Referencia, versao: string = VERSAO_PADRAO): Promise<Versiculo[]> {
  const livro = await carregarLivro(ref.livroId, versao)
  const capitulo = livro.capitulos[ref.capitulo - 1] ?? []
  const intervalo = intervaloVersos(ref)
  if (!intervalo) return []
  const [ini, fim] = intervalo
  const out: Versiculo[] = []
  for (let v = ini; v <= fim && v <= capitulo.length; v++) {
    if (capitulo[v - 1]) out.push({ numero: v, texto: capitulo[v - 1] })
  }
  return out
}

/** Palavras do hebraico/grego do capítulo (índice = versículo; 0 = título dos Salmos). */
export function carregarOriginal(livroId: string, capitulo: number): Promise<CapituloOriginal> {
  if (!livroPorId(livroId) || !Number.isInteger(capitulo) || capitulo < 1) {
    return Promise.reject(new Error('capítulo inválido'))
  }
  return buscarJson<CapituloOriginal>(`${RAIZ}/original/${livroId}/${capitulo}.json`)
}

export async function carregarVerbete(strong: string): Promise<Verbete | null> {
  const caminho = caminhoLexico(strong)
  if (!caminho) return null
  const bloco = await buscarJson<Record<string, Verbete>>(caminho)
  return bloco[strong] ?? null
}

/** URL relativa do leitor para uma referência (mesmo host da org). */
export function hrefLeitor(codigo: string, versao?: string): string {
  let href = `/biblia?ref=${encodeURIComponent(codigo)}`
  if (versao && versao !== VERSAO_PADRAO && versaoPorId(versao)) href += `&v=${versao}`
  return href
}
