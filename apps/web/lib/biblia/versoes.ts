/**
 * Versões da Bíblia disponíveis no leitor e links para versões protegidas.
 *
 * VERSOES (abertas) espelha public/biblia-dados/catalogo.json (o teste
 * versoes.test.mjs garante que os dois batem) para ficar disponível de forma
 * síncrona. VERSOES_LICENCIADAS são as protegidas servidas pelo proxy da
 * API.Bible (apps/api/src/routers/biblia.py): o texto NUNCA fica em arquivo
 * estático; quem diz se cada uma está ativa é o endpoint /biblia/versoes.
 * Sem imports de valor: roda direto no Node (`node --test`).
 */
import type { Referencia } from './referencias'

export type Idioma = 'pt' | 'en' | 'es'

/** 'aberta': JSON estático em /biblia-dados; 'licenciada': proxy da API.Bible (só com sessão). */
export type FonteVersao = 'aberta' | 'licenciada'

export interface VersaoInfo {
  id: string
  sigla: string
  nome: string
  idioma: Idioma
  licenca: string
  licencaUrl: string | null
  credito: string
  /** ausente = 'aberta' */
  fonte?: FonteVersao
}

const CC_BY = 'https://creativecommons.org/licenses/by/4.0/deed.pt-br'
const CC_BY_SA = 'https://creativecommons.org/licenses/by-sa/4.0/deed.pt-br'

export const VERSOES: VersaoInfo[] = [
  {
    id: 'blivre',
    sigla: 'BLIVRE',
    nome: 'Bíblia Livre',
    idioma: 'pt',
    licenca: 'CC BY 4.0 BR',
    licencaUrl: CC_BY,
    credito:
      'Bíblia Livre (BLIVRE), Copyright © Diego Santos, Mario Sérgio e Marco Teles, http://sites.google.com/site/biblialivre/ — Licença Creative Commons Atribuição 4.0 Brasil.',
  },
  {
    id: 'onbv',
    sigla: 'ONBV',
    nome: 'Nova Bíblia Viva (Biblica Open)',
    idioma: 'pt',
    licenca: 'CC BY-SA 4.0',
    licencaUrl: CC_BY_SA,
    credito:
      'Biblica® Open Nova Bíblia Viva 2007, Copyright © 2007, 2010 Biblica, Inc. Licença Creative Commons Atribuição-CompartilhaIgual 4.0.',
  },
  {
    id: 'bpm',
    sigla: 'BPM',
    nome: 'Bíblia Portuguesa Mundial',
    idioma: 'pt',
    licenca: 'Domínio público',
    licencaUrl: null,
    credito: 'Bíblia Portuguesa Mundial. Domínio público (tradução ainda em revisão pelos autores).',
  },
  {
    id: 'kjv',
    sigla: 'KJV',
    nome: 'King James Version (1769)',
    idioma: 'en',
    licenca: 'Domínio público',
    licencaUrl: null,
    credito:
      'King James Version (Authorized Version), texto padronizado de 1769. Domínio público fora do Reino Unido.',
  },
  {
    id: 'web',
    sigla: 'WEB',
    nome: 'World English Bible',
    idioma: 'en',
    licenca: 'Domínio público',
    licencaUrl: null,
    credito: 'World English Bible. Domínio público; "World English Bible" é marca registrada do eBible.org.',
  },
  {
    id: 'rv1909',
    sigla: 'RV1909',
    nome: 'Reina-Valera 1909',
    idioma: 'es',
    licenca: 'Domínio público',
    licencaUrl: null,
    credito: 'Santa Biblia, Reina-Valera 1909. Domínio público.',
  },
  {
    id: 'vbl',
    sigla: 'VBL',
    nome: 'Versión Biblia Libre',
    idioma: 'es',
    licenca: 'CC BY-SA 4.0',
    licencaUrl: CC_BY_SA,
    credito:
      'Versión Biblia Libre, Copyright © 2018-2020 Jonathan Gallagher y Shelly Barrios de Avila. Licença Creative Commons Atribuição-CompartilhaIgual 4.0.',
  },
]

// ---------------------------------------------------------------------------
// Versões licenciadas (API.Bible). Mesmos ids de apps/api/src/services/biblia/versoes.py.
// `credito` é só o texto de reserva: o copyright exibido vem de cada resposta
// da API (campo `copyright`), como pedem os termos.
// ---------------------------------------------------------------------------
const LICENCA_API_BIBLE = 'Licenciada (API.Bible)'

function licenciada(id: string, sigla: string, nome: string, idioma: Idioma, credito: string): VersaoInfo {
  return { id, sigla, nome, idioma, licenca: LICENCA_API_BIBLE, licencaUrl: null, credito, fonte: 'licenciada' }
}

export const VERSOES_LICENCIADAS: VersaoInfo[] = [
  licenciada('ara', 'ARA', 'Almeida Revista e Atualizada', 'pt', 'ARA © 1993 Sociedade Bíblica do Brasil.'),
  licenciada('arc', 'ARC', 'Almeida Revista e Corrigida', 'pt', 'ARC © 2009 Sociedade Bíblica do Brasil. Todos os direitos reservados.'),
  licenciada('rc69', 'RC69', 'Almeida Revista e Corrigida 1969', 'pt', 'RC69 © 1969 Sociedade Bíblica do Brasil. Todos os direitos reservados.'),
  licenciada('ntlh', 'NTLH', 'Nova Tradução na Linguagem de Hoje', 'pt', 'Nova Tradução na Linguagem de Hoje © Copyright © 2000 Sociedade Bíblica do Brasil. Todos os direitos reservados.'),
  licenciada('niv', 'NIV', 'New International Version', 'en', 'Holy Bible, New International Version® NIV® © Biblica, Inc.®'),
  licenciada('nkjv', 'NKJV', 'New King James Version', 'en', 'New King James Version® © 1982 Thomas Nelson.'),
]

export const VERSAO_PADRAO = 'blivre'

/**
 * Versão padrão de cada idioma da interface, usada quando o usuário ainda
 * não escolheu uma (dono, 21/11/2026): pt -> BLIVRE, en -> WEB, es -> RV1909.
 */
export const VERSAO_PADRAO_POR_IDIOMA: Record<Idioma, string> = {
  pt: 'blivre',
  en: 'web',
  es: 'rv1909',
}

/** "en-US" -> "web"; idiomas fora de pt/en/es caem na BLIVRE. */
export function versaoPadraoDoIdioma(lng: string | null | undefined): string {
  const base = String(lng || '').split('-')[0].toLowerCase()
  return VERSAO_PADRAO_POR_IDIOMA[base as Idioma] ?? VERSAO_PADRAO
}

export function versaoPorId(id: string | null | undefined): VersaoInfo | undefined {
  if (!id) return undefined
  return VERSOES.find((v) => v.id === id) ?? VERSOES_LICENCIADAS.find((v) => v.id === id)
}

export function ehLicenciada(id: string | null | undefined): boolean {
  return versaoPorId(id)?.fonte === 'licenciada'
}

/** Sigla ("ARA", "BLIVRE"...) -> versão; usado para ler citações "— Jo 3:16 (ARA)". */
export function versaoPorSigla(sigla: string | null | undefined): VersaoInfo | undefined {
  if (!sigla) return undefined
  const s = sigla.toUpperCase()
  return VERSOES.find((v) => v.sigla === s) ?? VERSOES_LICENCIADAS.find((v) => v.sigla === s)
}

/** Id de versão válido ou o padrão. */
export function versaoValida(id: string | null | undefined): string {
  return versaoPorId(id) ? (id as string) : VERSAO_PADRAO
}

// ---------------------------------------------------------------------------
// Versões protegidas SEM licença aqui: NUNCA embutidas — só link para a mesma
// passagem na YouVersion (bible.com). ARA, ARC e NTLH saíram desta lista
// porque agora são lidas no próprio app (VERSOES_LICENCIADAS).
// Ids conferidos em bible.com/pt/bible/<id>/JHN.3.16.<SIGLA>.
// ---------------------------------------------------------------------------
export interface VersaoExterna {
  sigla: string
  nome: string
  idYouVersion: number
}

export const VERSOES_EXTERNAS: VersaoExterna[] = [
  { sigla: 'NVI', nome: 'Nova Versão Internacional', idYouVersion: 129 },
  { sigla: 'NAA', nome: 'Nova Almeida Atualizada', idYouVersion: 1840 },
]

/**
 * https://www.bible.com/pt/bible/{id}/{LIVRO}.{cap}[.{verso}[-{fim}]].{SIGLA}
 * Os códigos de livro da YouVersion são os USFM, os mesmos de Referencia.livroId.
 */
export function urlYouVersion(ref: Referencia, versao: VersaoExterna): string {
  let passagem = `${ref.livroId}.${ref.capitulo}`
  if (ref.versoIni !== undefined) {
    passagem += `.${ref.versoIni}`
    if (ref.versoFim !== undefined && ref.versoFim !== ref.versoIni) passagem += `-${ref.versoFim}`
  }
  return `https://www.bible.com/pt/bible/${versao.idYouVersion}/${passagem}.${versao.sigla}`
}
