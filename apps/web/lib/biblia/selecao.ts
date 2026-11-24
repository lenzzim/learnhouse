/**
 * Seleção de versículos no leitor (P0 do plano do leitor, item 1): quais
 * versículos estão selecionados, como a seleção vira rótulo ("João 3:16-17,
 * 19"), link da passagem e o texto da cópia:
 *
 *   "16 Porque Deus amou… 17 …" — João 3:16-17 (NVI)
 *   https://…/biblia?ref=JHN.3.16-17&v=nvi
 *
 * Módulo puro (só imports de módulos puros): roda no Node.
 */
import { formatarReferencia, type NomesLivros, type Referencia } from './referencias'
import { politicaCopia } from './versoes'

/** Liga ou desliga um versículo (lista ordenada, sem repetição). */
export function alternarVerso(selecao: readonly number[], n: number): number[] {
  return selecao.includes(n) ? selecao.filter((v) => v !== n) : [...selecao, n].sort((a, b) => a - b)
}

/** Shift+clique: acrescenta o intervalo entre a âncora e `n` (inclusive). */
export function estenderSelecao(selecao: readonly number[], ancora: number | null, n: number, existe: (v: number) => boolean = () => true): number[] {
  if (ancora === null) return alternarVerso(selecao, n)
  const [ini, fim] = ancora <= n ? [ancora, n] : [n, ancora]
  const set = new Set(selecao)
  for (let v = ini; v <= fim; v++) if (existe(v)) set.add(v)
  return [...set].sort((a, b) => a - b)
}

/** [16, 17, 19] -> [[16, 17], [19, 19]] */
export function trechos(selecao: readonly number[]): [number, number][] {
  const ordenada = [...new Set(selecao)].sort((a, b) => a - b)
  const out: [number, number][] = []
  for (const n of ordenada) {
    const ultimo = out[out.length - 1]
    if (ultimo && n === ultimo[1] + 1) ultimo[1] = n
    else out.push([n, n])
  }
  return out
}

/** Referência de cada trecho contíguo da seleção. */
export function referenciasDosTrechos(livroId: string, capitulo: number, selecao: readonly number[]): Referencia[] {
  return trechos(selecao).map(([ini, fim]) => {
    const r: Referencia = { livroId, capitulo, versoIni: ini }
    if (fim !== ini) r.versoFim = fim
    return r
  })
}

/** "João 3:16-17, 19" (ou "Jo 3:16-17, 19" com `abreviado`). */
export function rotuloSelecao(
  livroId: string,
  capitulo: number,
  selecao: readonly number[],
  nomes?: NomesLivros | null,
  abreviado = false
): string {
  const partes = trechos(selecao)
  if (!partes.length) return formatarReferencia({ livroId, capitulo }, abreviado, nomes)
  const primeiro = formatarReferencia(
    { livroId, capitulo, versoIni: partes[0][0], versoFim: partes[0][1] !== partes[0][0] ? partes[0][1] : undefined },
    abreviado,
    nomes
  )
  const resto = partes.slice(1).map(([a, b]) => (a === b ? String(a) : `${a}-${b}`))
  return [primeiro, ...resto].join(', ')
}

/** Código do link da passagem: do primeiro ao último versículo ("JHN.3.16-19"). */
export function codigoSelecao(livroId: string, capitulo: number, selecao: readonly number[]): string {
  const ordenada = [...selecao].sort((a, b) => a - b)
  if (!ordenada.length) return `${livroId}.${capitulo}`
  const ini = ordenada[0]
  const fim = ordenada[ordenada.length - 1]
  return `${livroId}.${capitulo}.${ini}${fim !== ini ? `-${fim}` : ''}`
}

export interface VersoCopia {
  numero: number
  texto: string
  /** rótulo exibido ("25-26" num combinado); padrão: o número */
  rotulo?: string
}

/**
 * Texto da cópia: entre aspas, com os números quando há mais de um
 * versículo, a referência, a sigla e o link (sempre: regra das licenciadas).
 */
export function textoCopia({ versos, referencia, sigla, link }: { versos: VersoCopia[]; referencia: string; sigla: string; link: string }): string {
  const corpo =
    versos.length === 1
      ? versos[0].texto.trim()
      : versos.map((v) => `${v.rotulo ?? v.numero} ${v.texto.trim()}`).join(' ')
  return `"${corpo}" — ${referencia} (${sigla})\n${link}`
}

/** Limite de versículos por cópia na versão (null = sem limite). */
export function limiteCopia(versaoId: string | null | undefined): number | null {
  return politicaCopia(versaoId).maxVersiculosCopia
}

/** A cópia cabe no limite da versão? */
export function copiaPermitida(versaoId: string | null | undefined, quantidade: number): boolean {
  const max = limiteCopia(versaoId)
  return politicaCopia(versaoId).permiteCopiar && (max === null || quantidade <= max)
}
