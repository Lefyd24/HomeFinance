import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatDate } from '../../lib/format'
import { polarityColor, useChartMotion } from '../chartConfig'
import { dailyReturns } from '../portfolioInsights'
import { HISTORY_RANGES, type HistoryRangeKey } from '../usePortfolioView'
import { Tile, TileEmpty } from './Tile'
import type { PortfolioSnapshot } from '../investmentsApi'

/**
 * The portfolio's day-by-day return, as bars above and below zero.
 *
 * Bars rather than a line because each day is its own result, and the sign is
 * the point: green and red read as "up day / down day" at a glance, which a
 * value curve buries under its own trend.
 */
export function DailyReturnsTile({
  history,
  range,
  onRangeChange,
  loading,
  className,
}: {
  history: PortfolioSnapshot[]
  range: HistoryRangeKey
  onRangeChange: (range: HistoryRangeKey) => void
  loading: boolean
  className?: string
}) {
  const { t } = useTranslation('investments')
  const motion = useChartMotion()

  const returns = useMemo(() => dailyReturns(history), [history])

  const config = useMemo(
    () => ({ pct: { label: t('tiles.dailyReturn') } }) satisfies ChartConfig,
    [t],
  )

  return (
    <Tile
      title={t('tiles.dailyReturns')}
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
      ) : returns.length === 0 ? (
        <TileEmpty>{t('detail.noHistory')}</TileEmpty>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-[13rem] w-full">
          <BarChart data={returns} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
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
              tickFormatter={(value: number) => `${value.toFixed(1)}%`}
            />
            <ChartTooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
              // Recharts' tooltip wrapper carries no z-index of its own, so it
              // loses to any later sibling tile on the grid.
              wrapperStyle={{ zIndex: 30 }}
              content={
                <ChartTooltipContent
                  hideIndicator
                  labelFormatter={(value) => formatDate(String(value))}
                  formatter={(value) => (
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="text-muted-foreground">{config.pct.label}</span>
                      <span className="font-medium tabular-nums">
                        {Number(value) > 0 ? '+' : ''}
                        {Number(value).toFixed(2)}%
                      </span>
                    </div>
                  )}
                />
              }
            />
            <Bar {...motion} dataKey="pct" radius={2}>
              {returns.map((day) => (
                <Cell key={day.date} fill={polarityColor(day.pct)} />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </Tile>
  )
}
