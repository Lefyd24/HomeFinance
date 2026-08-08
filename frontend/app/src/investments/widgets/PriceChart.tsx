import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Area,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceDot,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { formatDate } from '../../lib/format'
import { seriesColor, useChartMotion } from '../chartConfig'
import { Tile, TileEmpty } from './Tile'
import type { TechnicalResponse } from '../technicalApi'

type ChartRow = Record<string, number | null | undefined | [number, number] | string> & {
  date: string
  close: number | null
  volume: number | null
  bbRange: [number, number] | null
}

/** Fixed slot per series so identity colour never shifts as data changes. EMA20 gets
 * its own colour slot (index 4) rather than reusing SMA20's, since both are now drawn
 * distinctly (dashed, thin) and would otherwise be indistinguishable in the legend. */
const SERIES = [
  { key: 'close', label: 'Close', strokeWidth: 2.5, dash: undefined as string | undefined, colorIndex: 0 },
  { key: 'sma20', label: 'SMA20', strokeWidth: 1, dash: '4 3', colorIndex: 1 },
  { key: 'sma50', label: 'SMA50', strokeWidth: 1.5, dash: undefined as string | undefined, colorIndex: 2 },
  { key: 'sma200', label: 'SMA200', strokeWidth: 3, dash: undefined as string | undefined, colorIndex: 3 },
  { key: 'ema20', label: 'EMA20', strokeWidth: 1, dash: '2 3', colorIndex: 4 },
] as const

function mergeRows(
  overlays: TechnicalResponse['overlays'],
  price: TechnicalResponse['price'],
): ChartRow[] {
  const barByDate = new Map(price.map((bar) => [bar.date, bar]))
  return overlays.map((row) => {
    const bbLow = row.bb_lower
    const bbHigh = row.bb_upper
    const bar = barByDate.get(row.date)
    return {
      ...row,
      close: bar?.close ?? null,
      volume: bar?.volume ?? null,
      bbRange: typeof bbLow === 'number' && typeof bbHigh === 'number' ? [bbLow, bbHigh] : null,
    } as ChartRow
  })
}

function CrossoverDotShape({
  cx,
  cy,
  color,
  title,
}: {
  cx?: number
  cy?: number
  color: string
  title: string
}) {
  if (cx == null || cy == null) return null
  return (
    <g>
      <circle cx={cx} cy={cy} r={11} fill={color} fillOpacity={0.22} />
      <circle cx={cx} cy={cy} r={7} fill={color} stroke="var(--background)" strokeWidth={2} />
      <title>{title}</title>
    </g>
  )
}

/**
 * The instrument's price with its moving averages, Bollinger band, key
 * support/resistance zones, volume and MA crossovers — the one chart every
 * other pane on this page is read against, hence the shared `syncId`. This is
 * the hero of the dashboard: area-filled price, heavier SMA200, visible S/R
 * zones and a volume sub-panel so price action reads with confirmation.
 */
export function PriceChart({
  overlays,
  price,
  levels,
  crossovers,
  loading,
}: {
  overlays: TechnicalResponse['overlays']
  price: TechnicalResponse['price']
  levels: TechnicalResponse['levels']
  crossovers: TechnicalResponse['crossovers']
  loading: boolean
}) {
  const { t } = useTranslation('investments')
  const motion = useChartMotion()
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const gradientId = useId().replace(/:/g, '')

  const data = useMemo(() => mergeRows(overlays, price), [overlays, price])
  const hasData = !loading && data.length > 0
  const hasVolume = data.some((row) => typeof row.volume === 'number')

  const config = useMemo(
    () =>
      Object.fromEntries(
        SERIES.map((series) => [series.key, { label: series.label, color: seriesColor(series.colorIndex) }]),
      ) satisfies ChartConfig,
    [],
  )

  const maxScore = useMemo(() => Math.max(1e-6, ...levels.map((level) => level.score)), [levels])

  function toggleSeries(key: string) {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  return (
    <Tile title={t('technical.price.title')} allowOverflow className="lg:row-span-2">
      {loading ? (
        <Skeleton className="h-96 w-full rounded-lg" />
      ) : !hasData ? (
        <TileEmpty>No price data available for this period.</TileEmpty>
      ) : (
        <>
          <ChartContainer config={config} className={cn('aspect-auto w-full', hasVolume ? 'h-96' : 'h-80')}>
            <ComposedChart
              data={data}
              margin={{ left: 4, right: 4, top: 4, bottom: 0 }}
              syncId="ta"
            >
              <defs>
                <linearGradient id={`priceFill-${gradientId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={seriesColor(0)} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={seriesColor(0)} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={40}
                tickFormatter={(value: string) =>
                  formatDate(value, { day: 'numeric', month: 'short' })
                }
              />
              <YAxis
                yAxisId="price"
                tickLine={false}
                axisLine={false}
                width={52}
                tickMargin={4}
                domain={['auto', 'auto']}
                tickFormatter={(value: number) => value.toFixed(0)}
              />
              {hasVolume && (
                <YAxis
                  yAxisId="volume"
                  orientation="right"
                  hide
                  /* Volume bars only occupy the bottom ~20% of the plot area by giving
                   * their axis 5x the domain the data actually needs — a standard
                   * recharts technique for a mini sub-panel inside one ComposedChart. */
                  domain={[0, (dataMax: number) => dataMax * 5]}
                />
              )}
              <ChartTooltip
                wrapperStyle={{ zIndex: 30 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const rows = payload.filter(
                    (item) =>
                      typeof item.value === 'number' &&
                      !hidden.has(String(item.dataKey)) &&
                      item.dataKey !== 'volume',
                  )
                  if (rows.length === 0) return null
                  return (
                    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                      <div className="mb-1 font-medium text-muted-foreground">
                        {formatDate(String(label))}
                      </div>
                      <div className="flex flex-col gap-1">
                        {rows.map((item) => (
                          <div key={String(item.dataKey)} className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="size-2 shrink-0 rounded-[3px]"
                              style={{ backgroundColor: String(item.color) }}
                            />
                            <span className="min-w-0 flex-1 truncate">{String(item.dataKey)}</span>
                            <span className="shrink-0 tabular-nums font-medium">
                              {Number(item.value).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                }}
              />
              {levels.map((level, index) => {
                const opacity = 0.22 + 0.35 * (level.score / maxScore)
                const color = level.kind === 'support' ? 'var(--flow-in)' : 'var(--flow-out)'
                return (
                  <ReferenceArea
                    key={`${level.kind}-${index}`}
                    yAxisId="price"
                    y1={level.low}
                    y2={level.high}
                    fill={color}
                    fillOpacity={opacity}
                    stroke={color}
                    strokeOpacity={0.4}
                    strokeDasharray="2 2"
                    ifOverflow="extendDomain"
                    label={{
                      value: `${t(`technical.levels.${level.kind}`)} ${level.centre.toFixed(0)}`,
                      position: 'insideTopRight',
                      fontSize: 10,
                      fill: color,
                    }}
                  />
                )
              })}
              {!hidden.has('bbRange') && (
                <Area
                  {...motion}
                  yAxisId="price"
                  dataKey="bbRange"
                  stroke="none"
                  fill={seriesColor(1)}
                  fillOpacity={0.15}
                  connectNulls
                />
              )}
              {!hidden.has('bb_mid') && (
                <Line
                  {...motion}
                  yAxisId="price"
                  dataKey="bb_mid"
                  type="monotone"
                  stroke={seriesColor(1)}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  strokeOpacity={0.7}
                  dot={false}
                  connectNulls
                />
              )}
              {!hidden.has('close') && (
                <Area
                  {...motion}
                  yAxisId="price"
                  dataKey="close"
                  type="monotone"
                  stroke="none"
                  fill={`url(#priceFill-${gradientId})`}
                  connectNulls
                />
              )}
              {SERIES.map((series) =>
                hidden.has(series.key) ? null : (
                  <Line
                    key={series.key}
                    {...motion}
                    yAxisId="price"
                    dataKey={series.key}
                    type="monotone"
                    stroke={seriesColor(series.colorIndex)}
                    strokeWidth={series.strokeWidth}
                    strokeDasharray={series.dash}
                    dot={false}
                    connectNulls
                  />
                ),
              )}
              {hasVolume && (
                <Bar yAxisId="volume" dataKey="volume" maxBarSize={6} isAnimationActive={false}>
                  {data.map((row, index) => {
                    const prevClose = index > 0 ? data[index - 1].close : null
                    const up = prevClose == null || row.close == null ? true : row.close >= prevClose
                    return (
                      <Cell
                        key={row.date}
                        fill={up ? 'var(--flow-in)' : 'var(--flow-out)'}
                        fillOpacity={0.35}
                      />
                    )
                  })}
                </Bar>
              )}
              {!hidden.has('sma50') &&
                crossovers.map((crossover) => {
                  const row = data.find((entry) => entry.date === crossover.date)
                  const y = row?.sma50
                  if (typeof y !== 'number') return null
                  const color = crossover.kind === 'golden' ? 'var(--flow-in)' : 'var(--flow-out)'
                  const title = `${t(`technical.crossovers.${crossover.kind}`)} — ${formatDate(crossover.date)}`
                  return (
                    <ReferenceDot
                      key={`${crossover.date}-${crossover.kind}`}
                      yAxisId="price"
                      x={crossover.date}
                      y={y}
                      shape={(props: { cx?: number; cy?: number }) => (
                        <CrossoverDotShape
                          cx={props.cx}
                          cy={props.cy}
                          color={color}
                          title={title}
                        />
                      )}
                    />
                  )
                })}
            </ComposedChart>
          </ChartContainer>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-2">
            {SERIES.map((series) => (
              <button
                key={series.key}
                type="button"
                onClick={() => toggleSeries(series.key)}
                className={cn(
                  'inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-opacity',
                  hidden.has(series.key) && 'opacity-40',
                )}
              >
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: seriesColor(series.colorIndex) }}
                />
                {series.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-[0.65rem] text-muted-foreground/70">
            {t('technical.price.legendHint')}
          </p>
        </>
      )}
    </Tile>
  )
}

/**
 * Compact list rendering of `levels` — kept as a separate export so a page
 * composer can place it beside or below `PriceChart` as its own tile.
 */
export function LevelsList({ levels }: { levels: TechnicalResponse['levels'] }) {
  const { t } = useTranslation('investments')

  if (levels.length === 0) {
    return <p className="text-xs text-muted-foreground">{t('technical.levels.empty')}</p>
  }

  return (
    <ul className="flex flex-col gap-2">
      {levels.map((level, index) => (
        <li
          key={`${level.kind}-${index}`}
          className="flex items-center justify-between gap-2 text-xs"
        >
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <span
              aria-hidden="true"
              className={cn(
                'size-2 shrink-0 rounded-full',
                level.kind === 'support' ? 'bg-flow-in' : 'bg-flow-out',
              )}
            />
            <span className="truncate text-muted-foreground">
              {t(`technical.levels.${level.kind}`)}
            </span>
          </span>
          <span className="shrink-0 tabular-nums font-medium">{level.centre.toFixed(2)}</span>
          <span className="shrink-0 text-muted-foreground">
            {t('technical.levels.touches', { count: level.touches })}
          </span>
          <span
            className={cn(
              'shrink-0 tabular-nums',
              level.distance_pct >= 0 ? 'text-flow-in' : 'text-flow-out',
            )}
          >
            {t(
              level.distance_pct >= 0
                ? 'technical.levels.distanceAbove'
                : 'technical.levels.distanceBelow',
              {
                pct: `${Math.abs(level.distance_pct).toFixed(1)}%`,
              },
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
