import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { CompanyProfile } from '../investmentsApi'
import {
  deltaClass,
  fmtCompactMoney,
  fmtInt,
  fmtMoney,
  fmtPct,
  fmtRatio,
} from './researchFormat'

/**
 * Bento cells D2-D5 — the reference tables.
 *
 * All four share one dense two-column row so spacing and alternating stripes
 * stay identical across cards sitting side by side. Each returns null for
 * non-stock quote types; the ETF and crypto blocks live in CompanyProfileView.
 */
function Row({
  label,
  value,
  tone,
  striped,
}: {
  label: string
  value: ReactNode
  tone?: string
  striped: boolean
}) {
  return (
    <div
      className={cn(
        'flex items-baseline justify-between gap-3 rounded px-2 py-1.5',
        striped && 'bg-muted/30',
      )}
    >
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn('text-sm font-medium tabular-nums', tone ?? 'text-foreground')}>
        {value}
      </span>
    </div>
  )
}

function TableCard({
  title,
  rows,
  className,
}: {
  title: string
  rows: { label: string; value: ReactNode; tone?: string }[]
  className?: string
}) {
  return (
    <Card size="sm" className={cn('flex flex-col', className)}>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1">
        <div className="flex flex-col">
          {rows.map((row, index) => (
            <Row key={row.label} {...row} striped={index % 2 === 1} />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

export function ValuationTable({
  profile,
  className,
}: {
  profile: CompanyProfile
  className?: string
}) {
  const { t } = useTranslation('investments')
  if (profile.quote_type !== 'stock') return null

  const earningsYield =
    profile.trailing_pe != null && profile.trailing_pe !== 0 ? 1 / profile.trailing_pe : null

  return (
    <TableCard
      title={t('research.valuationTitle')}
      className={className}
      rows={[
        { label: t('research.stats.pe'), value: fmtRatio(profile.trailing_pe) },
        { label: t('research.stats.forwardPe'), value: fmtRatio(profile.forward_pe) },
        { label: t('research.pegRatio'), value: fmtRatio(profile.peg_ratio) },
        { label: t('research.priceToBook'), value: fmtRatio(profile.price_to_book) },
        { label: t('research.priceToSales'), value: fmtRatio(profile.price_to_sales) },
        { label: t('research.evToEbitda'), value: fmtRatio(profile.ev_to_ebitda) },
        { label: t('research.evToSales'), value: fmtRatio(profile.ev_to_sales) },
        { label: t('research.earningsYield'), value: fmtPct(earningsYield) },
        { label: t('research.fcfYield'), value: fmtPct(profile.fcf_yield) },
        {
          label: t('research.stats.dividendYield'),
          value: profile.dividend_yield != null ? `${profile.dividend_yield.toFixed(2)}%` : '—',
        },
        { label: t('research.payoutRatio'), value: fmtPct(profile.payout_ratio) },
      ]}
    />
  )
}

export function ProfitabilityTable({
  profile,
  className,
}: {
  profile: CompanyProfile
  className?: string
}) {
  const { t } = useTranslation('investments')
  if (profile.quote_type !== 'stock') return null

  return (
    <TableCard
      title={t('research.profitabilityTitle')}
      className={className}
      rows={[
        { label: t('research.roe'), value: fmtPct(profile.roe) },
        { label: t('research.roa'), value: fmtPct(profile.return_on_assets) },
        { label: t('research.grossMargin'), value: fmtPct(profile.gross_margin) },
        { label: t('research.operatingMargin'), value: fmtPct(profile.operating_margin) },
        { label: t('research.profitMargin'), value: fmtPct(profile.profit_margin) },
        {
          label: t('research.revenueGrowth'),
          value: fmtPct(profile.revenue_growth, { signed: true }),
          tone: deltaClass(profile.revenue_growth),
        },
        {
          label: t('research.earningsGrowth'),
          value: fmtPct(profile.earnings_growth, { signed: true }),
          tone: deltaClass(profile.earnings_growth),
        },
      ]}
    />
  )
}

export function BalanceSheetTable({
  profile,
  className,
}: {
  profile: CompanyProfile
  className?: string
}) {
  const { t } = useTranslation('investments')
  if (profile.quote_type !== 'stock') return null
  const currency = profile.currency ?? 'USD'
  const netCash =
    profile.total_cash != null && profile.total_debt != null
      ? profile.total_cash - profile.total_debt
      : null

  return (
    <TableCard
      title={t('research.balanceSheetTitle')}
      className={className}
      rows={[
        { label: t('research.totalCash'), value: fmtCompactMoney(profile.total_cash, currency) },
        { label: t('research.totalDebt'), value: fmtCompactMoney(profile.total_debt, currency) },
        {
          label: t('research.netCash'),
          value: fmtCompactMoney(netCash, currency),
          tone: deltaClass(netCash),
        },
        { label: t('research.debtToEquity'), value: fmtRatio(profile.debt_to_equity) },
        { label: t('research.debtToEbitda'), value: fmtRatio(profile.debt_to_ebitda) },
        { label: t('research.currentRatio'), value: fmtRatio(profile.current_ratio) },
        { label: t('research.quickRatio'), value: fmtRatio(profile.quick_ratio) },
        { label: t('research.bookValue'), value: fmtMoney(profile.book_value, currency) },
      ]}
    />
  )
}

export function EarningsTable({
  profile,
  className,
}: {
  profile: CompanyProfile
  className?: string
}) {
  const { t } = useTranslation('investments')
  if (profile.quote_type !== 'stock') return null
  const currency = profile.currency ?? 'USD'

  return (
    <Card size="sm" className={cn('flex flex-col', className)}>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-muted-foreground">
          {t('research.earningsTitle')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-3">
        <div className="flex flex-col">
          {[
            { label: t('research.revenueTtm'), value: fmtCompactMoney(profile.total_revenue, currency) },
            { label: t('research.ebitda'), value: fmtCompactMoney(profile.ebitda, currency) },
            { label: t('research.trailingEps'), value: fmtMoney(profile.trailing_eps, currency) },
            { label: t('research.forwardEps'), value: fmtMoney(profile.forward_eps, currency) },
            { label: t('research.stats.target'), value: fmtMoney(profile.target_mean_price, currency) },
            { label: t('research.analystCount'), value: fmtInt(profile.analyst_count) },
          ].map((row, index) => (
            <Row key={row.label} {...row} striped={index % 2 === 1} />
          ))}
        </div>

        {(profile.earnings_history ?? []).length > 0 && (
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted-foreground">
              {t('research.surpriseTitle')}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {profile.earnings_history.map((quarter) => (
                <div
                  key={quarter.quarter}
                  className="flex flex-col gap-0.5 rounded-lg border border-border/70 px-2.5 py-1.5"
                >
                  <span className="text-[0.65rem] text-muted-foreground">{quarter.quarter}</span>
                  <span className="text-xs tabular-nums">
                    {fmtRatio(quarter.eps_actual)}
                    <span className="text-muted-foreground">
                      {' / '}
                      {fmtRatio(quarter.eps_estimate)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'text-[0.65rem] tabular-nums',
                      deltaClass(quarter.surprise_pct),
                    )}
                  >
                    {fmtPct(quarter.surprise_pct, { signed: true })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
