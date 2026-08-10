import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ChartLineData01Icon,
  LinkSquare02Icon,
  News01Icon,
  Search01Icon,
  StarIcon,
} from '@hugeicons/core-free-icons'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
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
import {
  DeltaPct,
  InvestmentsBreadcrumb,
  MarketDataProviderSwitch,
  Metric,
} from './InvestmentPrimitives'
import {
  useCompanyProfile,
  useInvestmentAccounts,
  useSaveWatch,
  useDeleteWatch,
  useSymbolSearch,
  useWatches,
} from './useInvestments'
import { WatchCard } from './widgets/WatchCard'
import {
  isMarketDataProviderReady,
  parseMarketDataProvider,
  type CompanyProfile,
  type MarketDataProviderId,
  type SymbolSearchResult,
} from './investmentsApi'

const MIN_QUERY_LENGTH = 2

/**
 * Instrument search and company research, combined.
 *
 * Search and research used to be two pages joined by a link — you searched,
 * then hopped to a second page to see anything about what you found. Here the
 * provider-aware search (formerly Ticker Search) sits above the profile
 * (formerly Company Research): picking a result loads the profile inline, no
 * navigation. `symbol` still lives in the URL so a specific company can be
 * linked to directly from elsewhere in the app.
 */
export function CompanyResearchPage() {
  const { t } = useTranslation('investments')
  const [params, setParams] = useSearchParams()
  const query = params.get('q') ?? ''
  const provider = parseMarketDataProvider(params.get('provider'))
  const providerReady = isMarketDataProviderReady(provider)
  const symbol = (params.get('symbol') ?? '').trim().toUpperCase()
  const [draft, setDraft] = useState(query)

  useEffect(() => setDraft(query), [query])

  const { data: accounts = [] } = useInvestmentAccounts()
  const {
    data: results = [],
    isLoading: searchLoading,
    isError: searchFailed,
    error: searchError,
  } = useSymbolSearch(query, { minLength: MIN_QUERY_LENGTH, provider })

  const { data: profile, isLoading: profileLoading, isError: profileFailed } = useCompanyProfile(
    symbol || null,
  )
  const { data: watches } = useWatches()
  const saveWatch = useSaveWatch()
  const deleteWatch = useDeleteWatch()
  const hasWatches = watches != null && watches.length > 0

  const updateParams = (next: {
    q?: string | null
    provider?: MarketDataProviderId | null
    symbol?: string | null
  }) => {
    const updated = new URLSearchParams(params)
    if ('q' in next) {
      if (next.q?.trim()) updated.set('q', next.q.trim())
      else updated.delete('q')
    }
    if ('provider' in next) {
      if (next.provider && next.provider !== 'yahoo') updated.set('provider', next.provider)
      else updated.delete('provider')
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

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <div>
        <InvestmentsBreadcrumb current={t('research.title')} />
        <PageHeader title={t('research.title')} description={t('research.description')} className="mb-0" />
      </div>

      <section className="flex flex-col gap-3 rounded-xl border border-border bg-muted/40 p-3 sm:p-3.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('providers.label')}
          </span>
          <MarketDataProviderSwitch
            value={provider}
            onChange={(next) => updateParams({ provider: next })}
          />
        </div>

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

      {symbol ? (
        <>
          {(query || hasWatches) && (
            <div className="flex justify-end">
              <Button variant="ghost" size="sm" onClick={clearSymbol}>
                <span className="text-xs">
                  {query ? t('research.backToResults') : t('research.backToWatchlist')}
                </span>
              </Button>
            </div>
          )}

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
          provider={provider}
          providerReady={providerReady}
          hasAccounts={accounts.length > 0}
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
  provider,
  providerReady,
  hasAccounts,
  results,
  isLoading,
  isError,
  error,
  onSelect,
}: {
  query: string
  provider: MarketDataProviderId
  providerReady: boolean
  hasAccounts: boolean
  results: SymbolSearchResult[]
  isLoading: boolean
  isError: boolean
  error: Error | null
  onSelect: (symbol: string) => void
}) {
  const { t } = useTranslation('investments')

  if (!providerReady) {
    return (
      <Empty className="border border-dashed bg-card/60 py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>
            {t('providers.comingSoonTitle', { provider: t(`providers.${provider}`) })}
          </EmptyTitle>
          <EmptyDescription>
            {t('providers.comingSoonDescription', { provider: t(`providers.${provider}`) })}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (!hasAccounts && provider === 'freedom24') {
    return (
      <Empty className="border border-dashed bg-card/60 py-12">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
          </EmptyMedia>
          <EmptyTitle>{t('search.needsAccountTitle')}</EmptyTitle>
          <EmptyDescription>{t('search.needsAccount')}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

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

function CompanyProfileView({
  profile,
  isWatched,
  onToggleWatch,
}: {
  profile: CompanyProfile
  isWatched: boolean
  onToggleWatch: () => void
}) {
  const { t } = useTranslation('investments')
  const currency = profile.currency ?? 'USD'
  const money = (value: number | null | undefined) =>
    value == null ? '—' : formatCurrency(value, currency)

  const location = [profile.city, profile.state, profile.country].filter(Boolean).join(', ')

  return (
    <div className="flex flex-col gap-4">
      <Card size="sm" className="overflow-hidden">
        <CardHeader className="border-b border-border">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl sm:text-2xl">{profile.symbol}</CardTitle>
                {profile.quote_type && (
                  <Badge variant="secondary" className="capitalize">
                    {profile.quote_type}
                  </Badge>
                )}
                {profile.exchange && <Badge variant="outline">{profile.exchange}</Badge>}
              </div>
              <CardDescription className="text-base text-foreground">
                {profile.name ?? profile.short_name ?? profile.symbol}
              </CardDescription>
              {(profile.sector || profile.industry) && (
                <p className="text-xs text-muted-foreground">
                  {[profile.sector, profile.industry].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-1">
                <span className="font-heading text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
                  {money(profile.current_price)}
                </span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onToggleWatch}
                  title={isWatched ? t('research.removeWatch') : t('research.saveWatch')}
                  className={isWatched ? 'text-yellow-500 hover:text-yellow-600' : 'text-muted-foreground'}
                >
                  <HugeiconsIcon
                    icon={StarIcon}
                    strokeWidth={2}
                    style={isWatched ? { fill: 'currentColor' } : { fill: 'none' }}
                  />
                </Button>
              </div>
              <DeltaPct pct={profile.day_change_pct} className="text-sm" />
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Button asChild size="sm" variant="secondary">
            <Link to={`/investments/technical?symbol=${encodeURIComponent(profile.symbol)}`}>
              <HugeiconsIcon icon={ChartLineData01Icon} strokeWidth={2} data-icon="inline-start" />
              {t('research.viewTechnical')}
            </Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to={`/investments/news?symbol=${encodeURIComponent(profile.symbol)}`}>
              <HugeiconsIcon icon={News01Icon} strokeWidth={2} data-icon="inline-start" />
              {t('research.viewNews')}
            </Link>
          </Button>
          {profile.website && (
            <Button asChild size="sm" variant="outline">
              <a href={profile.website} target="_blank" rel="noreferrer">
                <HugeiconsIcon icon={LinkSquare02Icon} strokeWidth={2} data-icon="inline-start" />
                {t('research.website')}
              </a>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Performance & Risk (1Y) */}
      {(profile.one_year_return != null ||
        profile.one_year_volatility != null ||
        profile.max_drawdown_1y != null ||
        profile.sharpe_1y != null) && (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {t('research.performanceTitle')}
          </h3>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatCard
              label={t('research.oneYearReturn')}
              value={
                profile.one_year_return != null
                  ? `${profile.one_year_return >= 0 ? '+' : ''}${(profile.one_year_return * 100).toFixed(1)}%`
                  : '—'
              }
            />
            <StatCard
              label={t('research.oneYearVolatility')}
              value={
                profile.one_year_volatility != null
                  ? `${(profile.one_year_volatility * 100).toFixed(1)}%`
                  : '—'
              }
            />
            <StatCard
              label={t('research.maxDrawdown1y')}
              value={
                profile.max_drawdown_1y != null ? `${(profile.max_drawdown_1y * 100).toFixed(1)}%` : '—'
              }
            />
            <StatCard
              label={t('research.sharpe1y')}
              value={profile.sharpe_1y != null ? profile.sharpe_1y.toFixed(2) : '—'}
            />
          </div>
        </div>
      )}

      {/* Price chart */}
      {profile.price_history && profile.price_history.length > 0 && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>{t('research.chartTitle')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={profile.price_history}>
                <defs>
                  <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-flow-in)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="var(--color-flow-in)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10 }}
                  tickFormatter={(d: string) => {
                    const date = new Date(d)
                    return date.toLocaleDateString(undefined, { month: 'short' })
                  }}
                  interval="preserveStartEnd"
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  domain={['auto', 'auto']}
                  tick={{ fontSize: 10 }}
                  tickFormatter={(v: number) =>
                    new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(v)
                  }
                  width={45}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value), profile.currency ?? 'USD'), '']}
                  labelFormatter={(label) => new Date(String(label)).toLocaleDateString()}
                />
                <Area
                  type="monotone"
                  dataKey="close"
                  stroke="var(--color-flow-in)"
                  fill="url(#priceGradient)"
                  strokeWidth={1.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Valuation */}
      {profile.quote_type === 'stock' ? (
        (profile.trailing_pe != null ||
          profile.forward_pe != null ||
          profile.price_to_book != null ||
          profile.ev_to_ebitda != null ||
          profile.fcf_yield != null ||
          profile.roe != null ||
          profile.debt_to_equity != null ||
          profile.revenue_growth != null ||
          profile.gross_margin != null ||
          profile.payout_ratio != null) && (
          <Card size="sm">
            <CardHeader>
              <CardTitle>{t('research.valuationTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {profile.trailing_pe != null && (
                  <StatCard label={t('research.stats.pe')} value={profile.trailing_pe.toFixed(2)} />
                )}
                {profile.forward_pe != null && (
                  <StatCard label={t('research.stats.forwardPe')} value={profile.forward_pe.toFixed(2)} />
                )}
                {profile.price_to_book != null && (
                  <StatCard label={t('research.priceToBook')} value={profile.price_to_book.toFixed(2)} />
                )}
                {profile.ev_to_ebitda != null && (
                  <StatCard label={t('research.evToEbitda')} value={profile.ev_to_ebitda.toFixed(2)} />
                )}
                {profile.fcf_yield != null && (
                  <StatCard label={t('research.fcfYield')} value={`${(profile.fcf_yield * 100).toFixed(1)}%`} />
                )}
                {profile.roe != null && (
                  <StatCard label={t('research.roe')} value={`${(profile.roe * 100).toFixed(1)}%`} />
                )}
                {profile.debt_to_equity != null && (
                  <StatCard label={t('research.debtToEquity')} value={profile.debt_to_equity.toFixed(2)} />
                )}
                {profile.revenue_growth != null && (
                  <StatCard
                    label={t('research.revenueGrowth')}
                    value={`${(profile.revenue_growth * 100).toFixed(1)}%`}
                  />
                )}
                {profile.gross_margin != null && (
                  <StatCard label={t('research.grossMargin')} value={`${(profile.gross_margin * 100).toFixed(1)}%`} />
                )}
                {profile.payout_ratio != null && (
                  <StatCard
                    label={t('research.payoutRatio')}
                    value={`${(profile.payout_ratio * 100).toFixed(1)}%`}
                  />
                )}
              </div>
            </CardContent>
          </Card>
        )
      ) : profile.quote_type === 'etf' || profile.quote_type === 'mutual_fund' ? (
        (profile.expense_ratio != null ||
          profile.aum != null ||
          profile.category != null ||
          profile.yield_ != null) && (
          <Card size="sm">
            <CardHeader>
              <CardTitle>{t('research.valuationTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {profile.expense_ratio != null && (
                  <StatCard
                    label={t('research.expenseRatio')}
                    value={`${(profile.expense_ratio * 100).toFixed(2)}%`}
                  />
                )}
                {profile.aum != null && (
                  <StatCard label={t('research.aum')} value={formatCompact(profile.aum, currency)} />
                )}
                {profile.category != null && <StatCard label={t('research.category')} value={profile.category} />}
                {profile.yield_ != null && (
                  <StatCard label={t('research.yield')} value={`${(profile.yield_ * 100).toFixed(2)}%`} />
                )}
              </div>
            </CardContent>
          </Card>
        )
      ) : profile.quote_type === 'crypto' ? (
        (profile.market_cap != null ||
          profile.circulating_supply != null ||
          profile.volume_24h != null) && (
          <Card size="sm">
            <CardHeader>
              <CardTitle>{t('research.valuationTitle')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {profile.market_cap != null && (
                  <StatCard label={t('research.stats.marketCap')} value={formatCompact(profile.market_cap, currency)} />
                )}
                {profile.circulating_supply != null && (
                  <StatCard
                    label={t('research.circulatingSupply')}
                    value={profile.circulating_supply.toLocaleString()}
                  />
                )}
                {profile.volume_24h != null && (
                  <StatCard label={t('research.volume24h')} value={profile.volume_24h.toLocaleString()} />
                )}
              </div>
            </CardContent>
          </Card>
        )
      ) : null}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label={t('research.stats.marketCap')} value={formatCompact(profile.market_cap, currency)} />
        <StatCard label={t('research.stats.pe')} value={formatNumber(profile.trailing_pe)} />
        <StatCard label={t('research.stats.forwardPe')} value={formatNumber(profile.forward_pe)} />
        <StatCard
          label={t('research.stats.dividendYield')}
          value={profile.dividend_yield != null ? `${profile.dividend_yield.toFixed(2)}%` : '—'}
        />
        <StatCard label={t('research.stats.beta')} value={formatNumber(profile.beta)} />
        <StatCard label={t('research.stats.target')} value={money(profile.target_mean_price)} />
        <StatCard
          label={t('research.stats.recommendation')}
          value={profile.recommendation ? profile.recommendation.replace(/_/g, ' ') : '—'}
        />
        <StatCard
          label={t('research.stats.employees')}
          value={profile.employees != null ? profile.employees.toLocaleString() : '—'}
        />
      </div>

      <Card size="sm">
        <CardHeader>
          <CardTitle>{t('research.quoteTitle')}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
            <QuoteRow label={t('research.stats.open')} value={money(profile.open)} />
            <QuoteRow label={t('research.stats.previousClose')} value={money(profile.previous_close)} />
            <QuoteRow label={t('research.stats.dayHigh')} value={money(profile.day_high)} />
            <QuoteRow label={t('research.stats.dayLow')} value={money(profile.day_low)} />
            <QuoteRow label={t('research.stats.weekHigh')} value={money(profile.fifty_two_week_high)} />
            <QuoteRow label={t('research.stats.weekLow')} value={money(profile.fifty_two_week_low)} />
            <QuoteRow
              label={t('research.stats.volume')}
              value={profile.volume != null ? profile.volume.toLocaleString() : '—'}
            />
            <QuoteRow
              label={t('research.stats.avgVolume')}
              value={profile.average_volume != null ? profile.average_volume.toLocaleString() : '—'}
            />
          </dl>
        </CardContent>
      </Card>

      {(profile.summary || location) && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>{t('research.aboutTitle')}</CardTitle>
            {location && <CardDescription>{location}</CardDescription>}
          </CardHeader>
          {profile.summary && (
            <CardContent>
              <p className="text-sm leading-relaxed text-muted-foreground whitespace-pre-wrap">
                {profile.summary}
              </p>
            </CardContent>
          )}
        </Card>
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-3">
      <Metric label={label} value={value} size="sm" />
    </div>
  )
}

function QuoteRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value}</dd>
    </div>
  )
}

function formatNumber(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—'
  return value.toFixed(2)
}

function formatCompact(value: number | null | undefined, currency: string): string {
  if (value == null || Number.isNaN(value)) return '—'
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 2,
    }).format(value)
  } catch {
    return formatCurrency(value, currency)
  }
}
