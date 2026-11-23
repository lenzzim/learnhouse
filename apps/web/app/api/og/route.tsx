/**
 * Imagem de prévia de link (Open Graph) da comunidade (Discipulei, item 3.4).
 *
 * P&B, tipográfica: marca, título e espaço. O título e o espaço NUNCA vêm da
 * URL: o servidor busca a discussão/espaço sem sessão (como um visitante). Se
 * não for público (espaço restrito, desafio só para inscritos, nota privada,
 * inexistente), a imagem é a genérica, sem título nem trecho. Assim ninguém
 * monta uma prévia com texto inventado e nada privado vai para o WhatsApp.
 *
 *   /api/og                          genérica
 *   /api/og?tipo=comunidades         lista de espaços
 *   /api/og?tipo=espaco&c=<id>       espaço público
 *   /api/og?tipo=discussao&d=<id>    discussão pública
 */

import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'
import { getCommunity } from '@services/communities/communities'
import { getDiscussion } from '@services/communities/discussions'

export const dynamic = 'force-dynamic'

const LARGURA = 1200
const ALTURA = 630
const ID_VALIDO = /^[A-Za-z0-9-]{8,64}$/

function cortar(texto: string, max: number): string {
  const t = texto.replace(/\s+/g, ' ').trim()
  // "..." em ASCII: a fonte padrão do next/og pode não ter o caractere de reticências.
  return t.length > max ? `${t.slice(0, max - 3).trimEnd()}...` : t
}

async function dadosPublicos(req: NextRequest): Promise<{ titulo: string | null; espaco: string | null }> {
  const p = req.nextUrl.searchParams
  const tipo = p.get('tipo')
  try {
    if (tipo === 'discussao') {
      const id = p.get('d') || ''
      if (!ID_VALIDO.test(id)) return { titulo: null, espaco: null }
      // Sem token de propósito: só o que é público.
      const d = await getDiscussion(`discussion_${id}`, null)
      if (!d || d.visibility === 'private') return { titulo: null, espaco: null }
      return { titulo: cortar(d.title || '', 110), espaco: null }
    }
    if (tipo === 'espaco') {
      const id = p.get('c') || ''
      if (!ID_VALIDO.test(id)) return { titulo: null, espaco: null }
      const c = await getCommunity(`community_${id}`, null)
      if (!c?.public) return { titulo: null, espaco: null }
      return { titulo: cortar(c.name || '', 80), espaco: null }
    }
    if (tipo === 'comunidades') return { titulo: 'Espaços da comunidade', espaco: null }
  } catch {
    // Negado ou inexistente para visitante: genérica.
  }
  return { titulo: null, espaco: null }
}

export async function GET(req: NextRequest) {
  const { titulo: tituloBruto, espaco: espacoBruto } = await dadosPublicos(req)
  let titulo = tituloBruto
  let espaco = espacoBruto

  // Discussão pública: o nome do espaço vem de `c`, mas só se o espaço também
  // for público para visitantes e for mesmo o espaço da discussão.
  const p = req.nextUrl.searchParams
  if (p.get('tipo') === 'discussao' && titulo) {
    const c = p.get('c') || ''
    if (ID_VALIDO.test(c)) {
      try {
        const [comunidade, d] = await Promise.all([
          getCommunity(`community_${c}`, null),
          getDiscussion(`discussion_${p.get('d')}`, null),
        ])
        if (comunidade?.public && d?.community_id === comunidade.id) espaco = cortar(comunidade.name || '', 60)
      } catch {
        espaco = null
      }
    }
  }
  if (!titulo) espaco = null

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '64px 72px',
          background: '#121211',
          color: '#ecebe7',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', fontSize: 30, letterSpacing: 1, color: '#a3a19c' }}>
          <div style={{ display: 'flex', width: 14, height: 14, borderRadius: 7, background: '#ecebe7', marginRight: 16 }} />
          Discipulei
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {espaco && (
            <div style={{ display: 'flex', fontSize: 30, color: '#a3a19c', marginBottom: 20 }}>{espaco}</div>
          )}
          <div
            style={{
              display: 'flex',
              fontSize: titulo && titulo.length > 60 ? 60 : 76,
              lineHeight: 1.12,
              maxWidth: 1000,
            }}
          >
            {titulo || 'Leia a Bíblia, escreva e partilhe com a comunidade.'}
          </div>
        </div>
        <div style={{ display: 'flex', height: 2, background: 'rgba(236,235,231,0.25)' }} />
      </div>
    ),
    {
      width: LARGURA,
      height: ALTURA,
      headers: { 'Cache-Control': 'public, max-age=600, s-maxage=600' },
    }
  )
}
