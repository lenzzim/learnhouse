'use client'

import React from 'react'
import { useTranslation } from 'react-i18next'
import { useEditorState, type Editor } from '@tiptap/react'
import {
  ArrowUUpLeft,
  ArrowUUpRight,
  BracketsSquare,
  CheckSquare,
  Hash,
  Highlighter,
  ImageSquare,
  ListBullets,
  ListNumbers,
  Question,
  Quotes,
  Table,
  TextAUnderline,
  TextB,
  TextHFour,
  TextHThree,
  TextHTwo,
  TextItalic,
} from '@phosphor-icons/react'
import { BotaoInserirVersiculo } from '@components/Biblia/BotaoInserirVersiculo'
import { corValida, type Cor } from '@/lib/caderno/cores'
import { abrirMenuComandos } from './barraComandos'
import { MenuCores } from './MenuCores'
import { FOCO } from '../estilos'

/**
 * Barra de formatação do Caderno (itens 1.2 e 1.4 do plano de 23/11/2026).
 *
 * - Celular e tablet (< 1024 px): duas linhas fixas. **Texto** (desfazer,
 *   refazer, negrito, itálico, marca-texto, cor, H2–H4, listas, tarefa,
 *   citação; rola de lado se não couber) e **Inserir** (Bíblia, ligação,
 *   tag, "/", imagem, tabela). Alvos de 44 px; a Bíblia tem rótulo e fica
 *   longe da # (o toque errado entre as duas era o problema relatado).
 * - Computador: uma linha só, grupos separados por divisores.
 *
 * O estado dos botões vem de useEditorState: a barra só re-renderiza quando
 * algo que ela mostra muda (não a cada tecla, como antes, quando o editor
 * inteiro re-renderizava em toda transação).
 */

const ALVO = `inline-flex h-11 min-w-11 shrink-0 items-center justify-center rounded-md transition-colors lg:h-9 lg:min-w-9 ${FOCO}`
const INATIVO = 'text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)]'
const ATIVO = 'bg-[var(--surface)] text-[var(--text)]'

function Botao({
  onClick,
  ativo,
  rotulo,
  desativado,
  children,
}: {
  onClick: () => void
  ativo?: boolean
  rotulo: string
  desativado?: boolean
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
      disabled={desativado}
      className={`${ALVO} ${ativo ? ATIVO : INATIVO} disabled:pointer-events-none disabled:opacity-35`}
    >
      {children}
    </button>
  )
}

const Divisor = () => <span className="mx-1 hidden h-5 w-px shrink-0 bg-[var(--line)] lg:block" aria-hidden="true" />

export function BarraFormatacao({
  editor,
  sinalVersiculo,
  sinalCor,
  aoAbrirGuia,
  aoInserirImagem,
}: {
  editor: Editor
  sinalVersiculo: number
  sinalCor: number
  aoAbrirGuia: () => void
  aoInserirImagem: () => void
}) {
  const { t } = useTranslation()
  const s = useEditorState({
    editor,
    selector: ({ editor: ed }) => ({
      desfazer: ed.can().undo(),
      refazer: ed.can().redo(),
      negrito: ed.isActive('bold'),
      italico: ed.isActive('italic'),
      marca: ed.isActive('highlight') ? corValida(ed.getAttributes('highlight').cor) ?? 'verde' : null,
      cor: ed.isActive('corTexto') ? corValida(ed.getAttributes('corTexto').cor) : null,
      h2: ed.isActive('heading', { level: 2 }),
      h3: ed.isActive('heading', { level: 3 }),
      h4: ed.isActive('heading', { level: 4 }),
      lista: ed.isActive('bulletList'),
      numerada: ed.isActive('orderedList'),
      tarefas: ed.isActive('taskList'),
      citacao: ed.isActive('blockquote'),
      tabela: ed.isActive('table'),
    }),
  })
  const c = () => editor.chain().focus()
  const icone = 17

  const marcar = (cor: Cor | null) => (cor ? c().setMarcaTexto(cor).run() : c().unsetMarcaTexto().run())
  const colorir = (cor: Cor | null) => (cor ? c().setCorTexto(cor).run() : c().unsetCorTexto().run())

  return (
    <div
      role="toolbar"
      aria-label={t('caderno.formatacao')}
      className="flex flex-col border-b border-[var(--line)] lg:flex-row lg:items-center lg:gap-0.5 lg:overflow-x-auto lg:px-3 lg:py-1 lg:[scrollbar-width:none]"
    >
      {/* Linha Texto */}
      <div
        role="group"
        aria-label={t('caderno_editor.barra_texto')}
        className="flex items-center gap-0.5 overflow-x-auto px-2 py-0.5 [scrollbar-width:none] lg:contents"
      >
        <Botao rotulo={t('caderno_editor.desfazer')} desativado={!s.desfazer} onClick={() => c().undo().run()}>
          <ArrowUUpLeft size={icone} aria-hidden="true" />
        </Botao>
        <Botao rotulo={t('caderno_editor.refazer')} desativado={!s.refazer} onClick={() => c().redo().run()}>
          <ArrowUUpRight size={icone} aria-hidden="true" />
        </Botao>
        <Divisor />
        <Botao rotulo={t('caderno.negrito')} ativo={s.negrito} onClick={() => c().toggleBold().run()}>
          <TextB size={icone} aria-hidden="true" />
        </Botao>
        <Botao rotulo={t('caderno.italico')} ativo={s.italico} onClick={() => c().toggleItalic().run()}>
          <TextItalic size={icone} aria-hidden="true" />
        </Botao>
        <MenuCores
          tipo="marca"
          ativa={s.marca}
          aoEscolher={marcar}
          rotulo={t('caderno_editor.cmd.marca_texto')}
          icone={<Highlighter size={icone} aria-hidden="true" />}
          classeBotao={`${ALVO} ${INATIVO}`}
        />
        <MenuCores
          tipo="cor"
          ativa={s.cor}
          aoEscolher={colorir}
          rotulo={t('caderno_editor.cmd.cor_texto')}
          icone={<TextAUnderline size={icone} aria-hidden="true" />}
          abrirSinal={sinalCor}
          classeBotao={`${ALVO} ${INATIVO}`}
        />
        <Divisor />
        <Botao rotulo={t('caderno.titulo_2')} ativo={s.h2} onClick={() => c().toggleHeading({ level: 2 }).run()}>
          <TextHTwo size={icone} aria-hidden="true" />
        </Botao>
        <Botao rotulo={t('caderno.titulo_3')} ativo={s.h3} onClick={() => c().toggleHeading({ level: 3 }).run()}>
          <TextHThree size={icone} aria-hidden="true" />
        </Botao>
        <Botao rotulo={t('caderno.titulo_4')} ativo={s.h4} onClick={() => c().toggleHeading({ level: 4 }).run()}>
          <TextHFour size={icone} aria-hidden="true" />
        </Botao>
        <Divisor />
        <Botao rotulo={t('caderno.lista')} ativo={s.lista} onClick={() => c().toggleBulletList().run()}>
          <ListBullets size={icone} aria-hidden="true" />
        </Botao>
        <Botao rotulo={t('caderno.lista_numerada')} ativo={s.numerada} onClick={() => c().toggleOrderedList().run()}>
          <ListNumbers size={icone} aria-hidden="true" />
        </Botao>
        <Botao rotulo={t('caderno_editor.cmd.tarefas')} ativo={s.tarefas} onClick={() => c().toggleTaskList().run()}>
          <CheckSquare size={icone} aria-hidden="true" />
        </Botao>
        <Botao rotulo={t('caderno.citacao')} ativo={s.citacao} onClick={() => c().toggleBlockquote().run()}>
          <Quotes size={icone} aria-hidden="true" />
        </Botao>
      </div>

      <Divisor />

      {/* Linha Inserir */}
      <div
        role="group"
        aria-label={t('caderno_editor.barra_inserir')}
        className="flex items-center gap-0.5 overflow-x-auto border-t border-[var(--line-2)] px-2 py-0.5 [scrollbar-width:none] lg:contents"
      >
        <div className="caderno-inserir-versiculo shrink-0 me-3 lg:me-0">
          <BotaoInserirVersiculo
            editor={editor}
            abrirSinal={sinalVersiculo}
            rotuloVisivel={t('caderno_editor.biblia_curto')}
            classeBotao={`${ALVO} ${INATIVO} gap-1.5 px-2.5 text-sm`}
          />
        </div>
        <Botao rotulo={t('caderno.inserir_ligacao')} onClick={() => c().insertContent('[[').run()}>
          <BracketsSquare size={icone} aria-hidden="true" />
        </Botao>
        <Botao rotulo={t('caderno.inserir_tag')} onClick={() => c().insertContent(' #').run()}>
          <Hash size={icone} aria-hidden="true" />
        </Botao>
        {/* Atalho visível para o menu "/" (no celular digitar "/" é menos óbvio). */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => abrirMenuComandos(editor)}
          aria-label={t('caderno_editor.abrir_menu')}
          title={t('caderno_editor.abrir_menu')}
          aria-haspopup="listbox"
          className={`${ALVO} ${INATIVO} font-mono text-base`}
        >
          <span aria-hidden="true">/</span>
        </button>
        <Botao rotulo={t('caderno_editor.cmd.imagem')} onClick={aoInserirImagem}>
          <ImageSquare size={icone} aria-hidden="true" />
        </Botao>
        <Botao rotulo={t('caderno_editor.cmd.tabela')} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
          <Table size={icone} aria-hidden="true" />
        </Botao>
        {s.tabela && (
          <>
            <span className="mx-1 h-5 w-px shrink-0 bg-[var(--line)]" aria-hidden="true" />
            {(
              [
                ['tabela_linha', () => c().addRowAfter().run()],
                ['tabela_coluna', () => c().addColumnAfter().run()],
                ['tabela_tirar_linha', () => c().deleteRow().run()],
                ['tabela_tirar_coluna', () => c().deleteColumn().run()],
                ['tabela_apagar', () => c().deleteTable().run()],
              ] as const
            ).map(([chave, f]) => (
              <button
                key={chave}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={f}
                className={`inline-flex h-11 shrink-0 items-center whitespace-nowrap rounded-md px-2 text-xs text-[var(--text-2)] hover:bg-[var(--surface)] hover:text-[var(--text)] lg:h-9 ${FOCO}`}
              >
                {t(`caderno_editor.${chave}`)}
              </button>
            ))}
          </>
        )}
        <span className="flex-1" />
        <Botao rotulo={t('caderno_editor.cmd.guia')} onClick={aoAbrirGuia}>
          <Question size={icone} aria-hidden="true" />
        </Botao>
      </div>
    </div>
  )
}

export default BarraFormatacao
