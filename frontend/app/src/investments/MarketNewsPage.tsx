import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import DOMPurify from 'dompurify'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  Cancel01Icon,
  LinkSquare02Icon,
  News01Icon,
  Search01Icon,
} from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { cn } from '@/lib/utils'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { formatDate } from '../lib/format'
import {
  InvestmentsBreadcrumb,
  MarketDataProviderSwitch,
  SentimentDot,
} from './InvestmentPrimitives'
import {
  useInvestmentAccounts,
  useInvestmentPositions,
  useNews,
  useNewsStory,
} from './useInvestments'
import {
  isMarketDataProviderReady,
  parseMarketDataProvider,
  type MarketDataProviderId,
  type NewsItem,
} from './investmentsApi'

const PAGE_SIZE = 24

type PosterShape = 'hero' | 'portrait' | 'wide' | 'compact' | 'text'

const POSTER_SHAPES: PosterShape[] = ['hero', 'portrait', 'wide', 'compact', 'text', 'hero', 'wide', 'portrait']

/** Stable-ish hash so a story keeps a shape for a session, but reshuffles across visits. */
function hashSeed(input: string): number {
  let h = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function pickPosterShape(storyId: string, seed: number, hasImage: boolean): PosterShape {
  if (!hasImage) return 'text'
  const shapes = POSTER_SHAPES.filter((s) => s !== 'text')
  return shapes[(hashSeed(storyId) ^ seed) % shapes.length]!
}

function shuffleWithSeed<T>(items: T[], seed: number): T[] {
  const next = [...items]
  let state = seed || 1
  for (let i = next.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    const j = state % (i + 1)
    ;[next[i], next[j]] = [next[j]!, next[i]!]
  }
  return next
}

/** Today shows a time, anything older shows a date — the only distinction that matters in a feed. */
function publishedLabel(published: string | null): string {
  if (!published) return ''
  const date = new Date(published)
  if (Number.isNaN(date.getTime())) return ''
  const isToday = new Date().toDateString() === date.toDateString()
  return isToday
    ? formatDate(date, { hour: '2-digit', minute: '2-digit' })
    : formatDate(date, { day: '2-digit', month: 'short', year: 'numeric' })
}

/**
 * Market news from the selected market-data provider.
 *
 * Filters and provider live in the URL so a filtered feed can be linked to —
 * which is how the ticker search page hands a symbol over to this one.
 */
export function MarketNewsPage() {
  const { t, i18n } = useTranslation('investments')
  const [params, setParams] = useSearchParams()
  const [openStoryId, setOpenStoryId] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  // Fresh layout seed each mount so the poster collage reshuffles on visit.
  const [layoutSeed] = useState(() => (Math.random() * 0xffffffff) >>> 0)

  const provider = parseMarketDataProvider(params.get('provider'))
  const providerReady = isMarketDataProviderReady(provider)
  const symbol = params.get('symbol')
  const query = params.get('q') ?? ''
  const [queryDraft, setQueryDraft] = useState(query)

  const { data: accounts = [] } = useInvestmentAccounts()
  const { data: holdings = [] } = useInvestmentPositions(accounts[0]?.id ?? null)

  const {
    data: news,
    isLoading,
    isError,
    error,
    isFetching,
  } = useNews({
    query: query || undefined,
    symbol: symbol || undefined,
    limit: PAGE_SIZE * (page + 1),
    language: i18n.language?.slice(0, 2),
    provider,
  })

  const items = useMemo(
    () => shuffleWithSeed(news?.items ?? [], layoutSeed),
    [news?.items, layoutSeed],
  )
  const hasMore = !!news && (news.items?.length ?? 0) < news.total

  const setFilter = (next: {
    symbol?: string | null
    q?: string | null
    provider?: MarketDataProviderId | null
  }) => {
    const updated = new URLSearchParams(params)
    for (const [key, value] of Object.entries(next)) {
      if (value) updated.set(key, value)
      else updated.delete(key)
    }
    // Default provider stays out of the URL so shared links stay short.
    if (updated.get('provider') === 'yahoo') updated.delete('provider')
    setPage(0)
    setParams(updated, { replace: true })
  }

  return (
    <PageContainer wide className="flex flex-col gap-5">
      {/* The sibling-page buttons are gone — the sidebar lists them now — but
          the breadcrumb stays: it says where this page sits and gets you back
          to the portfolio in one click. */}
      <div>
        <InvestmentsBreadcrumb current={t('news.title')} />
        <PageHeader
          title={t('news.title')}
          description={t('news.description')}
          className="mb-0"
        />
      </div>

      <section className="flex flex-col gap-3 rounded-xl bg-card p-3 shadow-card sm:p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('providers.label')}
          </span>
          <MarketDataProviderSwitch
            value={provider}
            onChange={(next) => setFilter({ provider: next })}
          />
        </div>

        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault()
            setFilter({ q: queryDraft.trim() || null })
          }}
        >
          <InputGroup className="flex-1 bg-muted/50">
            <InputGroupAddon>
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
            </InputGroupAddon>
            <InputGroupInput
              value={queryDraft}
              onChange={(e) => setQueryDraft(e.target.value)}
              placeholder={t('news.searchPlaceholder')}
              aria-label={t('news.searchPlaceholder')}
            />
          </InputGroup>
          <Button type="submit" size="sm" variant="secondary" className="sm:w-auto">
            {t('news.searchAction')}
          </Button>
        </form>

        {(holdings.length > 0 || symbol) && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {t('news.filterByHolding')}
            </span>
            <FilterChip active={!symbol} onClick={() => setFilter({ symbol: null })}>
              {t('news.allStories')}
            </FilterChip>
            {holdings.map((position) => (
              <FilterChip
                key={position.symbol}
                active={symbol === position.symbol}
                onClick={() => setFilter({ symbol: position.symbol })}
              >
                {position.symbol}
              </FilterChip>
            ))}
            {symbol && !holdings.some((p) => p.symbol === symbol) && (
              <FilterChip active onClick={() => setFilter({ symbol: null })}>
                {symbol}
              </FilterChip>
            )}
          </div>
        )}

        {(symbol || query) && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>
              {news ? t('news.resultCount', { count: news.total }) : t('news.loading')}
            </span>
            <button
              type="button"
              onClick={() => {
                setQueryDraft('')
                setFilter({ symbol: null, q: null })
              }}
              className="inline-flex items-center gap-1 font-medium text-foreground underline-offset-2 hover:underline"
            >
              <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} className="size-3" />
              {t('news.clearFilters')}
            </button>
          </div>
        )}
      </section>

      {!providerReady ? (
        <Empty className="border border-dashed py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={News01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t('providers.comingSoonTitle', { provider: t(`providers.${provider}`) })}</EmptyTitle>
            <EmptyDescription>
              {t('providers.comingSoonDescription', { provider: t(`providers.${provider}`) })}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : isLoading ? (
        <>
          <div className="flex flex-col gap-2 sm:hidden">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-20 w-full rounded-xl" />
            ))}
          </div>
          <div className="hidden columns-2 gap-3 sm:block xl:columns-3">
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <Skeleton
                key={i}
                className={cn(
                  'mb-3 w-full break-inside-avoid rounded-xl',
                  i % 4 === 0 && 'h-72',
                  i % 4 === 1 && 'h-48',
                  i % 4 === 2 && 'h-56',
                  i % 4 === 3 && 'h-40',
                )}
              />
            ))}
          </div>
        </>
      ) : isError ? (
        <Empty className="border border-dashed py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={News01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t('news.failedTitle')}</EmptyTitle>
            <EmptyDescription>
              {accounts.length === 0 && provider === 'freedom24'
                ? t('news.needsAccount')
                : (error as Error)?.message || t('news.failedDescription')}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : items.length === 0 ? (
        <Empty className="border border-dashed py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={News01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t('news.emptyTitle')}</EmptyTitle>
            <EmptyDescription>{t('news.emptyDescription')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          {/* Mobile: dense horizontal rows for quick scanning. */}
          <ul className="flex flex-col gap-2 sm:hidden">
            {items.map((item) => (
              <li key={item.story_id}>
                <MobileStoryCard
                  item={item}
                  onOpen={() => setOpenStoryId(item.story_id)}
                  onSymbolClick={(next) => setFilter({ symbol: next })}
                />
              </li>
            ))}
          </ul>

          {/* sm+: poster collage with varied shapes. */}
          <ul className="hidden columns-2 gap-3 sm:block xl:columns-3">
            {items.map((item) => {
              const shape = pickPosterShape(item.story_id, layoutSeed, Boolean(item.image_url))
              return (
                <li key={item.story_id} className="mb-3 break-inside-avoid">
                  <StoryCard
                    item={item}
                    shape={shape}
                    onOpen={() => setOpenStoryId(item.story_id)}
                    onSymbolClick={(next) => setFilter({ symbol: next })}
                  />
                </li>
              )
            })}
          </ul>

          {hasMore && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={isFetching}
              >
                {isFetching ? t('news.loading') : t('news.loadMore')}
              </Button>
            </div>
          )}
        </>
      )}

      <StoryReader
        storyId={openStoryId}
        provider={provider}
        onClose={() => setOpenStoryId(null)}
      />
    </PageContainer>
  )
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'min-h-8 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
        active
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

/** Compact horizontal row for phone feeds — thumbnail + headline, no body. */
function MobileStoryCard({
  item,
  onOpen,
  onSymbolClick,
}: {
  item: NewsItem
  onOpen: () => void
  onSymbolClick: (symbol: string) => void
}) {
  const { t } = useTranslation('investments')
  const hasImage = Boolean(item.image_url)
  const meta = [item.source, item.published_at ? publishedLabel(item.published_at) : null]
    .filter(Boolean)
    .join(' · ')

  return (
    <Card
      size="sm"
      className="cursor-pointer py-0 transition-colors hover:border-primary/40"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={item.title}
    >
      <div className="flex items-stretch gap-0">
        {hasImage ? (
          <div className="relative w-20 min-h-20 shrink-0 self-stretch overflow-hidden rounded-s-xl">
            <img
              src={item.image_url!}
              alt=""
              loading="lazy"
              className="absolute inset-0 size-full object-cover"
            />
          </div>
        ) : (
          <div className="flex w-20 min-h-20 shrink-0 self-stretch items-center justify-center rounded-s-xl bg-muted/50 text-muted-foreground">
            <HugeiconsIcon icon={News01Icon} strokeWidth={1.75} />
          </div>
        )}

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <p className="line-clamp-2 text-sm font-medium leading-snug text-start">{item.title}</p>
            {item.sentiment && <SentimentDot sentiment={item.sentiment} />}
          </div>
          {meta && <p className="truncate text-[0.7rem] text-muted-foreground">{meta}</p>}
          {item.symbols.length > 0 && (
            <div className="flex flex-nowrap gap-1 overflow-hidden">
              {item.symbols.slice(0, 2).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onSymbolClick(s)
                  }}
                  title={t('news.filterBySymbol', { symbol: s })}
                >
                  <Badge variant="secondary" className="text-[0.65rem]">
                    {s}
                  </Badge>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}

function StoryCard({
  item,
  shape,
  onOpen,
  onSymbolClick,
}: {
  item: NewsItem
  shape: PosterShape
  onOpen: () => void
  onSymbolClick: (symbol: string) => void
}) {
  const { t } = useTranslation('investments')
  const hasImage = Boolean(item.image_url) && shape !== 'text'
  const meta = [item.source, item.published_at ? publishedLabel(item.published_at) : null]
    .filter(Boolean)
    .join(' · ')

  const imageAspect =
    shape === 'hero'
      ? 'aspect-[4/5]'
      : shape === 'portrait'
        ? 'aspect-[3/4]'
        : shape === 'wide'
          ? 'aspect-[21/9]'
          : 'aspect-[16/10]'

  const titleClamp =
    shape === 'hero' ? 'line-clamp-4' : shape === 'compact' ? 'line-clamp-2' : 'line-clamp-3'
  const summaryClamp =
    shape === 'hero' ? 'line-clamp-5' : shape === 'compact' ? 'line-clamp-2' : 'line-clamp-3'
  const showSummary = Boolean(item.summary) && shape !== 'compact'

  return (
    <Card
      size="sm"
      className={cn(
        'cursor-pointer transition-[border-color,transform] duration-200 hover:border-primary/40 hover:-translate-y-0.5 motion-reduce:transform-none',
        shape === 'hero' && 'rounded-2xl',
        shape === 'portrait' && 'rounded-3xl',
        shape === 'wide' && 'rounded-xl',
        shape === 'compact' && 'rounded-lg',
        shape === 'text' && 'rounded-2xl bg-muted/25',
        !hasImage && shape !== 'text' && 'bg-muted/25',
      )}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={item.title}
    >
      {hasImage ? (
        <img
          src={item.image_url!}
          alt=""
          loading="lazy"
          className={cn('w-full object-cover', imageAspect)}
        />
      ) : (
        <div className="flex items-center gap-2 border-b border-border/70 bg-muted/40 px-(--card-spacing) py-2.5">
          <span className="flex size-8 items-center justify-center rounded-lg bg-background text-muted-foreground ring-1 ring-border">
            <HugeiconsIcon icon={News01Icon} strokeWidth={1.75} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              {t('news.textArticle')}
            </p>
            {meta && <p className="truncate text-xs text-muted-foreground">{meta}</p>}
          </div>
        </div>
      )}

      <CardHeader>
        <CardTitle
          className={cn(
            'text-start',
            titleClamp,
            shape === 'hero' && 'font-heading text-base sm:text-lg',
          )}
        >
          {item.title}
        </CardTitle>
        {hasImage && meta && <CardDescription>{meta}</CardDescription>}
        {item.sentiment && (
          <CardAction>
            <Badge
              variant="outline"
              className={cn(
                'gap-1.5',
                item.sentiment === 'positive' && 'border-flow-in/40 text-flow-in',
                item.sentiment === 'negative' && 'border-flow-out/40 text-flow-out',
              )}
            >
              {t(`news.sentiment.${item.sentiment}`)}
            </Badge>
          </CardAction>
        )}
      </CardHeader>

      {showSummary && (
        <CardContent>
          <p className={cn('text-sm text-muted-foreground', summaryClamp)}>{item.summary}</p>
        </CardContent>
      )}

      {item.symbols.length > 0 && (
        <CardFooter className="flex flex-wrap gap-1.5">
          {item.symbols.slice(0, 4).map((s) => (
            <button
              key={s}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onSymbolClick(s)
              }}
              title={t('news.filterBySymbol', { symbol: s })}
            >
              <Badge variant="secondary">{s}</Badge>
            </button>
          ))}
        </CardFooter>
      )}
    </Card>
  )
}

/** The article itself. Fetched only when a story is opened — the feed carries no body. */
function StoryReader({
  storyId,
  provider,
  onClose,
}: {
  storyId: string | null
  provider: MarketDataProviderId
  onClose: () => void
}) {
  const { t } = useTranslation('investments')
  const { data: story, isLoading, isError } = useNewsStory(storyId, provider)

  const body = useMemo(() => {
    if (!story?.body_html) return null
    return DOMPurify.sanitize(story.body_html, { USE_PROFILES: { html: true } })
  }, [story?.body_html])

  const meta = [
    story?.source,
    story?.published_at
      ? formatDate(story.published_at, {
          day: '2-digit',
          month: 'short',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <Dialog open={!!storyId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[min(90vh,44rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border px-4 py-4 pe-12">
          <DialogTitle className="text-start text-base leading-snug sm:text-lg">
            {story?.title ?? t('news.loading')}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-start">
            {story && <SentimentDot sentiment={story.sentiment} />}
            {meta || t('news.loading')}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4">
          {isLoading ? (
            <div className="flex flex-col gap-2">
              <Skeleton className="h-48 w-full rounded-lg" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          ) : isError || !story ? (
            <p className="text-sm text-muted-foreground">{t('news.storyFailed')}</p>
          ) : (
            <>
              {story.image_url && (
                <img
                  src={story.image_url}
                  alt=""
                  className="max-h-64 w-full rounded-lg object-cover"
                />
              )}

              {story.symbols.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {story.symbols.map((s) => (
                    <Badge key={s} variant="secondary">
                      {s}
                    </Badge>
                  ))}
                </div>
              )}

              {body ? (
                <div
                  className={cn(
                    'text-sm leading-relaxed text-foreground',
                    '[&>*]:my-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0',
                    '[&_a]:underline [&_a]:underline-offset-2',
                    '[&_img]:max-w-full [&_img]:rounded-lg',
                  )}
                  dangerouslySetInnerHTML={{ __html: body }}
                />
              ) : (
                <p className="text-sm text-muted-foreground">{t('news.noBody')}</p>
              )}
            </>
          )}
        </div>

        {story?.url && (
          <DialogFooter>
            <Button asChild variant="outline" size="sm">
              <a href={story.url} target="_blank" rel="noreferrer">
                <HugeiconsIcon
                  icon={LinkSquare02Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {t('news.openOriginal')}
              </a>
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
