import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import ReactECharts from 'echarts-for-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { HugeiconsIcon } from '@hugeicons/react'
import { ArrowDown01Icon, Refresh01Icon } from '@hugeicons/core-free-icons'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Separator } from '@/components/ui/separator'
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '../lib/format'
import { baseAxisStyle, tooltipStyle, useChartTheme, seriesHoverSafe } from '../reports/chartTheme'
import { computeRange, type RangeKey } from '../reports/useReportFilters'
import {
  DeltaAmount,
  DeltaBar,
  DeltaPct,
  Metric,
  SyncStatusBadge,
  deltaScale,
} from './InvestmentPrimitives'
import {
  useInvestmentHistory,
  useInvestmentPositions,
  useInvestmentTransactions,
  useSyncInvestmentAccount,
} from './useInvestments'
import type {
  InvestmentAccount,
  InvestmentTransaction,
  InvestmentTransactionType,
  PortfolioPosition,
} from './investmentsApi'

const SYNC_COOLDOWN_MS = 60_000

function isOnCooldown(lastSyncedAt: string | null): boolean {
  if (!lastSyncedAt) return false
  return Date.now() - new Date(lastSyncedAt).getTime() < SYNC_COOLDOWN_MS
}

const HISTORY_RANGES: Array<{ key: RangeKey | 'all'; labelKey: string }> = [
  { key: '30d', labelKey: 'detail.ranges.1m' },
  { key: '3m', labelKey: 'detail.ranges.3m' },
  { key: '6m', labelKey: 'detail.ranges.6m' },
  { key: '1y', labelKey: 'detail.ranges.1y' },
  { key: 'all', labelKey: 'detail.ranges.all' },
]

/**
 * Activity types are tinted by what they do to the account, reusing the app's
 * flow tokens. The signed amount beside the badge always says the same thing,
 * so the colour is reinforcement rather than the only signal.
 */
const TXN_BADGE: Record<InvestmentTransactionType, string> = {
  buy: 'border-chart-4/40 text-chart-4',
  sell: 'border-flow-in/40 text-flow-in',
  dividend: 'border-flow-in/40 text-flow-in',
  deposit: 'border-flow-in/40 text-flow-in',
  fx: 'border-border text-muted-foreground',
  fee: 'border-flow-out/40 text-flow-out',
  tax: 'border-flow-out/40 text-flow-out',
  withdrawal: 'border-flow-out/40 text-flow-out',
}

/**
 * Everything about one connected account: what it's worth, how it got there,
 * what's in it, and what it last did.
 *
 * Account-level aggregates come from the account row itself — the backend
 * converts every instrument into the account's currency during the sync — and
 * position rows are only used for per-holding detail.
 */
export function InvestmentAccountDetail({ account }: { account: InvestmentAccount }) {
  const { t } = useTranslation('investments')
  const theme = useChartTheme()
  const [historyRange, setHistoryRange] = useState<RangeKey | 'all'>('6m')
  const { data: positions = [], isLoading: positionsLoading } = useInvestmentPositions(account.id)
  const { data: transactions = [], isLoading: transactionsLoading } = useInvestmentTransactions(
    account.id,
  )
  const historyParams = useMemo(
    () => (historyRange === 'all' ? undefined : { start_date: computeRange(historyRange).start }),
    [historyRange],
  )
  const { data: history = [] } = useInvestmentHistory(account.id, historyParams)
  const syncAccount = useSyncInvestmentAccount()

  const onCooldown = isOnCooldown(account.last_synced_at)
  const currency = account.currency
  const money = useMemo(
    () => (value: number) => formatCurrency(value, currency),
    [currency],
  )

  const handleSync = async () => {
    try {
      await syncAccount.mutateAsync(account.id)
      toast.success(t('detail.toasts.synced'))
    } catch {
      toast.error(t('detail.toasts.syncFailed'))
    }
  }

  const allocationOption = useMemo(() => {
    if (positions.length === 0) return null
    // Slices use the account-currency value, so a EUR holding and a USD holding
    // are actually comparable within the same ring.
    return {
      tooltip: {
        trigger: 'item' as const,
        ...tooltipStyle(theme),
        formatter: (params: { name: string; value: number; percent: number }) =>
          `${params.name}<br/>${money(params.value)} (${params.percent}%)`,
      },
      series: [
        {
          type: 'pie' as const,
          radius: ['58%', '80%'],
          ...seriesHoverSafe,
          itemStyle: { borderColor: theme.surface, borderWidth: 2 },
          label: { show: false },
          data: positions.map((p, index) => ({
            name: p.symbol,
            value: p.market_value_base ?? p.market_value,
            itemStyle: { color: theme.seriesColor(index) },
          })),
        },
      ],
    }
  }, [positions, theme, money])

  const historyOption = useMemo(() => {
    if (history.length === 0) return null
    // Split cash from invested value whenever the broker reported it — that
    // split is the difference between "the portfolio grew" and "I paid money in".
    const hasSplit = history.some((h) => (h.positions_value ?? 0) > 0)
    const xAxis = {
      type: 'category' as const,
      data: history.map((h) => h.date),
      ...baseAxisStyle(theme),
      splitLine: { show: false },
      axisLabel: { color: theme.muted, fontSize: 11 },
    }
    const yAxis = {
      type: 'value' as const,
      ...baseAxisStyle(theme),
      axisLine: { show: false },
      axisLabel: { color: theme.muted, fontSize: 11 },
    }
    const tooltip = {
      trigger: 'axis' as const,
      ...tooltipStyle(theme),
      formatter: (params: Array<{ axisValue: string; value: number; seriesName: string }>) => {
        if (params.length === 0) return ''
        const lines = params.map((p) => `${p.seriesName}: ${money(p.value ?? 0)}`).join('<br/>')
        if (params.length === 1) return `${formatDate(params[0].axisValue)}<br/>${lines}`
        const total = params.reduce((sum, p) => sum + (p.value ?? 0), 0)
        return `${formatDate(params[0].axisValue)}<br/>${lines}<br/><b>${t(
          'detail.chart.totalValue',
        )}: ${money(total)}</b>`
      },
    }

    if (!hasSplit) {
      return {
        tooltip,
        grid: { left: 8, right: 12, top: 20, bottom: 8, containLabel: true },
        xAxis,
        yAxis,
        series: [
          {
            name: t('detail.chart.totalValue'),
            type: 'line' as const,
            smooth: true,
            symbol: 'none',
            ...seriesHoverSafe,
            lineStyle: { color: theme.neutral, width: 2 },
            areaStyle: { color: theme.neutral, opacity: 0.1 },
            data: history.map((h) => h.total_value),
          },
        ],
      }
    }

    return {
      tooltip,
      legend: {
        bottom: 0,
        textStyle: { color: theme.muted, fontSize: 11 },
        itemWidth: 10,
        itemHeight: 10,
      },
      grid: { left: 8, right: 12, top: 20, bottom: 28, containLabel: true },
      xAxis,
      yAxis,
      series: [
        {
          name: t('detail.chart.invested'),
          type: 'line' as const,
          stack: 'value',
          smooth: true,
          symbol: 'none',
          ...seriesHoverSafe,
          lineStyle: { color: theme.seriesColor(0), width: 2 },
          areaStyle: { color: theme.seriesColor(0), opacity: 0.18 },
          data: history.map((h) => h.positions_value ?? 0),
        },
        {
          name: t('detail.chart.cash'),
          type: 'line' as const,
          stack: 'value',
          smooth: true,
          symbol: 'none',
          ...seriesHoverSafe,
          lineStyle: { color: theme.seriesColor(2), width: 2 },
          areaStyle: { color: theme.seriesColor(2), opacity: 0.18 },
          data: history.map((h) => h.cash_balance ?? 0),
        },
      ],
    }
  }, [history, theme, money, t])

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-border bg-card p-3.5 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="font-heading text-lg font-semibold tracking-tight">{account.name}</h3>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <SyncStatusBadge status={account.sync_status} />
            <span>
              {account.last_synced_at
                ? t('detail.lastSynced', {
                    date: formatDate(account.last_synced_at, {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                  })
                : t('detail.neverSynced')}
            </span>
          </div>
          {account.sync_error && <p className="text-xs text-destructive">{account.sync_error}</p>}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleSync}
          disabled={syncAccount.isPending || onCooldown}
          title={onCooldown ? t('detail.syncCooldown') : undefined}
        >
          <HugeiconsIcon icon={Refresh01Icon} strokeWidth={2} data-icon="inline-start" />
          <span className="sr-only sm:not-sr-only">
            {syncAccount.isPending ? t('detail.syncing') : t('detail.syncNow')}
          </span>
        </Button>
      </header>

      {/* The five figures that answer "how is this account doing", in the order
          you would ask them. Total value leads at a larger size. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-lg border border-border bg-muted/30 px-3.5 py-3.5 sm:grid-cols-3 lg:grid-cols-5">
        <Metric
          label={t('detail.summary.totalValue')}
          value={money(account.balance)}
          size="lg"
          hint={t('detail.summary.cashHint', { amount: money(account.cash_balance) })}
        />
        <Metric label={t('detail.summary.marketValue')} value={money(account.total_market_value)} />
        <Metric label={t('detail.summary.costBasis')} value={money(account.total_cost_basis)} />
        <Metric
          label={t('detail.summary.unrealised')}
          value={<DeltaAmount amount={account.total_unrealized_pnl} format={money} />}
          hint={<DeltaPct pct={account.total_return_pct} className="text-xs" />}
        />
        <Metric
          label={t('detail.summary.today')}
          value={<DeltaAmount amount={account.day_change} format={money} />}
          hint={
            account.day_change_pct != null ? (
              <DeltaPct pct={account.day_change_pct} className="text-xs" />
            ) : (
              t('detail.summary.noQuote')
            )
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <div className="flex flex-col gap-2">
          <SectionTitle>{t('detail.allocationTitle')}</SectionTitle>
          {allocationOption ? (
            // The ring's hole is the natural home for the figure the ring adds
            // up to, rather than repeating it as a caption underneath.
            <div className="relative">
              <ReactECharts
                option={allocationOption}
                style={{ height: 240 }}
                opts={{ renderer: 'svg' }}
                notMerge
              />
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
                <span className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {t('detail.summary.invested')}
                </span>
                <span className="font-heading text-lg font-semibold tabular-nums tracking-tight">
                  {money(account.total_market_value)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t('detail.holdingCount', { count: account.position_count })}
                </span>
              </div>
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">
              {t('detail.noPositions')}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <SectionTitle>{t('detail.historyTitle')}</SectionTitle>
            <div className="flex overflow-x-auto rounded-lg border border-border p-0.5">
              {HISTORY_RANGES.map((preset) => (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => setHistoryRange(preset.key)}
                  aria-pressed={historyRange === preset.key}
                  className={cn(
                    'min-h-[2.25rem] shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors',
                    historyRange === preset.key
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:bg-muted',
                  )}
                >
                  {t(preset.labelKey)}
                </button>
              ))}
            </div>
          </div>
          {historyOption ? (
            <ReactECharts
              option={historyOption}
              style={{ height: 240 }}
              opts={{ renderer: 'svg' }}
              notMerge
            />
          ) : (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('detail.noHistory')}</p>
          )}
        </div>
      </div>

      <Separator />

      <PositionsSection
        positions={positions}
        loading={positionsLoading}
        account={account}
        money={money}
      />

      <Separator />

      <ActivitySection transactions={transactions} loading={transactionsLoading} />
    </section>
  )
}

function PositionsSection({
  positions,
  loading,
  account,
  money,
}: {
  positions: PortfolioPosition[]
  loading: boolean
  account: InvestmentAccount
  money: (value: number) => string
}) {
  const { t } = useTranslation('investments')
  // One shared scale across every row, so the bars compare holdings against each
  // other rather than each one restating its own percentage.
  const scale = deltaScale(positions.map((p) => p.unrealized_pnl_base ?? p.unrealized_pnl))

  if (loading) return <Skeleton className="h-40 w-full rounded-lg" />
  if (positions.length === 0) {
    return (
      <div className="flex flex-col gap-2">
        <SectionTitle>{t('detail.positionsTitle')}</SectionTitle>
        <p className="text-sm text-muted-foreground">{t('detail.noPositions')}</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SectionTitle>{t('detail.positionsTitle')}</SectionTitle>
        <span className="text-xs text-muted-foreground">{t('detail.gainLossLegend')}</span>
      </div>

      {/* Card list below `lg` — a ten-column table can't fit a narrow screen
          without forcing sideways scroll on every row. */}
      <ul className="flex flex-col gap-2 lg:hidden">
        {positions.map((position) => (
          <li key={position.id} className="rounded-lg border border-border p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{position.symbol}</p>
                {position.name && (
                  <p className="truncate text-xs text-muted-foreground">{position.name}</p>
                )}
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="font-medium tabular-nums">
                  {formatCurrency(position.market_value, position.currency)}
                </span>
                <DeltaPct pct={position.unrealized_return_pct} className="text-xs" />
              </div>
            </div>
            <DeltaBar
              value={position.unrealized_pnl_base ?? position.unrealized_pnl}
              scale={scale}
              className="mt-2.5"
            />
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
              <span className="text-muted-foreground">{t('detail.table.quantity')}</span>
              <span className="text-end tabular-nums">{position.quantity}</span>
              <span className="text-muted-foreground">{t('detail.table.avgPrice')}</span>
              <span className="text-end tabular-nums">
                {position.avg_price != null
                  ? formatCurrency(position.avg_price, position.currency)
                  : '—'}
              </span>
              <span className="text-muted-foreground">{t('detail.table.unrealizedPnl')}</span>
              <span className="text-end">
                <DeltaAmount
                  amount={position.unrealized_pnl}
                  format={(v) => formatCurrency(v, position.currency)}
                />
              </span>
              <span className="text-muted-foreground">{t('detail.table.dayChange')}</span>
              <span className="text-end">
                <DeltaPct pct={position.day_change_pct} className="text-xs" />
              </span>
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('detail.table.symbol')}</TableHead>
              <TableHead className="text-end">{t('detail.table.quantity')}</TableHead>
              <TableHead className="text-end">{t('detail.table.avgPrice')}</TableHead>
              <TableHead className="text-end">{t('detail.table.currentPrice')}</TableHead>
              <TableHead className="text-end">{t('detail.table.dayChange')}</TableHead>
              <TableHead className="text-end">{t('detail.table.marketValue')}</TableHead>
              <TableHead className="w-28">{t('detail.table.gainLoss')}</TableHead>
              <TableHead className="text-end">{t('detail.table.unrealizedPnl')}</TableHead>
              <TableHead className="text-end">{t('detail.table.returnPct')}</TableHead>
              <TableHead className="text-end">{t('detail.table.weight')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {positions.map((position) => (
              <TableRow key={position.id}>
                <TableCell>
                  <div className="font-medium">{position.symbol}</div>
                  {position.name && (
                    <div className="text-xs text-muted-foreground">{position.name}</div>
                  )}
                </TableCell>
                <TableCell className="text-end tabular-nums">{position.quantity}</TableCell>
                <TableCell className="text-end tabular-nums">
                  {position.avg_price != null
                    ? formatCurrency(position.avg_price, position.currency)
                    : '—'}
                </TableCell>
                <TableCell className="text-end tabular-nums">
                  {position.current_price != null
                    ? formatCurrency(position.current_price, position.currency)
                    : '—'}
                </TableCell>
                <TableCell className="text-end">
                  <DeltaPct pct={position.day_change_pct} />
                </TableCell>
                <TableCell className="text-end font-medium tabular-nums">
                  {formatCurrency(position.market_value, position.currency)}
                  {/* Only worth restating when it isn't the account's own currency. */}
                  {position.currency !== account.currency && (
                    <div className="text-xs font-normal text-muted-foreground">
                      {money(position.market_value_base ?? position.market_value)}
                    </div>
                  )}
                </TableCell>
                <TableCell>
                  <DeltaBar
                    value={position.unrealized_pnl_base ?? position.unrealized_pnl}
                    scale={scale}
                  />
                </TableCell>
                <TableCell className="text-end">
                  <DeltaAmount
                    amount={position.unrealized_pnl}
                    format={(v) => formatCurrency(v, position.currency)}
                  />
                </TableCell>
                <TableCell className="text-end">
                  <DeltaPct pct={position.unrealized_return_pct} />
                </TableCell>
                <TableCell className="text-end tabular-nums text-muted-foreground">
                  {position.weight_pct != null ? `${position.weight_pct.toFixed(1)}%` : '—'}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={5}>{t('detail.table.total')}</TableCell>
              <TableCell className="text-end font-medium tabular-nums">
                {money(account.total_market_value)}
              </TableCell>
              <TableCell />
              <TableCell className="text-end">
                <DeltaAmount amount={account.total_unrealized_pnl} format={money} />
              </TableCell>
              <TableCell className="text-end">
                <DeltaPct pct={account.total_return_pct} />
              </TableCell>
              <TableCell className="text-end tabular-nums text-muted-foreground">100%</TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  )
}

function ActivitySection({
  transactions,
  loading,
}: {
  transactions: InvestmentTransaction[]
  loading: boolean
}) {
  const { t } = useTranslation('investments')
  const [open, setOpen] = useState(false)
  const visible = transactions.slice(0, 12)

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="flex flex-col gap-2">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2.5 text-start transition-colors hover:bg-muted/50"
        >
          <span className="flex min-w-0 flex-col gap-0.5">
            <SectionTitle>{t('detail.transactionsTitle')}</SectionTitle>
            <span className="text-xs text-muted-foreground">
              {loading
                ? t('detail.loadingActivity')
                : t('detail.activityCount', { count: visible.length })}
            </span>
          </span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            className={cn(
              'size-4 shrink-0 text-muted-foreground transition-transform',
              open && 'rotate-180',
            )}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent className="data-open:animate-accordion-down data-closed:animate-accordion-up overflow-hidden">
        <div className="pt-1">
          {loading ? (
            <Skeleton className="h-24 w-full rounded-lg" />
          ) : transactions.length === 0 ? (
            <p className="px-1 text-sm text-muted-foreground">{t('detail.noTransactions')}</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
              {visible.map((txn) => (
                <li
                  key={txn.id}
                  className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <Badge variant="outline" className={cn('shrink-0', TXN_BADGE[txn.type])}>
                      {t(`detail.txnTypes.${txn.type}`, txn.type)}
                    </Badge>
                    <div className="min-w-0">
                      {txn.symbol && <span className="font-medium">{txn.symbol}</span>}
                      <div className="text-xs text-muted-foreground">
                        {formatDate(txn.date)}
                        {txn.quantity != null && txn.price != null && (
                          <>
                            {' · '}
                            {txn.quantity} @ {formatCurrency(txn.price, txn.currency)}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <DeltaAmount
                    amount={txn.amount}
                    format={(v) => formatCurrency(v, txn.currency)}
                    className="shrink-0"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
      {children}
    </h4>
  )
}
