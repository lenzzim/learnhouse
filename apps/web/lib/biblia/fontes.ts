/**
 * Provedor único de texto bíblico: decide se o capítulo vem do JSON estático
 * (versões abertas, /biblia-dados) ou do proxy da API.Bible (versões
 * licenciadas, /api/v1/biblia — só com sessão). Quem exibe texto (leitor,
 * popover, inserir versículo, Caderno) deve passar por aqui:
 *
 *   const cap = await getChapter('ara', 'JHN', 3, { token })
 *   cap.versos[15]          // texto do v. 16 ("" se a versão não tem)
 *   cap.titulos[16]         // "A missão do Filho" (título de seção, NÃO é texto do versículo)
 *   cap.copyright, cap.fums // exibir o copyright; reportar o fums ao mostrar (ver fums.ts)
 *
 * Regras das licenciadas (termos da API.Bible): não guardar o texto em notas
 * ou posts (guarde só a referência + versão), não enviar para IA/LLM, não
 * gerar áudio/TTS, sempre mostrar o copyright e reportar o FUMS.
 */
import { getAPIUrl } from '@services/config/config'
import { carregarLivro, type Versiculo } from './dados'
import { intervaloVersos, livroPorId, type Referencia } from './referencias'
import { VERSOES_LICENCIADAS, ehLicenciada, versaoPorId, type FonteVersao, type VersaoInfo } from './versoes'

export interface Capitulo {
  /** id da versão (blivre, ara...) */
  versao: string
  fonte: FonteVersao
  /** livro (USFM) */
  id: string
  nome: string
  abrev?: string
  capitulo: number
  /** versos[v - 1] = texto do versículo v ("" quando ausente ou incluído num combinado) */
  versos: string[]
  /** versículos combinados: 25 -> 26 quando o v. 25 cobre 25-26 */
  combinados: Record<number, number>
  /** títulos de seção, pelo número do versículo que vem logo depois */
  titulos: Record<number, string>
  /** copyright integral (licenciadas: como a API entrega) */
  copyright: string | null
  /** copyright curto para espaços pequenos */
  copyrightCurto: string | null
  /** token FUMS (só licenciadas) */
  fums: string | null
}

export interface OpcoesFonte {
  /** access token da sessão (Authorization). Sem ele, vale o cookie da sessão. */
  token?: string | null
}

/** Erro de carregamento com o código do proxy (nao_autenticado, chave_ausente, limite_api...). */
export class ErroFonte extends Error {
  status: number
  codigo: string
  constructor(status: number, codigo: string, mensagem?: string) {
    super(mensagem || codigo)
    this.status = status
    this.codigo = codigo
  }
}

// ---------------------------------------------------------------------------
// Licenciadas: proxy da API
// ---------------------------------------------------------------------------
interface RespostaCapitulo {
  id: string
  livro: string
  capitulo: number
  versos: { numero: number; ate?: number; texto: string }[]
  titulos: Record<string, string>
  copyright: string | null
  copyright_curto?: string | null
  fums: string | null
}

// cache em memória só durante a visita (a política de 14 dias é do servidor)
const cacheLicenciadas = new Map<string, Promise<Capitulo>>()

// token da sessão para quem chama sem opções (ex.: widget de citação, fora do React)
let tokenPadrao: string | null = null
export function definirTokenPadrao(token: string | null | undefined): void {
  tokenPadrao = token || null
}

async function buscarApi<T>(caminho: string, opcoes?: OpcoesFonte): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' }
  const token = opcoes?.token || tokenPadrao
  if (token) headers.Authorization = `Bearer ${token}`
  let resp: Response
  try {
    resp = await fetch(`${getAPIUrl()}${caminho}`, { credentials: 'include', headers, cache: 'no-store' })
  } catch {
    throw new ErroFonte(0, 'rede')
  }
  if (!resp.ok) {
    let codigo = resp.status === 401 ? 'nao_autenticado' : 'erro'
    let detalhe: string | undefined
    try {
      const corpo = await resp.json()
      if (corpo?.codigo) codigo = corpo.codigo
      if (typeof corpo?.detail === 'string') detalhe = corpo.detail
    } catch {
      // corpo não-JSON
    }
    if (resp.status === 401) codigo = 'nao_autenticado'
    throw new ErroFonte(resp.status, codigo, detalhe)
  }
  return resp.json() as Promise<T>
}

function capituloDaResposta(r: RespostaCapitulo, versao: VersaoInfo, livroId: string, capitulo: number): Capitulo {
  const livro = livroPorId(livroId)
  const total = Math.max(livro?.versos[capitulo - 1] ?? 0, ...r.versos.map((v) => v.ate ?? v.numero), 0)
  const versos: string[] = Array.from({ length: total }, () => '')
  const combinados: Record<number, number> = {}
  for (const v of r.versos) {
    if (v.numero >= 1) versos[v.numero - 1] = v.texto
    if (v.ate && v.ate > v.numero) combinados[v.numero] = v.ate
  }
  const titulos: Record<number, string> = {}
  for (const [k, t] of Object.entries(r.titulos || {})) {
    const n = Number(k)
    if (Number.isInteger(n) && n > 0 && t) titulos[n] = t
  }
  return {
    versao: versao.id,
    fonte: 'licenciada',
    id: livroId,
    nome: livro?.nome ?? livroId,
    abrev: livro?.abrev,
    capitulo,
    versos,
    combinados,
    titulos,
    copyright: r.copyright || versao.credito,
    copyrightCurto: r.copyright_curto || r.copyright || versao.credito,
    fums: r.fums || null,
  }
}

function capituloLicenciado(versao: VersaoInfo, livroId: string, capitulo: number, opcoes?: OpcoesFonte): Promise<Capitulo> {
  const chave = `${versao.id}/${livroId}/${capitulo}`
  let p = cacheLicenciadas.get(chave)
  if (!p) {
    p = buscarApi<RespostaCapitulo>(`biblia/${versao.id}/capitulo/${livroId}/${capitulo}`, opcoes)
      .then((r) => capituloDaResposta(r, versao, livroId, capitulo))
      .catch((e) => {
        cacheLicenciadas.delete(chave) // falha não fica no cache
        throw e
      })
    cacheLicenciadas.set(chave, p)
  }
  return p
}

// ---------------------------------------------------------------------------
// API pública do provedor
// ---------------------------------------------------------------------------

/** Capítulo de qualquer versão (aberta ou licenciada) no formato interno. */
export async function getChapter(versionId: string, book: string, chapter: number, opcoes?: OpcoesFonte): Promise<Capitulo> {
  const versao = versaoPorId(versionId)
  if (!versao) throw new ErroFonte(404, 'versao_desconhecida')
  const livro = livroPorId(book)
  if (!livro || !Number.isInteger(chapter) || chapter < 1 || chapter > livro.versos.length) {
    throw new ErroFonte(404, 'nao_encontrado')
  }
  if (versao.fonte === 'licenciada') return capituloLicenciado(versao, livro.id, chapter, opcoes)

  const dados = await carregarLivro(livro.id, versao.id)
  return {
    versao: versao.id,
    fonte: 'aberta',
    id: dados.id,
    nome: dados.nome,
    abrev: dados.abrev,
    capitulo: chapter,
    versos: dados.capitulos[chapter - 1] ?? [],
    combinados: {},
    titulos: {},
    copyright: versao.credito,
    copyrightCurto: versao.credito,
    fums: null,
  }
}

export interface Trecho {
  versos: Versiculo[]
  capitulo: Capitulo
}

/**
 * Versículos de uma referência (capítulo inteiro se não houver versículo).
 * Ausentes ficam de fora; um combinado (25-26) entra se tocar o intervalo,
 * com `numero` = 25 (use capitulo.combinados para o rótulo "25-26").
 */
export async function getVerses(versionId: string, ref: Referencia, opcoes?: OpcoesFonte): Promise<Trecho> {
  const capitulo = await getChapter(versionId, ref.livroId, ref.capitulo, opcoes)
  const intervalo = intervaloVersos(ref)
  if (!intervalo) return { versos: [], capitulo }
  const [ini, fim] = intervalo
  const versos: Versiculo[] = []
  for (let v = 1; v <= capitulo.versos.length && v <= fim; v++) {
    const ate = capitulo.combinados[v] ?? v
    if (ate < ini || !capitulo.versos[v - 1]) continue
    versos.push({ numero: v, texto: capitulo.versos[v - 1] })
  }
  return { versos, capitulo }
}

/** "16" ou "25-26" para o número exibido de um versículo. */
export function rotuloVerso(capitulo: Pick<Capitulo, 'combinados'> | null | undefined, n: number): string {
  const ate = capitulo?.combinados[n]
  return ate ? `${n}-${ate}` : String(n)
}

/** Versículo n está dentro de um combinado anterior? Devolve o número inicial. */
export function versoIncluidoEm(capitulo: Pick<Capitulo, 'combinados'> | null | undefined, n: number): number | null {
  if (!capitulo) return null
  for (const [k, ate] of Object.entries(capitulo.combinados)) {
    const ini = Number(k)
    if (n > ini && n <= ate) return ini
  }
  return null
}

// ---------------------------------------------------------------------------
// Catálogo das licenciadas (o que a chave do servidor libera)
// ---------------------------------------------------------------------------
export interface EstadoLicenciadas {
  /** servidor com BIBLE_API_KEY configurada */
  ativo: boolean
  /** ids liberados para leitura */
  disponiveis: string[]
  copyright: Record<string, string>
}

let catalogo: Promise<EstadoLicenciadas> | null = null

export function carregarVersoesLicenciadas(): Promise<EstadoLicenciadas> {
  if (!catalogo) {
    catalogo = buscarApi<{ ativo: boolean; versoes: { id: string; disponivel: boolean; copyright: string | null }[] }>(
      'biblia/versoes'
    )
      .then((r) => ({
        ativo: !!r.ativo,
        disponiveis: r.versoes.filter((v) => v.disponivel && versaoPorId(v.id)).map((v) => v.id),
        copyright: Object.fromEntries(r.versoes.filter((v) => v.copyright).map((v) => [v.id, v.copyright as string])),
      }))
      .catch(() => {
        catalogo = null // tenta de novo na próxima
        return { ativo: false, disponiveis: [], copyright: {} }
      })
  }
  return catalogo
}

/** Licenciadas liberadas, na ordem do catálogo. */
export function filtrarLicenciadas(estado: EstadoLicenciadas | null): VersaoInfo[] {
  if (!estado?.ativo) return []
  return VERSOES_LICENCIADAS.filter((v) => estado.disponiveis.includes(v.id))
}

export { ehLicenciada }
