/**
 * Referências bíblicas em português.
 *
 * Encontra referências como "Jo 3:16", "João 3.16-18", "1 Co 13", "Sl 23" ou
 * "I Coríntios 13:4" em texto livre e as normaliza para
 * { livroId (USFM), capitulo, versoIni?, versoFim? }, com os offsets do trecho
 * no texto original (para envolver num link sem alterar o conteúdo salvo).
 *
 * Módulo PURO e SEM IMPORTS de propósito: roda no Next (cliente e servidor) e
 * direto no Node 24 (`node --test lib/biblia/referencias.test.mjs`). Por isso
 * não usa enum/namespace/parameter properties (o Node só remove tipos).
 *
 * Contra falsos positivos:
 *  - exige número de capítulo logo após o nome do livro ("Jo" sozinho não casa);
 *  - valida capítulo e versículos contra a contagem real da BLIVRE;
 *  - abreviações que também são palavras comuns ("Os", "Na", "Ap", "Ag", ...)
 *    só casam com inicial maiúscula E versículo ("Os 6:6", não "os 3 meninos");
 *  - nomes que também são substantivos comuns ("Números", "Atos", "Reis", ...)
 *    só casam com inicial maiúscula ("os números 3 e 4" não vira Nm 3).
 * O modo `{ estrito: false }` (usado no seletor do editor, onde o usuário
 * digita só a referência) desliga essas duas últimas exigências.
 */

export interface Referencia {
  livroId: string
  capitulo: number
  versoIni?: number
  versoFim?: number
}

export interface ReferenciaEncontrada extends Referencia {
  /** offset (UTF-16) do início do trecho no texto */
  inicio: number
  /** offset exclusivo do fim do trecho */
  fim: number
  /** o trecho exatamente como aparece no texto */
  texto: string
}

export interface LivroInfo {
  id: string
  nome: string
  abrev: string
  /** versículos por capítulo; versos.length === número de capítulos */
  versos: number[]
  testamento: 'AT' | 'NT'
}

// <tabela-gerada>
// Gerado por scripts/biblia_gerar_tabela.mjs a partir do index.json. Não editar à mão.
export const TRADUCAO = "BLIVRE"
export const NOME_TRADUCAO = "Bíblia Livre"
export const CREDITO = "Bíblia Livre (BLIVRE), Copyright © Diego Santos, Mario Sérgio e Marco Teles, http://sites.google.com/site/biblialivre/ — Licença Creative Commons Atribuição 4.0 Brasil."
export const LICENCA = "CC BY 4.0 BR"
const TABELA: [string, string, string, string][] = [
  ["GEN", "Gênesis", "Gn", '31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26'],
  ["EXO", "Êxodo", "Êx", '22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38'],
  ["LEV", "Levítico", "Lv", '17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34'],
  ["NUM", "Números", "Nm", '54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13'],
  ["DEU", "Deuteronômio", "Dt", '46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12'],
  ["JOS", "Josué", "Js", '18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33'],
  ["JDG", "Juízes", "Jz", '36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25'],
  ["RUT", "Rute", "Rt", '22,23,18,22'],
  ["1SA", "1 Samuel", "1Sm", '28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,42,15,23,29,22,44,25,12,25,11,31,13'],
  ["2SA", "2 Samuel", "2Sm", '27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25'],
  ["1KI", "1 Reis", "1Rs", '53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53'],
  ["2KI", "2 Reis", "2Rs", '18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30'],
  ["1CH", "1 Crônicas", "1Cr", '54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30'],
  ["2CH", "2 Crônicas", "2Cr", '17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23'],
  ["EZR", "Esdras", "Ed", '11,70,13,24,17,22,28,36,15,44'],
  ["NEH", "Neemias", "Ne", '11,20,32,23,19,19,73,18,38,39,36,47,31'],
  ["EST", "Ester", "Et", '22,23,15,17,14,14,10,17,32,3'],
  ["JOB", "Jó", "Jó", '22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17'],
  ["PSA", "Salmos", "Sl", '6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6'],
  ["PRO", "Provérbios", "Pv", '33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31'],
  ["ECC", "Eclesiastes", "Ec", '18,26,22,16,20,12,29,17,18,20,10,14'],
  ["SNG", "Cantares", "Ct", '17,17,11,16,16,13,13,14'],
  ["ISA", "Isaías", "Is", '31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,17,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24'],
  ["JER", "Jeremias", "Jr", '19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34'],
  ["LAM", "Lamentações", "Lm", '22,22,66,22,22'],
  ["EZK", "Ezequiel", "Ez", '28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35'],
  ["DAN", "Daniel", "Dn", '21,49,30,37,31,28,28,27,27,21,45,13'],
  ["HOS", "Oseias", "Os", '11,23,5,19,15,11,16,14,17,15,12,14,16,9'],
  ["JOL", "Joel", "Jl", '20,32,21'],
  ["AMO", "Amós", "Am", '15,16,15,13,27,14,17,14,15'],
  ["OBA", "Obadias", "Ob", '21'],
  ["JON", "Jonas", "Jn", '17,10,10,11'],
  ["MIC", "Miqueias", "Mq", '16,13,12,13,15,16,20'],
  ["NAM", "Naum", "Na", '15,13,19'],
  ["HAB", "Habacuque", "Hc", '17,20,19'],
  ["ZEP", "Sofonias", "Sf", '18,15,20'],
  ["HAG", "Ageu", "Ag", '15,23'],
  ["ZEC", "Zacarias", "Zc", '21,13,10,14,11,15,14,23,17,12,17,14,9,21'],
  ["MAL", "Malaquias", "Ml", '14,17,18,6'],
  ["MAT", "Mateus", "Mt", '25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20'],
  ["MRK", "Marcos", "Mc", '45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20'],
  ["LUK", "Lucas", "Lc", '80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53'],
  ["JHN", "João", "Jo", '51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25'],
  ["ACT", "Atos", "At", '26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31'],
  ["ROM", "Romanos", "Rm", '32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,27'],
  ["1CO", "1 Coríntios", "1Co", '31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24'],
  ["2CO", "2 Coríntios", "2Co", '24,17,18,18,21,18,16,24,15,18,33,21,14'],
  ["GAL", "Gálatas", "Gl", '24,21,29,31,26,18'],
  ["EPH", "Efésios", "Ef", '23,22,21,32,33,24'],
  ["PHP", "Filipenses", "Fp", '30,30,21,23'],
  ["COL", "Colossenses", "Cl", '29,23,25,18'],
  ["1TH", "1 Tessalonicenses", "1Ts", '10,20,13,18,28'],
  ["2TH", "2 Tessalonicenses", "2Ts", '12,17,18'],
  ["1TI", "1 Timóteo", "1Tm", '20,15,16,16,25,21'],
  ["2TI", "2 Timóteo", "2Tm", '18,26,17,22'],
  ["TIT", "Tito", "Tt", '16,15,15'],
  ["PHM", "Filemom", "Fm", '25'],
  ["HEB", "Hebreus", "Hb", '14,18,19,16,14,20,28,13,28,39,40,29,25'],
  ["JAS", "Tiago", "Tg", '27,26,18,17,20'],
  ["1PE", "1 Pedro", "1Pe", '25,25,22,19,14'],
  ["2PE", "2 Pedro", "2Pe", '21,22,18'],
  ["1JN", "1 João", "1Jo", '10,29,24,21,21'],
  ["2JN", "2 João", "2Jo", '13'],
  ["3JN", "3 João", "3Jo", '14'],
  ["JUD", "Judas", "Jd", '25'],
  ["REV", "Apocalipse", "Ap", '20,29,22,11,14,17,17,13,21,11,19,17,18,20,8,21,18,24,21,15,27,21'],
]
// </tabela-gerada>

export const LIVROS: LivroInfo[] = TABELA.map(([id, nome, abrev, v], i): LivroInfo => ({
  id,
  nome,
  abrev,
  versos: v.split(',').map(Number),
  testamento: i < 39 ? 'AT' : 'NT',
}))

const POR_ID = new Map<string, LivroInfo>(LIVROS.map((l) => [l.id, l]))

export function livroPorId(id: string): LivroInfo | undefined {
  return POR_ID.get(id)
}

// ---------------------------------------------------------------------------
// Nomes e abreviações aceitos. Livros numerados (1SA, 2CO, 1JN...) listam só a
// parte sem número; o prefixo (1, 1ª, I, Primeira...) é tratado à parte.
// Variantes sem acento são geradas automaticamente (exceto quando colidem com
// outro livro: "Jó" sem acento é "Jo", que é João).
// ---------------------------------------------------------------------------
const NOMES: Record<string, string[]> = {
  GEN: ['Gênesis', 'Gn', 'Gên', 'Gen'],
  EXO: ['Êxodo', 'Êx', 'Ex'],
  LEV: ['Levítico', 'Lv', 'Lev'],
  NUM: ['Números', 'Nm'],
  DEU: ['Deuteronômio', 'Dt', 'Deut'],
  JOS: ['Josué', 'Js'],
  JDG: ['Juízes', 'Jz'],
  RUT: ['Rute', 'Rt'],
  '1SA': ['Samuel', 'Sm'],
  '2SA': ['Samuel', 'Sm'],
  '1KI': ['Reis', 'Rs'],
  '2KI': ['Reis', 'Rs'],
  '1CH': ['Crônicas', 'Cr'],
  '2CH': ['Crônicas', 'Cr'],
  EZR: ['Esdras', 'Ed'],
  NEH: ['Neemias', 'Ne'],
  EST: ['Ester', 'Et'],
  JOB: ['Jó'],
  PSA: ['Salmos', 'Salmo', 'Sl'],
  PRO: ['Provérbios', 'Pv', 'Prov'],
  ECC: ['Eclesiastes', 'Ec', 'Ecl'],
  SNG: ['Cantares', 'Cântico dos Cânticos', 'Cânticos', 'Ct'],
  ISA: ['Isaías', 'Is'],
  JER: ['Jeremias', 'Jr', 'Jer'],
  LAM: ['Lamentações de Jeremias', 'Lamentações', 'Lm'],
  EZK: ['Ezequiel', 'Ez'],
  DAN: ['Daniel', 'Dn'],
  HOS: ['Oseias', 'Oséias', 'Os'],
  JOL: ['Joel', 'Jl'],
  AMO: ['Amós', 'Am'],
  OBA: ['Obadias', 'Ob'],
  JON: ['Jonas', 'Jn'],
  MIC: ['Miqueias', 'Miquéias', 'Mq'],
  NAM: ['Naum', 'Na'],
  HAB: ['Habacuque', 'Hc'],
  ZEP: ['Sofonias', 'Sf'],
  HAG: ['Ageu', 'Ag'],
  ZEC: ['Zacarias', 'Zc'],
  MAL: ['Malaquias', 'Ml'],
  MAT: ['Mateus', 'Mt'],
  MRK: ['Marcos', 'Mc'],
  LUK: ['Lucas', 'Lc'],
  JHN: ['João', 'Jo'],
  ACT: ['Atos dos Apóstolos', 'Atos', 'At'],
  ROM: ['Romanos', 'Rm', 'Rom'],
  '1CO': ['Coríntios', 'Cor', 'Co'],
  '2CO': ['Coríntios', 'Cor', 'Co'],
  GAL: ['Gálatas', 'Gl', 'Gál'],
  EPH: ['Efésios', 'Ef'],
  PHP: ['Filipenses', 'Fp', 'Fil'],
  COL: ['Colossenses', 'Cl', 'Col'],
  '1TH': ['Tessalonicenses', 'Ts', 'Tes'],
  '2TH': ['Tessalonicenses', 'Ts', 'Tes'],
  '1TI': ['Timóteo', 'Tm', 'Tim'],
  '2TI': ['Timóteo', 'Tm', 'Tim'],
  TIT: ['Tito', 'Tt'],
  PHM: ['Filemom', 'Filemon', 'Fm'],
  HEB: ['Hebreus', 'Hb'],
  JAS: ['Tiago', 'Tg'],
  '1PE': ['Pedro', 'Pe'],
  '2PE': ['Pedro', 'Pe'],
  '1JN': ['João', 'Jo'],
  '2JN': ['João', 'Jo'],
  '3JN': ['João', 'Jo'],
  JUD: ['Judas', 'Jd'],
  REV: ['Apocalipse', 'Ap', 'Apoc'],
}

/** Abreviações que também são palavras comuns: exigem maiúscula + versículo. */
const ABREV_AMBIGUAS = new Set(['os', 'na', 'ap', 'ag', 'am', 'at', 'ed', 'et'])

/** Nomes que também são substantivos comuns: exigem inicial maiúscula. */
const NOMES_COMUNS = new Set([
  'numeros',
  'atos',
  'juizes',
  'reis',
  'cronicas',
  'lamentacoes',
  'proverbios',
  'cantares',
  'canticos',
])

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
}

function chaveNome(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** chave = "<n>|<nome>" para livros numerados, "<nome>" para os demais */
const ALIAS_PARA_LIVRO = new Map<string, string>()
const TODOS_NOMES = new Set<string>()

;(function montarMapa() {
  const pares: [string, string][] = []
  for (const id of Object.keys(NOMES)) {
    const num = /^[1-3]/.test(id) ? id[0] + '|' : ''
    for (const nome of NOMES[id]) pares.push([num + chaveNome(nome), id])
  }
  // explícitos primeiro; variantes sem acento só onde não colidem
  for (const [k, id] of pares) if (!ALIAS_PARA_LIVRO.has(k)) ALIAS_PARA_LIVRO.set(k, id)
  for (const [k, id] of pares) {
    const s = semAcento(k)
    if (!ALIAS_PARA_LIVRO.has(s)) ALIAS_PARA_LIVRO.set(s, id)
  }
  for (const k of ALIAS_PARA_LIVRO.keys()) TODOS_NOMES.add(k.replace(/^[1-3]\|/, ''))
})()

function escaparRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+')
}

// Grupos: 1 = fronteira à esquerda, 2 = prefixo numérico, 3 = nome do livro,
// 4 = separador, 5 = capítulo. Sem lookbehind (Safari < 16.4 não suporta).
const PREFIXO =
  '((?:[123]\\s*(?:[ªº°]\\.?|[ao](?=\\s)|\\.)?|(?:iii|ii|i)(?=\\s)|primeir[ao]|segund[ao]|terceir[ao])\\s*)?'
const NOMES_REGEX = [...TODOS_NOMES].sort((a, b) => b.length - a.length).map(escaparRegex).join('|')
const PADRAO = `(^|[^\\p{L}\\p{N}])${PREFIXO}(${NOMES_REGEX})(\\.?\\s*)(\\d{1,3})(?!\\d)`

function numeroDoPrefixo(p: string): number {
  const s = p.trim().toLowerCase()
  if (/^[123]/.test(s)) return Number(s[0])
  if (s.startsWith('iii') || s.startsWith('terceir')) return 3
  if (s.startsWith('ii') || s.startsWith('segund')) return 2
  return 1
}

const LETRA = /\p{L}/u

function ehDigito(c: string | undefined): boolean {
  return c !== undefined && c >= '0' && c <= '9'
}

/** Lê dígitos a partir de `i`; devolve [valor, fim] ou null. */
function lerNumero(texto: string, i: number): [number, number] | null {
  let j = i
  while (ehDigito(texto[j])) j++
  if (j === i || j - i > 3) return null
  return [Number(texto.slice(i, j)), j]
}

export interface OpcoesBusca {
  /** false: aceita abreviações ambíguas e nomes comuns em minúscula (padrão: true) */
  estrito?: boolean
}

export function encontrarReferencias(texto: string, opcoes: OpcoesBusca = {}): ReferenciaEncontrada[] {
  const estrito = opcoes.estrito !== false
  const re = new RegExp(PADRAO, 'giu')
  const achados: ReferenciaEncontrada[] = []
  let m: RegExpExecArray | null

  while ((m = re.exec(texto)) !== null) {
    const fronteira = m[1]
    const prefixo = m[2] || ''
    const nome = m[3]
    const capTexto = m[5]
    const inicioPrefixo = m.index + fronteira.length
    const inicioNome = inicioPrefixo + prefixo.length
    const fimCap = m.index + m[0].length

    const chave = chaveNome(nome)
    let livroId: string | undefined
    let inicio = inicioPrefixo
    if (prefixo) livroId = ALIAS_PARA_LIVRO.get(numeroDoPrefixo(prefixo) + '|' + chave)
    if (!livroId) {
      // "2 Gn 1:1": o "2" não faz parte de um livro numerado; tenta sem ele
      livroId = ALIAS_PARA_LIVRO.get(chave)
      inicio = inicioNome
    }
    const livro = livroId ? POR_ID.get(livroId) : undefined
    if (!livro) {
      re.lastIndex = m.index + 1
      continue
    }

    const capitulo = Number(capTexto)
    let versoIni: number | undefined
    let versoFim: number | undefined
    let fim = fimCap

    // versículo: ":16" ou ".16", opcionalmente "-18" / "–18"
    const sep = texto[fimCap]
    if ((sep === ':' || sep === '.') && ehDigito(texto[fimCap + 1])) {
      const v = lerNumero(texto, fimCap + 1)
      if (v) {
        versoIni = v[0]
        fim = v[1]
        const traco = texto[fim]
        if ((traco === '-' || traco === '–') && ehDigito(texto[fim + 1])) {
          const w = lerNumero(texto, fim + 1)
          // "3:16-4:2" (atravessa capítulos) não é suportado: fica só 3:16
          const cruzaCapitulo = w && (texto[w[1]] === ':' || texto[w[1]] === '.') && ehDigito(texto[w[1] + 1])
          if (w && !cruzaCapitulo) {
            versoFim = w[0]
            fim = w[1]
          }
        }
      }
    }

    // fronteira à direita: "Sl 23ª" ou "Jo 3x" não são referências;
    // "Jo 3:16a" (meio versículo) é aceito como 3:16
    const depois = texto[fim]
    let rejeitar = false
    if (depois !== undefined && LETRA.test(depois)) {
      const sufixoMeioVerso = versoIni !== undefined && /[abc]/i.test(depois) && !LETRA.test(texto[fim + 1] ?? ' ')
      if (!sufixoMeioVerso) rejeitar = true
    }

    if (estrito && !rejeitar && !prefixo) {
      const chaveSemAcento = semAcento(chave)
      const maiuscula = nome[0] !== nome[0].toLowerCase()
      if (ABREV_AMBIGUAS.has(chaveSemAcento) && (!maiuscula || versoIni === undefined)) rejeitar = true
      if (NOMES_COMUNS.has(chaveSemAcento.split(' ')[0]) && !maiuscula) rejeitar = true
    }
    if (estrito && !rejeitar && prefixo && NOMES_COMUNS.has(semAcento(chave))) {
      if (nome[0] === nome[0].toLowerCase()) rejeitar = true
    }

    // validação contra a contagem real
    if (!rejeitar && (capitulo < 1 || capitulo > livro.versos.length)) rejeitar = true
    if (!rejeitar && versoIni !== undefined) {
      const total = livro.versos[capitulo - 1]
      if (versoIni < 1 || versoIni > total) rejeitar = true
      else if (versoFim !== undefined && (versoFim <= versoIni || versoFim > total)) {
        // intervalo inválido: mantém só o primeiro versículo
        versoFim = undefined
        fim = fimCap + 1 + String(versoIni).length
      }
    }

    if (rejeitar) {
      re.lastIndex = m.index + 1
      continue
    }

    const ref: ReferenciaEncontrada = { livroId: livro.id, capitulo, inicio, fim, texto: texto.slice(inicio, fim) }
    if (versoIni !== undefined) ref.versoIni = versoIni
    if (versoFim !== undefined) ref.versoFim = versoFim
    achados.push(ref)
    re.lastIndex = fim
  }
  return achados
}

/**
 * Interpreta um texto que deve ser SÓ uma referência ("Jo 3:16-18",
 * "joao 3.16", ou o código "JHN.3.16-18"). Usado no seletor do editor.
 */
export function interpretarReferencia(texto: string): Referencia | null {
  const t = texto.trim()
  if (!t) return null
  const porCodigo = lerCodigoReferencia(t)
  if (porCodigo) return porCodigo
  const achados = encontrarReferencias(t, { estrito: false })
  if (achados.length !== 1) return null
  const a = achados[0]
  if (a.inicio !== 0 || a.fim !== t.length) return null
  return semOffsets(a)
}

function semOffsets(a: Referencia): Referencia {
  const r: Referencia = { livroId: a.livroId, capitulo: a.capitulo }
  if (a.versoIni !== undefined) r.versoIni = a.versoIni
  if (a.versoFim !== undefined) r.versoFim = a.versoFim
  return r
}

/** "JHN.3", "JHN.3.16" ou "JHN.3.16-18" — o formato usado na URL do leitor. */
export function codigoReferencia(ref: Referencia): string {
  let s = `${ref.livroId}.${ref.capitulo}`
  if (ref.versoIni !== undefined) {
    s += `.${ref.versoIni}`
    if (ref.versoFim !== undefined && ref.versoFim !== ref.versoIni) s += `-${ref.versoFim}`
  }
  return s
}

export function lerCodigoReferencia(codigo: string | null | undefined): Referencia | null {
  if (!codigo) return null
  const m = /^([1-3]?[A-Z]{2,3})\.(\d{1,3})(?:\.(\d{1,3})(?:-(\d{1,3}))?)?$/.exec(codigo.trim().toUpperCase())
  if (!m) return null
  const livro = POR_ID.get(m[1])
  if (!livro) return null
  const capitulo = Number(m[2])
  if (capitulo < 1 || capitulo > livro.versos.length) return null
  const ref: Referencia = { livroId: livro.id, capitulo }
  if (m[3]) {
    const total = livro.versos[capitulo - 1]
    const ini = Number(m[3])
    if (ini < 1 || ini > total) return ref
    ref.versoIni = ini
    if (m[4]) {
      const fim = Number(m[4])
      if (fim > ini && fim <= total) ref.versoFim = fim
    }
  }
  return ref
}

/** "João 3:16-18" (ou "Jo 3:16-18" com `abreviado`). */
export function formatarReferencia(ref: Referencia, abreviado = false): string {
  const livro = POR_ID.get(ref.livroId)
  const nome = livro ? (abreviado ? livro.abrev : livro.nome) : ref.livroId
  let s = `${nome} ${ref.capitulo}`
  if (ref.versoIni !== undefined) {
    s += `:${ref.versoIni}`
    if (ref.versoFim !== undefined && ref.versoFim !== ref.versoIni) s += `-${ref.versoFim}`
  }
  return s
}

/** Capítulo anterior/seguinte, atravessando livros. null nas pontas da Bíblia. */
export function capituloVizinho(
  livroId: string,
  capitulo: number,
  direcao: 1 | -1
): { livroId: string; capitulo: number } | null {
  const i = LIVROS.findIndex((l) => l.id === livroId)
  if (i < 0) return null
  const livro = LIVROS[i]
  const c = capitulo + direcao
  if (c >= 1 && c <= livro.versos.length) return { livroId, capitulo: c }
  const outro = LIVROS[i + direcao]
  if (!outro) return null
  return { livroId: outro.id, capitulo: direcao === 1 ? 1 : outro.versos.length }
}

/** Intervalo de versículos [ini, fim] (1-based, inclusivo) coberto pela referência. */
export function intervaloVersos(ref: Referencia): [number, number] | null {
  const livro = POR_ID.get(ref.livroId)
  if (!livro) return null
  const total = livro.versos[ref.capitulo - 1]
  if (!total) return null
  if (ref.versoIni === undefined) return [1, total]
  return [ref.versoIni, ref.versoFim ?? ref.versoIni]
}
