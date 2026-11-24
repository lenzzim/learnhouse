'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  BookCopy,
  Folder,
  Users as UsersIcon,
  Search as SearchIcon,
  MessagesSquare,
  MessageCircle,
  Mic,
  ChevronLeft,
  ChevronRight,
  BookOpen,
} from 'lucide-react'
import { Cube } from '@phosphor-icons/react'
import { useTranslation } from 'react-i18next'

import { searchOrgContent, searchPassage, searchBible } from '@services/search/search'
import { interpretarConsulta, rotuloPassagem, codigoLeitor } from '@/lib/biblia/consulta'
import {
  ChipPassagem,
  ListaPassagem,
  ListaVersiculos,
  type BibliaResultadoApi,
  type PassagemDiscussaoApi,
  type PassagemResultadoApi,
} from '@components/Busca/ResultadosBiblicos'
import { useLHSession } from '@components/Contexts/LHSessionContext'
import { useOrg } from '@components/Contexts/OrgContext'
import {
  getCourseThumbnailMediaDirectory,
  getUserAvatarMediaDirectory,
  getCommunityThumbnailMediaDirectory,
  getPlaygroundThumbnailMediaDirectory,
  getPodcastThumbnailMediaDirectory,
} from '@services/media/media'
import { getUriWithOrg } from '@services/config/config'
import { removeCoursePrefix } from '@components/Objects/Thumbnails/CourseThumbnail'
import UserAvatar from '@components/Objects/UserAvatar'
import { useLHAnalytics, AnalyticsEvent } from '@services/analytics'

/**
 * Discussions store their body as a tiptap/ProseMirror JSON document
 * ({"type":"doc","content":[…]}). Old posts may also be plain strings.
 * Return a flat preview string either way.
 */
function extractPreviewText(raw: string | undefined | null): string {
  if (!raw) return ''
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return trimmed

  try {
    const parsed = JSON.parse(trimmed)
    const parts: string[] = []
    const walk = (node: any): void => {
      if (!node) return
      if (typeof node === 'string') {
        parts.push(node)
        return
      }
      if (Array.isArray(node)) {
        node.forEach(walk)
        return
      }
      if (typeof node.text === 'string') parts.push(node.text)
      if (node.content) walk(node.content)
    }
    walk(parsed)
    return parts.join(' ').replace(/\s+/g, ' ').trim()
  } catch {
    return trimmed
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Types mirror the backend SearchResult shape — kept flexible on purpose so
// the backend stays the source of truth.
// ─────────────────────────────────────────────────────────────────────────────

interface ApiUser {
  username: string
  first_name: string
  last_name: string
  avatar_image?: string
  bio?: string
  details?: Record<string, any>
  id: number
  user_uuid: string
}

interface ApiAuthor { user: ApiUser }

interface ApiCourse {
  name: string
  description?: string
  thumbnail_image?: string
  course_uuid: string
  authors?: ApiAuthor[]
}

interface ApiFolder {
  name: string
  description?: string
  folder_uuid: string
}

interface ApiCommunity {
  name: string
  description?: string
  thumbnail_image?: string
  community_uuid: string
  public?: boolean
}

interface ApiDiscussion {
  title: string
  content?: string
  discussion_uuid: string
  community_id: number
  community_uuid?: string
  label?: string
  emoji?: string
}

interface ApiPlayground {
  name: string
  description?: string
  thumbnail_image?: string
  playground_uuid: string
  org_uuid?: string
}

interface ApiPodcast {
  name: string
  description?: string
  thumbnail_image?: string
  podcast_uuid: string
}

interface SearchResults {
  courses: ApiCourse[]
  folders: ApiFolder[]
  users: ApiUser[]
  communities: ApiCommunity[]
  discussions: ApiDiscussion[]
  playgrounds: ApiPlayground[]
  podcasts: ApiPodcast[]
  total_courses: number
  total_folders: number
  total_users: number
  total_communities: number
  total_discussions: number
  total_playgrounds: number
  total_podcasts: number
}

const EMPTY_RESULTS: SearchResults = {
  courses: [],
  folders: [],
  users: [],
  communities: [],
  discussions: [],
  playgrounds: [],
  podcasts: [],
  total_courses: 0,
  total_folders: 0,
  total_users: 0,
  total_communities: 0,
  total_discussions: 0,
  total_playgrounds: 0,
  total_podcasts: 0,
}

type ResourceKey =
  | 'courses'
  | 'folders'
  | 'users'
  | 'communities'
  | 'discussions'
  | 'playgrounds'
  | 'podcasts'

type TabKey = 'all' | ResourceKey

// ─────────────────────────────────────────────────────────────────────────────
// Section registry — each resource type provides its own card renderer and
// metadata. Adding a new type means one entry here, not scattered JSX.
// ─────────────────────────────────────────────────────────────────────────────

interface SectionDescriptor<T> {
  key: ResourceKey
  icon: React.ComponentType<any>
  items: (_results: SearchResults) => T[]
  total: (_results: SearchResults) => number
  renderCard: (_item: T, _ctx: RenderContext) => React.ReactNode
  itemKey: (_item: T) => string
}

interface RenderContext {
  orgSlug: string
  orgUuid: string
}

const sections: SectionDescriptor<any>[] = [
  {
    key: 'courses',
    icon: BookCopy,
    items: (r) => r.courses,
    total: (r) => r.total_courses,
    itemKey: (c: ApiCourse) => c.course_uuid,
    renderCard: (course: ApiCourse, ctx) => (
      <ResourceCard
        href={getUriWithOrg(ctx.orgSlug, `/course/${removeCoursePrefix(course.course_uuid)}`)}
        imageUrl={course.thumbnail_image
          ? getCourseThumbnailMediaDirectory(ctx.orgUuid, course.course_uuid, course.thumbnail_image)
          : undefined}
        fallbackIcon={BookCopy}
        title={course.name}
        subtitle={course.description}
        footer={
          course.authors && course.authors.length > 0 ? (
            <div className="flex items-center gap-2 pt-2">
              <UserAvatar
                width={20}
                avatar_url={course.authors[0].user.avatar_image
                  ? getUserAvatarMediaDirectory(course.authors[0].user.user_uuid, course.authors[0].user.avatar_image)
                  : ''}
                predefined_avatar={course.authors[0].user.avatar_image ? undefined : 'empty'}
                userId={course.authors[0].user.id.toString()}
                showProfilePopup={false}
                rounded="rounded-full"
                backgroundColor="bg-gray-100"
              />
              <span className="text-xs text-[var(--text-2)]">
                {course.authors[0].user.first_name} {course.authors[0].user.last_name}
              </span>
            </div>
          ) : null
        }
      />
    ),
  },
  {
    key: 'folders',
    icon: Folder,
    items: (r) => r.folders,
    total: (r) => r.total_folders,
    itemKey: (f: ApiFolder) => f.folder_uuid,
    renderCard: (folder: ApiFolder, ctx) => (
      <InlineCard
        href={getUriWithOrg(
          ctx.orgSlug,
          `/library/folder/${folder.folder_uuid.replace('folder_', '')}`,
        )}
        icon={Folder}
        title={folder.name}
        subtitle={folder.description}
      />
    ),
  },
  {
    key: 'communities',
    icon: MessagesSquare,
    items: (r) => r.communities,
    total: (r) => r.total_communities,
    itemKey: (c: ApiCommunity) => c.community_uuid,
    renderCard: (community: ApiCommunity, ctx) => (
      <ResourceCard
        href={getUriWithOrg(ctx.orgSlug, `/community/${community.community_uuid.replace('community_', '')}`)}
        imageUrl={community.thumbnail_image
          ? getCommunityThumbnailMediaDirectory(ctx.orgUuid, community.community_uuid, community.thumbnail_image)
          : undefined}
        fallbackIcon={MessagesSquare}
        title={community.name}
        subtitle={community.description}
      />
    ),
  },
  {
    key: 'discussions',
    icon: MessageCircle,
    items: (r) => r.discussions,
    total: (r) => r.total_discussions,
    itemKey: (d: ApiDiscussion) => d.discussion_uuid,
    renderCard: (discussion: ApiDiscussion, ctx) => {
      const communityUuid = (discussion.community_uuid ?? '').replace('community_', '')
      const discussionUuid = discussion.discussion_uuid.replace('discussion_', '')
      const href = communityUuid
        ? getUriWithOrg(
            ctx.orgSlug,
            `/community/${communityUuid}/discussion/${discussionUuid}`,
          )
        : getUriWithOrg(ctx.orgSlug, `/discussion/${discussionUuid}`)
      return (
        <InlineCard
          href={href}
          icon={MessageCircle}
          emoji={discussion.emoji}
          title={discussion.title}
          subtitle={extractPreviewText(discussion.content)}
        />
      )
    },
  },
  {
    key: 'playgrounds',
    icon: Cube,
    items: (r) => r.playgrounds,
    total: (r) => r.total_playgrounds,
    itemKey: (p: ApiPlayground) => p.playground_uuid,
    renderCard: (playground: ApiPlayground, ctx) => (
      <ResourceCard
        href={getUriWithOrg(ctx.orgSlug, `/playground/${playground.playground_uuid}`)}
        imageUrl={playground.thumbnail_image && playground.org_uuid
          ? getPlaygroundThumbnailMediaDirectory(
              playground.org_uuid,
              playground.playground_uuid,
              playground.thumbnail_image,
            )
          : undefined}
        fallbackIcon={Cube}
        title={playground.name}
        subtitle={playground.description}
      />
    ),
  },
  {
    key: 'podcasts',
    icon: Mic,
    items: (r) => r.podcasts,
    total: (r) => r.total_podcasts,
    itemKey: (p: ApiPodcast) => p.podcast_uuid,
    renderCard: (podcast: ApiPodcast, ctx) => (
      <ResourceCard
        href={getUriWithOrg(ctx.orgSlug, `/podcast/${podcast.podcast_uuid.replace('podcast_', '')}`)}
        imageUrl={podcast.thumbnail_image
          ? getPodcastThumbnailMediaDirectory(ctx.orgUuid, podcast.podcast_uuid, podcast.thumbnail_image)
          : undefined}
        fallbackIcon={Mic}
        title={podcast.name}
        subtitle={podcast.description}
      />
    ),
  },
  {
    key: 'users',
    icon: UsersIcon,
    items: (r) => r.users,
    total: (r) => r.total_users,
    itemKey: (u: ApiUser) => u.user_uuid,
    renderCard: (user: ApiUser, ctx) => (
      <Link
        href={getUriWithOrg(ctx.orgSlug, `/user/${user.username}`)}
        className="flex items-center gap-4 p-3 bg-[var(--panel)] rounded-lg border border-[var(--line)] hover:border-[var(--line-strong)] transition-colors"
      >
        <UserAvatar
          width={40}
          avatar_url={user.avatar_image ? getUserAvatarMediaDirectory(user.user_uuid, user.avatar_image) : ''}
          predefined_avatar={user.avatar_image ? undefined : 'empty'}
          userId={user.id.toString()}
          showProfilePopup
          rounded="rounded-full"
          backgroundColor="bg-gray-100"
        />
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-[var(--text)] truncate">
            {user.first_name} {user.last_name}
          </h3>
          <p className="text-xs text-[var(--text-2)] truncate">@{user.username}</p>
        </div>
      </Link>
    ),
  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

const PER_PAGE = 9

type ExtraTab = 'passagem' | 'biblia'

function SearchPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const session = useLHSession() as any
  const org = useOrg() as any
  const { track } = useLHAnalytics('learner')

  const urlQuery = searchParams.get('q') ?? ''
  const urlPage = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const urlType = (searchParams.get('type') as TabKey | ExtraTab) || 'all'
  const accessToken = session?.data?.tokens?.access_token

  const [inputValue, setInputValue] = useState(urlQuery)
  const [results, setResults] = useState<SearchResults>(EMPTY_RESULTS)
  const [isLoading, setIsLoading] = useState(false)
  // Busca por passagem: só quando a consulta é uma referência ("1Pe 1", "Salmos")
  const passagem = useMemo(() => interpretarConsulta(urlQuery), [urlQuery])
  const [porPassagem, setPorPassagem] = useState<PassagemResultadoApi | null>(null)
  const [biblia, setBiblia] = useState<BibliaResultadoApi | null>(null)

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setInputValue(urlQuery), [urlQuery])

  const updateParams = useCallback(
    (updates: Record<string, string | number | null>) => {
      const next = new URLSearchParams(Array.from(searchParams.entries()))
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '' || value === undefined) {
          next.delete(key)
        } else {
          next.set(key, String(value))
        }
      }
      router.push(`?${next.toString()}`)
    },
    [router, searchParams],
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = inputValue.trim()
    if (!trimmed) return
    track(AnalyticsEvent.SearchExecuted, { query_length: trimmed.length, source: 'search_page' })
    updateParams({ q: trimmed, page: 1 })
  }

  const extraTab = urlType === 'passagem' || urlType === 'biblia'

  useEffect(() => {
    if (!urlQuery.trim() || !org?.slug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResults(EMPTY_RESULTS)
      return
    }

    let cancelled = false
    setIsLoading(true)
    searchOrgContent(
      org.slug,
      urlQuery,
      extraTab ? 1 : urlPage,
      PER_PAGE,
      null,
      accessToken,
    )
      .then((response) => {
        if (cancelled) return
        const data = response?.success ? response.data ?? {} : {}
        setResults({
          ...EMPTY_RESULTS,
          ...data,
        })
      })
      .catch((err) => {
        console.error('Search failed:', err)
        if (!cancelled) setResults(EMPTY_RESULTS)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [urlQuery, urlPage, extraTab, org?.slug, accessToken])

  useEffect(() => {
    if (!passagem || !org?.slug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPorPassagem(null)
      return
    }
    let cancelled = false
    searchPassage(org.slug, urlQuery, urlType === 'passagem' ? urlPage : 1, PER_PAGE, accessToken)
      .then((r) => {
        if (!cancelled) setPorPassagem(r?.success ? r.data : null)
      })
      .catch(() => {
        if (!cancelled) setPorPassagem(null)
      })
    return () => {
      cancelled = true
    }
  }, [passagem, urlQuery, urlType, urlPage, org?.slug, accessToken])

  useEffect(() => {
    if (urlQuery.trim().length < 2) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setBiblia(null)
      return
    }
    let cancelled = false
    // Na busca geral, sempre a BLIVRE (aberta, no banco): não gasta a cota das
    // licenciadas. O clique abre o leitor na versão da pessoa.
    searchBible(
      { query: urlQuery, versao: 'blivre', page: urlType === 'biblia' ? urlPage : 1, limit: PER_PAGE },
      accessToken,
    )
      .then((r) => {
        if (!cancelled) setBiblia(r?.success ? r.data : null)
      })
      .catch(() => {
        if (!cancelled) setBiblia(null)
      })
    return () => {
      cancelled = true
    }
  }, [urlQuery, urlType, urlPage, accessToken])

  const totalPassagem = porPassagem?.total ?? 0
  const totalBiblia = biblia?.referencia ? 1 : biblia?.total ?? 0

  const totalResults = useMemo(
    () => sections.reduce((sum, s) => sum + s.total(results), 0),
    [results],
  )

  const activeSections = useMemo(() => {
    if (extraTab) return []
    const shown = urlType === 'all'
      ? sections
      : sections.filter((s) => s.key === urlType)
    return shown.filter((s) => s.items(results).length > 0)
  }, [urlType, extraTab, results])

  const activeTotal = urlType === 'passagem'
    ? totalPassagem
    : urlType === 'biblia'
      ? biblia?.total ?? 0
      : urlType === 'all'
        ? totalResults
        : sections.find((s) => s.key === urlType)?.total(results) ?? 0

  const totalPages = Math.max(1, Math.ceil(activeTotal / PER_PAGE))
  const renderContext: RenderContext = {
    orgSlug: org?.slug ?? '',
    orgUuid: org?.org_uuid ?? '',
  }

  const hrefDiscussao = (d: PassagemDiscussaoApi) => {
    const c = d.community_uuid.replace('community_', '')
    const id = d.discussion_uuid.replace('discussion_', '')
    return getUriWithOrg(renderContext.orgSlug, c ? `/community/${c}/discussion/${id}` : `/discussion/${id}`)
  }
  const hrefLeitor = (codigo: string) => getUriWithOrg(renderContext.orgSlug, `/biblia?ref=${encodeURIComponent(codigo)}`)
  const rotulo = passagem ? rotuloPassagem(passagem) : ''
  const regraPassagem = passagem ? t(`busca.regra.${passagem.tipo}`, { passagem: rotulo }) : ''

  const nadaEncontrado = totalResults === 0 && totalPassagem === 0 && totalBiblia === 0

  const secaoPassagem = (limite?: number) =>
    porPassagem && porPassagem.discussions.length > 0 ? (
      <section aria-labelledby="secao-passagem">
        <h2 id="secao-passagem" className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-2)] mb-3 flex items-center gap-2">
          <BookOpen size={13} aria-hidden="true" />
          {t('busca.tipos.passagem')}
          <span className="text-[var(--text-2)] font-normal normal-case tracking-normal">({totalPassagem})</span>
        </h2>
        <ListaPassagem resultado={porPassagem} hrefDiscussao={hrefDiscussao} limite={limite} />
        {limite && totalPassagem > limite ? (
          <BotaoVerTodos label={t('busca.ver_todos_posts')} onClick={() => updateParams({ type: 'passagem', page: 1 })} />
        ) : null}
      </section>
    ) : null

  const secaoBiblia = (limite?: number) => {
    if (!biblia) return null
    if (biblia.referencia) {
      const ref = interpretarConsulta(urlQuery)
      return (
        <section aria-labelledby="secao-biblia">
          <h2 id="secao-biblia" className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-2)] mb-3 flex items-center gap-2">
            <BookOpen size={13} aria-hidden="true" />
            {t('busca.tipos.biblia')}
          </h2>
          <Link
            href={hrefLeitor(biblia.referencia)}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3 text-sm font-medium text-[var(--text)] hover:border-[var(--line-strong)]"
          >
            <BookOpen size={16} aria-hidden="true" />
            {t('busca.ir_para', { passagem: ref ? rotuloPassagem(ref) : biblia.referencia })}
          </Link>
        </section>
      )
    }
    if (!biblia.versiculos.length) return null
    return (
      <section aria-labelledby="secao-biblia">
        <h2 id="secao-biblia" className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-2)] mb-3 flex items-center gap-2">
          <BookOpen size={13} aria-hidden="true" />
          {t('busca.tipos.biblia')}
          <span className="text-[var(--text-2)] font-normal normal-case tracking-normal">({biblia.total})</span>
        </h2>
        <ListaVersiculos resultado={biblia} hrefVersiculo={(v) => hrefLeitor(v.codigo)} limite={limite} />
        <div className="mt-2 flex flex-wrap items-center gap-x-4">
          {limite && biblia.total > limite ? (
            <BotaoVerTodos label={t('busca.ver_todos_versiculos')} onClick={() => updateParams({ type: 'biblia', page: 1 })} />
          ) : null}
          <Link
            href={getUriWithOrg(renderContext.orgSlug, `/biblia/buscar?q=${encodeURIComponent(urlQuery)}`)}
            className="inline-flex min-h-11 items-center text-xs text-[var(--text-2)] underline decoration-[var(--link-underline)] underline-offset-4 hover:text-[var(--text)]"
          >
            {t('busca.busca_avancada_biblia')}
          </Link>
        </div>
      </section>
    )
  }

  return (
    <div className="min-h-screen text-[var(--text)]">
      <div className="container mx-auto px-4 pt-10 pb-4 max-w-5xl">
        <h1 className="text-2xl font-semibold text-[var(--text)] mb-1">
          {t('common.search')}
        </h1>
        <p className="text-sm text-[var(--text-2)] mb-6">{t('search.start_subtitle')}</p>

        <form onSubmit={handleSubmit} className="relative group" role="search">
          <input
            type="search"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            aria-label={t('search.search_placeholder')}
            placeholder={t('search.search_placeholder')}
            className="w-full h-12 ps-12 pe-24 rounded-xl bg-[var(--panel)] text-[var(--text)] nice-shadow
                       focus:outline-none focus:ring-2 focus:ring-[var(--focus)] focus:ring-offset-1 focus:ring-offset-[var(--page)]
                       text-base sm:text-sm placeholder:text-[var(--text-3)] transition-all"
          />
          <div className="absolute inset-y-0 start-0 ps-4 flex items-center pointer-events-none">
            <SearchIcon
              className="text-[var(--text-3)] group-focus-within:text-[var(--text)] transition-colors"
              size={18}
            />
          </div>
          <button
            type="submit"
            className="absolute inset-y-1 end-1 min-w-11 px-4 rounded-lg bg-black text-white text-xs font-semibold hover:bg-black/85 transition-colors"
          >
            {t('common.search')}
          </button>
        </form>

        {urlQuery && passagem && (
          <div className="mt-4">
            <ChipPassagem rotulo={rotulo} hrefLeitor={hrefLeitor(codigoLeitor(passagem))} regra={regraPassagem} />
          </div>
        )}

        {urlQuery && (
          <div className="mt-4 flex items-center gap-2 overflow-x-auto pb-2 -mx-1 px-1" role="tablist" aria-label={t('search.filter_heading')}>
            <TabButton
              label={t('search.types.all')}
              icon={SearchIcon}
              count={totalResults + totalPassagem}
              active={urlType === 'all'}
              onClick={() => updateParams({ type: '', page: 1 })}
            />
            {passagem && (
              <TabButton
                label={t('busca.tipos.passagem')}
                icon={BookOpen}
                count={totalPassagem}
                active={urlType === 'passagem'}
                onClick={() => updateParams({ type: 'passagem', page: 1 })}
              />
            )}
            {sections.map((s) => (
              <TabButton
                key={s.key}
                label={t(`search.types.${s.key}`)}
                icon={s.icon}
                count={s.total(results)}
                active={urlType === s.key}
                onClick={() => updateParams({ type: s.key, page: 1 })}
              />
            ))}
            <TabButton
              label={t('busca.tipos.biblia')}
              icon={BookOpen}
              count={totalBiblia}
              active={urlType === 'biblia'}
              onClick={() => updateParams({ type: 'biblia', page: 1 })}
            />
          </div>
        )}
      </div>

      <div className="container mx-auto px-4 pb-12 max-w-5xl">
        {!urlQuery.trim() ? (
          <StartState label={t('search.start_heading')} />
        ) : isLoading ? (
          <LoadingGrid />
        ) : urlType === 'passagem' ? (
          totalPassagem === 0 ? (
            <EmptyState query={urlQuery} t={t} descricao={t('busca.passagem_vazia', { passagem: rotulo })} />
          ) : (
            <>
              <p className="text-xs text-[var(--text-2)] mb-5" aria-live="polite">
                {t('search.found_results', { count: activeTotal, query: rotulo })}
              </p>
              {secaoPassagem()}
            </>
          )
        ) : urlType === 'biblia' ? (
          totalBiblia === 0 ? (
            <EmptyState query={urlQuery} t={t} descricao={t('busca.biblia_vazia', { query: urlQuery })} />
          ) : (
            secaoBiblia()
          )
        ) : nadaEncontrado ? (
          <EmptyState query={urlQuery} t={t} />
        ) : (
          <>
            <p className="text-xs text-[var(--text-2)] mb-5" aria-live="polite">
              {t('search.found_results', { count: activeTotal, query: urlQuery })}
            </p>

            <div className="space-y-8">
              {urlType === 'all' && secaoPassagem(4)}

              {activeSections.length === 0 && urlType !== 'all' && (
                <EmptyState query={urlQuery} t={t} />
              )}

              {activeSections.map((section) => {
                const items = section.items(results)
                return (
                  <section key={section.key}>
                    <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-2)] mb-3 flex items-center gap-2">
                      <section.icon size={13} />
                      {t(`search.types.${section.key}`)}
                      <span className="text-[var(--text-2)] font-normal normal-case tracking-normal">
                        ({section.total(results)})
                      </span>
                    </h2>
                    <div className={gridClass(section.key)}>
                      {items.map((item, index) => (
                        <span
                          key={section.itemKey(item)}
                          className="contents"
                          onClick={() =>
                            track(AnalyticsEvent.SearchResultClicked, {
                              result_type: section.key,
                              position: index + 1,
                            })
                          }
                        >
                          {section.renderCard(item, renderContext)}
                        </span>
                      ))}
                    </div>
                  </section>
                )
              })}

              {urlType === 'all' && secaoBiblia(3)}
            </div>
          </>
        )}

        {urlQuery.trim() && !isLoading && totalPages > 1 && (urlType !== 'all' || totalResults > 0) && (
          <Pagination
            page={urlPage}
            totalPages={totalPages}
            onChange={(p) => updateParams({ page: p })}
            t={t}
          />
        )}
      </div>
    </div>
  )
}

function BotaoVerTodos({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 inline-flex min-h-11 items-center text-xs font-medium text-[var(--text)] underline decoration-[var(--link-underline)] underline-offset-4"
    >
      {label}
    </button>
  )
}

// ─── subcomponents ──────────────────────────────────────────────────────────

function TabButton({
  label,
  icon: Icon,
  count,
  active,
  onClick,
}: {
  label: string
  icon: React.ComponentType<any>
  count: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex min-h-11 items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${
        active
          ? 'bg-black text-white'
          : 'bg-[var(--surface)] text-[var(--text)] hover:bg-[var(--line-strong)]'
      }`}
    >
      <Icon size={14} />
      {label}
      <span className={active ? 'opacity-70' : 'text-[var(--text-2)]'}>{count}</span>
    </button>
  )
}

function ResourceCard({
  href,
  imageUrl,
  fallbackIcon: FallbackIcon,
  title,
  subtitle,
  footer,
}: {
  href: string
  imageUrl?: string
  fallbackIcon: React.ComponentType<any>
  title: string
  subtitle?: string
  footer?: React.ReactNode
}) {
  return (
    <Link
      href={href}
      className="bg-[var(--panel)] rounded-lg border border-[var(--line)] hover:border-[var(--line-strong)] transition-colors overflow-hidden group flex flex-col"
    >
      <div className="relative aspect-video bg-[var(--surface)] flex items-center justify-center">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={title}
            className="w-full h-full object-cover"
          />
        ) : (
          <FallbackIcon size={28} className="text-[var(--text-3)]" />
        )}
      </div>
      <div className="p-3 flex-1 flex flex-col">
        <h3 className="text-sm font-medium text-[var(--text)] line-clamp-1">{title}</h3>
        {subtitle && (
          <p className="text-xs text-[var(--text-2)] line-clamp-2 mt-1">{subtitle}</p>
        )}
        {footer}
      </div>
    </Link>
  )
}

function InlineCard({
  href,
  icon: Icon,
  emoji,
  title,
  subtitle,
}: {
  href: string
  icon: React.ComponentType<any>
  emoji?: string
  title: string
  subtitle?: string
}) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 p-3 bg-[var(--panel)] rounded-lg border border-[var(--line)] hover:border-[var(--line-strong)] transition-colors"
    >
      <div className="w-9 h-9 bg-[var(--surface)] rounded-md flex items-center justify-center flex-shrink-0 text-base">
        {emoji ? <span>{emoji}</span> : <Icon size={18} className="text-[var(--text-2)]" />}
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-medium text-[var(--text)] line-clamp-1">{title}</h3>
        {subtitle && (
          <p className="text-xs text-[var(--text-2)] line-clamp-2 mt-0.5">{subtitle}</p>
        )}
      </div>
    </Link>
  )
}

function LoadingGrid() {
  return (
    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="bg-[var(--panel)] rounded-lg border border-[var(--line)] p-3 animate-pulse"
        >
          <div className="w-full aspect-video bg-[var(--surface)] rounded mb-3" />
          <div className="w-3/4 h-3 bg-[var(--surface)] rounded mb-1.5" />
          <div className="w-1/2 h-3 bg-[var(--surface)] rounded" />
        </div>
      ))}
    </div>
  )
}

function EmptyState({ query, t, descricao }: { query: string; t: (_k: string, _o?: any) => string; descricao?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 p-4 bg-[var(--surface)] rounded-full">
        <SearchIcon className="w-8 h-8 text-[var(--text-3)]" />
      </div>
      <h3 className="text-lg font-medium text-[var(--text)] mb-2">
        {t('search.no_results_found')}
      </h3>
      <p className="text-sm text-[var(--text-2)] max-w-md">
        {descricao ?? t('search.no_results_description', { query })}
      </p>
    </div>
  )
}

function StartState({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="mb-4 p-4 bg-[var(--surface)] rounded-full">
        <SearchIcon className="w-8 h-8 text-[var(--text-3)]" />
      </div>
      <h3 className="text-lg font-medium text-[var(--text)]">{label}</h3>
    </div>
  )
}

function Pagination({
  page,
  totalPages,
  onChange,
  t,
}: {
  page: number
  totalPages: number
  onChange: (_p: number) => void
  t: (_k: string) => string
}) {
  const windowSize = 5
  const half = Math.floor(windowSize / 2)
  const start = Math.max(1, Math.min(page - half, totalPages - windowSize + 1))
  const end = Math.min(totalPages, start + windowSize - 1)
  const pages = Array.from({ length: end - start + 1 }, (_, i) => start + i)

  const baseBtn =
    'flex min-h-11 min-w-11 items-center justify-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors'
  return (
    <nav className="flex justify-center items-center gap-1 mt-8" aria-label={t('busca.paginacao')}>
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className={`${baseBtn} text-[var(--text-2)] hover:bg-[var(--surface)] disabled:opacity-40 disabled:cursor-not-allowed`}
        aria-label={t('search.previous')}
      >
        <ChevronLeft size={14} />
        <span className="hidden sm:inline">{t('search.previous')}</span>
      </button>
      <div className="flex items-center gap-1">
        {pages.map((p) => (
          <button
            key={p}
            onClick={() => onChange(p)}
            className={`min-w-11 h-11 rounded-md text-xs font-medium transition-colors ${
              p === page
                ? 'bg-black text-white'
                : 'text-[var(--text-2)] hover:bg-[var(--surface)]'
            }`}
            aria-current={p === page ? 'page' : undefined}
          >
            {p}
          </button>
        ))}
      </div>
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className={`${baseBtn} text-[var(--text-2)] hover:bg-[var(--surface)] disabled:opacity-40 disabled:cursor-not-allowed`}
        aria-label={t('search.next')}
      >
        <span className="hidden sm:inline">{t('search.next')}</span>
        <ChevronRight size={14} />
      </button>
    </nav>
  )
}

function gridClass(key: ResourceKey): string {
  // Dense list for inline types (folders/discussions), card grid for rich types.
  if (key === 'folders' || key === 'discussions' || key === 'users') {
    return 'grid gap-3 md:grid-cols-2 lg:grid-cols-3'
  }
  return 'grid gap-4 md:grid-cols-2 lg:grid-cols-3'
}

export default SearchPage
