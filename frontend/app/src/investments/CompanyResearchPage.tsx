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
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { formatCurrency } from '../lib/format'
import { DeltaPct, InvestmentsBreadcrumb, Metric } from './InvestmentPrimitives'
import { useCompanyProfile, useWatches, useSaveWatch, useDeleteWatch } from './useInvestments'
import { WatchCard } from './widgets/WatchCard'
import type { CompanyProfile } from './investmentsApi'

/**
 * Company research powered by Yahoo Finance — profile, quote, and key stats
 * for any symbol the user looks up.
 */
export function CompanyResearchPage() {
  const { t } = useTranslation('investments')
  const [params, setParams] = useSearchParams()
  const symbol = (params.get('symbol') ?? '').trim().toUpperCase()
  const [draft, setDraft] = useState(symbol)
  const [showSearch, setShowSearch] = useState(false)

  useEffect(() => setDraft(symbol), [symbol])

  // If a symbol is loaded from URL, we're in research mode — show search
  // automatically so the user can switch tickers.
  useEffect(() => {
    if (symbol) setShowSearch(true)
  }, [symbol])

  const { data: profile, isLoading, isError } = useCompanyProfile(symbol || null)
  const { data: watches } = useWatches()
  const saveWatch = useSaveWatch()
  const deleteWatch = useDeleteWatch()

  const hasWatches = watches && watches.length > 0
  // When the user has watches and hasn't started a search yet, show
  // the watchlist-only view. If no watches, the search is always visible.
  const isWatchlistOnly = hasWatches && !showSearch && !symbol

  const submit = (value: string) => {
    const next = new URLSearchParams(params)
    const trimmed = value.trim().toUpperCase()
    if (trimmed) next.set('symbol', trimmed)
    else next.delete('symbol')
    setParams(next, { replace: true })
  }

  const searchForm = (
    <form
      className="flex flex-col gap-2 rounded-xl border border-border bg-muted/40 p-3 sm:flex-row sm:p-3.5"
      onSubmit={(e) => {
        e.preventDefault()
        submit(draft)
      }}
    >
      <InputGroup className="flex-1 border-border/80 bg-background shadow-xs">
        <InputGroupAddon>
          <HugeiconsIcon icon={ChartLineData01Icon} strokeWidth={2} />
        </InputGroupAddon>
        <InputGroupInput
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('research.placeholder')}
          aria-label={t('research.placeholder')}
          autoFocus
        />
      </InputGroup>
      <Button type="submit" size="sm" variant="secondary" disabled={!draft.trim()}>
        {t('research.action')}
      </Button>
    </form>
  )

  // ── Watchlist-only view: no search, no breadcrumb, no header ──
  if (isWatchlistOnly) {
    return (
      <PageContainer wide className="flex flex-col gap-5">
        <div className="flex items-center justify-between">
          <div>
            <InvestmentsBreadcrumb current={t('research.title')} />
            <PageHeader
              title={t('research.watchedCompanies')}
              description={t('research.watchedDescription')}
              className="mb-0"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 shrink-0"
            onClick={() => setShowSearch(true)}
          >
            <HugeiconsIcon icon={Search01Icon} strokeWidth={2} className="size-4" />
            <span className="hidden sm:inline">{t('research.newResearch')}</span>
          </Button>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {watches!.map((w) => (
            <WatchCard key={w.id} watch={w} onDelete={() => deleteWatch.mutate(w.id)} />
          ))}
        </div>
      </PageContainer>
    )
  }

  // ── Research/symbol view (or no watches at all) ──
  return (
    <PageContainer wide className="flex flex-col gap-5">
      {/* Back to watchlist button */}
      {hasWatches && showSearch && (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowSearch(false)
              // Clear symbol so we go back to watchlist-only
              const next = new URLSearchParams(params)
              next.delete('symbol')
              setParams(next, { replace: true })
            }}
          >
            <span className="text-xs">{t('research.backToWatchlist')}</span>
          </Button>
        </div>
      )}

      <div>
        <InvestmentsBreadcrumb current={t('research.title')} />
        <PageHeader
          title={t('research.title')}
          description={t('research.description')}
          className="mb-0"
        />
      </div>

      {searchForm}

      {!symbol ? (
        <Empty className="border border-dashed bg-card/60 py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={ChartLineData01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t('research.idleTitle')}</EmptyTitle>
            <EmptyDescription>{t('research.idleDescription')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : isLoading ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-40 w-full rounded-xl" />
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : isError || !profile ? (
        <Empty className="border border-dashed bg-card/60 py-12">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={ChartLineData01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t('research.failedTitle')}</EmptyTitle>
            <EmptyDescription>
              {t('research.failedDescription', { symbol })}
            </EmptyDescription>
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
    </PageContainer>
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
