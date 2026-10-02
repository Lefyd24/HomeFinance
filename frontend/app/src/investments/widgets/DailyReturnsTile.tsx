import { useMemo, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, CartesianGrid, Cell, ComposedChart, Line, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatDate } from '../../lib/format'
import { polarityColor, seriesColor, useChartMotion } from '../chartConfig'
import { dailyReturns, withCumulativeReturn } from '../portfolioInsights'
import { HISTORY_RANGES, type HistoryRangeKey } from '../usePortfolioView'
import { Tile, TileEmpty } from './Tile'
import type { PortfolioSnapshot } from '../investmentsApi'

/**
 * The portfolio's return over the selected range: a line for the running total
 * and bars for each day's result.
 *
 * Both share one percent axis so the bars are honest about how small a day is
 * next to the whole move. The bars stay green/red ("up day / down day"), and
 * are softened so the line, which carries the trend, reads first.
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

  const returns = useMemo(() => withCumulativeReturn(dailyReturns(history)), [history])

  const config = useMemo(
    () =>
      ({
        pct: { label: t('tiles.dailyReturn') },
        cumulative: { label: t('tiles.cumulativeReturn'), color: seriesColor(0) },
      }) satisfies ChartConfig,
    [t],
  )

  return (
    <Tile
      title={t('tiles.portfolioReturn')}
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
          <ComposedChart data={returns} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
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
                  // One row per series would repeat the date's pair, so the
                  // first item renders both from the shared data point.
                  formatter={(_value, _name, item, index) =>
                    index === 0 ? (
                      <div className="flex w-full flex-col gap-1">
                        <TooltipRow label={config.cumulative.label} pct={item.payload.cumulative} />
                        <TooltipRow label={config.pct.label} pct={item.payload.pct} />
                      </div>
                    ) : null
                  }
                />
              }
            />
            <Bar {...motion} dataKey="pct" radius={2} fillOpacity={0.55}>
              {returns.map((day) => (
                <Cell key={day.date} fill={polarityColor(day.pct)} />
              ))}
            </Bar>
            <Line
              {...motion}
              dataKey="cumulative"
              type="monotone"
              stroke="var(--color-cumulative)"
              strokeWidth={2}
              dot={false}
            />
          </ComposedChart>
        </ChartContainer>
      )}
    </Tile>
  )
}

function TooltipRow({ label, pct }: { label: ReactNode; pct: number }) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">
        {pct > 0 ? '+' : ''}
        {pct.toFixed(2)}%
      </span>
    </div>
  )
}
