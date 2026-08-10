import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { ChartLineData01Icon, News01Icon, Search01Icon } from '@hugeicons/core-free-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
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
import { formatCurrency } from '../lib/format'
import { DeltaPct, InvestmentsBreadcrumb } from './InvestmentPrimitives'
import { useCompanyProfile, useSaveWatch, useDeleteWatch, useSymbolSearch, useWatches } from './useInvestments'
import { WatchCard } from './widgets/WatchCard'
import { CompanyProfileView } from './research/CompanyProfileView'
import type { SymbolSearchResult } from './investmentsApi'

const MIN_QUERY_LENGTH = 2

/**
 * Instrument search and company research, combined.
 *
 * Search and research used to be two pages joined by a link — you searched,
 * then hopped to a second page to see anything about what you found. Here
 * search sits above the profile (`research/CompanyProfileView`, a bento grid
 * of focused widgets): picking a result loads the profile inline, no
 * navigation. `symbol` still lives in the URL so a specific company can be
 * linked to directly from elsewhere in the app. Yahoo Finance only — Freedom24
 * and Binance are not market-data sources for this page.
 */
export function CompanyResearchPage() {
  const { t } = useTranslation('investments')
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const symbol = (params.get('symbol') ?? '').trim().toUpperCase()
  const [draft, setDraft] = useState(query)

  useEffect(() => setDraft(query), [query])

  const {
    data: results = [],
    isLoading: searchLoading,
    isError: searchFailed,
    error: searchError,
  } = useSymbolSearch(query, { minLength: MIN_QUERY_LENGTH, provider: 'yahoo' })

  const { data: profile, isLoading: profileLoading, isError: profileFailed } = useCompanyProfile(
    symbol || null,
  )
  const { data: watches } = useWatches()
  const saveWatch = useSaveWatch()
  const deleteWatch = useDeleteWatch()
  const hasWatches = watches != null && watches.length > 0

  const updateParams = (next: { q?: string | null; symbol?: string | null }) => {
    const updated = new URLSearchParams(params)
    if ('q' in next) {
      if (next.q?.trim()) updated.set('q', next.q.trim())
      else updated.delete('q')
    }
    if ('symbol' in next) {
      if (next.symbol?.trim()) updated.set('symbol', next.symbol.trim().toUpperCase())
      else updated.delete('symbol')
    }
    setParams(updated, { replace: true })
  }

  const submitSearch = (value: string) => updateParams({ q: value })
  const selectSymbol = (sym: string) => updateParams({ symbol: sym })
  const clearSymbol = () => updateParams({ symbol: null })

  const showBackButton = Boolean(symbol) && (query || hasWatches)

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <div>
        <InvestmentsBreadcrumb
          current={symbol || t('research.title')}
          parent={symbol ? { label: t('research.title'), onClick: clearSymbol } : undefined}
        />
        <PageHeader
          title={t('research.title')}
          description={t('research.description')}
          className="mb-0"
          action={
            showBackButton ? (
              <Button variant="ghost" size="sm" onClick={clearSymbol}>
                <span className="text-xs">
                  {query ? t('research.backToResults') : t('research.backToWatchlist')}
                </span>
              </Button>
            ) : undefined
          }
        />
      </div>

      {!symbol && (
        <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:p-3.5">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault()
              submitSearch(draft)
            }}
          >
            <InputGroup className="flex-1 border-border/80 bg-background shadow-xs">
              <InputGroupAddon>
                <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
              </InputGroupAddon>
              <InputGroupInput
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={t('search.placeholder')}
                aria-label={t('search.placeholder')}
                autoFocus
              />
            </InputGroup>
            <Button
              type="submit"
              size="sm"
              variant="secondary"
              disabled={draft.trim().length < MIN_QUERY_LENGTH}
            >
              {t('search.action')}
            </Button>
          </form>
        </section>
      )}

      {symbol ? (
        <>
          {profileLoading ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-40 w-full rounded-xl" />
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
              </div>
              <Skeleton className="h-48 w-full rounded-xl" />
            </div>
          ) : profileFailed || !profile ? (
            <Empty className="border border-dashed bg-card/60 py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={ChartLineData01Icon} strokeWidth={2} />
                </EmptyMedia>
                <EmptyTitle>{t('research.failedTitle')}</EmptyTitle>
                <EmptyDescription>{t('research.failedDescription', { symbol })}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <CompanyProfileView
              profile={profile}
              isWatched={watches?.some((w) => w.symbol === symbol) ?? false}
              onToggleWatch={() => {
                const existing = watches?.find((w) => w.symbol === symbol)
                if (existing) {
                  deleteWatch.mutate(existing.id)
                } else {
                  saveWatch.mutate({ symbol, name: profile.name ?? undefined })
                }
              }}
            />
          )}
        </>
      ) : query.length > 0 ? (
        <SearchResults
          query={query}
          results={results}
          isLoading={searchLoading}
          isError={searchFailed}
          error={searchError as Error | null}
          onSelect={selectSymbol}
        />
      ) : hasWatches ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-muted-foreground">
              {t('research.watchedCompanies')}
            </h3>
            <p className="text-xs text-muted-foreground">{t('research.watchedDescription')}</p>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {watches!.map((w) => (
              <WatchCard key={w.id} watch={w} onDelete={() => deleteWatch.mutate(w.id)} />
            ))}
          </div>
        </div>
      ) : (
        <Empty className="border border-dashed bg-card/60 py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t('search.idleTitle')}</EmptyTitle>
            <EmptyDescription>{t('search.idleDescription')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </PageContainer>
  )
}

function SearchResults({
  query,
  results,
  isLoading,
  isError,
  error,
  onSelect,
}: {
  query: string
  results: SymbolSearchResult[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  onSelect: (symbol: string) => void
}) {
  const { t } = useTranslation('investments')

  if (query.length < MIN_QUERY_LENGTH) {
    return (
      <Empty className="border border-dashed bg-card/60 py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>{t('search.idleTitle')}</EmptyTitle>
          <EmptyDescription>{t('search.idleDescription')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />

  if (isError) {
    return (
      <Empty className="border border-dashed bg-card/60 py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>{t('search.failedTitle')}</EmptyTitle>
          <EmptyDescription>{error?.message || t('search.failedDescription')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (results.length === 0) {
    return (
      <Empty className="border border-dashed bg-card/60 py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>{t('search.emptyTitle')}</EmptyTitle>
          <EmptyDescription>{t('search.emptyDescription', { query })}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  return (
    <>
      <p className="text-xs text-muted-foreground">
        {t('search.resultCount', { count: results.length })}
      </p>

      <ul className="flex flex-col gap-2 md:hidden">
        {results.map((result) => (
          <li
            key={`${result.symbol}-${result.isin ?? ''}`}
            className="rounded-xl border border-border bg-card p-3"
          >
            <button
              type="button"
              className="flex w-full items-start justify-between gap-2 text-start"
              onClick={() => onSelect(result.symbol)}
            >
              <div className="min-w-0">
                <p className="font-medium">{result.symbol}</p>
                {result.name && (
                  <p className="truncate text-xs text-muted-foreground">{result.name}</p>
                )}
              </div>
              <div className="flex flex-col items-end gap-0.5">
                {result.last_price != null && (
                  <span className="text-sm font-medium tabular-nums">
                    {formatCurrency(result.last_price, result.currency ?? 'USD')}
                  </span>
                )}
                <DeltaPct pct={result.day_change_pct} className="text-xs" />
              </div>
            </button>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {result.exchange && <Badge variant="outline">{result.exchange}</Badge>}
              {result.instrument_type && (
                <Badge variant="secondary" className="capitalize">
                  {result.instrument_type}
                </Badge>
              )}
              <div className="ms-auto flex items-center gap-1">
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/investments/technical?symbol=${encodeURIComponent(result.symbol)}`}>
                    {t('search.viewTechnical')}
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm">
                  <Link to={`/investments/news?symbol=${encodeURIComponent(result.symbol)}`}>
                    {t('search.viewNews')}
                  </Link>
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <div
        className={cn(
          'hidden overflow-hidden rounded-xl border border-border md:block',
          'bg-card text-card-foreground shadow-xs',
        )}
      >
        <Table>
          <TableHeader className="bg-muted/70 [&_tr]:border-border">
            <TableRow className="hover:bg-transparent">
              <TableHead className="ps-3">{t('search.table.symbol')}</TableHead>
              <TableHead>{t('search.table.name')}</TableHead>
              <TableHead>{t('search.table.exchange')}</TableHead>
              <TableHead>{t('search.table.type')}</TableHead>
              <TableHead className="text-end">{t('search.table.lastPrice')}</TableHead>
              <TableHead className="text-end">{t('search.table.dayChange')}</TableHead>
              <TableHead className="pe-3 text-end">{t('search.table.actions')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {results.map((result, index) => (
              <SearchRow
                key={`${result.symbol}-${result.isin ?? ''}`}
                result={result}
                striped={index % 2 === 1}
                onSelect={onSelect}
              />
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

function SearchRow({
  result,
  striped,
  onSelect,
}: {
  result: SymbolSearchResult
  striped: boolean
  onSelect: (symbol: string) => void
}) {
  const { t } = useTranslation('investments')
  return (
    <TableRow className={cn(striped && 'bg-muted/35', 'hover:bg-muted/55')}>
      <TableCell className="ps-3 font-medium">
        {result.symbol}
        {result.isin && (
          <div className="text-xs font-normal text-muted-foreground">{result.isin}</div>
        )}
      </TableCell>
      <TableCell className="max-w-56 truncate text-foreground">{result.name ?? '—'}</TableCell>
      <TableCell>
        {result.exchange ? <Badge variant="outline">{result.exchange}</Badge> : '—'}
      </TableCell>
      <TableCell className="capitalize text-muted-foreground">
        {result.instrument_type ?? '—'}
      </TableCell>
      <TableCell className="text-end tabular-nums">
        {result.last_price != null
          ? formatCurrency(result.last_price, result.currency ?? 'USD')
          : '—'}
      </TableCell>
      <TableCell className="text-end">
        <DeltaPct pct={result.day_change_pct} />
      </TableCell>
      <TableCell className="pe-3 text-end">
        <div className="flex items-center justify-end gap-1">
          <Button variant="secondary" size="sm" onClick={() => onSelect(result.symbol)}>
            <HugeiconsIcon icon={ChartLineData01Icon} strokeWidth={2} data-icon="inline-start" />
            {t('search.viewResearch')}
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to={`/investments/technical?symbol=${encodeURIComponent(result.symbol)}`}>
              {t('search.viewTechnical')}
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link to={`/investments/news?symbol=${encodeURIComponent(result.symbol)}`}>
              <HugeiconsIcon icon={News01Icon} strokeWidth={2} data-icon="inline-start" />
              {t('search.viewNews')}
            </Link>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
