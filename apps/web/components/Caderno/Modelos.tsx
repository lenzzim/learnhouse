'use client'

import React, { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import { FileDashed, Sparkle, Trash, UserCircle } from '@phosphor-icons/react'
import { FolhaInferior } from '@components/Discipulei/Navegacao/FolhaInferior'
import { apagarModelo, criarModelo, listarModelos, type ModeloUsuario, type TipoNota } from '@services/caderno/notas'
import { MODELOS_PRONTOS, docDoModelo, lerDoc, type NoTiptap } from '@/lib/caderno/conteudo'
import { TIPO_DO_MODELO, type Propriedade } from '@/lib/caderno/propriedades'
import { useCaderno } from './CadernoContexto'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO, FOCO, ICONE_PEQUENO } from './estilos'

export interface OpcaoModelo {
  id: string
  nome: string
  descricao?: string
  doc: NoTiptap
  meu?: ModeloUsuario
  paraTcd?: boolean
  /** propriedades que o modelo preenche (ex.: tipo = Culto) */
  propriedades?: Propriedade[]
}

const chaveModelos = (orgId?: number) => ['caderno', 'modelos', orgId ?? 0] as const

/** Modelos prontos (i18n) + os da pessoa. Para o TCD, os de TCD vêm primeiro. */
export function useModelos(tcd: boolean) {
  const { t } = useTranslation()
  const c = useCaderno()
  const meus = useQuery({
    queryKey: chaveModelos(c.orgId),
    queryFn: () => listarModelos(c.orgId as number, c.token),
    enabled: c.autenticado && !!c.orgId && !!c.token,
    staleTime: 60_000,
  })
  const prontos: OpcaoModelo[] = MODELOS_PRONTOS.map((m) => {
    const secoes = t(`caderno.modelos.${m.id}.secoes`, { returnObjects: true }) as unknown
    return {
      id: `pronto:${m.id}`,
      nome: t(`caderno.modelos.${m.id}.nome`),
      descricao: t(`caderno.modelos.${m.id}.descricao`),
      doc: docDoModelo(Array.isArray(secoes) ? (secoes as string[]) : [], m.lista),
      paraTcd: m.paraTcd,
      propriedades: TIPO_DO_MODELO[m.id] ? [{ key: 'tipo', value: TIPO_DO_MODELO[m.id] }] : undefined,
    }
  })
  if (tcd) prontos.sort((a, b) => Number(!!b.paraTcd) - Number(!!a.paraTcd))
  const proprios: OpcaoModelo[] = (meus.data ?? []).map((m) => ({
    id: m.template_uuid,
    nome: m.name,
    doc: lerDoc(m.content_json),
    meu: m,
    propriedades: m.properties?.length ? m.properties : undefined,
  }))
  return { prontos, proprios, recarregar: meus.refetch }
}

/**
 * Seletor que aparece no editor quando a nota está vazia. "Começar do zero"
 * é o padrão: nada entra no texto sem a pessoa escolher.
 */
export function SeletorModelosVazio({
  tcd,
  tcdDeHoje = true,
  aoEscolher,
  aoComecar,
}: {
  tcd: boolean
  /** TCD de outro dia: o título não fala em "hoje". */
  tcdDeHoje?: boolean
  aoEscolher: (m: OpcaoModelo) => void
  aoComecar: () => void
}) {
  const { t } = useTranslation()
  const { prontos, proprios } = useModelos(tcd)
  const destaque = tcd ? prontos.filter((m) => m.paraTcd) : prontos.slice(0, 4)
  const [todos, setTodos] = useState(false)
  const lista = todos ? [...proprios, ...prontos] : [...proprios.slice(0, 2), ...destaque]

  return (
    <section aria-labelledby="modelos-vazio" className={`mt-6 rounded-2xl border border-[var(--line)] p-4 ${tcd ? 'bg-[var(--panel)]' : ''}`}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="modelos-vazio" className="caderno-secao text-sm font-medium text-[var(--text)]">
          {tcd ? t(tcdDeHoje ? 'caderno.modelo_tcd_titulo' : 'caderno.modelo_tcd_titulo_outro_dia') : t('caderno.usar_modelo')}
        </h2>
        <button type="button" onClick={aoComecar} className={`rounded text-sm font-medium text-[var(--text)] underline decoration-[var(--link-underline)] underline-offset-4 ${FOCO}`}>
          {t('caderno.comecar_do_zero')}
        </button>
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {lista.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => aoEscolher(m)}
              className={`flex w-full items-start gap-2.5 rounded-xl px-3 py-2.5 text-start transition-colors hover:bg-[var(--surface)] ${FOCO}`}
            >
              {m.meu ? (
                <UserCircle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--text-3)]" />
              ) : (
                <FileDashed size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-[var(--text-3)]" />
              )}
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[var(--text)]">{m.nome}</span>
                {m.descricao && <span className="block text-xs leading-snug text-[var(--text-2)]">{m.descricao}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!todos && prontos.length + proprios.length > lista.length && (
        <button type="button" onClick={() => setTodos(true)} className={`mt-2 rounded px-3 text-xs text-[var(--text-2)] underline decoration-[var(--link-underline)] underline-offset-2 hover:text-[var(--text)] ${FOCO}`}>
          {t('caderno.ver_todos_modelos')}
        </button>
      )}
    </section>
  )
}

/** Diálogo "Usar um modelo" (menu …): insere no cursor ou substitui tudo, com confirmação. */
export function DialogoModelos({
  aberto,
  aoMudar,
  tcd,
  notaVazia,
  aoInserir,
  aoSubstituir,
}: {
  aberto: boolean
  aoMudar: (v: boolean) => void
  tcd: boolean
  notaVazia: boolean
  aoInserir: (doc: NoTiptap, modelo?: OpcaoModelo) => void
  aoSubstituir: (doc: NoTiptap, modelo?: OpcaoModelo) => void
}) {
  const { t } = useTranslation()
  const c = useCaderno()
  const { prontos, proprios, recarregar } = useModelos(tcd)
  const [escolhido, setEscolhido] = useState<OpcaoModelo | null>(null)

  const fechar = (v: boolean) => {
    aoMudar(v)
    if (!v) setEscolhido(null)
  }
  const escolher = (m: OpcaoModelo) => {
    if (notaVazia) {
      aoSubstituir(m.doc, m)
      fechar(false)
    } else setEscolhido(m)
  }
  const apagar = async (m: OpcaoModelo) => {
    if (!m.meu || !window.confirm(t('caderno.confirmar_apagar_modelo', { nome: m.nome }))) return
    try {
      await apagarModelo(m.meu.template_uuid, c.token)
      recarregar()
    } catch {
      toast.error(t('caderno.erro_modelo'))
    }
  }

  const Item = ({ m }: { m: OpcaoModelo }) => (
    <li className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => escolher(m)}
        aria-pressed={escolhido?.id === m.id}
        className={`flex min-w-0 flex-1 items-start gap-2.5 rounded-xl px-3 py-2.5 text-start transition-colors ${FOCO} ${
          escolhido?.id === m.id ? 'bg-[var(--surface)]' : 'hover:bg-[var(--surface)]'
        }`}
      >
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[var(--text)]">{m.nome}</span>
          {m.descricao && <span className="block text-xs leading-snug text-[var(--text-2)]">{m.descricao}</span>}
        </span>
      </button>
      {m.meu && (
        <button type="button" onClick={() => apagar(m)} className={ICONE_PEQUENO} aria-label={t('caderno.apagar_modelo', { nome: m.nome })}>
          <Trash size={15} aria-hidden="true" />
        </button>
      )}
    </li>
  )

  return (
    <FolhaInferior aberta={aberto} aoMudar={fechar} titulo={t('caderno.usar_modelo')} descricao={t('caderno.usar_modelo_descricao')} larguraDesktop="md">
      {escolhido ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-[var(--text)]">{t('caderno.modelo_como', { nome: escolhido.nome })}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" className={`${BOTAO_PRIMARIO} min-h-11 flex-1 px-4 text-sm`} onClick={() => { aoInserir(escolhido.doc, escolhido); fechar(false) }}>
              {t('caderno.inserir_no_cursor')}
            </button>
            <button
              type="button"
              className={`${BOTAO_SECUNDARIO} min-h-11 flex-1 px-4 text-sm`}
              onClick={() => {
                if (!window.confirm(t('caderno.confirmar_substituir'))) return
                aoSubstituir(escolhido.doc, escolhido)
                fechar(false)
              }}
            >
              {t('caderno.substituir_tudo')}
            </button>
          </div>
          <button type="button" onClick={() => setEscolhido(null)} className={`self-start rounded text-sm text-[var(--text-2)] underline underline-offset-2 ${FOCO}`}>
            {t('caderno.voltar')}
          </button>
        </div>
      ) : (
        <div className="flex max-h-[60dvh] flex-col gap-4 overflow-y-auto">
          {proprios.length > 0 && (
            <section>
              <h3 className="caderno-secao mb-1 px-3 text-xs font-medium text-[var(--text-3)]">{t('caderno.meus_modelos')}</h3>
              <ul className="flex flex-col">{proprios.map((m) => <Item key={m.id} m={m} />)}</ul>
            </section>
          )}
          <section>
            <h3 className="caderno-secao mb-1 flex items-center gap-1.5 px-3 text-xs font-medium text-[var(--text-3)]">
              <Sparkle size={12} aria-hidden="true" />
              {t('caderno.modelos_prontos')}
            </h3>
            <ul className="flex flex-col">{prontos.map((m) => <Item key={m.id} m={m} />)}</ul>
          </section>
        </div>
      )}
    </FolhaInferior>
  )
}

/** "Salvar como modelo": guarda a estrutura da nota atual (privado à pessoa). */
export function DialogoSalvarModelo({
  aberto,
  aoMudar,
  doc,
  kind,
  nomeSugerido,
  propriedades,
}: {
  aberto: boolean
  aoMudar: (v: boolean) => void
  doc: () => NoTiptap
  kind: TipoNota
  nomeSugerido: string
  /** propriedades da nota (a data não vai para o modelo) */
  propriedades?: () => Propriedade[]
}) {
  const { t } = useTranslation()
  const c = useCaderno()
  const [nome, setNome] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    const n = (nome || nomeSugerido).trim().slice(0, 120)
    if (!n || !c.orgId) return
    setOcupado(true)
    try {
      const props = (propriedades?.() ?? []).filter((p) => p.key.toLowerCase() !== 'data')
      await criarModelo({ org_id: c.orgId, name: n, content_json: JSON.stringify(doc()), kind, properties: props }, c.token)
      c.invalidar()
      toast.success(t('caderno.modelo_salvo'))
      aoMudar(false)
      setNome('')
    } catch (err: any) {
      toast.error(err?.status === 409 ? t('caderno.erro_modelo_limite') : t('caderno.erro_modelo'))
    } finally {
      setOcupado(false)
    }
  }
  return (
    <FolhaInferior aberta={aberto} aoMudar={aoMudar} titulo={t('caderno.salvar_como_modelo')} descricao={t('caderno.salvar_como_modelo_descricao')}>
      <form onSubmit={salvar} className="flex flex-col gap-3">
        <label htmlFor="nome-modelo" className="text-sm font-medium text-[var(--text)]">{t('caderno.nome_modelo')}</label>
        <input id="nome-modelo" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={nomeSugerido} maxLength={120} className={`${CAMPO} h-11`} autoFocus />
        <button type="submit" disabled={ocupado} className={`${BOTAO_PRIMARIO} min-h-11 text-sm disabled:opacity-60`}>
          {t('caderno.salvar_modelo')}
        </button>
      </form>
    </FolhaInferior>
  )
}
