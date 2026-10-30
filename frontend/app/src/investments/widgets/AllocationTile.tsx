import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Cell, Pie, PieChart } from 'recharts'
import { Skeleton } from '@/components/ui/skeleton'
import { ChartContainer, type ChartConfig } from '@/components/ui/chart'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatBalance } from '../../lib/format'
import { useBalanceVisibility } from '../../ui/BalanceVisibilityContext'
import { positionValue } from '../portfolioInsights'
import { OVERFLOW_COLOR, seriesColor, useChartMotion } from '../chartConfig'
import { groupPositionsByCurrency } from './CurrencyExposureTile'
import { Tile, TileEmpty } from './Tile'
import type { InvestmentAccount, PortfolioPosition } from '../investmentsApi'

type AllocationMode = 'holding' | 'currency' | 'account'

interface RawRow {
  key: string
  label: string
  value: number
}

interface SliceRow extends RawRow {
  pct: number
  color: string
}

const TOP_COUNT = 6
const OTHER_KEY = '__other__'
const CASH_KEY = '__cash__'
const CASH_COLOR = 'color-mix(in oklab, var(--muted-foreground) 40%, transparent)'

function rawRows(
  positions: PortfolioPosition[],
  accounts: InvestmentAccount[],
  mode: AllocationMode,
  t: (key: string) => string,
): RawRow[] {
  if (mode === 'currency') {
    return groupPositionsByCurrency(positions).map((row) => ({
      key: row.currency,
      label: row.currency,
      value: row.value,
    }))
  }

  if (mode === 'account') {
    const nameByAccountId = new Map(accounts.map((account) => [account.id, account.name]))
    const byAccount = new Map<number, number>()
    for (const position of positions) {
      const value = positionValue(position)
      if (value <= 0) continue
      byAccount.set(position.account_id, (byAccount.get(position.account_id) ?? 0) + value)
    }
    return Array.from(byAccount.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([accountId, value]) => ({
        key: `account-${accountId}`,
        label: nameByAccountId.get(accountId) ?? `#${accountId}`,
        value,
      }))
  }

  // Holdings. Same symbol across two accounts is one view concern — the
  // allocation question is "where is my money" per instrument, so aggregate.
  const bySymbol = new Map<string, number>()
  for (const position of positions) {
    const value = positionValue(position)
    if (value <= 0) continue
    bySymbol.set(position.symbol, (bySymbol.get(position.symbol) ?? 0) + value)
  }
  const ranked = Array.from(bySymbol.entries())
    .sort((a, b) => b[1] - a[1])

  if (ranked.length <= TOP_COUNT) {
    return ranked.map(([symbol, value]) => ({ key: symbol, label: symbol, value }))
  }
  const top = ranked.slice(0, TOP_COUNT).map(([symbol, value]) => ({ key: symbol, label: symbol, value }))
  const otherValue = ranked
    .slice(TOP_COUNT)
    .reduce((sum, [, value]) => sum + value, 0)
  return [...top, { key: OTHER_KEY, label: t('allocation.other'), value: otherValue }]
}

/**
 * Portfolio allocation as donuts.
 *
 * Holdings beyond six fold into one grey "Other" slice — past that many wedges
 * the eye stops telling colours apart (see `SERIES_COLORS`'s own note), and
 * splitting the tail into near-identical slivers only invents distinctions.
 * Currency grouping reuses `groupPositionsByCurrency`, so the two views keep
 * the same ranking and the same quiet single-currency answer.
 */
export function AllocationTile({
  positions,
  accounts,
  currency,
  loading,
  cash = 0,
  className,
}: {
  positions: PortfolioPosition[]
  accounts: InvestmentAccount[]
  currency: string
  loading: boolean
  /** The scope's cash, shown as its own slice so the donut adds up to the total value. */
  cash?: number
  className?: string
}) {
  const { t } = useTranslation('investments')
  const { hidden } = useBalanceVisibility()
  const motionProps = useChartMotion()
  const [mode, setMode] = useState<AllocationMode>('holding')

  const slices = useMemo<SliceRow[]>(() => {
    const raw = rawRows(positions, accounts, mode, t)
    if (cash > 0) raw.push({ key: CASH_KEY, label: t('allocation.cash'), value: cash })
    const total = raw.reduce((sum, row) => sum + row.value, 0)
    if (total <= 0) return []
    // Pcts rounded to one decimal need not add to 100 exactly (five 16.67%s
    // become five 16.7%s); the drift is paid back to the largest slice, where
    // a rounding wobble is least visible.
    const rounded = raw.map((row) => ({ ...row, pct: Math.round((row.value / total) * 1000) / 10 }))
    const drift = Math.round((100 - rounded.reduce((sum, row) => sum + row.pct, 0)) * 10) / 10
    const largest = rounded.reduce(
      (best, row, index) => (row.value > rounded[best].value ? index : best),
      0,
    )
    rounded[largest].pct = Math.round((rounded[largest].pct + drift) * 10) / 10
    return rounded.map((row, index) => ({
      ...row,
      color:
        row.key === CASH_KEY ? CASH_COLOR : row.key === OTHER_KEY ? OVERFLOW_COLOR : seriesColor(index),
    }))
  }, [positions, accounts, cash, mode, t])

  const total = slices.reduce((sum, row) => sum + row.value, 0)
  const chartConfig = useMemo<ChartConfig>(() => {
    const config: ChartConfig = {}
    for (const slice of slices) {
      config[slice.key] = { label: slice.label }
    }
    return config
  }, [slices])

  return (
    <Tile
      title={t('allocation.title')}
      className={className}
      action={
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          spacing={0}
          value={mode}
          onValueChange={(next) => {
            if (next) setMode(next as AllocationMode)
          }}
          aria-label={t('allocation.title')}
        >
          <ToggleGroupItem value="holding" className="px-2 text-xs">
            {t('allocation.byHolding')}
          </ToggleGroupItem>
          <ToggleGroupItem value="currency" className="px-2 text-xs">
            {t('allocation.byCurrency')}
          </ToggleGroupItem>
          <ToggleGroupItem value="account" className="px-2 text-xs">
            {t('allocation.byAccount')}
          </ToggleGroupItem>
        </ToggleGroup>
      }
    >
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-44 w-full rounded-lg" />
          <Skeleton className="h-6 w-full rounded-lg" />
        </div>
      ) : slices.length === 0 ? (
        <TileEmpty>{t('detail.noPositions')}</TileEmpty>
      ) : (
        <div className="flex flex-col">
          {/* The tile clips its body (see Tile), so the pie fits inside with
              room to spare rather than fighting the corner radius. */}
          <div className="relative mx-auto aspect-square w-full max-w-44">
            <ChartContainer config={chartConfig} className="absolute inset-0 aspect-auto">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="62%"
                  outerRadius="94%"
                  paddingAngle={1}
                  strokeWidth={0}
                  {...motionProps}
                >
                  {slices.map((slice) => (
                    <Cell key={slice.key} fill={slice.color} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            {/* Total in the eye of the donut. pointer-events keeps the overlay
                from swallowing anything React would still want to track. */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[0.625rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t('allocation.holdings')}
              </span>
              <span className="font-heading text-sm font-semibold tabular-nums">
                {formatBalance(total, currency, hidden)}
              </span>
            </div>
          </div>
          <ul className="mt-3 flex flex-col gap-1">
            {slices.map((slice) => (
              <li key={slice.key} className="flex items-center gap-2 text-xs">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="min-w-0 flex-1 truncate font-medium">{slice.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {slice.pct.toFixed(1)}%
                </span>
                <span className="shrink-0 tabular-nums">
                  {formatBalance(slice.value, currency, hidden)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tile>
  )
}
