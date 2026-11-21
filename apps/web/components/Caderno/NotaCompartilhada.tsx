'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from 'react-i18next'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Lock } from '@phosphor-icons/react'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { getUriWithOrg } from '@services/config/config'
import { ReferenciasBiblicas } from '@components/Biblia/extensaoReferencias'
import { ReferenciasNoTexto } from '@components/Biblia/ReferenciasNoTexto'
import { lerCompartilhada, type NotaCompartilhada } from '@services/caderno/notas'
import { dataBR, lerDoc } from '@/lib/caderno/conteudo'
import { LigacoesETags } from './editor/extensoes'
import { BOTAO_PRIMARIO, SERIF } from './estilos'

type Estado =
  | { tipo: 'carregando' }
  | { tipo: 'login' }
  | { tipo: 'indisponivel' }
  | { tipo: 'pronto'; nota: NotaCompartilhada }

function Leitura({ nota }: { nota: NotaCompartilhada }) {
  const { t } = useTranslation()
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [StarterKit.configure({ link: { openOnClick: true, HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' } } }), ReferenciasBiblicas, LigacoesETags],
    content: lerDoc(nota.content_json) as any,
    editorProps: { attributes: { class: 'caderno-prosa', lang: 'pt-BR' } },
  })
  const data = nota.kind === 'tcd' && nota.tcd_date ? dataBR(nota.tcd_date) : new Date(nota.updated_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  return (
    <article>
      <h1 className="text-[2.25rem] font-medium leading-tight tracking-[-0.02em] text-[var(--text)] sm:text-[2.75rem]" style={SERIF}>
        {nota.title || t('caderno.sem_titulo')}
      </h1>
      <p className="mt-3 text-sm text-[var(--text-3)]">
        {nota.author_name ? t('caderno.por_autor', { nome: nota.author_name }) + ' · ' : ''}
        {data}
      </p>
      {/* [[ligações]] não levam a lugar nenhum fora do caderno de quem escreveu. */}
      <ReferenciasNoTexto className="caderno-leitura mt-10">
        <div onClickCapture={(e) => (e.target as HTMLElement).closest('a.nota-ligacao, a.nota-tag') && e.preventDefault()}>
          <EditorContent editor={editor} />
        </div>
      </ReferenciasNoTexto>
    </article>
  )
}

/**
 * Página limpa de uma nota compartilhada por link privado: só leitura, sem
 * shell, sem rastreio, sem indexação. O token nunca vai para o Referer.
 */
export default function NotaCompartilhadaCliente({ token, orgslug }: { token: string; orgslug: string }) {
  const { t } = useTranslation()
  const session = useLHSession() as any
  const status = session?.status ?? 'loading'
  const tokenSessao: string | undefined = session?.data?.tokens?.access_token
  const [estado, setEstado] = useState<Estado>({ tipo: 'carregando' })

  useEffect(() => {
    if (status === 'loading') return
    let vivo = true
    lerCompartilhada(token, tokenSessao)
      .then((nota) => vivo && setEstado({ tipo: 'pronto', nota }))
      .catch((e: any) => {
        if (!vivo) return
        const codigo = e?.detail?.code ?? e?.detail
        setEstado(e?.status === 401 || codigo === 'SHARE_REQUIRES_LOGIN' ? { tipo: 'login' } : { tipo: 'indisponivel' })
      })
    return () => {
      vivo = false
    }
  }, [token, tokenSessao, status])

  return (
    <div className="caderno-area min-h-dvh bg-[var(--page)] text-[var(--text)]">
      <main className="mx-auto w-full max-w-[42rem] px-5 pb-24 pt-14 sm:px-8 sm:pt-20">
        {estado.tipo === 'carregando' && (
          <div aria-busy="true">
            <span className="sr-only">{t('biblia.carregando')}</span>
            <div className="h-12 w-3/4 animate-pulse rounded-lg bg-[var(--surface)]" />
            <div className="mt-10 h-4 w-full animate-pulse rounded bg-[var(--surface)]" />
            <div className="mt-3 h-4 w-5/6 animate-pulse rounded bg-[var(--surface)]" />
          </div>
        )}
        {estado.tipo === 'pronto' && <Leitura nota={estado.nota} />}
        {estado.tipo === 'login' && (
          <div className="flex flex-col items-start gap-4">
            <Lock size={24} aria-hidden="true" className="text-[var(--text-2)]" />
            <h1 className="text-3xl text-[var(--text)]" style={SERIF}>{t('caderno.compartilhada_membros_titulo')}</h1>
            <p className="text-base leading-relaxed text-[var(--text-2)]">{t('caderno.compartilhada_membros_texto')}</p>
            <Link href={getUriWithOrg(orgslug, '/login')} className={`${BOTAO_PRIMARIO} min-h-11 px-5 text-sm`} rel="nofollow">
              {t('auth.login')}
            </Link>
          </div>
        )}
        {estado.tipo === 'indisponivel' && (
          <div className="flex flex-col items-start gap-3">
            <h1 className="text-3xl text-[var(--text)]" style={SERIF}>{t('caderno.compartilhada_indisponivel_titulo')}</h1>
            <p className="text-base leading-relaxed text-[var(--text-2)]">{t('caderno.compartilhada_indisponivel_texto')}</p>
          </div>
        )}
        <footer className="mt-20 border-t border-[var(--line)] pt-5 text-xs leading-relaxed text-[var(--text-3)]">
          {t('caderno.compartilhada_rodape')}
        </footer>
      </main>
    </div>
  )
}
