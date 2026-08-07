import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDate } from '../../lib/format'
import { seriesColor, useChartMotion } from '../chartConfig'
import { Tile, TileEmpty } from './Tile'
import type { SeriesBlock } from '../comparisonApi'

/**
 * Daily series are long enough that a "Jan 5" tick every axis label would
 * overlap; weekly/monthly ones are usually spanning years, so a month +
 * short-year tick is the readable grain. Deliberately hand-rolled rather
 * than a new date library — `Intl.DateTimeFormat` already covers both cases.
 */
function formatAxisDate(value: string, frequency: 'daily' | 'weekly' | 'monthly'): string {
  if (frequency === 'daily') return formatDate(value, { day: 'numeric', month: 'short' })
  return formatDate(value, { month: 'short', year: '2-digit' })
}

/**
 * "Growth of 100" — every instrument rebased to the same starting index so a
 * cheap stock and an expensive one are visually comparable from day one. The
 * benchmark, when it's one of the plotted lines, is drawn dashed and muted
 * rather than in its identity color: it's the yardstick the others are read
 * against, not another contender for attention.
 */
export function NormalizedChart({
  series,
  symbols,
  benchmarkSymbol,
  seriesFrequency,
  loading,
}: {
  series: SeriesBlock['normalized']
  symbols: string[]
  benchmarkSymbol: string | null
  seriesFrequency: 'daily' | 'weekly' | 'monthly'
  loading: boolean
}) {
  const { t } = useTranslation('investments')
  const motion = useChartMotion()
  const [logScale, setLogScale] = useState(false)

  const config = useMemo(
    () =>
      Object.fromEntries(
        symbols.map((symbol, index) => [
          symbol,
          {
            label: symbol,
            color: symbol === benchmarkSymbol ? 'var(--muted-foreground)' : seriesColor(index),
          },
        ]),
      ) satisfies ChartConfig,
    [symbols, benchmarkSymbol],
  )

  const hasData = !loading && series.length > 0 && symbols.length > 0

  return (
    <Tile
      title={t('compare.tiles.growth')}
      allowOverflow
      action={
        <Tooltip>
          <TooltipTrigger asChild>
            <label className="flex cursor-default items-center gap-1.5 text-[0.65rem] font-medium text-muted-foreground">
              <Switch
                checked={logScale}
                onCheckedChange={setLogScale}
                size="sm"
                aria-label={t('compare.tiles.growthLogToggle')}
              />
              {t('compare.tiles.growthLogToggle')}
            </label>
          </TooltipTrigger>
          <TooltipContent className="max-w-56">{t('compare.tiles.growthLogHint')}</TooltipContent>
        </Tooltip>
      }
    >
      <p className="mb-2 text-xs text-muted-foreground">{t('compare.tiles.growthSubtitle')}</p>
      {loading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : !hasData ? (
        <TileEmpty>{t('compare.empty.title')}</TileEmpty>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
          <LineChart data={series} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value: string) => formatAxisDate(value, seriesFrequency)}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={40}
              tickMargin={4}
              scale={logScale ? 'log' : 'linear'}
              domain={logScale ? ['auto', 'auto'] : undefined}
              tickFormatter={(value: number) => value.toFixed(0)}
            />
            <ReferenceLine y={100} stroke="var(--border)" />
            <ChartTooltip
              // Recharts positions the tooltip in an absolutely-placed wrapper
              // with no z-index of its own, so it loses to any later sibling
              // tile on the grid.
              wrapperStyle={{ zIndex: 30 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const sorted = [...payload]
                  .filter((item) => typeof item.value === 'number')
                  .sort((a, b) => Number(b.value) - Number(a.value))
                if (sorted.length === 0) return null
                return (
                  <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                    <div className="mb-1 font-medium text-muted-foreground">{formatDate(String(label))}</div>
                    <div className="flex flex-col gap-1">
                      {sorted.map((item) => {
                        const symbol = String(item.dataKey)
                        const isBenchmark = symbol === benchmarkSymbol
                        return (
                          <div key={symbol} className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="size-2 shrink-0 rounded-[3px]"
                              style={{
                                backgroundColor: isBenchmark ? 'var(--muted-foreground)' : String(item.color),
                              }}
                            />
                            <span className="min-w-0 flex-1 truncate">{symbol}</span>
                            <span className="shrink-0 tabular-nums font-medium">
                              {Number(item.value).toFixed(1)}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              }}
            />
            {symbols.map((symbol, index) => {
              const isBenchmark = symbol === benchmarkSymbol
              return (
                <Line
                  key={symbol}
                  {...motion}
                  dataKey={symbol}
                  type="monotone"
                  stroke={isBenchmark ? 'var(--muted-foreground)' : seriesColor(index)}
                  strokeWidth={isBenchmark ? 1.5 : 2}
                  strokeDasharray={isBenchmark ? '4 4' : undefined}
                  dot={false}
                  connectNulls
                />
              )
            })}
          </LineChart>
        </ChartContainer>
      )}
    </Tile>
  )
}
