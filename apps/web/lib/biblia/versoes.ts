/**
 * Versões da Bíblia disponíveis no leitor e links para versões protegidas.
 *
 * VERSOES espelha public/biblia-dados/catalogo.json (o teste
 * versoes.test.mjs garante que os dois batem) para ficar disponível de forma
 * síncrona. Sem imports de valor: roda direto no Node (`node --test`).
 */
import type { Referencia } from './referencias'

export type Idioma = 'pt' | 'en' | 'es'

export interface VersaoInfo {
  id: string
  sigla: string
  nome: string
  idioma: Idioma
  licenca: string
  licencaUrl: string | null
  credito: string
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
  return id ? VERSOES.find((v) => v.id === id) : undefined
}

/** Id de versão válido ou o padrão. */
export function versaoValida(id: string | null | undefined): string {
  return versaoPorId(id) ? (id as string) : VERSAO_PADRAO
}

// ---------------------------------------------------------------------------
// Versões protegidas: NUNCA embutidas — só link para a mesma passagem na
// YouVersion (bible.com). Ids conferidos em bible.com/pt/bible/<id>/JHN.3.16.<SIGLA>.
// ---------------------------------------------------------------------------
export interface VersaoExterna {
  sigla: string
  nome: string
  idYouVersion: number
}

export const VERSOES_EXTERNAS: VersaoExterna[] = [
  { sigla: 'NVI', nome: 'Nova Versão Internacional', idYouVersion: 129 },
  { sigla: 'ARA', nome: 'Almeida Revista e Atualizada', idYouVersion: 1608 },
  { sigla: 'ARC', nome: 'Almeida Revista e Corrigida', idYouVersion: 212 },
  { sigla: 'NTLH', nome: 'Nova Tradução na Linguagem de Hoje', idYouVersion: 211 },
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
