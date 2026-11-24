import React from 'react'
import { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getOrganizationContextInfo } from '@services/organizations/orgs'
import { obterPostCompartilhado } from '@services/communities/membros'
import { imagensOg } from '@/lib/discipulei/og.server'
import PostCompartilhadoCliente from '@components/Discipulei/Compartilhar/PostCompartilhado'

// Post compartilhado fora da comunidade (N44): título, autor (nome público) e
// um trecho de ~280 caracteres. O servidor só devolve posts de espaços
// públicos e compartilháveis; para o resto, 404. Fora do (withmenu): sem shell.
export const dynamic = 'force-dynamic'

type Params = { orgslug: string; discussionuuid: string }

async function carregar(orgslug: string, discussionuuid: string) {
  try {
    const org = await getOrganizationContextInfo(orgslug, { revalidate: 120, tags: ['organizations'] })
    if (!org?.id) return { org: null, post: null }
    const post = await obterPostCompartilhado(org.id, discussionuuid)
    return { org, post }
  } catch {
    return { org: null, post: null }
  }
}

export async function generateMetadata(props: { params: Promise<Params> }): Promise<Metadata> {
  const { orgslug, discussionuuid } = await props.params
  const { org, post } = await carregar(orgslug, discussionuuid)
  if (!post) return { title: 'Discipulei', robots: { index: false, follow: false } }
  const siteName = org?.name || 'Discipulei'
  // A prévia mostra só o trecho, nunca o post inteiro.
  const og = await imagensOg(
    orgslug,
    { tipo: 'discussao', comunidade: post.community_uuid, discussao: post.discussion_uuid },
    post.title
  )
  return {
    title: post.title,
    description: post.excerpt,
    robots: { index: false, follow: false },
    openGraph: { ...og.openGraph, title: post.title, description: post.excerpt, siteName, type: 'article' },
    twitter: { ...og.twitter, title: post.title, description: post.excerpt },
  }
}

export default async function PostCompartilhadoPage(props: { params: Promise<Params> }) {
  const { orgslug, discussionuuid } = await props.params
  const { post } = await carregar(orgslug, discussionuuid)
  if (!post) notFound()
  return <PostCompartilhadoCliente orgslug={orgslug} post={post} />
}
