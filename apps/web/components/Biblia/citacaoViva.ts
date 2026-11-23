/**
 * Citação "viva" de versão licenciada em posts.
 *
 * Os termos da API.Bible e da YouVersion não permitem guardar o texto
 * licenciado de forma permanente. Por isso o post guarda só a citação — um blockquote cujo texto é
 * "— João 3:16-18 (ARA)" — e, ao exibir, este widget (decoração do
 * ProseMirror, fora do documento salvo) busca o texto pelo proxy e o mostra
 * com o copyright, reportando o FUMS. Sem sessão (visitante, link /n/), no
 * limite diário ou com a versão desligada, mostra o texto da aberta do idioma
 * (BLIVRE) com o aviso ("Entre para ler na NVI. Mostrando a BLIVRE.").
 *
 * DOM puro (sem React): o ProseMirror ignora mutações dentro de widgets.
 */
import i18n from 'i18next'
import { codigoReferencia, interpretarReferencia, lerCodigoReferencia } from '@/lib/biblia/referencias'
import { ErroFonte, getVersesComRecuo, rotuloVerso } from '@/lib/biblia/fontes'
import { reportarFums } from '@/lib/biblia/fums'
import { versaoPorId, versaoPorSigla } from '@/lib/biblia/versoes'

export interface CitacaoLicenciada {
  codigo: string
  versao: string
}

const RE_CITACAO = /^\s*[—–-]\s*(.+?)\s*\(([A-Za-z0-9]{2,8})\)\s*$/

/** "— João 3:16-18 (ARA)" (texto inteiro do blockquote) -> citação licenciada; senão null. */
export function lerCitacaoLicenciada(texto: string): CitacaoLicenciada | null {
  const m = RE_CITACAO.exec(texto)
  if (!m) return null
  const versao = versaoPorSigla(m[2])
  if (versao?.fonte !== 'licenciada') return null
  const ref = interpretarReferencia(m[1])
  if (!ref || ref.versoIni === undefined) return null
  return { codigo: codigoReferencia(ref), versao: versao.id }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, estilo: string, texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  e.setAttribute('style', estilo)
  if (texto !== undefined) e.textContent = texto
  return e
}

const ESTILO_TEXTO = "font-family: var(--font-serif), Georgia, 'Times New Roman', serif; line-height: 1.7; margin: 0 0 0.25rem;"
const ESTILO_NOTA = 'font-family: inherit; font-size: 0.75rem; line-height: 1.4; color: var(--text-3); margin: 0;'

export function criarCitacaoViva({ codigo, versao }: CitacaoLicenciada): HTMLElement {
  const raiz = el('div', 'margin: 0 0 0.25rem;')
  raiz.className = 'biblia-citacao-viva'
  raiz.contentEditable = 'false'
  raiz.setAttribute('aria-live', 'polite')
  raiz.appendChild(el('p', ESTILO_NOTA, i18n.t('biblia.carregando')))

  const ref = lerCodigoReferencia(codigo)
  const info = versaoPorId(versao)
  if (!ref || !info) return raiz

  getVersesComRecuo(versao, ref)
    .then(({ versos, capitulo, recuo }) => {
      raiz.replaceChildren()
      const p = el('p', ESTILO_TEXTO)
      p.lang = versaoPorId(capitulo.versao)?.idioma ?? info.idioma
      const numeros = versos.length > 1
      for (const v of versos) {
        if (numeros) {
          p.appendChild(el('sup', 'font-family: inherit; font-size: 0.7em; color: var(--text-3); margin-inline-end: 0.15em;', rotuloVerso(capitulo, v.numero)))
        }
        p.appendChild(document.createTextNode(`${v.texto} `))
      }
      raiz.appendChild(p)
      if (capitulo.copyrightCurto) raiz.appendChild(el('p', ESTILO_NOTA, capitulo.copyrightCurto))
      if (recuo) {
        const para = versaoPorId(recuo.para)?.sigla ?? recuo.para.toUpperCase()
        const chave =
          recuo.motivo === 'nao_autenticado'
            ? 'biblia.recuo_entrar'
            : recuo.motivo === 'limite_api' || recuo.motivo === 'limite_usuario'
              ? 'biblia.recuo_limite'
              : 'biblia.recuo_indisponivel'
        raiz.appendChild(el('p', ESTILO_NOTA, i18n.t(chave, { sigla: info.sigla, recuo: para })))
      }
      reportarFums([capitulo.fums])
    })
    .catch((erro) => {
      raiz.replaceChildren()
      const chave =
        erro instanceof ErroFonte && erro.codigo === 'nao_autenticado'
          ? 'biblia.licenciada_entrar'
          : erro instanceof ErroFonte && (erro.codigo === 'chave_ausente' || erro.codigo === 'versao_indisponivel')
            ? 'biblia.licenciada_indisponivel'
            : 'biblia.erro_carregar'
      raiz.appendChild(el('p', ESTILO_NOTA, i18n.t(chave, { sigla: info.sigla })))
    })
  return raiz
}
