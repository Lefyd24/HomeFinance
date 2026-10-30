import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Skeleton } from '@/components/ui/skeleton'
import { formatBalance } from '../../lib/format'
import { useBalanceVisibility } from '../../ui/BalanceVisibilityContext'
import { DeltaAmount, DeltaPct, MetricWithHelp } from '../InvestmentPrimitives'
import { PERFORMANCE_GLOSSARY } from '../metricGlossary'
import type { PortfolioTotals } from '../portfolioInsights'
import type { PortfolioPerformance } from '../investmentsApi'

const toPct = (decimal: number | null | undefined) => (decimal == null ? null : decimal * 100)

/**
 * The page's dense strip of headline numbers: where the portfolio stands, how
 * it did over the selected range, and how it did since the first deposit.
 *
 * Range figures come from the flow-adjusted performance endpoint; value, today
 * and cash stay on the live totals the ticker always used. Until performance
 * arrives (or if it can't be computed) the all-time cell falls back to the
 * balance-based totals so the strip is never empty.
 */
export function PerformanceKpis({
  totals,
  scopeLabel,
  performance,
  loading,
  rangeLabel,
}: {
  totals: PortfolioTotals
  scopeLabel: string
  performance: PortfolioPerformance | undefined
  loading: boolean
  /** Human name of the selected range, e.g. "3 months". */
  rangeLabel: string
}) {
  const { t } = useTranslation('investments')
  const { hidden } = useBalanceVisibility()
  const money = (value: number) => formatBalance(value, totals.currency, hidden)
  const cashPct = totals.value > 0 ? Math.max(0, (totals.cash / totals.value) * 100) : 0
  const label = (id: keyof typeof PERFORMANCE_GLOSSARY) => t(PERFORMANCE_GLOSSARY[id].labelKey)

  const summary = performance?.summary
  const breakdown = performance?.breakdown
  const allTimeGain = breakdown ? breakdown.total_gain : totals.pnl
  const allTimePct = breakdown
    ? breakdown.net_invested > 0
      ? (breakdown.total_gain / breakdown.net_invested) * 100
      : null
    : totals.returnPct

  const whenLoaded = (node: ReactNode) =>
    loading ? <Skeleton className="h-6 w-20" /> : node

  return (
    <div className="grid flex-1 grid-cols-2 gap-x-3 gap-y-3 sm:grid-cols-3 xl:grid-cols-6 [&>div>span:first-child]:min-h-8">
      <MetricWithHelp
        size="sm"
        label={label('totalValue')}
        entry={PERFORMANCE_GLOSSARY.totalValue}
        value={money(totals.value)}
        hint={scopeLabel}
      />
      <MetricWithHelp
        size="sm"
        label={label('today')}
        entry={PERFORMANCE_GLOSSARY.today}
        value={
          totals.dayChange != null ? (
            <span className="inline-flex flex-wrap items-baseline gap-1.5">
              <DeltaAmount amount={totals.dayChange} format={money} />
              <DeltaPct pct={totals.dayChangePct} className="text-xs" />
            </span>
          ) : (
            <span className="text-sm font-normal text-muted-foreground">{t('ticker.noQuote')}</span>
          )
        }
      />
      <MetricWithHelp
        size="sm"
        label={t('performance.kpi.gainOverRange', { range: rangeLabel })}
        entry={PERFORMANCE_GLOSSARY.rangeGain}
        value={whenLoaded(
          summary ? (
            <span className="inline-flex flex-wrap items-baseline gap-1.5">
              <DeltaAmount amount={summary.gain} format={money} />
              <DeltaPct pct={toPct(summary.twr)} className="text-xs" />
            </span>
          ) : (
            '—'
          ),
        )}
      />
      <MetricWithHelp
        size="sm"
        label={label('mwr')}
        entry={PERFORMANCE_GLOSSARY.mwr}
        value={whenLoaded(<DeltaPct pct={toPct(summary?.mwr)} className="text-base font-semibold" />)}
      />
      <MetricWithHelp
        size="sm"
        label={label('allTimeGain')}
        entry={PERFORMANCE_GLOSSARY.allTimeGain}
        value={
          <span className="inline-flex flex-wrap items-baseline gap-1.5">
            <DeltaAmount amount={allTimeGain} format={money} />
            <DeltaPct pct={allTimePct} className="text-xs" />
          </span>
        }
      />
      <MetricWithHelp
        size="sm"
        label={label('cash')}
        entry={PERFORMANCE_GLOSSARY.cash}
        value={money(totals.cash)}
        hint={t('ticker.cashShare', { pct: cashPct.toFixed(0) })}
      />
    </div>
  )
}
