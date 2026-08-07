import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ComposedChart, Line, CartesianGrid, ReferenceArea, ReferenceDot, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatCurrency, formatDate } from '../../lib/format'
import { seriesColor, useChartMotion } from '../chartConfig'
import { Tile, TileEmpty } from './Tile'
import type { DrawdownMetric, SeriesPoint } from '../scenariosApi'

const SCENARIO_COLOR = seriesColor(0)
const INVESTED_COLOR = 'var(--muted-foreground)'
const BENCHMARK_COLOR = 'var(--muted-foreground)'

type ViewMode = 'value' | 'normalized'

/**
 * Rebases every series to 100 at the first point, so a DCA scenario (whose raw
 * "invested" line keeps stepping up) can be compared on a like-for-like growth
 * basis with the benchmark. Shares `SeriesPoint`'s shape (rather than its own
 * type) so the chart below can treat both views identically.
 * See docs/investments/02-backtesting-sandbox.md §5.2.
 */
function normalize(series: SeriesPoint[]): SeriesPoint[] {
  const base = series[0]
  if (!base || base.value === 0) return []
  const benchmarkBase = base.benchmark_value ?? null
  return series.map((point) => ({
    date: point.date,
    value: (point.value / base.value) * 100,
    invested: base.invested !== 0 ? (point.invested / base.invested) * 100 : 100,
    benchmark_value:
      benchmarkBase && point.benchmark_value != null ? (point.benchmark_value / benchmarkBase) * 100 : null,
    drawdown: null,
  }))
}

/** A contribution landed on this date if invested jumped since the previous point. */
function contributionDates(series: SeriesPoint[]): string[] {
  const dates: string[] = []
  for (let i = 1; i < series.length; i++) {
    if (series[i].invested > series[i - 1].invested) dates.push(series[i].date)
  }
  return dates
}

function findByDate<T extends { date: string }>(series: T[], date: string | null): T | null {
  if (!date) return null
  return series.find((point) => point.date === date) ?? null
}

/**
 * The centrepiece: what the money actually did, day by day. See plan §5.2 —
 * everything else on the result page supports the plain-language sentence
 * this chart illustrates.
 */
export function JourneyChart({
  series,
  scenarioSymbol,
  benchmarkSymbol,
  currency,
  maxDrawdown,
  loading = false,
}: {
  series: SeriesPoint[]
  scenarioSymbol: string
  benchmarkSymbol: string | null
  currency: string
  maxDrawdown: DrawdownMetric | null
  loading?: boolean
}) {
  const { t } = useTranslation('investments')
  const motion = useChartMotion()
  const [view, setView] = useState<ViewMode>('value')
  const [showInvested, setShowInvested] = useState(true)

  const normalized = useMemo(() => normalize(series), [series])
  const contributions = useMemo(() => contributionDates(series), [series])
  const showContributionDots = contributions.length > 0 && contributions.length <= 24

  const data = view === 'value' ? series : normalized
  const hasData = !loading && data.length > 0

  const config = {
    value: { label: scenarioSymbol, color: SCENARIO_COLOR },
    ...(benchmarkSymbol ? { benchmark_value: { label: benchmarkSymbol, color: BENCHMARK_COLOR } } : {}),
    invested: { label: t('backtest.journey.investedLine'), color: INVESTED_COLOR },
  } satisfies ChartConfig

  const trough = maxDrawdown?.trough_date ?? null
  const peak = maxDrawdown?.peak_date ?? null
  const recovery = maxDrawdown?.recovery_date ?? null
  const troughPoint = findByDate(data, trough)
  const areaEnd = recovery ?? data[data.length - 1]?.date ?? null

  function fmtY(value: number) {
    return view === 'value' ? formatCurrency(value, currency) : value.toFixed(0)
  }

  return (
    <Tile
      title={t('backtest.journey.title')}
      allowOverflow
      action={
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(next) => next && setView(next as ViewMode)}
          variant="outline"
          size="sm"
          spacing={0}
          aria-label={t('backtest.journey.viewToggle')}
        >
          <ToggleGroupItem value="value" className="px-2.5 text-xs">
            {t('backtest.journey.viewValue')}
          </ToggleGroupItem>
          <ToggleGroupItem value="normalized" className="px-2.5 text-xs">
            {t('backtest.journey.viewNormalized')}
          </ToggleGroupItem>
        </ToggleGroup>
      }
    >
      {loading ? (
        <Skeleton className="h-72 w-full rounded-lg" />
      ) : !hasData ? (
        <TileEmpty>{t('backtest.empty.noResult')}</TileEmpty>
      ) : (
        <>
          <ChartContainer config={config} className="aspect-auto h-56 w-full sm:h-72">
            <ComposedChart data={data} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={40}
                tickFormatter={(value: string) => formatDate(value, { day: 'numeric', month: 'short' })}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={52}
                tickMargin={4}
                domain={['auto', 'auto']}
                tickFormatter={(value: number) => fmtY(value)}
              />
              <ChartTooltip
                wrapperStyle={{ zIndex: 30 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  return (
                    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                      <div className="mb-1 font-medium text-muted-foreground">{formatDate(String(label))}</div>
                      <div className="flex flex-col gap-1">
                        {payload
                          .filter((item) => typeof item.value === 'number')
                          .map((item) => (
                            <div key={String(item.dataKey)} className="flex items-center gap-2">
                              <span
                                aria-hidden="true"
                                className="size-2 shrink-0 rounded-[3px]"
                                style={{ backgroundColor: String(item.color) }}
                              />
                              <span className="min-w-0 flex-1 truncate">
                                {item.dataKey === 'value'
                                  ? scenarioSymbol
                                  : item.dataKey === 'benchmark_value'
                                    ? (benchmarkSymbol ?? '')
                                    : t('backtest.journey.investedLine')}
                              </span>
                              <span className="shrink-0 tabular-nums font-medium">{fmtY(Number(item.value))}</span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )
                }}
              />
              {peak && areaEnd && (
                <ReferenceArea
                  x1={peak}
                  x2={areaEnd}
                  fill="var(--flow-out)"
                  fillOpacity={0.08}
                  ifOverflow="extendDomain"
                />
              )}
              {showInvested && (
                <Line
                  {...motion}
                  dataKey="invested"
                  type="stepAfter"
                  stroke={INVESTED_COLOR}
                  strokeWidth={1}
                  strokeOpacity={0.5}
                  dot={false}
                />
              )}
              {benchmarkSymbol && (
                <Line
                  {...motion}
                  dataKey="benchmark_value"
                  type="monotone"
                  stroke={BENCHMARK_COLOR}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                  connectNulls
                />
              )}
              <Line
                {...motion}
                dataKey="value"
                type="monotone"
                stroke={SCENARIO_COLOR}
                strokeWidth={2}
                dot={false}
              />
              {showContributionDots &&
                contributions.map((date) => {
                  const point = findByDate(data, date)
                  if (!point) return null
                  return (
                    <ReferenceDot
                      key={date}
                      x={date}
                      y={point.value}
                      r={2.5}
                      fill={SCENARIO_COLOR}
                      stroke="var(--background)"
                      strokeWidth={1}
                    />
                  )
                })}
              {troughPoint && maxDrawdown && (
                <ReferenceDot
                  x={trough as string}
                  y={troughPoint.value}
                  r={4}
                  fill="var(--flow-out)"
                  stroke="var(--background)"
                  strokeWidth={1.5}
                  label={{
                    value: `${(maxDrawdown.depth * 100).toFixed(1)}%`,
                    position: 'bottom',
                    fill: 'var(--flow-out)',
                    fontSize: 11,
                  }}
                />
              )}
            </ComposedChart>
          </ChartContainer>
          <label className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground sm:hidden">
            <input
              type="checkbox"
              checked={showInvested}
              onChange={(e) => setShowInvested(e.target.checked)}
              className="size-3.5"
            />
            {t('backtest.journey.showInvested')}
          </label>
        </>
      )}
    </Tile>
  )
}
