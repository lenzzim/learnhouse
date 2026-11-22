/**
 * Propriedades das notas (metadados estilo Obsidian) e frontmatter YAML.
 *
 * A nota guarda uma lista ORDENADA de pares { key, value }. As regras
 * espelham o servidor (apps/api/src/services/notes/properties.py): chave de
 * 1 a 40 caracteres (letras, números, espaço, _ e -), valor de até 200, até
 * 30 propriedades, chave repetida (sem diferenciar caixa) só uma vez.
 *
 * O leitor de frontmatter aceita o subconjunto do YAML que o Obsidian grava
 * para propriedades simples: `chave: valor`, aspas, `[a, b]` e listas em
 * bloco (`- item`). Sem dependência.
 *
 * Módulo PURO e SEM IMPORTS: roda no Node (lib/caderno/propriedades.test.mjs).
 */

export interface Propriedade {
  key: string
  value: string
}

export const CHAVE_MAX = 40
export const VALOR_MAX = 200
export const PROPRIEDADES_MAX = 30

export type ChaveSugerida = 'tipo' | 'livro' | 'tema' | 'autor' | 'data' | 'status'

/** Chaves prontas, na ordem do menu "Adicionar propriedade". */
export const CHAVES_SUGERIDAS: ChaveSugerida[] = ['tipo', 'livro', 'tema', 'autor', 'data', 'status']

/** Valores prontos do "tipo" (o valor gravado é este texto, em português). */
export const TIPOS_SUGERIDOS = ['TCD', 'Culto', 'Estudo', 'Oração', 'Sermão']
export const STATUS_SUGERIDOS = ['Rascunho', 'Em andamento', 'Concluído']

/** Modelo pronto → tipo que ele preenche (o modelo pode sugerir o tipo). */
export const TIPO_DO_MODELO: Record<string, string> = {
  tcd: 'TCD',
  soap: 'TCD',
  tres_perguntas: 'TCD',
  culto: 'Culto',
  estudo: 'Estudo',
  tematico: 'Estudo',
  oracao: 'Oração',
}

const RE_CHAVE = /^[\p{L}\p{N}_][\p{L}\p{N}_ -]*$/u
// eslint-disable-next-line no-control-regex
const RE_CONTROLE = /[\u0000-\u0008\u000b-\u001f\u007f]/g

export function chaveValida(chave: string): boolean {
  const k = (chave || '').trim()
  return !!k && k.length <= CHAVE_MAX && RE_CHAVE.test(k)
}

/** Limpa a lista: tira inválidas e repetidas, corta tamanhos, até 30. */
export function normalizarPropriedades(lista: Propriedade[] | null | undefined): Propriedade[] {
  const out: Propriedade[] = []
  const vistos = new Set<string>()
  for (const p of lista ?? []) {
    const key = String(p?.key ?? '').replace(RE_CONTROLE, '').trim()
    if (!chaveValida(key) || vistos.has(key.toLowerCase())) continue
    vistos.add(key.toLowerCase())
    const value = String(p?.value ?? '').replace(RE_CONTROLE, '').replace(/\n/g, ' ').trim().slice(0, VALOR_MAX)
    out.push({ key, value })
    if (out.length >= PROPRIEDADES_MAX) break
  }
  return out
}

/** Mesmo conteúdo e mesma ordem? (decide se há o que salvar) */
export function mesmasPropriedades(a: Propriedade[] | null | undefined, b: Propriedade[] | null | undefined): boolean {
  const x = a ?? []
  const y = b ?? []
  return x.length === y.length && x.every((p, i) => p.key === y[i].key && p.value === y[i].value)
}

/** Valor de uma chave (sem diferenciar caixa), ou ''. */
export function valorDe(lista: Propriedade[] | null | undefined, chave: string): string {
  const k = chave.toLowerCase()
  return (lista ?? []).find((p) => p.key.toLowerCase() === k)?.value ?? ''
}

/** Define (ou acrescenta) uma chave mantendo a ordem. */
export function definirPropriedade(lista: Propriedade[], chave: string, valor: string): Propriedade[] {
  const k = chave.toLowerCase()
  const i = lista.findIndex((p) => p.key.toLowerCase() === k)
  if (i < 0) return [...lista, { key: chave, value: valor }]
  return lista.map((p, j) => (j === i ? { ...p, value: valor } : p))
}

/* ------------------------------------------------------------- YAML */

const RESERVADAS = new Set(['true', 'false', 'yes', 'no', 'on', 'off', 'null', '~'])

function escalar(valor: string): string {
  if (valor === '') return '""'
  const numero = /^[-+]?\d+(\.\d+)?$/.test(valor)
  const seguro =
    /^[^\s\-?:,[\]{}#&*!|>'"%@`][^:#]*$/.test(valor) &&
    valor === valor.trim() &&
    !RESERVADAS.has(valor.toLowerCase()) &&
    !numero &&
    !valor.includes(': ') &&
    !valor.includes(' #')
  if (seguro) return valor
  return `"${valor.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
}

/** Propriedades → bloco `---` YAML (vazio se não houver). Igual ao servidor. */
export function gerarFrontmatter(lista: Propriedade[] | null | undefined): string {
  const linhas: string[] = []
  for (const p of lista ?? []) {
    const k = (p.key || '').trim()
    if (!k) continue
    const chave = /^[\p{L}\p{N}_][\p{L}\p{N}_-]*$/u.test(k) ? k : escalar(k)
    const v = p.value ?? ''
    linhas.push(`${chave}: ${/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : escalar(v)}`)
  }
  return linhas.length ? `---\n${linhas.join('\n')}\n---\n` : ''
}

function semAspas(bruto: string): string {
  const s = bruto.trim()
  if (s.length >= 2 && s[0] === '"' && s[s.length - 1] === '"') return s.slice(1, -1).replace(/\\(["\\])/g, '$1')
  if (s.length >= 2 && s[0] === "'" && s[s.length - 1] === "'") return s.slice(1, -1).replace(/''/g, "'")
  return s.replace(/\s+#.*$/, '').trim()
}

/** Lê o frontmatter do topo do markdown → { propriedades, corpo }. */
export function lerFrontmatter(md: string): { propriedades: Propriedade[]; corpo: string } {
  const texto = (md || '').replace(/^\uFEFF/, '')
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(texto)
  if (!m) return { propriedades: [], corpo: md || '' }
  const brutas: Propriedade[] = []
  let chaveAtual: string | null = null
  let listaAtual: string[] = []
  const fechar = () => {
    if (chaveAtual !== null) brutas.push({ key: chaveAtual, value: listaAtual.join(', ') })
    chaveAtual = null
    listaAtual = []
  }
  for (const linha of m[1].split(/\r?\n/)) {
    if (!linha.trim() || linha.trimStart().startsWith('#')) continue
    const item = /^\s+-\s*(.*)$/.exec(linha) ?? /^-\s+(.*)$/.exec(linha)
    if (item && chaveAtual !== null) {
      const v = semAspas(item[1])
      if (v) listaAtual.push(v)
      continue
    }
    const kv = /^([^\s:#][^:]*?)\s*:\s*(.*)$/.exec(linha)
    if (!kv || /^\s/.test(linha)) continue
    fechar()
    const chave = semAspas(kv[1])
    const bruto = kv[2].trim()
    if (bruto === '') {
      chaveAtual = chave
      continue
    }
    if (bruto.startsWith('[') && bruto.endsWith(']')) {
      const vs = bruto.slice(1, -1).split(',').map(semAspas).filter(Boolean)
      brutas.push({ key: chave, value: vs.join(', ') })
      continue
    }
    brutas.push({ key: chave, value: semAspas(bruto) })
  }
  fechar()
  const propriedades = normalizarPropriedades(brutas.map((p) => ({ key: p.key.slice(0, CHAVE_MAX), value: p.value })))
  return { propriedades, corpo: texto.slice(m[0].length) }
}
