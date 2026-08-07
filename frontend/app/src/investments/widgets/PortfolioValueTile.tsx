import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '../../lib/format'
import { useChartMotion, VALUE_CHART_CONFIG } from '../chartConfig'
import { HISTORY_RANGES, type HistoryRangeKey } from '../usePortfolioView'
import { Tile, TileEmpty } from './Tile'
import type { PortfolioSnapshot } from '../investmentsApi'

/**
 * The portfolio over time, split into what is invested and what is cash.
 *
 * Stacked rather than two separate lines because the top edge is then the total
 * — the number people actually track — while the band underneath shows how much
 * of it was ever at risk. A single total line would hide a portfolio that only
 * looks steady because half of it is sitting in cash.
 */
export function PortfolioValueTile({
  history,
  currency,
  range,
  onRangeChange,
  loading,
  className,
}: {
  history: PortfolioSnapshot[]
  currency: string
  range: HistoryRangeKey
  onRangeChange: (range: HistoryRangeKey) => void
  loading: boolean
  className?: string
}) {
  const { t } = useTranslation('investments')
  const motion = useChartMotion()

  const config = useMemo(
    () => ({
      positions_value: { ...VALUE_CHART_CONFIG.positions_value, label: t('tiles.invested') },
      cash_balance: { ...VALUE_CHART_CONFIG.cash_balance, label: t('tiles.cash') },
    }),
    [t],
  )

  // Compact money for the axis — a full "€124,340.00" every 40px is unreadable,
  // and the tooltip carries the exact figure anyway.
  const compact = useMemo(
    () =>
      new Intl.NumberFormat(undefined, {
        notation: 'compact',
        maximumFractionDigits: 1,
      }),
    [],
  )

  return (
    <Tile
      title={t('tiles.portfolioValue')}
      className={className}
      allowOverflow
      action={
        <div className="-mr-0.5 flex max-w-[60vw] items-center gap-0.5 overflow-x-auto rounded-full bg-muted/60 p-0.5 sm:max-w-none">
          {HISTORY_RANGES.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => onRangeChange(key)}
              aria-pressed={range === key}
              className={cn(
                // Comfortably tappable on a phone, compact once there's a
                // pointer — this strip sits in a tile header with little room.
                'h-8 rounded-full px-2.5 text-[0.65rem] font-medium transition-colors sm:h-6 sm:px-2',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                range === key
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {t(`detail.ranges.${key === '30d' ? '1m' : key}`)}
            </button>
          ))}
        </div>
      }
    >
      {loading ? (
        <Skeleton className="h-[13rem] w-full rounded-lg" />
      ) : history.length === 0 ? (
        <TileEmpty>{t('detail.noHistory')}</TileEmpty>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-[13rem] w-full">
          <AreaChart data={history} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="fill-positions" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-positions_value)" stopOpacity={0.7} />
                <stop offset="95%" stopColor="var(--color-positions_value)" stopOpacity={0.08} />
              </linearGradient>
              <linearGradient id="fill-cash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-cash_balance)" stopOpacity={0.5} />
                <stop offset="95%" stopColor="var(--color-cash_balance)" stopOpacity={0.06} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value: string) => formatDate(value)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={44}
              tickMargin={4}
              tickFormatter={(value: number) => compact.format(value)}
            />
            <ChartTooltip
              cursor={{ strokeDasharray: '3 3' }}
              // Recharts' tooltip wrapper carries no z-index of its own, so it
              // loses to any later sibling tile on the grid.
              wrapperStyle={{ zIndex: 30 }}
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => formatDate(String(value))}
                  formatter={(value, name) => (
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">
                        {config[name as keyof typeof config]?.label ?? name}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatCurrency(Number(value), currency)}
                      </span>
                    </div>
                  )}
                />
              }
            />
            {/* Invested sits at the bottom of the stack so its band starts at
                zero — the part of the total that is actually in the market. */}
            <Area
              {...motion}
              dataKey="positions_value"
              type="monotone"
              stackId="value"
              stroke="var(--color-positions_value)"
              fill="url(#fill-positions)"
              strokeWidth={2}
            />
            <Area
              {...motion}
              dataKey="cash_balance"
              type="monotone"
              stackId="value"
              stroke="var(--color-cash_balance)"
              fill="url(#fill-cash)"
              strokeWidth={1.5}
            />
          </AreaChart>
        </ChartContainer>
      )}
    </Tile>
  )
}
