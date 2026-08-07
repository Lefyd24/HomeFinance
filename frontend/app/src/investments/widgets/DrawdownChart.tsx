import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Area, AreaChart, CartesianGrid, ReferenceDot, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '../../lib/format'
import { seriesColor, useChartMotion } from '../chartConfig'
import { Tile, TileEmpty } from './Tile'
import type { InstrumentComparison, SeriesBlock } from '../comparisonApi'

/** More than ~10 days off and the resampled series doesn't actually contain
 * this trough — better to skip the dot than mark the wrong point. */
const MAX_TROUGH_MATCH_MS = 10 * 24 * 60 * 60 * 1000

/**
 * Finds the series point closest to `targetDate`. `series` may be weekly- or
 * monthly-resampled, so the instrument's exact `trough_date` often isn't one
 * of the plotted dates — this is a best-effort nearest match, not an exact
 * lookup, and returns `null` rather than guessing when nothing is close.
 */
function findClosestPoint(
  series: SeriesBlock['drawdown'],
  targetDate: string | null,
): SeriesBlock['drawdown'][number] | null {
  if (!targetDate) return null
  const target = new Date(targetDate).getTime()
  if (Number.isNaN(target)) return null

  let best: SeriesBlock['drawdown'][number] | null = null
  let bestDiff = Infinity
  for (const point of series) {
    const time = new Date(String(point.date)).getTime()
    if (Number.isNaN(time)) continue
    const diff = Math.abs(time - target)
    if (diff < bestDiff) {
      bestDiff = diff
      best = point
    }
  }
  return bestDiff <= MAX_TROUGH_MATCH_MS ? best : null
}

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`
}

/**
 * How far under the previous peak each instrument was, every day of the
 * period — the chart that answers "what would it have actually felt like to
 * hold this?" better than any single headline number.
 *
 * Areas rather than lines: the filled band from 0 down to the line makes the
 * depth of a decline legible at a glance, the way the raw line alone
 * wouldn't. Values are already ≤ 0, so the axis starting at 0 at the top and
 * the fill growing downward needs no special baseline handling.
 */
export function DrawdownChart({
  series,
  symbols,
  instruments,
  loading,
}: {
  series: SeriesBlock['drawdown']
  symbols: string[]
  instruments: InstrumentComparison[]
  loading: boolean
}) {
  const { t } = useTranslation('investments')
  const motion = useChartMotion()

  const config = useMemo(
    () =>
      Object.fromEntries(
        symbols.map((symbol, index) => [symbol, { label: symbol, color: seriesColor(index) }]),
      ) satisfies ChartConfig,
    [symbols],
  )

  const worst = useMemo(() => {
    let candidate: InstrumentComparison | null = null
    for (const instrument of instruments) {
      const depth = instrument.risk.max_drawdown?.depth
      if (depth == null) continue
      const candidateDepth = candidate?.risk.max_drawdown?.depth
      if (candidateDepth == null || depth < candidateDepth) candidate = instrument
    }
    return candidate
  }, [instruments])

  const hasData = !loading && series.length > 0 && symbols.length > 0

  const footer =
    hasData && worst?.risk.max_drawdown
      ? t('compare.drawdown.worstMoment', {
          symbol: worst.symbol,
          depth: formatPct(worst.risk.max_drawdown.depth),
          peakDate: worst.risk.max_drawdown.peak_date ? formatDate(worst.risk.max_drawdown.peak_date) : '—',
          troughDate: worst.risk.max_drawdown.trough_date ? formatDate(worst.risk.max_drawdown.trough_date) : '—',
          recovery: worst.risk.max_drawdown.recovery_date
            ? t('compare.drawdown.recovered', { date: formatDate(worst.risk.max_drawdown.recovery_date) })
            : t('compare.drawdown.notRecovered'),
        })
      : undefined

  return (
    <Tile title={t('compare.tiles.drawdown')} allowOverflow footer={footer}>
      <p className="mb-2 text-xs text-muted-foreground">{t('compare.tiles.drawdownSubtitle')}</p>
      {loading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : !hasData ? (
        <TileEmpty>{t('compare.empty.title')}</TileEmpty>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-64 w-full">
          <AreaChart data={series} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
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
              domain={['dataMin', 0]}
              tickFormatter={(value: number) => formatPct(value)}
            />
            <ChartTooltip
              // Recharts positions the tooltip in an absolutely-placed wrapper
              // with no z-index of its own, so it loses to any later sibling
              // tile on the grid.
              wrapperStyle={{ zIndex: 30 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const sorted = [...payload]
                  .filter((item) => typeof item.value === 'number')
                  .sort((a, b) => Number(a.value) - Number(b.value))
                if (sorted.length === 0) return null
                return (
                  <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                    <div className="mb-1 font-medium text-muted-foreground">{formatDate(String(label))}</div>
                    <div className="flex flex-col gap-1">
                      {sorted.map((item) => (
                        <div key={String(item.dataKey)} className="flex items-center gap-2">
                          <span
                            aria-hidden="true"
                            className="size-2 shrink-0 rounded-[3px]"
                            style={{ backgroundColor: String(item.color) }}
                          />
                          <span className="min-w-0 flex-1 truncate">{String(item.dataKey)}</span>
                          <span className="shrink-0 tabular-nums font-medium">{formatPct(Number(item.value))}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              }}
            />
            {symbols.map((symbol, index) => (
              <Area
                key={symbol}
                {...motion}
                dataKey={symbol}
                type="monotone"
                stroke={seriesColor(index)}
                fill={seriesColor(index)}
                fillOpacity={0.16}
                strokeWidth={1.5}
                connectNulls
              />
            ))}
            {symbols.map((symbol, index) => {
              const instrument = instruments.find((entry) => entry.symbol === symbol)
              const troughDate = instrument?.risk.max_drawdown?.trough_date ?? null
              const point = findClosestPoint(series, troughDate)
              const value = point?.[symbol]
              if (!point || typeof value !== 'number') return null
              return (
                <ReferenceDot
                  key={`${symbol}-trough`}
                  x={String(point.date)}
                  y={value}
                  r={4}
                  fill={seriesColor(index)}
                  stroke="var(--background)"
                  strokeWidth={1.5}
                />
              )
            })}
          </AreaChart>
        </ChartContainer>
      )}
    </Tile>
  )
}
