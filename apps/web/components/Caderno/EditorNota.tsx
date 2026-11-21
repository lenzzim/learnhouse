'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import toast from 'react-hot-toast'
import {
  BookOpenText,
  CloudCheck,
  CloudSlash,
  DotsThree,
  DownloadSimple,
  FolderSimple,
  ListBullets,
  ListNumbers,
  Quotes,
  ShareNetwork,
  SidebarSimple,
  TextB,
  TextHTwo,
  TextHThree,
  TextItalic,
  Trash,
  ArrowCounterClockwise,
  Hash,
  BracketsSquare,
  CircleNotch,
  Warning,
  FileDashed,
  FloppyDisk,
} from '@phosphor-icons/react'
import { ReferenciasBiblicas } from '@components/Biblia/extensaoReferencias'
import { ReferenciasNoTexto } from '@components/Biblia/ReferenciasNoTexto'
import { BotaoInserirVersiculo } from '@components/Biblia/BotaoInserirVersiculo'
import { codigoReferencia, encontrarReferencias } from '@/lib/biblia/referencias'
import {
  criarNota,
  exportarMarkdown,
  idDaNota,
  listarNotas,
  listarTags,
  moverParaLixeira,
  resolverTitulo,
  restaurarNota,
  salvarNota,
  type Nota,
  type RefBiblica,
} from '@services/caderno/notas'
import { dataBR, lerDoc, pareceMarkdown, textoDoDoc, type NoTiptap } from '@/lib/caderno/conteudo'
import { markdownParaDocPublico } from '@/lib/caderno/importar'
import { DialogoModelos, DialogoSalvarModelo, SeletorModelosVazio } from './Modelos'
import { useCaderno } from './CadernoContexto'
import { criarSugestoes, LigacoesETags, type FontesSugestao } from './editor/extensoes'
import type { ItemSugestao } from './editor/MenuSugestao'
import { DialogoCompartilhar } from './DialogoCompartilhar'
import { SeloVisibilidade } from './SeloVisibilidade'
import { opcoesColecoes, useColecoes } from './ArvoreColecoes'
import { hrefCaderno } from './PainelEsquerdo'
import { BOTAO_SECUNDARIO, CAMPO, FOCO, ICONE_PEQUENO, SERIF } from './estilos'

type Status = 'salvo' | 'salvando' | 'pendente' | 'offline' | 'erro'

const ATRASO_SALVAR = 1500

/** Referências do texto para o servidor (o parser robusto é o do cliente). */
function refsDoTexto(texto: string): RefBiblica[] {
  const vistos = new Set<string>()
  const out: RefBiblica[] = []
  for (const r of encontrarReferencias(texto)) {
    const codigo = codigoReferencia(r)
    if (vistos.has(codigo)) continue
    vistos.add(codigo)
    out.push({ book: r.livroId, chapter: r.capitulo, verse_start: r.versoIni ?? null, verse_end: r.versoFim ?? r.versoIni ?? null })
    if (out.length >= 200) break
  }
  return out
}

function BotaoBarra({
  onClick,
  ativo,
  rotulo,
  children,
}: {
  onClick: () => void
  ativo?: boolean
  rotulo: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={rotulo}
      aria-pressed={ativo}
      title={rotulo}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors ${FOCO} ${
        ativo ? 'bg-[var(--surface)] text-[var(--text)]' : 'text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
      }`}
    >
      {children}
    </button>
  )
}

function StatusSalvo({ status }: { status: Status }) {
  const { t } = useTranslation()
  const mapa: Record<Status, { Icone: typeof CloudCheck; texto: string; girar?: boolean }> = {
    salvo: { Icone: CloudCheck, texto: t('caderno.salvo') },
    pendente: { Icone: CircleNotch, texto: t('caderno.salvando'), girar: false },
    salvando: { Icone: CircleNotch, texto: t('caderno.salvando'), girar: true },
    offline: { Icone: CloudSlash, texto: t('caderno.offline') },
    erro: { Icone: Warning, texto: t('caderno.erro_ao_salvar') },
  }
  const { Icone, texto, girar } = mapa[status]
  return (
    <span role="status" aria-live="polite" className="inline-flex shrink-0 items-center gap-1.5 text-xs text-[var(--text-3)]">
      <Icone size={14} aria-hidden="true" className={girar ? 'animate-spin' : ''} />
      <span className="hidden sm:inline">{texto}</span>
      <span className="sr-only sm:hidden">{texto}</span>
    </span>
  )
}

export function EditorNota({ notaInicial }: { notaInicial: Nota }) {
  const { t } = useTranslation()
  const c = useCaderno()
  const router = useRouter()
  const colecoes = useColecoes()
  const [nota, setNota] = useState<Nota>(notaInicial)
  const [titulo, setTitulo] = useState(notaInicial.title)
  const [status, setStatus] = useState<Status>('salvo')
  const [compartilhar, setCompartilhar] = useState(false)
  const [menu, setMenu] = useState(false)
  const [movendo, setMovendo] = useState(false)
  const lixeira = !!nota.deleted_at

  // Estado vivo para o salvamento (evita closures velhas).
  const vivo = useRef({ titulo: notaInicial.title, pendente: false, salvando: false, timer: 0 as any, editor: null as Editor | null })
  const ctxRef = useRef(c)
  useEffect(() => {
    ctxRef.current = c
  }, [c])

  // Toda nota nasce vazia (inclusive o TCD): modelo só quando a pessoa escolhe.
  const docInicial = useMemo<NoTiptap>(() => lerDoc(notaInicial.content_json), [notaInicial.note_uuid]) // eslint-disable-line react-hooks/exhaustive-deps
  const [semModelo, setSemModelo] = useState(false)
  const [dialogoModelos, setDialogoModelos] = useState(false)
  const [salvarModelo, setSalvarModelo] = useState(false)

  /* ------------------------------------------------------ salvar */

  const salvarAgora = useCallback(async () => {
    const v = vivo.current
    const ed = v.editor
    if (!ed || !v.pendente) return
    if (v.salvando) return // o término do salvamento atual reagenda
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatus('offline')
      return
    }
    v.salvando = true
    v.pendente = false
    setStatus('salvando')
    const json = ed.getJSON() as NoTiptap
    const texto = textoDoDoc(json)
    try {
      const salva = await salvarNota(
        notaInicial.note_uuid,
        { title: v.titulo.trim(), content_json: JSON.stringify(json), bible_refs: refsDoTexto(texto) },
        ctxRef.current.token
      )
      setNota((n) => ({ ...n, ...salva }))
      setStatus(v.pendente ? 'pendente' : 'salvo')
      ctxRef.current.invalidar()
    } catch (e: any) {
      v.pendente = true
      setStatus(e instanceof TypeError || !navigator.onLine ? 'offline' : 'erro')
    } finally {
      v.salvando = false
      if (v.pendente && navigator.onLine) {
        window.clearTimeout(v.timer)
        v.timer = window.setTimeout(salvarAgora, ATRASO_SALVAR)
      }
    }
  }, [notaInicial.note_uuid])

  const agendar = useCallback(() => {
    const v = vivo.current
    v.pendente = true
    setStatus((s) => (s === 'salvando' ? s : 'pendente'))
    window.clearTimeout(v.timer)
    v.timer = window.setTimeout(salvarAgora, ATRASO_SALVAR)
  }, [salvarAgora])

  // Volta da conexão: salva o que ficou pendente. Fechar a aba com algo
  // pendente pede confirmação. Sair da nota salva na hora.
  useEffect(() => {
    const online = () => vivo.current.pendente && salvarAgora()
    const offline = () => setStatus('offline')
    const antesDeSair = (e: BeforeUnloadEvent) => {
      if (vivo.current.pendente || vivo.current.salvando) e.preventDefault()
    }
    window.addEventListener('online', online)
    window.addEventListener('offline', offline)
    window.addEventListener('beforeunload', antesDeSair)
    return () => {
      window.removeEventListener('online', online)
      window.removeEventListener('offline', offline)
      window.removeEventListener('beforeunload', antesDeSair)
      window.clearTimeout(vivo.current.timer)
      if (vivo.current.pendente) salvarAgora()
    }
  }, [salvarAgora])

  /* ---------------------------------------------------- sugestões */

  const fontes = useCallback(
    (): FontesSugestao => ({
      notas: async (consulta) => {
        const ctx = ctxRef.current
        if (!ctx.orgId) return []
        const q = consulta.trim()
        try {
          const r = await listarNotas(ctx.orgId, { q: q || undefined, limit: 7 }, ctx.token)
          const itens: ItemSugestao[] = r.items
            .filter((n) => n.note_uuid !== notaInicial.note_uuid && n.title.trim())
            .map((n) => ({ id: n.note_uuid, rotulo: n.title, detalhe: n.kind === 'tcd' ? 'TCD' : undefined }))
          if (q && !itens.some((i) => i.rotulo.toLowerCase() === q.toLowerCase())) {
            itens.push({ id: `criar:${q}`, rotulo: q, detalhe: t('caderno.nova'), criar: true })
          }
          return itens
        } catch {
          return q ? [{ id: `criar:${q}`, rotulo: q, criar: true }] : []
        }
      },
      tags: async (consulta) => {
        const ctx = ctxRef.current
        if (!ctx.orgId) return []
        const q = consulta.trim().toLowerCase()
        try {
          const todas = await listarTags(ctx.orgId, ctx.token)
          const itens: ItemSugestao[] = todas
            .filter((tg) => !q || tg.name.toLowerCase().includes(q))
            .slice(0, 7)
            .map((tg) => ({ id: tg.tag_uuid, rotulo: tg.name, detalhe: String(tg.count) }))
          if (q && !todas.some((tg) => tg.name.toLowerCase() === q)) {
            itens.push({ id: `criar:${q}`, rotulo: consulta.trim(), detalhe: t('caderno.nova_tag'), criar: true })
          }
          return itens
        } catch {
          return []
        }
      },
      textos: { vazioNotas: t('caderno.sugestao_vazia_notas'), vazioTags: t('caderno.sugestao_vazia_tags') },
    }),
    [notaInicial.note_uuid, t]
  )
  const fontesRef = useRef(fontes)
  useEffect(() => {
    fontesRef.current = fontes
  }, [fontes])

  /* ------------------------------------------------------- editor */

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    editable: !lixeira,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } },
      }),
      Placeholder.configure({
        includeChildren: false,
        placeholder: ({ editor: ed, node, pos }) => {
          if (node.type.name === 'heading') return t('caderno.titulo_secao')
          if (node.type.name === 'paragraph') {
            const $pos = ed.state.doc.resolve(pos)
            const antes = $pos.depth === 0 && $pos.index(0) > 0 ? ed.state.doc.child($pos.index(0) - 1) : null
            if (antes?.type.name === 'heading') return t('caderno.escreva_aqui')
          }
          if (ed.state.doc.childCount <= 1) {
            return notaInicial.kind === 'tcd' ? t('caderno.placeholder_tcd') : t('caderno.placeholder_corpo')
          }
          return ''
        },
      }),
      ReferenciasBiblicas,
      LigacoesETags,
      criarSugestoes(() => fontesRef.current()),
    ],
    content: docInicial as any,
    editorProps: {
      attributes: {
        class: 'caderno-prosa',
        'aria-label': t('caderno.corpo_nota'),
        spellcheck: 'true',
        lang: 'pt-BR',
      },
      // Colar markdown (sem HTML junto) converte a formatação.
      handlePaste: (_view, event) => {
        const dados = event.clipboardData
        if (!dados || dados.getData('text/html')) return false
        const texto = dados.getData('text/plain')
        if (!pareceMarkdown(texto)) return false
        event.preventDefault()
        markdownParaDocPublico(texto)
          .then((doc) => vivo.current.editor?.chain().focus().insertContent((doc.content ?? []) as any).run())
          .catch(() => vivo.current.editor?.chain().focus().insertContent(texto).run())
        return true
      },
    },
    onUpdate: () => agendar(),
  })

  useEffect(() => {
    vivo.current.editor = editor ?? null
  }, [editor])

  useEffect(() => {
    editor?.setEditable(!lixeira)
  }, [editor, lixeira])

  // Sumário/backlinks do painel direito; passagem padrão = 1ª referência.
  const publicarAberta = useCallback(() => {
    if (!editor) return
    const doc = editor.getJSON() as NoTiptap
    ctxRef.current.setNotaAberta({ note_uuid: notaInicial.note_uuid, title: vivo.current.titulo, doc })
  }, [editor, notaInicial.note_uuid])

  useEffect(() => {
    if (!editor) return
    publicarAberta()
    if (!ctxRef.current.passagem) {
      const primeira = encontrarReferencias(textoDoDoc(editor.getJSON() as NoTiptap))[0]
      if (primeira) ctxRef.current.definirPassagem(codigoReferencia(primeira))
    }
    let timer = 0 as any
    const aoMudar = () => {
      window.clearTimeout(timer)
      timer = window.setTimeout(publicarAberta, 500)
    }
    editor.on('update', aoMudar)
    return () => {
      window.clearTimeout(timer)
      editor.off('update', aoMudar)
      ctxRef.current.setNotaAberta(null)
    }
  }, [editor, publicarAberta])

  // Sumário → rolar até o heading.
  useEffect(() => {
    if (!editor) return
    c.registrarIrParaTitulo((i) => {
      const hs = editor.view.dom.querySelectorAll('h1, h2, h3')
      const alvo = hs[i] as HTMLElement | undefined
      alvo?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => c.registrarIrParaTitulo(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  /* ------------------------------------------- cliques em links */

  const abrirLigacao = useCallback(
    async (tituloAlvo: string) => {
      const ctx = ctxRef.current
      if (!ctx.orgId) return
      if (vivo.current.pendente) await salvarAgora()
      try {
        const existente = await resolverTitulo(ctx.orgId, tituloAlvo, ctx.token)
        if (existente) {
          router.push(hrefCaderno(ctx.orgslug, `/${idDaNota(existente.note_uuid)}`))
          return
        }
        const nova = await criarNota({ org_id: ctx.orgId, title: tituloAlvo }, ctx.token)
        ctx.invalidar()
        router.push(hrefCaderno(ctx.orgslug, `/${idDaNota(nova.note_uuid)}`))
      } catch {
        toast.error(t('caderno.erro_abrir_ligacao'))
      }
    },
    [router, salvarAgora, t]
  )

  const aoClicarNoCorpo = (e: React.MouseEvent) => {
    const alvo = e.target as HTMLElement
    const lig = alvo.closest('a[data-nota-titulo]') as HTMLElement | null
    const tag = alvo.closest('a[data-nota-tag]') as HTMLElement | null
    if (!lig && !tag) return
    e.preventDefault()
    // Com texto selecionado (arrastando), não navega.
    if (!window.getSelection()?.isCollapsed) return
    if (lig) abrirLigacao(lig.getAttribute('data-nota-titulo') || '')
    else if (tag) router.push(hrefCaderno(c.orgslug, `?tag=${encodeURIComponent(tag.getAttribute('data-nota-tag') || '')}`))
  }

  /* --------------------------------------------------- ações */

  const aplicarModelo = (doc: NoTiptap, modo: 'substituir' | 'inserir') => {
    if (!editor) return
    if (modo === 'substituir') editor.chain().setContent(doc as any).focus('end').run()
    else editor.chain().focus().insertContent((doc.content ?? []) as any).run()
    setSemModelo(true)
    agendar()
  }

  const exportar = async () => {
    setMenu(false)
    if (vivo.current.pendente) await salvarAgora()
    try {
      const { nome, texto } = await exportarMarkdown(nota.note_uuid, c.token)
      const url = URL.createObjectURL(new Blob([texto], { type: 'text/markdown;charset=utf-8' }))
      const a = document.createElement('a')
      a.href = url
      a.download = nome
      a.click()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      toast.error(t('caderno.erro_exportar'))
    }
  }

  const paraLixeira = async () => {
    setMenu(false)
    try {
      if (vivo.current.pendente) await salvarAgora()
      await moverParaLixeira(nota.note_uuid, c.token)
      c.invalidar()
      toast.success(t('caderno.na_lixeira_ok'))
      router.push(hrefCaderno(c.orgslug))
    } catch {
      toast.error(t('caderno.erro_lixeira'))
    }
  }

  const restaurar = async () => {
    try {
      const n = await restaurarNota(nota.note_uuid, c.token)
      setNota(n)
      c.invalidar()
    } catch {
      toast.error(t('caderno.erro_restaurar'))
    }
  }

  const moverPara = async (uuid: string) => {
    setMovendo(false)
    try {
      const n = await salvarNota(nota.note_uuid, { collection_uuid: uuid }, c.token)
      setNota((x) => ({ ...x, ...n }))
      c.invalidar()
    } catch {
      toast.error(t('caderno.erro_mover'))
    }
  }

  useEffect(() => {
    if (!menu) return
    const fechar = (e: PointerEvent) => !(e.target as HTMLElement).closest('[data-menu-nota]') && setMenu(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false)
    document.addEventListener('pointerdown', fechar)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', fechar)
      document.removeEventListener('keydown', esc)
    }
  }, [menu])

  const nomeColecao = (colecoes.data ?? []).find((x) => x.collection_uuid === nota.collection_uuid)?.name
  const tituloTcd = nota.kind === 'tcd' && nota.tcd_date ? t('caderno.tcd_de', { data: dataBR(nota.tcd_date) }) : null

  /* ------------------------------------------------------ layout */

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Cabeçalho da nota */}
      <div className="flex min-h-12 items-center gap-1 border-b border-[var(--line)] px-2 sm:px-3">
        <button
          type="button"
          className={`${ICONE_PEQUENO} lg:hidden`}
          onClick={() => c.setEsquerdaAberta(true)}
          aria-label={t('caderno.abrir_navegacao')}
        >
          <SidebarSimple size={18} aria-hidden="true" />
        </button>
        {c.direitaAberta && (
          <span className="hidden lg:block min-[1440px]:hidden">
            <button
              type="button"
              className={ICONE_PEQUENO}
              onClick={() => c.setDireitaAberta(false)}
              aria-label={t('caderno.mostrar_navegacao')}
            >
              <SidebarSimple size={18} aria-hidden="true" />
            </button>
          </span>
        )}
        <div className="flex min-w-0 flex-1 items-center gap-2 ps-1 text-xs text-[var(--text-3)]">
          {nomeColecao && (
            <span className="hidden min-w-0 items-center gap-1 truncate sm:inline-flex">
              <FolderSimple size={13} aria-hidden="true" />
              <span className="truncate">{nomeColecao}</span>
            </span>
          )}
          <SeloVisibilidade visibilidade={nota.visibility} compacto onClick={lixeira ? undefined : () => setCompartilhar(true)} />
        </div>
        <StatusSalvo status={status} />
        {!lixeira && (
          <button
            type="button"
            onClick={() => setCompartilhar(true)}
            className={`${BOTAO_SECUNDARIO} ms-1 min-h-9 px-3 text-sm`}
          >
            <ShareNetwork size={16} aria-hidden="true" />
            <span className="hidden sm:inline">{t('caderno.compartilhar')}</span>
          </button>
        )}
        <div className="relative" data-menu-nota>
          <button
            type="button"
            className={ICONE_PEQUENO}
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-label={t('caderno.mais_acoes')}
            onClick={() => setMenu((m) => !m)}
          >
            <DotsThree size={20} weight="bold" aria-hidden="true" />
          </button>
          {menu && (
            <div role="menu" className="absolute end-0 top-full z-20 mt-1 w-56 rounded-xl border border-[var(--line-strong)] bg-[var(--panel)] p-1" style={{ boxShadow: 'var(--sombra-md)' }}>
              {[
                { Icone: DownloadSimple, rotulo: t('caderno.exportar_md'), f: exportar },
                ...(!lixeira
                  ? [
                      { Icone: FileDashed, rotulo: t('caderno.usar_modelo'), f: () => { setMenu(false); setDialogoModelos(true) } },
                      { Icone: FloppyDisk, rotulo: t('caderno.salvar_como_modelo'), f: () => { setMenu(false); setSalvarModelo(true) } },
                      { Icone: FolderSimple, rotulo: t('caderno.mover_colecao'), f: () => { setMenu(false); setMovendo(true) } },
                      { Icone: Trash, rotulo: t('caderno.mover_lixeira'), f: paraLixeira },
                    ]
                  : []),
              ].map(({ Icone, rotulo, f }) => (
                <button key={rotulo} type="button" role="menuitem" onClick={f} className={`flex min-h-10 w-full items-center gap-2.5 rounded-lg px-2.5 text-start text-sm text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)] ${FOCO}`}>
                  <Icone size={16} aria-hidden="true" />
                  {rotulo}
                </button>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          className={`${ICONE_PEQUENO} ${c.direitaAberta ? 'bg-[var(--surface)] text-[var(--text)]' : ''}`}
          onClick={() => c.setDireitaAberta(!c.direitaAberta)}
          aria-pressed={c.direitaAberta}
          aria-label={t('caderno.painel_estudo')}
          title={t('caderno.painel_estudo')}
        >
          <BookOpenText size={18} aria-hidden="true" />
        </button>
      </div>

      {movendo && (
        <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-2">
          <label htmlFor="mover-nota" className="shrink-0 text-sm text-[var(--text-2)]">{t('caderno.mover_colecao')}</label>
          <select
            id="mover-nota"
            autoFocus
            defaultValue={nota.collection_uuid ?? ''}
            onChange={(e) => moverPara(e.target.value)}
            onBlur={() => setMovendo(false)}
            className={`${CAMPO} h-9 max-w-xs`}
          >
            <option value="">{t('caderno.sem_colecao')}</option>
            {opcoesColecoes(colecoes.data ?? []).map((o) => (
              <option key={o.uuid} value={o.uuid}>{o.rotulo}</option>
            ))}
          </select>
        </div>
      )}

      {lixeira && (
        <div role="status" className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] bg-[var(--surface)] px-4 py-2.5 text-sm text-[var(--text)]">
          <span>{t('caderno.nota_na_lixeira')}</span>
          <button type="button" onClick={restaurar} className={`${BOTAO_SECUNDARIO} min-h-9 px-3 text-sm`}>
            <ArrowCounterClockwise size={16} aria-hidden="true" />
            {t('caderno.restaurar')}
          </button>
        </div>
      )}

      {/* Barra de formatação: pequena, rola de lado no celular */}
      {!lixeira && editor && (
        <div className="flex items-center gap-0.5 overflow-x-auto border-b border-[var(--line)] px-2 py-1 [scrollbar-width:none] sm:px-3" role="toolbar" aria-label={t('caderno.formatacao')}>
          <BotaoBarra rotulo={t('caderno.negrito')} ativo={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
            <TextB size={17} aria-hidden="true" />
          </BotaoBarra>
          <BotaoBarra rotulo={t('caderno.italico')} ativo={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <TextItalic size={17} aria-hidden="true" />
          </BotaoBarra>
          <BotaoBarra rotulo={t('caderno.titulo_2')} ativo={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <TextHTwo size={17} aria-hidden="true" />
          </BotaoBarra>
          <BotaoBarra rotulo={t('caderno.titulo_3')} ativo={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <TextHThree size={17} aria-hidden="true" />
          </BotaoBarra>
          <BotaoBarra rotulo={t('caderno.lista')} ativo={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <ListBullets size={17} aria-hidden="true" />
          </BotaoBarra>
          <BotaoBarra rotulo={t('caderno.lista_numerada')} ativo={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListNumbers size={17} aria-hidden="true" />
          </BotaoBarra>
          <BotaoBarra rotulo={t('caderno.citacao')} ativo={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quotes size={17} aria-hidden="true" />
          </BotaoBarra>
          <span className="mx-1 h-5 w-px shrink-0 bg-[var(--line)]" aria-hidden="true" />
          <BotaoBarra rotulo={t('caderno.inserir_ligacao')} onClick={() => editor.chain().focus().insertContent('[[').run()}>
            <BracketsSquare size={17} aria-hidden="true" />
          </BotaoBarra>
          <BotaoBarra rotulo={t('caderno.inserir_tag')} onClick={() => editor.chain().focus().insertContent(' #').run()}>
            <Hash size={17} aria-hidden="true" />
          </BotaoBarra>
          <div className="caderno-inserir-versiculo shrink-0">
            <BotaoInserirVersiculo editor={editor} />
          </div>
        </div>
      )}

      {/* Corpo */}
      <div className="min-h-0 flex-1 overflow-y-auto" id="caderno-rolagem">
        <article className="mx-auto w-full max-w-[44rem] px-5 pb-32 pt-8 sm:px-8 lg:pt-12">
          {tituloTcd && (
            <p className="mb-2 text-sm text-[var(--text-3)]">{tituloTcd}</p>
          )}
          <label htmlFor="caderno-titulo" className="sr-only">{t('caderno.titulo_nota')}</label>
          <textarea
            id="caderno-titulo"
            rows={1}
            value={titulo}
            readOnly={lixeira}
            maxLength={300}
            placeholder={t('caderno.sem_titulo')}
            onChange={(e) => {
              setTitulo(e.target.value)
              vivo.current.titulo = e.target.value
              agendar()
              e.target.style.height = 'auto'
              e.target.style.height = `${e.target.scrollHeight}px`
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                editor?.commands.focus('start')
              }
            }}
            ref={(el) => {
              if (el) {
                el.style.height = 'auto'
                el.style.height = `${el.scrollHeight}px`
              }
            }}
            className="w-full resize-none overflow-hidden bg-transparent text-[2rem] font-medium leading-tight tracking-[-0.02em] text-[var(--text)] outline-none placeholder:text-[var(--text-3)] sm:text-[2.375rem]"
            style={SERIF}
          />
          {!lixeira && editor && editor.isEmpty && !semModelo && (
            <SeletorModelosVazio
              tcd={nota.kind === 'tcd'}
              aoEscolher={(m) => aplicarModelo(m.doc, 'substituir')}
              aoComecar={() => {
                setSemModelo(true)
                editor.commands.focus('start')
              }}
            />
          )}
          <ReferenciasNoTexto className="mt-6" aoClicar={(codigo) => c.abrirPassagem(codigo)}>
            <div onClick={aoClicarNoCorpo}>
              <EditorContent editor={editor} />
            </div>
          </ReferenciasNoTexto>
          {nota.tags.length > 0 && (
            <ul className="mt-10 flex flex-wrap gap-1.5 border-t border-[var(--line)] pt-4" aria-label={t('caderno.tags')}>
              {nota.tags.map((tg) => (
                <li key={tg}>
                  <a href={hrefCaderno(c.orgslug, `?tag=${encodeURIComponent(tg)}`)} className="inline-flex min-h-8 items-center gap-1 rounded-full border border-[var(--line)] px-2.5 text-xs text-[var(--text-2)] hover:border-[var(--line-strong)] hover:text-[var(--text)]">
                    <Hash size={11} aria-hidden="true" />
                    {tg}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </article>
      </div>

      {!lixeira && editor && (
        <>
          <DialogoModelos
            aberto={dialogoModelos}
            aoMudar={setDialogoModelos}
            tcd={nota.kind === 'tcd'}
            notaVazia={editor.isEmpty}
            aoInserir={(doc) => aplicarModelo(doc, 'inserir')}
            aoSubstituir={(doc) => aplicarModelo(doc, 'substituir')}
          />
          <DialogoSalvarModelo
            aberto={salvarModelo}
            aoMudar={setSalvarModelo}
            doc={() => editor.getJSON() as NoTiptap}
            kind={nota.kind}
            nomeSugerido={titulo.trim() || t('caderno.sem_titulo')}
          />
        </>
      )}
      {!lixeira && (
        <DialogoCompartilhar
          nota={nota}
          aberto={compartilhar}
          aoMudar={setCompartilhar}
          aoAtualizar={async () => {
            try {
              const { obterNota } = await import('@services/caderno/notas')
              const n = await obterNota(nota.note_uuid, c.token)
              setNota((x) => ({ ...x, visibility: n.visibility, published_discussion_uuid: n.published_discussion_uuid, published_community_uuid: n.published_community_uuid }))
              c.invalidar()
            } catch {
              /* o selo atualiza na próxima carga */
            }
          }}
        />
      )}
    </div>
  )
}

export default EditorNota
