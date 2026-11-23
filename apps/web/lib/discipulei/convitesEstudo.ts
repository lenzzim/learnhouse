/* ==========================================================================
   Convites para agendar estudo (decisão N40, 23/11/2026)
   --------------------------------------------------------------------------
   Quatro momentos: fim de um TCD salvo, fim de um capítulo no leitor, a tela
   Hoje a cada 3 dias de uso e depois da 1ª nota publicada. Regras:

   - no máximo 1 convite por dia por pessoa;
   - "Agora não" esconde todos por 14 dias;
   - nunca para quem já agendou.

   "Já agendou": o agendamento acontece no site (outro domínio), então a
   comunidade não fica sabendo. Usamos como marcador o clique em "Agendar
   estudo" em qualquer lugar da comunidade (convites, faixa, menu). Quem clica
   não recebe mais convites. Limitação: o marcador mora no navegador
   (localStorage, chave por conta). Em outro aparelho a pessoa ainda pode ver
   convites até clicar lá também.

   Estado por conta, em localStorage com o id do usuário na chave; toda leitura
   e escrita em try/catch (modo privado ou armazenamento bloqueado = sem
   convites, nunca erro).
   ========================================================================== */

export type MomentoConvite = 'tcd' | 'biblia' | 'hoje' | 'primeira-nota' | 'devocional'

const PREFIXO = 'discipulei_convite_estudo:'
const DIA_MS = 24 * 60 * 60 * 1000
export const DISPENSA_DIAS = 14
export const DIAS_DE_USO_HOJE = 3
/** Um convite já exibido hoje continua valendo por alguns minutos (remontagens). */
const JANELA_MESMO_CONVITE_MS = 10 * 60 * 1000

/** Evento disparado quando a pessoa clica em "Agendar estudo" em qualquer lugar. */
export const EVENTO_AGENDOU = 'discipulei:agendar-estudo'
/** Evento do Caderno: um TCD foi salvo com conteúdo. */
export const EVENTO_TCD_SALVO = 'discipulei:tcd-salvo'
/** Evento do Caderno/comunidade: uma nota foi publicada. */
export const EVENTO_NOTA_PUBLICADA = 'discipulei:nota-publicada'

interface Estado {
  agendouEm?: number
  dispensadoAte?: number
  exibido?: { dia: string; momento: MomentoConvite; em: number }
  ultimoDiaUso?: string
  diasDesdeConviteHoje?: number
  primeiraNotaConvidada?: boolean
}

export function diaLocal(d = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${dia}`
}

function chave(userId: string | number): string {
  return `${PREFIXO}${userId}`
}

function ler(userId: string | number): Estado | null {
  try {
    const bruto = window.localStorage.getItem(chave(userId))
    return bruto ? (JSON.parse(bruto) as Estado) : {}
  } catch {
    return null
  }
}

function gravar(userId: string | number, estado: Estado): void {
  try {
    window.localStorage.setItem(chave(userId), JSON.stringify(estado))
  } catch {
    // armazenamento indisponível: o convite some só nesta visita
  }
}

/** Registra um dia de uso (para o convite da tela Hoje a cada 3 dias). */
export function registrarDiaDeUso(userId: string | number, agora = new Date()): void {
  const e = ler(userId)
  if (!e) return
  const hoje = diaLocal(agora)
  if (e.ultimoDiaUso === hoje) return
  gravar(userId, { ...e, ultimoDiaUso: hoje, diasDesdeConviteHoje: (e.diasDesdeConviteHoje ?? 0) + 1 })
}

/** Pode mostrar o convite deste momento agora? */
export function podeConvidar(userId: string | number, momento: MomentoConvite, agora = new Date()): boolean {
  const e = ler(userId)
  if (!e) return false
  if (e.agendouEm) return false
  const ms = agora.getTime()
  if (e.dispensadoAte && e.dispensadoAte > ms) return false

  const hoje = diaLocal(agora)
  if (e.exibido && e.exibido.dia === hoje) {
    // Já houve um convite hoje: só o mesmo, há pouco (remontagem da página).
    return e.exibido.momento === momento && ms - e.exibido.em < JANELA_MESMO_CONVITE_MS
  }
  if (momento === 'hoje' && (e.diasDesdeConviteHoje ?? 0) < DIAS_DE_USO_HOJE) return false
  if (momento === 'primeira-nota' && e.primeiraNotaConvidada) return false
  return true
}

/** Marca o convite como exibido hoje (conta para o limite de 1 por dia). */
export function registrarExibicao(userId: string | number, momento: MomentoConvite, agora = new Date()): void {
  const e = ler(userId)
  if (!e) return
  const hoje = diaLocal(agora)
  if (e.exibido && e.exibido.dia === hoje && e.exibido.momento === momento) return
  const novo: Estado = { ...e, exibido: { dia: hoje, momento, em: agora.getTime() } }
  if (momento === 'hoje') novo.diasDesdeConviteHoje = 0
  if (momento === 'primeira-nota') novo.primeiraNotaConvidada = true
  gravar(userId, novo)
}

/** "Agora não": nenhum convite por 14 dias. */
export function dispensarConvites(userId: string | number, agora = new Date()): void {
  const e = ler(userId)
  if (!e) return
  gravar(userId, { ...e, dispensadoAte: agora.getTime() + DISPENSA_DIAS * DIA_MS })
}

/** Clicou em "Agendar estudo": nunca mais convites (marcador documentado acima). */
export function registrarAgendamento(userId: string | number | null | undefined): void {
  if (userId === null || userId === undefined || userId === '') return
  const e = ler(userId)
  if (!e) return
  if (!e.agendouEm) gravar(userId, { ...e, agendouEm: Date.now() })
}

/** Dispara o evento global (a faixa e o menu não sabem o id do usuário). */
export function avisarAgendamento(): void {
  try {
    window.dispatchEvent(new CustomEvent(EVENTO_AGENDOU))
  } catch {
    // ambiente sem CustomEvent
  }
}
