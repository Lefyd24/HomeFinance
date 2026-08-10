import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { Refresh01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '../../lib/format'
import { cn } from '@/lib/utils'
import { DeltaPct, Metric, SyncStatusBadge } from '../InvestmentPrimitives'
import type { PortfolioTotals } from '../portfolioInsights'
import type { InvestmentAccount } from '../investmentsApi'

/**
 * The one line that answers "how am I doing" before anything else loads.
 *
 * It replaces the old hero card, which spent a large tinted panel restating
 * three numbers. Here the numbers themselves are the banner: a single strip
 * across the top of the workspace, with the allocation split as a thin bar
 * underneath rather than its own labelled block.
 *
 * It also owns sync, because sync is scoped the same way the figures are: with
 * one account selected the button refreshes that account, and only that one.
 */
export function PortfolioTicker({
  totals,
  scopeLabel,
  accounts,
  onSync,
  syncing,
  syncDisabled,
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
}) {
  const { t } = useTranslation('investments')
  const single = accounts.length === 1 ? accounts[0] : null
  const money = (value: number) => formatCurrency(value, totals.currency)

  const investedPct =
    totals.value > 0 ? Math.min(100, Math.max(0, (totals.invested / totals.value) * 100)) : 0
  const cashPct = Math.max(0, 100 - investedPct)

  return (
    <section className="flex flex-col gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 shadow-sm">
      {/*
        A two-up grid on a phone rather than a wrapping flex row: wrapping made
        the four figures land in a ragged 2-1-1 that read as three groups. A
        grid keeps them aligned in columns whatever the widths turn out to be,
        and only becomes a single row once there is space for one.
      */}
      <div className="grid grid-cols-2 items-end gap-x-4 gap-y-3 sm:flex sm:flex-wrap sm:gap-x-9">
        <Metric
          label={t('ticker.totalValue')}
          value={money(totals.value)}
          size="lg"
          hint={scopeLabel}
        />
        <Metric
          label={t('ticker.today')}
          value={
            totals.dayChange != null ? (
              <span className="inline-flex items-baseline gap-2">
                <span
                  className={cn(
                    totals.dayChange > 0 && 'text-flow-in',
                    totals.dayChange < 0 && 'text-flow-out',
                  )}
                >
                  {totals.dayChange > 0 ? '+' : ''}
                  {money(totals.dayChange)}
                </span>
                <DeltaPct pct={totals.dayChangePct} className="text-sm" />
              </span>
            ) : (
              <span className="text-muted-foreground">—</span>
            )
          }
          hint={totals.dayChange == null ? t('ticker.noQuote') : undefined}
        />
        <Metric
          label={t('ticker.allTime')}
          value={
            <span className="inline-flex items-baseline gap-2">
              <span
                className={cn(totals.pnl > 0 && 'text-flow-in', totals.pnl < 0 && 'text-flow-out')}
              >
                {totals.pnl > 0 ? '+' : ''}
                {money(totals.pnl)}
              </span>
              <DeltaPct pct={totals.returnPct} className="text-sm" />
            </span>
          }
        />
        <Metric
          label={t('ticker.cash')}
          value={money(totals.cash)}
          size="sm"
          hint={t('ticker.cashShare', { pct: cashPct.toFixed(0) })}
        />

        {/* Sync is maintenance, not the point of the page, so it stays pale —
            and on a phone it shrinks further rather than spanning the row,
            where a full-width button would outrank the figures above it. */}
        <div className="col-span-2 flex flex-col items-end gap-1 sm:ms-auto">
          <Button
            variant="secondary"
            size="sm"
            onClick={onSync}
            disabled={syncing || syncDisabled}
            className="h-7 max-w-full px-2 text-[0.7rem] font-normal text-secondary-foreground sm:h-8 sm:px-3 sm:text-xs"
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
          <span className="flex items-center justify-end gap-1.5 text-[0.65rem] text-muted-foreground">
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
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted/70">
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
