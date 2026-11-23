/**
 * Versões da Bíblia disponíveis no leitor e links para versões protegidas.
 *
 * VERSOES (abertas) espelha public/biblia-dados/catalogo.json (o teste
 * versoes.test.mjs garante que os dois batem) para ficar disponível de forma
 * síncrona. VERSOES_LICENCIADAS são as protegidas servidas pelo proxy do
 * servidor (apps/api/src/routers/biblia.py), que fala com a API.Bible (ARA,
 * ARC, NTLH, RC69, NIV, NKJV) ou com a YouVersion Platform (NVI): o texto
 * NUNCA fica em arquivo estático; quem diz se cada uma está ativa é o
 * endpoint /biblia/versoes.
 * Sem imports de valor: roda direto no Node (`node --test`).
 */
import type { Referencia } from './referencias'

export type Idioma = 'pt' | 'en' | 'es'

/** 'aberta': JSON estático em /biblia-dados; 'licenciada': proxy do servidor (só com sessão). */
export type FonteVersao = 'aberta' | 'licenciada'

/** Quem fornece o texto de uma licenciada (créditos e regras mudam por provedor). */
export type ProvedorLicenciada = 'apibible' | 'youversion'

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
  /** só licenciadas */
  provedor?: ProvedorLicenciada
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
// Versões licenciadas. Mesmos ids de apps/api/src/services/biblia/versoes.py.
// `credito` é só o texto de reserva: o copyright exibido vem de cada resposta
// do proxy (campo `copyright`, vindo da API.Bible ou da YouVersion), como
// pedem os termos. A ordem aqui é a ordem no seletor ("Licenciadas":
// NVI, ARA, ARC, NTLH, RC69).
// ---------------------------------------------------------------------------
const LICENCA_POR_PROVEDOR: Record<ProvedorLicenciada, string> = {
  apibible: 'Licenciada (API.Bible)',
  youversion: 'Licenciada (YouVersion)',
}

function licenciada(
  id: string,
  sigla: string,
  nome: string,
  idioma: Idioma,
  credito: string,
  provedor: ProvedorLicenciada = 'apibible'
): VersaoInfo {
  return { id, sigla, nome, idioma, licenca: LICENCA_POR_PROVEDOR[provedor], licencaUrl: null, credito, fonte: 'licenciada', provedor }
}

const CREDITO_NVI =
  'Bíblia Sagrada, Nova Versão Internacional®, NVI® © 1993, 2000, 2011, 2023 por Biblica, Inc. Usado com permissão. Todos os direitos reservados mundialmente.'

export const VERSOES_LICENCIADAS: VersaoInfo[] = [
  licenciada('nvi', 'NVI', 'Nova Versão Internacional', 'pt', CREDITO_NVI, 'youversion'),
  licenciada('ara', 'ARA', 'Almeida Revista e Atualizada', 'pt', 'ARA © 1993 Sociedade Bíblica do Brasil.'),
  licenciada('arc', 'ARC', 'Almeida Revista e Corrigida', 'pt', 'ARC © 2009 Sociedade Bíblica do Brasil. Todos os direitos reservados.'),
  licenciada('ntlh', 'NTLH', 'Nova Tradução na Linguagem de Hoje', 'pt', 'Nova Tradução na Linguagem de Hoje © Copyright © 2000 Sociedade Bíblica do Brasil. Todos os direitos reservados.'),
  licenciada('rc69', 'RC69', 'Almeida Revista e Corrigida 1969', 'pt', 'RC69 © 1969 Sociedade Bíblica do Brasil. Todos os direitos reservados.'),
  // YouVersion opcionais: só aparecem se o servidor as ligar (YOUVERSION_BIBLES)
  licenciada('nvi2011', 'NVI2011', 'Nova Versão Internacional (2011)', 'pt', 'Nova Versão Internacional © Biblica, Inc.', 'youversion'),
  licenciada('nbvp', 'NBVP', 'Nova Bíblia Viva (Portugal)', 'pt', 'Nova Bíblia Viva © Biblica, Inc.', 'youversion'),
  licenciada('olivro', 'OL', 'O Livro', 'pt', 'O Livro © Biblica, Inc.', 'youversion'),
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

/**
 * Versão padrão de quem está LOGADO (decisão N38, dono, 23/11/2026): em
 * português, a NVI (licenciada, YouVersion). en -> WEB e es -> RV1909 não
 * mudam. Visitante, link privado /n/<token> e o site continuam na aberta do
 * idioma (BLIVRE): a NVI exige sessão e tem limite diário de chamadas.
 */
export const VERSAO_PADRAO_LOGADO_POR_IDIOMA: Partial<Record<Idioma, string>> = {
  pt: 'nvi',
}

/** Padrão quando o usuário não escolheu outra: NVI para logado em pt; senão a aberta do idioma. */
export function versaoPadraoPara(lng: string | null | undefined, logado: boolean): string {
  if (logado) {
    const base = String(lng || '').split('-')[0].toLowerCase()
    const v = VERSAO_PADRAO_LOGADO_POR_IDIOMA[base as Idioma]
    if (v) return v
  }
  return versaoPadraoDoIdioma(lng)
}

/**
 * Versão aberta usada quando uma licenciada não pode ser lida (sem sessão,
 * limite diário, chave ausente, versão desligada): a padrão do idioma dela
 * (NVI/ARA -> BLIVRE, NIV -> WEB). Aberta devolve ela mesma.
 */
export function versaoDeRecuo(id: string | null | undefined): string {
  const info = versaoPorId(id)
  if (!info) return VERSAO_PADRAO
  return info.fonte === 'licenciada' ? versaoPadraoDoIdioma(info.idioma) : info.id
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
// passagem na YouVersion (bible.com). ARA, ARC, NTLH e NVI saíram desta lista
// porque agora são lidas no próprio app (VERSOES_LICENCIADAS).
// Ids conferidos em bible.com/pt/bible/<id>/JHN.3.16.<SIGLA>.
// ---------------------------------------------------------------------------
export interface VersaoExterna {
  sigla: string
  nome: string
  idYouVersion: number
}

export const VERSOES_EXTERNAS: VersaoExterna[] = [
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

// ---------------------------------------------------------------------------
// Política de cópia/compartilhamento por versão (P0 do leitor; ainda NÃO usada
// pela interface além do que já existe: inserir versículo licenciado já grava
// só a referência). Valores conservadores até a leitura completa dos termos:
//  - abertas (CC BY, CC BY-SA, domínio público): cópia livre, imagem permitida;
//  - API.Bible: no máximo 25 versículos por cópia (placeholder), sem imagem;
//  - YouVersion (NVI): no máximo 25 versículos por cópia, sem imagem.
// `siglaObrigatoria`: toda cópia leva a sigla da versão (e, nas licenciadas,
// o copyright).
// ---------------------------------------------------------------------------
export interface PoliticaCopia {
  permiteCopiar: boolean
  /** null = sem limite */
  maxVersiculosCopia: number | null
  /** gerar imagem de versículo para compartilhar */
  permiteImagem: boolean
  siglaObrigatoria: true
}

export const POLITICA_ABERTA: Readonly<PoliticaCopia> = Object.freeze({
  permiteCopiar: true,
  maxVersiculosCopia: null,
  permiteImagem: true,
  siglaObrigatoria: true as const,
})

export const POLITICA_POR_PROVEDOR: Readonly<Record<ProvedorLicenciada, Readonly<PoliticaCopia>>> = Object.freeze({
  apibible: Object.freeze({ permiteCopiar: true, maxVersiculosCopia: 25, permiteImagem: false, siglaObrigatoria: true as const }),
  youversion: Object.freeze({ permiteCopiar: true, maxVersiculosCopia: 25, permiteImagem: false, siglaObrigatoria: true as const }),
})

/** Política de cópia da versão; id desconhecido cai na regra mais restrita (licenciada). */
export function politicaCopia(id: string | null | undefined): Readonly<PoliticaCopia> {
  const v = versaoPorId(id)
  if (!v) return POLITICA_POR_PROVEDOR.apibible
  if (v.fonte !== 'licenciada') return POLITICA_ABERTA
  return POLITICA_POR_PROVEDOR[v.provedor ?? 'apibible']
}
