import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { Refresh01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { formatDate } from '../../lib/format'
import { cn } from '@/lib/utils'
import { SyncStatusBadge } from '../InvestmentPrimitives'
import { PerformanceKpis } from './PerformanceKpis'
import type { PortfolioTotals } from '../portfolioInsights'
import type { InvestmentAccount, PortfolioPerformance } from '../investmentsApi'

/**
 * The one line that answers "how am I doing" before anything else loads.
 *
 * The KPI strip (see `PerformanceKpis`) carries the figures, each its own
 * labeled cell so the eye can land on "today" or "cash" without reading every
 * label to its left. The
 * allocation split stays underneath as a thin bar, and sync stays folded
 * into the corner: it's maintenance, not the point of the page.
 */
export function PortfolioTicker({
  totals,
  scopeLabel,
  accounts,
  onSync,
  syncing,
  syncDisabled,
  performance,
  performanceLoading,
  rangeLabel,
}: {
  totals: PortfolioTotals
  /** Which accounts these figures cover — "All accounts", or one account's name. */
  scopeLabel: string
  /** The accounts in scope, so a single one can show its own sync state. */
  accounts: InvestmentAccount[]
  onSync: () => void
  syncing: boolean
  /** True while every account in scope is still inside its sync cooldown. */
  syncDisabled: boolean
  performance: PortfolioPerformance | undefined
  performanceLoading: boolean
  /** Human name of the selected range, e.g. "3 months". */
  rangeLabel: string
}) {
  const { t } = useTranslation('investments')
  const single = accounts.length === 1 ? accounts[0] : null
  const investedPct =
    totals.value > 0 ? Math.min(100, Math.max(0, (totals.invested / totals.value) * 100)) : 0
  const cashPct = Math.max(0, 100 - investedPct)

  return (
    <section className="flex flex-col gap-3 rounded-xl bg-card p-3 shadow-card">
      {/* Stacked on a phone — the sync control used to share a row with the
          stat grid via `flex-wrap`, which on a narrow viewport left the grid
          only as much width as the button didn't take, squeezing every cell
          until its label and value both wrapped. Full-width rows for each
          fix that without touching anything above `sm`. */}
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
        <PerformanceKpis
          totals={totals}
          scopeLabel={scopeLabel}
          performance={performance}
          loading={performanceLoading}
          rangeLabel={rangeLabel}
        />

        {/* Sync is maintenance, not the point of the page, so it stays pale and
            tucked in the corner on desktop — but a corner-sized tap target is
            too small to chase on a phone, so it goes full-width there instead. */}
        <div className="flex flex-col items-stretch gap-1 border-t border-border/60 pt-3 sm:items-end sm:border-t-0 sm:pt-0">
          <Button
            variant="secondary"
            size="sm"
            onClick={onSync}
            disabled={syncing || syncDisabled}
            className="h-9 max-w-full justify-center px-2 text-[0.7rem] font-normal text-secondary-foreground sm:h-8 sm:justify-start sm:px-3 sm:text-xs"
          >
            <HugeiconsIcon
              icon={Refresh01Icon}
              strokeWidth={2}
              data-icon="inline-start"
              className={cn('size-3.5', syncing && 'animate-spin motion-reduce:animate-none')}
            />
            <span className="truncate">
              {syncing
                ? t('detail.syncing')
                : single
                  ? t('ticker.syncAccount', { name: single.name })
                  : t('ticker.syncAll')}
            </span>
          </Button>
          <span className="flex items-center justify-center gap-1.5 text-[0.65rem] text-muted-foreground sm:justify-end">
            {single && <SyncStatusBadge status={single.sync_status} iconOnly />}
            {single
              ? single.last_synced_at
                ? t('card.lastSynced', { date: formatDate(single.last_synced_at) })
                : t('card.neverSynced')
              : t('ticker.syncAllHint', { count: accounts.length })}
          </span>
        </div>
      </div>

      {single?.sync_error && (
        <p className="text-[0.7rem] text-destructive">{single.sync_error}</p>
      )}

      {/* Invested against cash. Two segments, no legend — the figures above
          already name both halves, so a legend would only repeat them. */}
      <div
        role="img"
        aria-label={t('ticker.holdingsVsCash')}
        title={t('ticker.holdingsVsCash')}
        className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/70"
      >
        <div
          className="bg-chart-4 transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${investedPct}%` }}
        />
        <div
          className="bg-chart-2/70 transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${cashPct}%` }}
        />
      </div>
    </section>
  )
}
