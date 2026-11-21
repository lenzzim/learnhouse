'use client'

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { FileText, Lock, UploadSimple } from '@phosphor-icons/react'
import { FolhaInferior } from '@components/Discipulei/Navegacao/FolhaInferior'
import { criarNota, idDaNota } from '@services/caderno/notas'
import { ACCEPT, formatoAceito, importarArquivo, type ErroImportacao } from '@/lib/caderno/importar'
import { useCaderno } from './CadernoContexto'
import { opcoesColecoes, useColecoes } from './ArvoreColecoes'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, SERIF } from './estilos'
import { hrefCaderno } from './PainelEsquerdo'

const Contexto = createContext<{ abrirSeletor: () => void }>({ abrirSeletor: () => {} })
export const useImportar = () => useContext(Contexto)

/**
 * Importar .md, .txt e .docx: pelo seletor de arquivos ou arrastando para a
 * área do caderno. Antes de criar, a pessoa escolhe a coleção. Toda nota
 * importada nasce privada.
 */
export function ImportarProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation()
  const c = useCaderno()
  const router = useRouter()
  const params = useSearchParams()
  const entrada = useRef<HTMLInputElement | null>(null)
  const [arquivos, setArquivos] = useState<File[]>([])
  const [colecao, setColecao] = useState('')
  const [arrastando, setArrastando] = useState(false)
  const [importando, setImportando] = useState(false)
  const colecoes = useColecoes()

  const abrirSeletor = useCallback(() => entrada.current?.click(), [])

  const receber = useCallback(
    (lista: File[]) => {
      const aceitos = lista.filter((f) => formatoAceito(f.name))
      if (aceitos.length < lista.length) toast.error(t('caderno.importar_formato'))
      if (!aceitos.length) return
      setColecao(params?.get('colecao') ?? '')
      setArquivos(aceitos.slice(0, 20))
    },
    [params, t]
  )

  // Arrastar e soltar em qualquer lugar da janela enquanto o caderno está aberto.
  useEffect(() => {
    let profundidade = 0
    const temArquivos = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files')
    const entrar = (e: DragEvent) => {
      if (!temArquivos(e)) return
      profundidade++
      setArrastando(true)
    }
    const sair = (e: DragEvent) => {
      if (!temArquivos(e)) return
      profundidade = Math.max(0, profundidade - 1)
      if (!profundidade) setArrastando(false)
    }
    const sobre = (e: DragEvent) => {
      if (temArquivos(e)) e.preventDefault()
    }
    const soltar = (e: DragEvent) => {
      if (!temArquivos(e)) return
      e.preventDefault()
      profundidade = 0
      setArrastando(false)
      receber(Array.from(e.dataTransfer?.files ?? []))
    }
    window.addEventListener('dragenter', entrar)
    window.addEventListener('dragleave', sair)
    window.addEventListener('dragover', sobre)
    window.addEventListener('drop', soltar)
    return () => {
      window.removeEventListener('dragenter', entrar)
      window.removeEventListener('dragleave', sair)
      window.removeEventListener('dragover', sobre)
      window.removeEventListener('drop', soltar)
    }
  }, [receber])

  const importar = async () => {
    if (!c.orgId) return
    setImportando(true)
    let ultima: string | null = null
    let ok = 0
    let simplificados = 0
    const falhas: string[] = []
    for (const arquivo of arquivos) {
      try {
        const { titulo, doc, simplificado } = await importarArquivo(arquivo)
        const conteudo = JSON.stringify(doc)
        if (conteudo.length > 1_000_000) throw Object.assign(new Error(), { codigo: 'grande_demais' as ErroImportacao })
        const nota = await criarNota(
          { org_id: c.orgId, title: titulo, content_json: conteudo, collection_uuid: colecao || null },
          c.token
        )
        ultima = nota.note_uuid
        ok++
        if (simplificado) simplificados++
      } catch (e: any) {
        const codigo: ErroImportacao = e?.codigo ?? 'leitura'
        falhas.push(`${arquivo.name}: ${t(`caderno.importar_erro_${codigo}`)}`)
      }
    }
    setImportando(false)
    setArquivos([])
    // Resumo único: quantas entraram e quais falharam (e por quê).
    const linhas = [
      ok ? t('caderno.importar_ok', { count: ok }) : null,
      simplificados ? t('caderno.importar_simplificado', { count: simplificados }) : null,
      falhas.length ? t('caderno.importar_falhas', { count: falhas.length }) : null,
      ...falhas,
    ].filter(Boolean)
    const mensagem = linhas.join('\n')
    if (falhas.length && !ok) toast.error(mensagem, { duration: 8000, style: { whiteSpace: 'pre-line' } })
    else toast.success(mensagem, { duration: falhas.length || simplificados ? 8000 : 3000, style: { whiteSpace: 'pre-line' } })
    if (ok) {
      c.invalidar()
      if (ok === 1 && ultima) router.push(hrefCaderno(c.orgslug, `/${idDaNota(ultima)}`))
      else router.push(hrefCaderno(c.orgslug, colecao ? `?colecao=${encodeURIComponent(colecao)}` : ''))
    }
  }

  return (
    <Contexto.Provider value={{ abrirSeletor }}>
      {children}
      <input
        ref={entrada}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          receber(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />

      {arrastando && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 flex items-center justify-center bg-[var(--overlay)] backdrop-blur-[2px]"
          style={{ zIndex: 'var(--z-modal)' }}
        >
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[var(--text-2)] bg-[var(--panel)] px-10 py-8 text-center">
            <UploadSimple size={28} aria-hidden="true" className="text-[var(--text)]" />
            <p className="text-lg text-[var(--text)]" style={SERIF}>{t('caderno.soltar_para_importar')}</p>
            <p className="text-sm text-[var(--text-2)]">{t('caderno.formatos_aceitos')}</p>
          </div>
        </div>
      )}

      <FolhaInferior
        aberta={arquivos.length > 0}
        aoMudar={(v) => !v && !importando && setArquivos([])}
        titulo={t('caderno.importar_titulo', { count: arquivos.length })}
        descricao={t('caderno.importar_descricao')}
        larguraDesktop="md"
      >
        <ul className="mb-4 flex flex-col gap-1.5">
          {arquivos.map((f) => (
            <li key={f.name + f.size} className="flex items-center gap-2.5 text-sm text-[var(--text)]">
              <FileText size={16} aria-hidden="true" className="shrink-0 text-[var(--text-3)]" />
              <span className="min-w-0 flex-1 truncate">{f.name}</span>
              <span className="tabular-nums text-xs text-[var(--text-3)]">{Math.max(1, Math.round(f.size / 1024))} KB</span>
            </li>
          ))}
        </ul>
        <label className="mb-1.5 block text-sm font-medium text-[var(--text)]" htmlFor="importar-colecao">
          {t('caderno.colecao')}
        </label>
        <select id="importar-colecao" value={colecao} onChange={(e) => setColecao(e.target.value)} className={`${CAMPO} h-11`}>
          <option value="">{t('caderno.sem_colecao')}</option>
          {opcoesColecoes(colecoes.data ?? []).map((o) => (
            <option key={o.uuid} value={o.uuid}>{o.rotulo}</option>
          ))}
        </select>
        <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--text-2)]">
          <Lock size={12} aria-hidden="true" />
          {t('caderno.importar_privada')}
        </p>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" className={`${BOTAO_SECUNDARIO} min-h-11 px-4 text-sm`} onClick={() => setArquivos([])} disabled={importando}>
            {t('caderno.cancelar')}
          </button>
          <button type="button" className={`${BOTAO_PRIMARIO} min-h-11 px-5 text-sm disabled:opacity-60`} onClick={importar} disabled={importando}>
            {importando ? t('caderno.importando') : t('caderno.importar')}
          </button>
        </div>
      </FolhaInferior>
    </Contexto.Provider>
  )
}
