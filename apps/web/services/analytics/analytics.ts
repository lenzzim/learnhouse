import { getAPIUrl } from '@services/config/config'

// lgtm[js/hardcoded-credentials] -- not a secret, just a sessionStorage key name
const SESSION_KEY = 'lh_analytics_session_id'

/**
 * Eventos que o back aceita em POST /analytics/events. Precisa bater com
 * `ALLOWED_FRONTEND_EVENTS` em apps/api/src/services/analytics/events.py.
 * Qualquer outro nome levaria um 400, então nem sai do navegador (o PostHog
 * continua recebendo todos pelo useLHAnalytics, quando estiver ligado).
 */
export const BACKEND_ACCEPTED_EVENTS: ReadonlySet<string> = new Set([
  'page_view',
  'course_view',
  'activity_view',
  'search_query',
  'time_on_activity',
])

export function backendAcceptsEvent(eventName: string): boolean {
  return BACKEND_ACCEPTED_EVENTS.has(eventName)
}

function getSessionId(): string {
  if (typeof window === 'undefined') return ''
  try {
    let id = sessionStorage.getItem(SESSION_KEY)
    if (!id) {
      id = crypto.randomUUID()
      sessionStorage.setItem(SESSION_KEY, id)
    }
    return id
  } catch {
    return ''
  }
}

// GET /analytics/status diz se há Tinybird configurado. Consultado uma vez
// por token; sem Tinybird nenhum evento é enviado.
let statusToken: string | null = null
let statusPromise: Promise<boolean> | null = null

function backendConfigured(accessToken: string): Promise<boolean> {
  if (statusPromise && statusToken === accessToken) return statusPromise
  statusToken = accessToken
  statusPromise = fetch(`${getAPIUrl()}analytics/status`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => Boolean(j?.configured))
    .catch(() => false)
  return statusPromise
}

// Comunidades em que o back respondeu 403 (a pessoa não é membro): não
// insistimos durante a sessão da página.
const orgsSemAcesso = new Set<number>()

export async function trackEvent(
  eventName: string,
  orgId: number,
  properties: Record<string, unknown>,
  accessToken: string
): Promise<void> {
  if (!backendAcceptsEvent(eventName) || orgsSemAcesso.has(orgId)) return
  try {
    if (!(await backendConfigured(accessToken))) return
    const url = `${getAPIUrl()}analytics/events`
    const resposta = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        event_name: eventName,
        org_id: orgId,
        session_id: getSessionId(),
        properties,
      }),
      keepalive: true,
    })
    if (resposta.status === 403) orgsSemAcesso.add(orgId)
  } catch {
    // Silently swallow — analytics should never break the app
  }
}
