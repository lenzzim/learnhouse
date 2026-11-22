'use client'

import React, { useId, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Image as IconeImagem, LockSimple, UploadSimple, VideoCamera } from '@phosphor-icons/react'
import { FolhaInferior } from '@components/Discipulei/Navegacao/FolhaInferior'
import { analisarUrlVideo, urlImagemValida, type VideoAnalisado } from '@/lib/caderno/video'
import { TIPOS_IMAGEM } from '@services/caderno/notas'
import { BOTAO_PRIMARIO, BOTAO_SECUNDARIO, CAMPO } from './estilos'

/** "Imagem": enviar do aparelho (privada) ou inserir por link https. */
export function DialogoImagem({
  aberto,
  aoMudar,
  aoEnviar,
  aoInserirLink,
}: {
  aberto: boolean
  aoMudar: (v: boolean) => void
  aoEnviar: (arquivos: File[], alt: string) => void
  aoInserirLink: (url: string, alt: string) => void
}) {
  const { t } = useTranslation()
  const [link, setLink] = useState('')
  const [alt, setAlt] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const entrada = useRef<HTMLInputElement | null>(null)
  const idLink = useId()
  const idAlt = useId()
  const idErro = useId()

  const fechar = (v: boolean) => {
    aoMudar(v)
    if (!v) {
      setLink('')
      setAlt('')
      setErro(null)
    }
  }
  const inserirLink = (e: React.FormEvent) => {
    e.preventDefault()
    const url = urlImagemValida(link)
    if (!url) {
      setErro(t('caderno_editor.imagem_link_invalido'))
      return
    }
    aoInserirLink(url, alt.trim())
    fechar(false)
  }

  return (
    <FolhaInferior aberta={aberto} aoMudar={fechar} titulo={t('caderno_editor.cmd.imagem')} descricao={t('caderno_editor.imagem_descricao')}>
      <div className="flex flex-col gap-4">
        <div>
          <label htmlFor={idAlt} className="mb-1.5 block text-sm font-medium text-[var(--text)]">
            {t('caderno_editor.imagem_alt')}
          </label>
          <input id={idAlt} value={alt} onChange={(e) => setAlt(e.target.value)} maxLength={300} className={`${CAMPO} h-11`} placeholder={t('caderno_editor.imagem_alt_exemplo')} />
        </div>
        <div className="rounded-xl border border-dashed border-[var(--line-strong)] p-4">
          <input
            ref={entrada}
            type="file"
            accept={TIPOS_IMAGEM.join(',')}
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(e) => {
              const arquivos = Array.from(e.target.files ?? [])
              e.target.value = ''
              if (arquivos.length) {
                aoEnviar(arquivos, alt.trim())
                fechar(false)
              }
            }}
          />
          <button type="button" onClick={() => entrada.current?.click()} className={`${BOTAO_PRIMARIO} min-h-11 w-full px-4 text-sm`}>
            <UploadSimple size={18} aria-hidden="true" />
            {t('caderno_editor.imagem_enviar')}
          </button>
          <p className="mt-2 text-xs leading-relaxed text-[var(--text-2)]">{t('caderno_editor.imagem_limites')}</p>
          <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-[var(--text-2)]">
            <LockSimple size={13} aria-hidden="true" className="mt-0.5 shrink-0" />
            {t('caderno_editor.imagem_privada')}
          </p>
        </div>
        <form onSubmit={inserirLink} className="flex flex-col gap-1.5" noValidate>
          <label htmlFor={idLink} className="text-sm font-medium text-[var(--text)]">
            {t('caderno_editor.imagem_link')}
          </label>
          <div className="flex gap-2">
            <input
              id={idLink}
              type="url"
              inputMode="url"
              value={link}
              onChange={(e) => {
                setLink(e.target.value)
                setErro(null)
              }}
              placeholder="https://"
              aria-invalid={!!erro}
              aria-describedby={erro ? idErro : undefined}
              className={`${CAMPO} h-11 min-w-0 flex-1`}
            />
            <button type="submit" disabled={!link.trim()} className={`${BOTAO_SECUNDARIO} min-h-11 shrink-0 px-4 text-sm disabled:opacity-50`}>
              <IconeImagem size={16} aria-hidden="true" />
              {t('caderno_editor.inserir')}
            </button>
          </div>
          {erro && (
            <p id={idErro} role="alert" className="text-xs text-[var(--text)]">
              {erro}
            </p>
          )}
          <p className="text-xs text-[var(--text-3)]">{t('caderno_editor.imagem_link_aviso')}</p>
        </form>
      </div>
    </FolhaInferior>
  )
}

/** "Vídeo": só por link do YouTube (sem cookie) ou do Vimeo (sem rastreio). */
export function DialogoVideo({
  aberto,
  aoMudar,
  aoInserir,
}: {
  aberto: boolean
  aoMudar: (v: boolean) => void
  aoInserir: (v: VideoAnalisado) => void
}) {
  const { t } = useTranslation()
  const [link, setLink] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const idLink = useId()
  const idErro = useId()
  const video = link.trim() ? analisarUrlVideo(link) : null

  const fechar = (v: boolean) => {
    aoMudar(v)
    if (!v) {
      setLink('')
      setErro(null)
    }
  }
  const enviar = (e: React.FormEvent) => {
    e.preventDefault()
    if (!video) {
      setErro(t('caderno_editor.video_invalido'))
      return
    }
    aoInserir(video)
    fechar(false)
  }

  return (
    <FolhaInferior aberta={aberto} aoMudar={fechar} titulo={t('caderno_editor.cmd.video')} descricao={t('caderno_editor.video_descricao')}>
      <form onSubmit={enviar} className="flex flex-col gap-2" noValidate>
        <label htmlFor={idLink} className="text-sm font-medium text-[var(--text)]">
          {t('caderno_editor.video_link')}
        </label>
        <input
          id={idLink}
          type="url"
          inputMode="url"
          autoFocus
          value={link}
          onChange={(e) => {
            setLink(e.target.value)
            setErro(null)
          }}
          placeholder="https://youtu.be/…"
          aria-invalid={!!erro}
          aria-describedby={erro ? idErro : undefined}
          className={`${CAMPO} h-11`}
        />
        <p className="min-h-5 text-xs text-[var(--text-2)]" aria-live="polite">
          {video ? t(video.tipo === 'youtube' ? 'caderno_editor.video_ok_youtube' : 'caderno_editor.video_ok_vimeo') : ''}
        </p>
        {erro && (
          <p id={idErro} role="alert" className="text-xs text-[var(--text)]">
            {erro}
          </p>
        )}
        <button type="submit" disabled={!link.trim()} className={`${BOTAO_PRIMARIO} min-h-11 px-4 text-sm disabled:opacity-50`}>
          <VideoCamera size={18} aria-hidden="true" />
          {t('caderno_editor.inserir_video')}
        </button>
        <p className="text-xs leading-relaxed text-[var(--text-3)]">{t('caderno_editor.video_privacidade')}</p>
      </form>
    </FolhaInferior>
  )
}
