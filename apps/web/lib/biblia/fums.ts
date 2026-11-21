/**
 * FUMS (Fair Use Management System) da API.Bible — obrigatório em apps web
 * que exibem texto licenciado (docs.api.bible/resources/fair-use).
 *
 * Cada resposta de texto licenciado traz um `fums` (fumsToken). Ao EXIBIR o
 * texto, reportamos o token com fums("trackView", token). O script oficial
 * (fumsV3.min.js) só é carregado quando alguém de fato vê uma versão
 * licenciada — quem lê só versões abertas não carrega nada da API.Bible.
 *
 * Não enviamos userId (é opcional): o rastreador usa só ids aleatórios de
 * aparelho e de sessão que ele mesmo gera. Detalhes para a política de
 * privacidade no relatório da integração.
 */

const SCRIPT_FUMS = 'https://pkg.api.bible/fumsV3.min.js'

type Fums = (acao: string, ...args: unknown[]) => void
type JanelaFums = Window & { fums?: Fums; fumsData?: unknown[] }

let scriptInjetado = false

function garantirFums(): Fums | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') return null
  const w = window as JanelaFums
  // fila oficial: guarda as chamadas até o script carregar
  w.fumsData = w.fumsData || []
  w.fums =
    w.fums ||
    function (...args: unknown[]) {
      w.fumsData!.push(args)
    }
  if (!scriptInjetado) {
    scriptInjetado = true
    const s = document.createElement('script')
    s.src = SCRIPT_FUMS
    s.async = true
    s.dataset.origem = 'api-bible-fums'
    document.body.appendChild(s)
  }
  return w.fums
}

/** Reporta a exibição de um ou mais trechos licenciados. Tokens vazios são ignorados. */
export function reportarFums(tokens: Array<string | null | undefined>): void {
  const validos = Array.from(new Set(tokens.filter((t): t is string => !!t)))
  if (!validos.length) return
  try {
    const fums = garantirFums()
    if (!fums) return
    fums('trackView', validos.length === 1 ? validos[0] : validos)
  } catch {
    // o relatório nunca pode quebrar a leitura
  }
}
