import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import {
  ChartLineData01Icon,
  LinkSquare02Icon,
  News01Icon,
} from '@hugeicons/core-free-icons'
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
import { useCompanyProfile } from './useInvestments'
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

  useEffect(() => setDraft(symbol), [symbol])

  const { data: profile, isLoading, isError } = useCompanyProfile(symbol || null)

  const submit = (value: string) => {
    const next = new URLSearchParams(params)
    const trimmed = value.trim().toUpperCase()
    if (trimmed) next.set('symbol', trimmed)
    else next.delete('symbol')
    setParams(next, { replace: true })
  }

  return (
    <PageContainer wide className="flex flex-col gap-5">
      {/* The sibling-page buttons are gone — the sidebar lists them now — but
          the breadcrumb stays: it says where this page sits and gets you back
          to the portfolio in one click. */}
      <div>
        <InvestmentsBreadcrumb current={t('research.title')} />
        <PageHeader
          title={t('research.title')}
          description={t('research.description')}
          className="mb-0"
        />
      </div>

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
        <CompanyProfileView profile={profile} />
      )}
    </PageContainer>
  )
}

function CompanyProfileView({ profile }: { profile: CompanyProfile }) {
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
              <span className="font-heading text-2xl font-semibold tabular-nums tracking-tight sm:text-3xl">
                {money(profile.current_price)}
              </span>
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
