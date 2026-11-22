import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
const ALIASES = [
  ['@components/', 'components/'],
  ['@lib/', 'lib/'],
  ['@services/', 'services/'],
  ['@/', ''],
]
const EXTENSOES = ['.ts', '.mjs', '.js', '/index.ts']

function candidato(base) {
  if (existsSync(base) && statSync(base).isFile()) return base
  for (const ext of EXTENSOES) {
    if (existsSync(base + ext)) return base + ext
  }
  return null
}

export async function resolve(especificador, contexto, proximo) {
  let base = null
  for (const [alias, pasta] of ALIASES) {
    if (especificador.startsWith(alias)) {
      base = path.join(RAIZ, pasta, especificador.slice(alias.length))
      break
    }
  }
  if (!base && /^\.{1,2}\//.test(especificador) && contexto.parentURL?.startsWith('file:')) {
    base = path.resolve(path.dirname(fileURLToPath(contexto.parentURL)), especificador)
  }
  if (base) {
    const arquivo = candidato(base)
    if (arquivo) return proximo(pathToFileURL(arquivo).href, contexto)
  }
  return proximo(especificador, contexto)
}
