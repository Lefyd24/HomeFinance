import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { Refresh01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { formatBalance, formatDate } from '../../lib/format'
import { useBalanceVisibility } from '../../ui/BalanceVisibilityContext'
import { cn } from '@/lib/utils'
import { DeltaPct, SyncStatusBadge } from '../InvestmentPrimitives'
import type { PortfolioTotals } from '../portfolioInsights'
import type { InvestmentAccount } from '../investmentsApi'

/**
 * The one line that answers "how am I doing" before anything else loads.
 *
 * Four figures, each its own labeled cell — a row of distinct stat cards
 * rather than a dense wrap of labels, so the eye can land on "today" or
 * "cash" without having to first read every label to its left. The
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
  const { hidden } = useBalanceVisibility()
  const single = accounts.length === 1 ? accounts[0] : null
  const money = (value: number) => formatBalance(value, totals.currency, hidden)

  const investedPct =
    totals.value > 0 ? Math.min(100, Math.max(0, (totals.invested / totals.value) * 100)) : 0
  const cashPct = Math.max(0, 100 - investedPct)

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="grid flex-1 grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-0 sm:divide-x sm:divide-border/60">
          <StatCell label={t('ticker.totalValue')} hint={scopeLabel}>
            <span className="font-heading text-xl font-semibold tabular-nums tracking-tight sm:text-2xl">
              {money(totals.value)}
            </span>
          </StatCell>

          <StatCell label={t('ticker.today')}>
            {totals.dayChange != null ? (
              <span className="inline-flex flex-wrap items-baseline gap-1.5">
                <span
                  className={cn(
                    'font-heading text-lg font-semibold tabular-nums',
                    totals.dayChange > 0 && 'text-flow-in',
                    totals.dayChange < 0 && 'text-flow-out',
                  )}
                >
                  {totals.dayChange > 0 ? '+' : ''}
                  {money(totals.dayChange)}
                </span>
                <DeltaPct pct={totals.dayChangePct} className="text-xs" />
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">{t('ticker.noQuote')}</span>
            )}
          </StatCell>

          <StatCell label={t('ticker.allTime')}>
            <span className="inline-flex flex-wrap items-baseline gap-1.5">
              <span
                className={cn(
                  'font-heading text-lg font-semibold tabular-nums',
                  totals.pnl > 0 && 'text-flow-in',
                  totals.pnl < 0 && 'text-flow-out',
                )}
              >
                {totals.pnl > 0 ? '+' : ''}
                {money(totals.pnl)}
              </span>
              <DeltaPct pct={totals.returnPct} className="text-xs" />
            </span>
          </StatCell>

          <StatCell label={t('ticker.cash')} hint={t('ticker.cashShare', { pct: cashPct.toFixed(0) })}>
            <span className="font-heading text-lg font-semibold tabular-nums">{money(totals.cash)}</span>
          </StatCell>
        </div>

        {/* Sync is maintenance, not the point of the page, so it stays pale and
            tucked in the corner rather than spanning the row. */}
        <div className="flex flex-col items-end gap-1">
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

function StatCell({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 px-0 sm:px-3.5 sm:first:pl-0">
      <span className="text-[0.625rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {label}
      </span>
      {children}
      {hint && <span className="truncate text-[0.65rem] text-muted-foreground">{hint}</span>}
    </div>
  )
}
