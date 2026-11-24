'use client'

/**
 * Criar ou editar um bate-papo (só admins e grupo de autores; o servidor
 * confere). A data e a hora são as do fuso escolhido; o servidor converte.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { useDadosNav } from '@components/Discipulei/Navegacao/useDadosNav'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, FOCO } from '@components/Discipulei/Navegacao/estilos'
import {
  criarBatePapo,
  editarBatePapo,
  type BatePapo,
  type NovoBatePapo,
} from '@services/communities/batepapos'
import { fusoDoNavegador } from './comum'

const FUSOS_COMUNS = [
  'America/Sao_Paulo',
  'America/Manaus',
  'America/Fortaleza',
  'America/Noronha',
  'America/Rio_Branco',
  'Europe/Lisbon',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Madrid',
  'Asia/Tokyo',
  'UTC',
]

const DURACOES = [30, 45, 60, 90, 120]

const CAMPO =
  'mt-1 block w-full min-h-11 rounded-lg border border-[var(--line-strong)] bg-[var(--page)] px-3 text-sm text-[var(--text)] ' +
  FOCO

/** "2026-12-01T23:00:00+00:00" -> "2026-12-01T20:00" no fuso dado (para o input). */
function paraInputLocal(iso: string, timeZone: string): string {
  try {
    const partes = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(iso))
    const p = (tipo: string) => partes.find((x) => x.type === tipo)?.value ?? '00'
    return `${p('year')}-${p('month')}-${p('day')}T${p('hour')}:${p('minute')}`
  } catch {
    return ''
  }
}

export function FormularioEvento({
  inicial,
  aoSalvar,
  aoCancelar,
}: {
  inicial?: BatePapo | null
  aoSalvar: (ev: BatePapo) => void
  aoCancelar: () => void
}) {
  const { t } = useTranslation()
  const { orgId, token, comunidades } = useDadosNav()
  const editando = !!inicial

  const [titulo, setTitulo] = useState(inicial?.title ?? '')
  const [tema, setTema] = useState(inicial?.theme ?? '')
  const [descricao, setDescricao] = useState(inicial?.description ?? '')
  const [fuso, setFuso] = useState(inicial?.timezone ?? 'America/Sao_Paulo')
  const [quando, setQuando] = useState(inicial ? paraInputLocal(inicial.starts_at, inicial.timezone) : '')
  const [duracao, setDuracao] = useState<number>(inicial?.duration_minutes ?? 60)
  const [link, setLink] = useState(inicial?.meeting_url ?? '')
  const [conduz, setConduz] = useState(inicial?.host_name ?? '')
  const [passagens, setPassagens] = useState(inicial?.passages ?? '')
  const [divulgar, setDivulgar] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [fusoNavegador, setFusoNavegador] = useState<string | null>(null)
  useEffect(() => setFusoNavegador(fusoDoNavegador()), [])

  const fusos = useMemo(() => {
    const lista = [...FUSOS_COMUNS]
    for (const f of [fusoNavegador, inicial?.timezone]) if (f && !lista.includes(f)) lista.unshift(f)
    return lista
  }, [fusoNavegador, inicial?.timezone])

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!orgId || enviando) return
    if (!titulo.trim() || !quando) {
      toast.error(t('batepapos.form.obrigatorios'))
      return
    }
    setEnviando(true)
    const dados: NovoBatePapo = {
      title: titulo.trim(),
      theme: tema.trim(),
      description: descricao.trim(),
      starts_at: quando,
      timezone: fuso,
      duration_minutes: duracao,
      meeting_url: link.trim(),
      host_name: conduz.trim(),
      passages: passagens.trim(),
    }
    try {
      const salvo = editando
        ? await editarBatePapo(inicial!.event_uuid, dados, token)
        : await criarBatePapo(orgId, { ...dados, announce_community_uuid: divulgar || null }, token)
      toast.success(editando ? t('batepapos.form.salvo') : t('batepapos.form.criado'))
      aoSalvar(salvo)
    } catch (err: any) {
      const detalhe = typeof err?.detail === 'string' ? err.detail : ''
      toast.error(detalhe && /https/.test(detalhe) ? t('batepapos.form.link_invalido') : t('batepapos.erro'))
    } finally {
      setEnviando(false)
    }
  }

  const rotulo = 'block text-sm font-medium text-[var(--text)]'
  const dica = 'mt-1 block text-xs text-[var(--text-3)]'

  return (
    <form onSubmit={enviar} className="flex flex-col gap-4">
      <label className={rotulo}>
        {t('batepapos.form.titulo')}
        <input className={CAMPO} value={titulo} onChange={(e) => setTitulo(e.target.value)} maxLength={160} required />
      </label>
      <label className={rotulo}>
        {t('batepapos.form.tema')}
        <input className={CAMPO} value={tema} onChange={(e) => setTema(e.target.value)} maxLength={160} />
      </label>
      <label className={rotulo}>
        {t('batepapos.form.descricao')}
        <textarea
          className={`${CAMPO} min-h-24 py-2`}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          maxLength={4000}
          rows={4}
        />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={rotulo}>
          {t('batepapos.form.quando')}
          <input
            type="datetime-local"
            className={CAMPO}
            value={quando}
            onChange={(e) => setQuando(e.target.value)}
            required
          />
        </label>
        <label className={rotulo}>
          {t('batepapos.form.fuso')}
          <select className={CAMPO} value={fuso} onChange={(e) => setFuso(e.target.value)}>
            {fusos.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={rotulo}>
          {t('batepapos.form.duracao')}
          <select className={CAMPO} value={duracao} onChange={(e) => setDuracao(Number(e.target.value))}>
            {(DURACOES.includes(duracao) ? DURACOES : [...DURACOES, duracao].sort((a, b) => a - b)).map((d) => (
              <option key={d} value={d}>
                {t('batepapos.duracao', { min: d })}
              </option>
            ))}
          </select>
        </label>
        <label className={rotulo}>
          {t('batepapos.form.conduz')}
          <input className={CAMPO} value={conduz} onChange={(e) => setConduz(e.target.value)} maxLength={120} />
        </label>
      </div>
      <label className={rotulo}>
        {t('batepapos.form.link')}
        <input
          type="url"
          inputMode="url"
          placeholder="https://meet.google.com/…"
          className={CAMPO}
          value={link}
          onChange={(e) => setLink(e.target.value)}
          maxLength={500}
        />
        <span className={dica}>{t('batepapos.form.link_dica')}</span>
      </label>
      <label className={rotulo}>
        {t('batepapos.form.passagens')}
        <input
          className={CAMPO}
          value={passagens}
          onChange={(e) => setPassagens(e.target.value)}
          maxLength={300}
          placeholder={t('batepapos.form.passagens_exemplo')}
        />
      </label>
      {!editando && comunidades.length > 0 && (
        <label className={rotulo}>
          {t('batepapos.form.divulgar')}
          <select className={CAMPO} value={divulgar} onChange={(e) => setDivulgar(e.target.value)}>
            <option value="">{t('batepapos.form.nao_divulgar')}</option>
            {comunidades.map((c) => (
              <option key={c.community_uuid} value={c.community_uuid}>
                {c.name}
              </option>
            ))}
          </select>
          <span className={dica}>{t('batepapos.form.divulgar_dica')}</span>
        </label>
      )}
      <div className="flex flex-wrap justify-end gap-2 pt-2">
        <button type="button" onClick={aoCancelar} className={`${BOTAO_SECUNDARIO} min-h-11 px-5 text-sm`}>
          {t('batepapos.form.cancelar')}
        </button>
        <button type="submit" disabled={enviando} className={`${BOTAO_PRIMARIO} min-h-11 px-5 text-sm disabled:opacity-60`}>
          {editando ? t('batepapos.form.salvar') : t('batepapos.form.criar')}
        </button>
      </div>
    </form>
  )
}

export default FormularioEvento
