'use client'

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslation } from 'react-i18next'
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react'
import type { EditorProps } from '@tiptap/pm/view'
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
  ShareNetwork,
  SidebarSimple,
  Trash,
  ArrowCounterClockwise,
  Hash,
  CircleNotch,
  Warning,
  FileDashed,
  FloppyDisk,
  PencilSimple,
  Check,
} from '@phosphor-icons/react'
import { ReferenciasBiblicas } from '@components/Biblia/extensaoReferencias'
import { ReferenciasNoTexto } from '@components/Biblia/ReferenciasNoTexto'
import type { AcoesEdicao } from '@components/Biblia/PopoverVersiculo'
import { citacaoNoLugar, inserirCitacao, mencaoDoLink, trocarVersaoDaMencao } from '@components/Biblia/citarNoEditor'
import { blocoCitacao, textoDoBloco } from '@/lib/biblia/citacao'
import { codigoReferencia, encontrarReferencias } from '@/lib/biblia/referencias'
import {
  criarNota,
  enviarImagem,
  exportarMarkdown,
  idDaNota,
  IMAGEM_MAX_BYTES,
  listarNotas,
  listarPropriedades,
  listarTags,
  TIPOS_IMAGEM,
  urlAnexo,
  moverParaLixeira,
  resolverTitulo,
  restaurarNota,
  salvarNota,
  type Nota,
  type RefBiblica,
} from '@services/caderno/notas'
import { dataBR, dataLocal, lerDoc, pareceMarkdown, textoDoDoc, type NoTiptap } from '@/lib/caderno/conteudo'
import { markdownParaDocPublico } from '@/lib/caderno/importar'
import { COMANDOS, filtrarComandos, type IdComando } from '@/lib/caderno/comandos'
import { definirPropriedade, mesmasPropriedades, normalizarPropriedades, valorDe, type Propriedade } from '@/lib/caderno/propriedades'
import { useQuery } from '@tanstack/react-query'
import { DialogoModelos, DialogoSalvarModelo, SeletorModelosVazio, type OpcaoModelo } from './Modelos'
import { criarBarraComandos, type OpcoesBarraComandos } from './editor/barraComandos'
import { BarraFormatacao } from './editor/BarraFormatacao'
import { renderizadorMenuComandos } from './editor/MenuComandos'
import { extensoesConteudoCaderno } from './editor/extensoesConteudo'
import { podeRecuar, RecuoListas } from './editor/recuo'
import { consumirCitacaoPendente } from '@/lib/caderno/citacaoPendente'
import { criarCarregadorAnexos } from './editor/carregadorAnexos'
import { DialogoImagem, DialogoVideo } from './DialogosMidia'
import { BlocoPropriedades } from './Propriedades'
import { GuiaMarkdown } from './GuiaMarkdown'
import { useCaderno } from './CadernoContexto'
import { criarSugestoes, LigacoesETags, type FontesSugestao } from './editor/extensoes'
import type { ItemSugestao } from './editor/MenuSugestao'
import { DialogoCompartilhar } from './DialogoCompartilhar'
import { SeloVisibilidade } from './SeloVisibilidade'
import { opcoesColecoes, useColecoes } from './ArvoreColecoes'
import { hrefCaderno } from './PainelEsquerdo'
import { BOTAO_SECUNDARIO, CAMPO, FOCO, ICONE_CABECALHO, SERIF } from './estilos'

/** Comandos do menu "/" que fazem sentido onde está o cursor (recuo só numa lista). */
function comandosAplicaveis(editor: Editor | null) {
  return COMANDOS.filter((cmd) => {
    if (cmd.id === 'recuo_mais') return !!editor && podeRecuar(editor, 1)
    if (cmd.id === 'recuo_menos') return !!editor && podeRecuar(editor, -1)
    return true
  })
}

type Status = 'salvo' | 'salvando' | 'pendente' | 'offline' | 'erro'

const ATRASO_SALVAR = 1500
/** JSON que o TipTap produz para um documento vazio (um parágrafo vazio). */
const DOC_VAZIO_JSON = '{"type":"doc","content":[{"type":"paragraph"}]}'

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

/**
 * Indicador "Salvando…/Salvo" com LARGURA FIXA: antes ele mudava de largura a
 * cada troca de estado (e aparecia/sumia na nota nova), empurrando os botões
 * do cabeçalho enquanto a pessoa escrevia (item 1.5).
 */
function StatusSalvo({ status, oculto = false }: { status: Status; oculto?: boolean }) {
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
    <span
      role="status"
      aria-live="polite"
      className={`inline-flex w-6 shrink-0 items-center justify-end gap-1.5 overflow-hidden whitespace-nowrap text-xs text-[var(--text-3)] sm:w-[7.5rem] ${oculto ? 'invisible' : ''}`}
    >
      <span className="hidden truncate sm:inline">{texto}</span>
      <span className="sr-only sm:hidden">{texto}</span>
      <Icone size={14} aria-hidden="true" className={`shrink-0 ${girar ? 'animate-spin' : ''}`} />
    </span>
  )
}

export function EditorNota({
  notaInicial,
  aoCriar,
}: {
  notaInicial: Nota
  /** Nota ainda não salva (TCD em branco): cria no servidor no primeiro salvamento. */
  aoCriar?: () => Promise<Nota>
}) {
  const { t, i18n } = useTranslation()
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
  // Item 1.6: nota publicada na comunidade abre em LEITURA (mesmo visual, sem
  // barra); "Editar" liga a edição e "Concluir" volta. Nota não publicada e o
  // TCD do dia (ainda não salvo, sem publicação) continuam abrindo editáveis.
  const [lendo, setLendo] = useState(() => !!notaInicial.published_discussion_uuid)
  const somenteLeitura = lixeira || lendo
  const existe = !!nota.note_uuid
  // TCD de outro dia não fala em "hoje" (placeholder e seletor de modelos).
  const tcdDeHoje = notaInicial.kind === 'tcd' && notaInicial.tcd_date === dataLocal()

  // Estado vivo para o salvamento (evita closures velhas). `uuid` fica vazio até
  // uma nota não salva ser criada no primeiro salvamento.
  const vivo = useRef({
    titulo: notaInicial.title,
    uuid: notaInicial.note_uuid,
    /**
     * Documento (JSON) salvo no servidor: só mudança real em relação a ele agenda
     * salvamento. Começa com o content_json guardado (o editor produz exatamente a
     * mesma string) ou com o documento vazio canônico do TipTap.
     */
    ultimoJson: notaInicial.content_json?.trim() ? notaInicial.content_json : DOC_VAZIO_JSON,
    /** Propriedades atuais (tela) e as últimas gravadas no servidor. */
    propriedades: normalizarPropriedades(notaInicial.properties),
    ultimasPropriedades: normalizarPropriedades(notaInicial.properties),
    /** Criação em andamento de uma nota ainda não salva (TCD em branco). */
    criando: null as Promise<string> | null,
    pendente: false,
    salvando: false,
    timer: 0 as any,
    editor: null as Editor | null,
  })
  const [propriedades, setPropriedades] = useState<Propriedade[]>(() => normalizarPropriedades(notaInicial.properties))
  const [sinalPropriedade, setSinalPropriedade] = useState(0)
  const [sinalVersiculo, setSinalVersiculo] = useState(0)
  const [sinalCor, setSinalCor] = useState(0)
  const [imagemAberta, setImagemAberta] = useState(false)
  const [videoAberto, setVideoAberto] = useState(false)
  const [guiaAberto, setGuiaAberto] = useState(false)
  const usadas = useQuery({
    queryKey: ['caderno', 'propriedades', c.orgId ?? 0],
    queryFn: () => listarPropriedades(c.orgId as number, c.token),
    enabled: c.autenticado && !!c.orgId && !!c.token && !lixeira,
    staleTime: 60_000,
  })
  // Imagens privadas: buscadas com a sessão do dono e guardadas como blob:.
  const carregador = useMemo(() => criarCarregadorAnexos(urlAnexo.dono, () => ctxRef.current.token), []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => carregador.liberar(), [carregador])
  const ctxRef = useRef(c)
  useEffect(() => {
    ctxRef.current = c
  }, [c])
  // A pessoa já tocou na página depois de abrir a nota? (teclado, toque,
  // colar ou soltar). Antes disso nenhuma transação do editor salva.
  const interagiu = useRef(false)
  useEffect(() => {
    const marcar = () => {
      interagiu.current = true
    }
    const eventos = ['keydown', 'pointerdown', 'paste', 'drop', 'beforeinput'] as const
    for (const ev of eventos) window.addEventListener(ev, marcar, true)
    return () => {
      for (const ev of eventos) window.removeEventListener(ev, marcar, true)
    }
  }, [])
  const aoCriarRef = useRef(aoCriar)
  useEffect(() => {
    aoCriarRef.current = aoCriar
  }, [aoCriar])

  // Toda nota nasce vazia (inclusive o TCD): modelo só quando a pessoa escolhe.
  const docInicial = useMemo<NoTiptap>(() => lerDoc(notaInicial.content_json), [notaInicial.note_uuid]) // eslint-disable-line react-hooks/exhaustive-deps
  const [semModelo, setSemModelo] = useState(false)
  const [dialogoModelos, setDialogoModelos] = useState(false)
  const [salvarModelo, setSalvarModelo] = useState(false)

  /* ------------------------------------------------------ salvar */

  /** uuid da nota; cria no servidor se ainda não existe (uma vez só, mesmo com chamadas simultâneas). */
  const garantirUuid = useCallback(async (): Promise<string> => {
    const v = vivo.current
    if (v.uuid) return v.uuid
    if (!v.criando) {
      const criar = aoCriarRef.current
      if (!criar) throw new Error('nota sem uuid')
      v.criando = criar()
        .then((criada) => {
          v.uuid = criada.note_uuid
          setNota((n) => ({ ...n, ...criada }))
          const ed = v.editor
          if (ed) ctxRef.current.setNotaAberta({ note_uuid: v.uuid, title: v.titulo, doc: ed.getJSON() as NoTiptap })
          return v.uuid
        })
        .finally(() => {
          v.criando = null
        })
    }
    return v.criando
  }, [])

  const salvarAgora = useCallback(async () => {
    const v = vivo.current
    const ed = v.editor
    if (!ed || !v.pendente) return
    if (v.salvando) return // o término do salvamento atual reagenda
    // Nota ainda não criada e nada escrito (ou tudo apagado), título intacto: não cria.
    if (!v.uuid && ed.isEmpty && v.titulo.trim() === notaInicial.title.trim() && !v.propriedades.length) {
      v.pendente = false
      setStatus('salvo')
      return
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setStatus('offline')
      return
    }
    v.salvando = true
    v.pendente = false
    setStatus('salvando')
    try {
      if (!v.uuid) await garantirUuid()
      // JSON lido só agora: inclui o que foi digitado enquanto a nota era criada.
      const json = ed.getJSON() as NoTiptap
      const jsonTexto = JSON.stringify(json)
      const texto = textoDoDoc(json)
      const props = v.propriedades
      const mudouProps = !mesmasPropriedades(props, v.ultimasPropriedades)
      const salva = await salvarNota(
        v.uuid,
        {
          title: v.titulo.trim(),
          content_json: jsonTexto,
          bible_refs: refsDoTexto(texto),
          ...(mudouProps ? { properties: props } : {}),
        },
        ctxRef.current.token
      )
      v.ultimoJson = jsonTexto
      if (mudouProps) v.ultimasPropriedades = props
      // Só metadados: o conteúdo do editor nunca é reaplicado a partir da resposta.
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
  }, [garantirUuid]) // eslint-disable-line react-hooks/exhaustive-deps

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

  /* ------------------------------------------------- propriedades */

  const mudarPropriedades = useCallback(
    (lista: Propriedade[]) => {
      setPropriedades(lista)
      vivo.current.propriedades = normalizarPropriedades(lista)
      // só mudança de verdade agenda (abrir a nota nunca salva)
      if (!mesmasPropriedades(vivo.current.propriedades, vivo.current.ultimasPropriedades)) agendar()
    },
    [agendar]
  )

  /* ------------------------------------------------------ imagens */

  const enviarArquivos = useCallback(
    async (arquivos: File[], alt = '', pos?: number) => {
      const ed = vivo.current.editor
      const imagens = arquivos.filter((a) => TIPOS_IMAGEM.includes(a.type))
      if (!ed || !imagens.length) {
        if (arquivos.length) toast.error(t('caderno_editor.imagem_tipo_invalido'))
        return
      }
      const grandes = imagens.filter((a) => a.size > IMAGEM_MAX_BYTES)
      if (grandes.length) toast.error(t('caderno_editor.imagem_grande'))
      const validas = imagens.filter((a) => a.size <= IMAGEM_MAX_BYTES)
      if (!validas.length) return
      const aviso = toast.loading(t('caderno_editor.imagem_enviando'))
      try {
        const uuid = await garantirUuid()
        let onde = pos
        for (const arquivo of validas) {
          const anexo = await enviarImagem(uuid, arquivo, ctxRef.current.token)
          carregador.registrar(anexo.attachment_uuid, arquivo)
          const no = { type: 'image', attrs: { anexo: anexo.attachment_uuid, src: null, alt: alt.slice(0, 300) } }
          const ed2 = vivo.current.editor
          if (!ed2) break
          if (typeof onde === 'number') {
            ed2.chain().insertContentAt(onde, no).run()
            onde += 1
          } else {
            ed2.chain().focus().insertContent([no, { type: 'paragraph' }]).run()
          }
        }
        toast.success(t('caderno_editor.imagem_enviada'), { id: aviso })
      } catch (e: any) {
        const quota = e?.detail?.code === 'NOTE_MEDIA_QUOTA'
        const msg = quota
          ? 'caderno_editor.imagem_quota'
          : e?.status === 413
            ? 'caderno_editor.imagem_grande'
            : e?.status === 415
              ? 'caderno_editor.imagem_tipo_invalido'
              : 'caderno_editor.imagem_erro'
        toast.error(t(msg), { id: aviso })
      }
    },
    [carregador, garantirUuid, t]
  )
  const enviarRef = useRef(enviarArquivos)
  useEffect(() => {
    enviarRef.current = enviarArquivos
  }, [enviarArquivos])

  /* --------------------------------------------------- comandos "/" */

  const pedirComando = useCallback((id: IdComando) => {
    if (id === 'imagem') setImagemAberta(true)
    else if (id === 'video') setVideoAberto(true)
    else if (id === 'versiculo') setSinalVersiculo((n) => n + 1)
    else if (id === 'modelo') setDialogoModelos(true)
    else if (id === 'propriedade') setSinalPropriedade((n) => n + 1)
    else if (id === 'guia') setGuiaAberto(true)
    else if (id === 'cor_texto') setSinalCor((n) => n + 1)
  }, [])

  const opcoesComandos = useCallback(
    (): OpcoesBarraComandos => ({
      itens: (consulta) =>
        filtrarComandos(comandosAplicaveis(vivo.current.editor), consulta, (cmd) => t(`caderno_editor.cmd.${cmd.id}`)).map((cmd) => ({
          id: cmd.id,
          rotulo: t(`caderno_editor.cmd.${cmd.id}`),
          descricao: t(`caderno_editor.cmd_desc.${cmd.id}`),
          atalho: cmd.atalho,
        })),
      render: renderizadorMenuComandos(() => ({
        rotulo: t('caderno_editor.menu_rotulo'),
        vazio: t('caderno_editor.menu_vazio'),
        dica: t('caderno_editor.menu_dica'),
      })),
      aoPedir: (id) => pedirComando(id),
      dataDeHoje: () => {
        const hoje = dataLocal()
        return i18n.language?.startsWith('pt') ? dataBR(hoje) : new Date().toLocaleDateString(i18n.language || undefined)
      },
    }),
    [t, i18n.language, pedirComando]
  )
  const comandosRef = useRef(opcoesComandos)
  useEffect(() => {
    comandosRef.current = opcoesComandos
  }, [opcoesComandos])

  /* ------------------------------------------------------- editor */

  // Opções do editor estáveis (memo): com objetos novos a cada render, o
  // useEditor chamava editor.setOptions() em todo render, refazendo as props
  // do ProseMirror. Os textos vêm de tRef (idioma atual) e o resto de refs.
  const tRef = useRef(t)
  tRef.current = t
  const extensoes = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3, 4] },
        link: { openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } },
      }),
      Placeholder.configure({
        includeChildren: false,
        placeholder: ({ editor: ed, node, pos }) => {
          if (node.type.name === 'heading') return tRef.current('caderno.titulo_secao')
          if (node.type.name === 'paragraph') {
            const $pos = ed.state.doc.resolve(pos)
            const antes = $pos.depth === 0 && $pos.index(0) > 0 ? ed.state.doc.child($pos.index(0) - 1) : null
            if (antes?.type.name === 'heading') return tRef.current('caderno.escreva_aqui')
          }
          if (ed.state.doc.childCount <= 1) {
            if (notaInicial.kind !== 'tcd') return tRef.current('caderno_editor.placeholder_corpo')
            return tcdDeHoje ? tRef.current('caderno.placeholder_tcd') : tRef.current('caderno.placeholder_tcd_outro_dia')
          }
          return ''
        },
      }),
      ...extensoesConteudoCaderno({
        carregar: (anexo) => carregador.carregar(anexo),
        rotuloErroImagem: tRef.current('caderno_editor.imagem_indisponivel'),
        rotuloCaixaTarefa: tRef.current('caderno_editor.tarefa_concluida'),
      }),
      ReferenciasBiblicas,
      LigacoesETags,
      criarSugestoes(() => fontesRef.current()),
      criarBarraComandos(() => comandosRef.current()),
      RecuoListas,
    ],
    [] // eslint-disable-line react-hooks/exhaustive-deps
  )
  const propsEditor = useMemo<EditorProps>(
    () => ({
      attributes: {
        class: 'caderno-prosa',
        'aria-label': tRef.current('caderno.corpo_nota'),
        spellcheck: 'true',
        lang: 'pt-BR',
      },
      // Soltar imagens do computador: envia (privada) e insere onde caiu.
      handleDrop: (view, event, _slice, movido) => {
        const arquivos = Array.from((event as DragEvent).dataTransfer?.files ?? []).filter((a) => a.type.startsWith('image/'))
        if (movido || !arquivos.length || !view.editable) return false
        event.preventDefault()
        const pos = view.posAtCoords({ left: (event as DragEvent).clientX, top: (event as DragEvent).clientY })?.pos
        enviarRef.current(arquivos, '', pos)
        return true
      },
      // Colar markdown (sem HTML junto) converte a formatação; colar imagem envia.
      handlePaste: (_view, event) => {
        const dados = event.clipboardData
        const imagens = Array.from(dados?.files ?? []).filter((a) => a.type.startsWith('image/'))
        if (imagens.length) {
          event.preventDefault()
          enviarRef.current(imagens)
          return true
        }
        if (!dados || dados.getData('text/html')) return false
        const texto = dados.getData('text/plain')
        if (!pareceMarkdown(texto)) return false
        event.preventDefault()
        markdownParaDocPublico(texto)
          .then((doc) => vivo.current.editor?.chain().focus().insertContent((doc.content ?? []) as any).run())
          .catch(() => vivo.current.editor?.chain().focus().insertContent(texto).run())
        return true
      },
    }),
    [] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const editor = useEditor({
    immediatelyRender: false,
    // A tela NÃO re-renderiza a cada transação (cada tecla): isso refazia a
    // árvore React inteira da nota e, em cada commit, o React mede a seleção
    // do contenteditable focado percorrendo o DOM do editor (custo que cresce
    // com a nota). Quem precisa do estado do editor usa useEditorState.
    shouldRerenderOnTransaction: false,
    editable: !somenteLeitura,
    extensions: extensoes,
    content: docInicial as any,
    editorProps: propsEditor,
    // O editor dispara uma transação ao montar (antes até do evento create) sem
    // mudar o conteúdo: agendar nela re-salvava toda nota só de abrir
    // (updated_at mudava, a lista reordenava) e criava o TCD do dia só de
    // visitar. Só mudança real em relação ao salvo agenda.
    // Normalizações do próprio editor ao abrir (atributos padrão de um nó
    // importado, parágrafo final depois de tabela/imagem) também chegam aqui
    // antes de qualquer toque da pessoa: viram a nova base em vez de salvar.
    onUpdate: ({ editor: ed }) => {
      // Já há salvamento agendado depois de um toque: só reagenda (evita
      // serializar a nota inteira a cada tecla).
      if (interagiu.current && vivo.current.pendente) {
        agendar()
        return
      }
      const json = JSON.stringify(ed.getJSON())
      if (json === vivo.current.ultimoJson) return
      if (!interagiu.current) {
        vivo.current.ultimoJson = json
        return
      }
      agendar()
    },
  })

  useEffect(() => {
    vivo.current.editor = editor ?? null
  }, [editor])

  // Única leitura do estado do editor no corpo da tela: re-renderiza só
  // quando a nota passa de vazia a escrita (ou volta).
  const notaVazia = useEditorState({ editor, selector: ({ editor: ed }) => ed?.isEmpty ?? true }) ?? true

  useEffect(() => {
    editor?.setEditable(!somenteLeitura)
  }, [editor, somenteLeitura])

  // Sumário/backlinks do painel direito; passagem padrão = 1ª referência.
  const publicarAberta = useCallback(() => {
    if (!editor) return
    const doc = editor.getJSON() as NoTiptap
    ctxRef.current.setNotaAberta({ note_uuid: vivo.current.uuid, title: vivo.current.titulo, doc })
  }, [editor])

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

  // Painel Bíblia (computador): "Inserir na nota" põe a citação no cursor.
  useEffect(() => {
    if (!editor || somenteLeitura) return
    c.registrarInsercao((bloco) => inserirCitacao(editor, bloco as any))
    return () => c.registrarInsercao(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, somenteLeitura])

  // "Anotar" do leitor bíblico: a nota nova ou o TCD de hoje abre com as
  // citações da seleção no fim. Conta como edição da pessoa (salva normalmente;
  // o TCD ainda não salvo é criado no primeiro salvamento).
  useEffect(() => {
    if (!editor || somenteLeitura) return
    let armazenamento: Storage | null = null
    try {
      armazenamento = window.sessionStorage
    } catch {
      return
    }
    const pendente = consumirCitacaoPendente(armazenamento, {
      kind: notaInicial.kind,
      tcd_date: notaInicial.tcd_date,
      vazia: editor.isEmpty,
    })
    if (!pendente) return
    interagiu.current = true
    setSemModelo(true)
    const vazio = editor.isEmpty
    const fim = editor.state.doc.content.size
    editor
      .chain()
      .insertContentAt(vazio ? { from: 0, to: fim } : fim, [...pendente.blocos, { type: 'paragraph' }] as any)
      .focus('end')
      .run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

  // Pop-up de uma referência escrita na nota (item 2.3): "Inserir passagem
  // completa" (a menção vira citação no lugar) e "Trocar versão". A linha de
  // uma citação ("— João 3:16 (NVI)") já é citação: sem ações.
  const edicaoReferencia = useCallback(
    (ancora: HTMLAnchorElement): AcoesEdicao | undefined => {
      const ed = vivo.current.editor
      if (!ed || lixeira || !ed.isEditable || ancora.closest('blockquote')) return undefined
      if (!mencaoDoLink(ed, ancora)) return undefined
      return {
        inserirCompleta: ({ versao, versos, titulo }) => {
          const faixa = mencaoDoLink(ed, ancora)
          if (!faixa) return
          const licenciada = versao.fonte === 'licenciada'
          citacaoNoLugar(
            ed,
            faixa,
            blocoCitacao({ referencia: titulo, sigla: versao.sigla, licenciada, texto: licenciada ? undefined : textoDoBloco(versos) })
          )
        },
        trocarVersao: (versao) => {
          const faixa = mencaoDoLink(ed, ancora)
          if (faixa) trocarVersaoDaMencao(ed, faixa, versao.sigla)
        },
      }
    },
    [lixeira]
  )

  // Sumário → rolar até o heading.
  useEffect(() => {
    if (!editor) return
    c.registrarIrParaTitulo((i) => {
      const hs = editor.view.dom.querySelectorAll('h1, h2, h3, h4')
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

  // Sem isto, o mousedown põe o cursor dentro de "[[...]]", a sugestão redecora o
  // link antes do mouseup e o navegador não dispara o click (o alvo some da árvore).
  // Com defaultPrevented o ProseMirror ignora o evento e o cursor fica onde estava.
  const aoPressionarNoCorpo = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    if ((e.target as HTMLElement).closest('a[data-nota-titulo], a[data-nota-tag]')) e.preventDefault()
  }

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

  const aplicarModelo = (doc: NoTiptap, modo: 'substituir' | 'inserir', modelo?: OpcaoModelo) => {
    if (!editor) return
    if (modo === 'substituir') editor.chain().setContent(doc as any).focus('end').run()
    else editor.chain().focus().insertContent((doc.content ?? []) as any).run()
    setSemModelo(true)
    // O modelo pode preencher propriedades (ex.: tipo = Culto) que ainda não existem.
    let props = vivo.current.propriedades
    for (const p of modelo?.propriedades ?? []) {
      if (!valorDe(props, p.key)) props = definirPropriedade(props, p.key, p.value)
    }
    if (!mesmasPropriedades(props, vivo.current.propriedades)) mudarPropriedades(props)
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
          className={`${ICONE_CABECALHO} lg:hidden`}
          onClick={() => c.setEsquerdaAberta(true)}
          aria-label={t('caderno.abrir_navegacao')}
        >
          <SidebarSimple size={18} aria-hidden="true" />
        </button>
        {c.direitaAberta && (
          <span className="hidden lg:block min-[1440px]:hidden">
            <button
              type="button"
              className={ICONE_CABECALHO}
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
          {existe && <SeloVisibilidade visibilidade={nota.visibility} compacto onClick={lixeira ? undefined : () => setCompartilhar(true)} />}
        </div>
        <StatusSalvo status={status} oculto={!existe && status === 'salvo'} />
        {existe && !lixeira && nota.published_discussion_uuid && (
          <button
            type="button"
            onClick={async () => {
              if (lendo) {
                setLendo(false)
                window.setTimeout(() => editor?.commands.focus('end'), 0)
              } else {
                if (vivo.current.pendente) await salvarAgora()
                setLendo(true)
              }
            }}
            aria-pressed={!lendo}
            className={`${BOTAO_SECUNDARIO} ms-1 min-h-11 px-3 text-sm lg:min-h-9`}
          >
            {lendo ? <PencilSimple size={16} aria-hidden="true" /> : <Check size={16} aria-hidden="true" />}
            <span>{lendo ? t('caderno.editar_nota') : t('caderno.concluir_edicao')}</span>
          </button>
        )}
        {existe && !lixeira && (
          <button
            type="button"
            onClick={() => setCompartilhar(true)}
            className={`${BOTAO_SECUNDARIO} ms-1 min-h-11 px-3 text-sm lg:min-h-9`}
          >
            <ShareNetwork size={16} aria-hidden="true" />
            <span className="hidden sm:inline">{t('caderno.compartilhar')}</span>
          </button>
        )}
        {existe && (
        <div className="relative" data-menu-nota>
          <button
            type="button"
            className={ICONE_CABECALHO}
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
        )}
        <button
          type="button"
          className={`${ICONE_CABECALHO} ${c.direitaAberta ? 'bg-[var(--surface)] text-[var(--text)]' : ''}`}
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

      {/* Barra de formatação: duas linhas no celular, uma no computador */}
      {!somenteLeitura && editor && (
        <BarraFormatacao
          editor={editor}
          sinalVersiculo={sinalVersiculo}
          sinalCor={sinalCor}
          aoAbrirGuia={() => setGuiaAberto(true)}
          aoInserirImagem={() => setImagemAberta(true)}
        />
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
            readOnly={somenteLeitura}
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
          <BlocoPropriedades
            propriedades={propriedades}
            aoMudar={mudarPropriedades}
            usados={usadas.data ?? []}
            somenteLeitura={somenteLeitura}
            sinalAdicionar={sinalPropriedade}
          />
          {!somenteLeitura && editor && notaVazia && !semModelo && (
            <SeletorModelosVazio
              tcd={nota.kind === 'tcd'}
              tcdDeHoje={tcdDeHoje}
              aoEscolher={(m) => aplicarModelo(m.doc, 'substituir', m)}
              aoComecar={() => {
                setSemModelo(true)
                editor.commands.focus('start')
              }}
            />
          )}
          <ReferenciasNoTexto
            className="mt-6"
            aoClicar={(codigo, versao) => c.abrirPassagem(codigo, 'biblia', versao)}
            edicao={edicaoReferencia}
          >
            <div onMouseDownCapture={aoPressionarNoCorpo} onClick={aoClicarNoCorpo}>
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
            notaVazia={notaVazia}
            aoInserir={(doc, m) => aplicarModelo(doc, 'inserir', m)}
            aoSubstituir={(doc, m) => aplicarModelo(doc, 'substituir', m)}
          />
          <DialogoSalvarModelo
            aberto={salvarModelo}
            aoMudar={setSalvarModelo}
            doc={() => editor.getJSON() as NoTiptap}
            kind={nota.kind}
            nomeSugerido={titulo.trim() || t('caderno.sem_titulo')}
            propriedades={() => vivo.current.propriedades}
          />
          <DialogoImagem
            aberto={imagemAberta}
            aoMudar={setImagemAberta}
            aoEnviar={(arquivos, alt) => enviarArquivos(arquivos, alt)}
            aoInserirLink={(url, alt) => editor.chain().focus().inserirImagem({ src: url, alt }).run()}
          />
          <DialogoVideo
            aberto={videoAberto}
            aoMudar={setVideoAberto}
            aoInserir={(v) => {
              const ch = editor.chain().focus()
              if (v.tipo === 'youtube') ch.insertContent([{ type: 'youtube', attrs: { src: v.url, start: v.inicio ?? 0 } }, { type: 'paragraph' }]).run()
              else ch.inserirVimeo({ id: v.id, hash: v.hash ?? null }).run()
            }}
          />
          <GuiaMarkdown aberto={guiaAberto} aoMudar={setGuiaAberto} />
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
