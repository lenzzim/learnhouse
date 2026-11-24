'use client'

/**
 * Criar, editar ou duplicar um evento da Agenda (o servidor confere quem
 * pode). A data e a hora são as do fuso escolhido; o servidor converte.
 *
 * Online: link da reunião (privado). Presencial: região, cidade e bairro
 * (públicos) e endereço exato (privado: só quem confirma "Vou" vê).
 */

import React, { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { useDadosNav } from '@components/Discipulei/Navegacao/useDadosNav'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, FOCO } from '@components/Discipulei/Navegacao/estilos'
import {
  TIPOS_EVENTO,
  criarBatePapo,
  editarBatePapo,
  type BatePapo,
  type ModoEvento,
  type NovoBatePapo,
  type TipoEvento,
} from '@services/communities/batepapos'
import { fusoDoNavegador, useRegioes } from './comum'

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
  duplicar = false,
  aoSalvar,
  aoCancelar,
}: {
  inicial?: BatePapo | null
  /** Usa `inicial` como modelo para um evento novo (data em branco). */
  duplicar?: boolean
  aoSalvar: (ev: BatePapo) => void
  aoCancelar: () => void
}) {
  const { t } = useTranslation()
  const { orgId, token, comunidades } = useDadosNav()
  const editando = !!inicial && !duplicar
  const regioes = useRegioes(orgId)

  const [titulo, setTitulo] = useState(inicial?.title ?? '')
  const [tema, setTema] = useState(inicial?.theme ?? '')
  const [descricao, setDescricao] = useState(inicial?.description ?? '')
  const [fuso, setFuso] = useState(inicial?.timezone ?? 'America/Sao_Paulo')
  const [quando, setQuando] = useState(editando && inicial ? paraInputLocal(inicial.starts_at, inicial.timezone) : '')
  const [duracao, setDuracao] = useState<number>(inicial?.duration_minutes ?? 60)
  const [link, setLink] = useState(inicial?.meeting_url ?? '')
  const [conduz, setConduz] = useState(inicial?.host_name ?? '')
  const [passagens, setPassagens] = useState(inicial?.passages ?? '')
  const [divulgar, setDivulgar] = useState('')
  const [tipo, setTipo] = useState<TipoEvento>(inicial?.kind ?? 'bible_talk')
  const [modo, setModo] = useState<ModoEvento>(inicial?.mode ?? 'online')
  const [regiao, setRegiao] = useState(inicial?.region && !inicial.region.is_online ? inicial.region.region_uuid : '')
  const [cidade, setCidade] = useState(inicial?.city ?? '')
  const [bairro, setBairro] = useState(inicial?.neighborhood ?? '')
  const [endereco, setEndereco] = useState(inicial?.address ?? '')
  const [vagas, setVagas] = useState(inicial?.capacity ? String(inicial.capacity) : '')
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
    if (modo === 'in_person' && !regiao) {
      toast.error(t('agenda.form.regiao_obrigatoria'))
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
      host_name: conduz.trim(),
      passages: passagens.trim(),
      kind: tipo,
      mode: modo,
      region_uuid: modo === 'in_person' ? regiao : null,
      city: modo === 'in_person' ? cidade.trim() : '',
      neighborhood: modo === 'in_person' ? bairro.trim() : '',
      address: modo === 'in_person' ? endereco.trim() : '',
      meeting_url: modo === 'online' ? link.trim() : '',
      capacity: vagas ? Math.max(0, Number(vagas) || 0) : 0,
    }
    try {
      const salvo = editando
        ? await editarBatePapo(inicial!.event_uuid, dados, token)
        : await criarBatePapo(orgId, { ...dados, announce_community_uuid: divulgar || null }, token)
      toast.success(editando ? t('batepapos.form.salvo') : t('agenda.form.criado'))
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
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={rotulo}>
          {t('agenda.form.tipo')}
          <select className={CAMPO} value={tipo} onChange={(e) => setTipo(e.target.value as TipoEvento)}>
            {TIPOS_EVENTO.map((k) => (
              <option key={k} value={k}>
                {t(`agenda.tipo.${k}`)}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend className={rotulo}>{t('agenda.form.modo')}</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {(['online', 'in_person'] as ModoEvento[]).map((m) => (
              <label
                key={m}
                className={`flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-3 text-sm ${
                  modo === m
                    ? 'border-[var(--text)] font-semibold text-[var(--text)]'
                    : 'border-[var(--line-strong)] text-[var(--text-2)]'
                }`}
              >
                <input
                  type="radio"
                  name="modo"
                  value={m}
                  checked={modo === m}
                  onChange={() => setModo(m)}
                  className="sr-only"
                />
                {m === 'online' ? t('agenda.online') : t('agenda.presencial')}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
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
      {modo === 'in_person' && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={rotulo}>
              {t('agenda.form.regiao')}
              <select className={CAMPO} value={regiao} onChange={(e) => setRegiao(e.target.value)} required>
                <option value="">{t('agenda.form.escolha')}</option>
                {(regioes.data ?? [])
                  .filter((r) => !r.is_online)
                  .map((r) => (
                    <option key={r.region_uuid} value={r.region_uuid}>
                      {r.name}
                    </option>
                  ))}
              </select>
            </label>
            <label className={rotulo}>
              {t('agenda.form.cidade')}
              <input className={CAMPO} value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={120} />
            </label>
          </div>
          <label className={rotulo}>
            {t('agenda.form.bairro')}
            <input className={CAMPO} value={bairro} onChange={(e) => setBairro(e.target.value)} maxLength={120} />
            <span className={dica}>{t('agenda.form.bairro_dica')}</span>
          </label>
          <label className={rotulo}>
            {t('agenda.form.endereco')}
            <input className={CAMPO} value={endereco} onChange={(e) => setEndereco(e.target.value)} maxLength={300} />
            <span className={dica}>{t('agenda.form.endereco_dica')}</span>
          </label>
        </>
      )}
      <label className={rotulo}>
        {t('agenda.form.vagas')}
        <input
          type="number"
          inputMode="numeric"
          min={0}
          max={10000}
          className={CAMPO}
          value={vagas}
          onChange={(e) => setVagas(e.target.value)}
          placeholder={t('agenda.form.vagas_vazio')}
        />
        <span className={dica}>{t('agenda.form.vagas_dica')}</span>
      </label>
      {modo === 'online' && (
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
        <span className={dica}>{t('agenda.form.link_dica')}</span>
      </label>
      )}
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
          {editando ? t('batepapos.form.salvar') : t('agenda.form.criar')}
        </button>
      </div>
    </form>
  )
}

export default FormularioEvento
