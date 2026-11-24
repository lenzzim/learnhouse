'use client'

import React, { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image as IconeImagem, LockSimple, Play } from '@phosphor-icons/react'
import { FolhaInferior } from '@components/Discipulei/Navegacao/FolhaInferior'
import { ATALHOS_TECLADO, GUIA, teclasLegiveis, type ExemploGuia, type NivelGuia, type Previa } from '@/lib/caderno/guia'

/** Desenho P&B do resultado de cada exemplo (mesmas classes do editor). */
function Resultado({ previa, amostra }: { previa: Previa; amostra?: string }) {
  const { t } = useTranslation()
  const a = amostra ?? ''
  switch (previa) {
    case 'h1':
      return <h1 className="text-[1.4rem]">{a}</h1>
    case 'h2':
      return <h2 className="text-[1.2rem]">{a}</h2>
    case 'h3':
      return <h3 className="text-[1.05rem]">{a}</h3>
    case 'h4':
      return <h4>{a}</h4>
    case 'negrito':
      return <p><strong>{a}</strong></p>
    case 'italico':
      return <p><em>{a}</em></p>
    case 'riscado':
      return <p><s>{a}</s></p>
    case 'sublinhado':
      return <p><u>{a}</u></p>
    case 'codigo':
      return <p><code>{a}</code></p>
    case 'marca':
      return <p><mark className="caderno-marca" data-cor="verde">{a}</mark></p>
    case 'cor':
      return <p><span className="caderno-cor" data-cor="azul">{a}</span></p>
    case 'lista':
      return <ul><li>{a}</li></ul>
    case 'numerada':
      return <ol><li>{a}</li></ol>
    case 'recuo_mais':
      return <ul><li>{t('caderno_editor.guia.amostra_recuo_pai')}<ul><li>{a}</li></ul></li></ul>
    case 'recuo_menos':
      return <ul><li>{t('caderno_editor.guia.amostra_recuo_pai')}</li><li>{a}</li></ul>
    case 'tarefa':
    case 'tarefa_feita':
      return (
        <ul data-type="taskList" className="caderno-tarefas">
          <li data-type="taskItem" data-checked={previa === 'tarefa_feita' ? 'true' : 'false'}>
            <label><input type="checkbox" checked={previa === 'tarefa_feita'} readOnly tabIndex={-1} aria-hidden="true" /></label>
            <div><p>{a}</p></div>
          </li>
        </ul>
      )
    case 'citacao':
      return <blockquote><p>{a}</p></blockquote>
    case 'destaque':
      return <aside className="caderno-destaque" data-type="callout"><p>{a}</p></aside>
    case 'divisor':
      return <hr className="!my-3" />
    case 'bloco_codigo':
      return <pre><code>{t('caderno_editor.guia.amostra_codigo')}</code></pre>
    case 'ligacao':
      return <p><span className="nota-ligacao-previa">{a}</span></p>
    case 'tag':
      return <p><span className="nota-tag-previa">#{a}</span></p>
    case 'referencia':
    case 'referencia_versao':
      return <p><span className="underline decoration-[var(--link-underline)] underline-offset-4">{a}</span></p>
    case 'imagem':
      return (
        <div className="flex h-14 items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-xs text-[var(--text-3)]">
          <IconeImagem size={16} aria-hidden="true" />
          {t('caderno_editor.cmd.imagem')}
        </div>
      )
    case 'video':
      return (
        <div className="flex h-14 items-center justify-center gap-1.5 rounded-lg border border-[var(--line)] bg-[var(--surface)] text-xs text-[var(--text-3)]">
          <Play size={16} aria-hidden="true" />
          YouTube · Vimeo
        </div>
      )
    case 'tabela':
      return (
        <table className="caderno-tabela">
          <tbody>
            <tr><th>A</th><th>B</th></tr>
            <tr><td>1</td><td>2</td></tr>
          </tbody>
        </table>
      )
    case 'propriedades':
      return (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 font-sans text-xs">
          <dt className="text-[var(--text-3)]">{t('caderno_editor.prop.chave.tipo')}</dt>
          <dd>Culto</dd>
          <dt className="text-[var(--text-3)]">{t('caderno_editor.prop.chave.livro')}</dt>
          <dd>João</dd>
        </dl>
      )
    case 'menu':
      return <p className="font-sans text-xs text-[var(--text-2)]">{t('caderno_editor.guia.abre_menu')}</p>
    case 'quebra':
      return <p>{t('caderno_editor.guia.amostra_quebra_1')}<br />{t('caderno_editor.guia.amostra_quebra_2')}</p>
    case 'desfazer':
      return <p className="font-sans text-xs text-[var(--text-2)]">{t('caderno_editor.guia.desfaz')}</p>
    case 'refazer':
      return <p className="font-sans text-xs text-[var(--text-2)]">{t('caderno_editor.guia.refaz')}</p>
    default:
      return null
  }
}

function Linha({ ex, mac }: { ex: ExemploGuia; mac: boolean }) {
  const { t } = useTranslation()
  const tecla = ex.verificar.tipo === 'atalho'
  return (
    <li className="border-t border-[var(--line)] py-3 first:border-t-0">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-3">
        <div className="min-w-0">
          <span className="sr-only">{t('caderno_editor.guia.digite')}</span>
          <code className="inline-block max-w-full whitespace-pre-wrap break-words rounded-md border border-[var(--line)] bg-[var(--page)] px-2 py-1 font-mono text-[0.8rem] text-[var(--text)]">
            {tecla ? teclasLegiveis(ex.digitar, mac) : (ex.mostrar ?? ex.digitar.trim())}
          </code>
        </div>
        <div className="caderno-prosa guia-previa min-w-0" aria-hidden="true">
          <Resultado previa={ex.previa} amostra={ex.amostra} />
        </div>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-2)]">{t(`caderno_editor.guia.ex.${ex.id}`)}</p>
    </li>
  )
}

const NIVEIS: NivelGuia[] = ['basico', 'intermediario', 'avancado']

/**
 * Guia de Markdown do Caderno: do básico ao avançado, só com o que o editor
 * faz de verdade (os exemplos são testados contra o editor em
 * components/Caderno/editor/editor.test.mjs). Abre pelo botão "?" da barra e
 * pelo comando "/guia".
 */
export function GuiaMarkdown({ aberto, aoMudar }: { aberto: boolean; aoMudar: (v: boolean) => void }) {
  const { t } = useTranslation()
  const [mac, setMac] = useState(false)
  useEffect(() => {
    setMac(typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent))
  }, [])

  return (
    <FolhaInferior aberta={aberto} aoMudar={aoMudar} titulo={t('caderno_editor.cmd.guia')} descricao={t('caderno_editor.guia.descricao')} larguraDesktop="md">
      <div className="flex max-h-[68dvh] flex-col gap-6 overflow-y-auto overscroll-contain pe-1">
        <div className="grid grid-cols-2 gap-3 border-b border-[var(--line)] pb-2 text-xs font-medium text-[var(--text-3)]" aria-hidden="true">
          <span>{t('caderno_editor.guia.digite')}</span>
          <span>{t('caderno_editor.guia.resultado')}</span>
        </div>
        {NIVEIS.map((nivel) => (
          <section key={nivel} aria-labelledby={`guia-${nivel}`}>
            <h3 id={`guia-${nivel}`} className="caderno-secao mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">
              {t(`caderno_editor.guia.nivel.${nivel}`)}
            </h3>
            {GUIA.filter((s) => s.nivel === nivel).map((s) => (
              <div key={s.id} className="mb-3">
                <h4 className="text-base text-[var(--text)]" style={{ fontFamily: 'var(--font-serif), Georgia, serif' }}>
                  {t(`caderno_editor.guia.secao.${s.id}`)}
                </h4>
                <ul>{s.exemplos.map((ex) => <Linha key={ex.id} ex={ex} mac={mac} />)}</ul>
              </div>
            ))}
          </section>
        ))}
        <section aria-labelledby="guia-teclas">
          <h3 id="guia-teclas" className="caderno-secao mb-1 text-xs font-medium uppercase tracking-wide text-[var(--text-3)]">
            {t('caderno_editor.guia.secao.teclado')}
          </h3>
          <ul>{ATALHOS_TECLADO.map((ex) => <Linha key={ex.id} ex={ex} mac={mac} />)}</ul>
        </section>
        <section className="rounded-xl border border-[var(--line)] p-3 text-xs leading-relaxed text-[var(--text-2)]">
          <p className="mb-1.5 font-medium text-[var(--text)]">{t('caderno_editor.guia.secao.saiba')}</p>
          <p>{t('caderno_editor.guia.backlinks')}</p>
          <p className="mt-1.5">{t('caderno_editor.guia.propriedades')}</p>
          <p className="mt-1.5 flex items-start gap-1.5">
            <LockSimple size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
            {t('caderno_editor.guia.privacidade_imagens')}
          </p>
          <p className="mt-1.5">{t('caderno_editor.guia.exportar')}</p>
        </section>
      </div>
    </FolhaInferior>
  )
}
