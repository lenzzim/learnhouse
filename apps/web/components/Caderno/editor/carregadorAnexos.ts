/**
 * Carrega as imagens privadas do Caderno para o <img>.
 *
 * O arquivo só sai por endpoint com credencial (sessão do dono, token do link
 * privado ou regra de leitura da discussion), então o <img> não pode apontar
 * direto para a API: buscamos com fetch (Authorization) e usamos um blob: em
 * cache. `liberar()` devolve a memória ao sair da nota.
 */

export interface CarregadorAnexos {
  carregar: (anexo: string) => Promise<string>
  /** Já temos o arquivo (acabou de ser enviado): mostra sem baixar de novo. */
  registrar: (anexo: string, arquivo: Blob) => void
  liberar: () => void
}

export function criarCarregadorAnexos(
  urlDe: (anexo: string) => string,
  obterToken: () => string | undefined,
  { semCache = false }: { semCache?: boolean } = {}
): CarregadorAnexos {
  const cache = new Map<string, Promise<string>>()
  const criadas: string[] = []

  const guardar = (blob: Blob) => {
    const url = URL.createObjectURL(blob)
    criadas.push(url)
    return url
  }

  return {
    carregar(anexo) {
      const existente = cache.get(anexo)
      if (existente) return existente
      const token = obterToken()
      const pedido = fetch(urlDe(anexo), {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
        cache: semCache ? 'no-store' : 'default',
        referrerPolicy: 'no-referrer',
      }).then(async (res) => {
        if (!res.ok) throw Object.assign(new Error('anexo'), { status: res.status })
        if (!(res.headers.get('content-type') || '').startsWith('image/')) throw new Error('anexo')
        return guardar(await res.blob())
      })
      pedido.catch(() => cache.delete(anexo))
      cache.set(anexo, pedido)
      return pedido
    },
    registrar(anexo, arquivo) {
      cache.set(anexo, Promise.resolve(guardar(arquivo)))
    },
    liberar() {
      for (const url of criadas) URL.revokeObjectURL(url)
      criadas.length = 0
      cache.clear()
    },
  }
}
