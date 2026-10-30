import { useMemo, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from 'recharts'
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import { ApiError } from '../../lib/apiClient'
import { formatBalance, formatDate } from '../../lib/format'
import { useBalanceVisibility } from '../../ui/BalanceVisibilityContext'
import { polarityColor, seriesColor, useChartMotion } from '../chartConfig'
import { PERFORMANCE_RANGES, type PerformanceRangeKey } from '../performanceView'
import { Tile, TileEmpty } from './Tile'
import type { PortfolioPerformance } from '../investmentsApi'

const CHART_HEIGHT = 'h-[13rem]'
// Always group (the default skips four-digit numbers), so ticks read 9.500 / 10.500 alike.
const axisMoney = new Intl.NumberFormat('de-DE', { useGrouping: 'always', maximumFractionDigits: 0 })

const pct = (value: number) => `${value.toFixed(1)}%`
const signedPct = (value: number) => `${value > 0 ? '+' : ''}${value.toFixed(2)}%`

/**
 * The portfolio's flow-adjusted performance over the selected range, in three
 * views of the same series: what it is worth against what was put in, how it
 * compounded against the benchmark, and how far it sits below its peak.
 *
 * Money in and out never counts as a return — the Value tab marks those days
 * instead, so the gap between the two lines is the gain.
 */
export function PerformanceTile({
  performance,
  range,
  onRangeChange,
  loading,
  error,
  currency,
  className,
}: {
  performance: PortfolioPerformance | undefined
  range: PerformanceRangeKey
  onRangeChange: (range: PerformanceRangeKey) => void
  loading: boolean
  error: Error | null
  currency: string
  className?: string
}) {
  const { t } = useTranslation('investments')
  const { hidden } = useBalanceVisibility()
  const motion = useChartMotion()
  // Held here, not inside the body, so a range change that flashes the skeleton keeps the tab.
  const [tab, setTab] = useState('value')
  const money = (value: number) => formatBalance(value, currency, hidden)

  // Percent series are scaled once here so the axes and tooltips deal in plain percents.
  const data = useMemo(
    () =>
      (performance?.series ?? []).map((point) => ({
        ...point,
        twrPct: point.twr * 100,
        benchmarkPct: point.benchmark == null ? null : point.benchmark * 100,
        drawdownPct: point.drawdown * 100,
      })),
    [performance],
  )

  const benchmarkLabel =
    performance?.benchmark?.symbol === '^GSPC' || !performance?.benchmark
      ? t('performance.chart.benchmark')
      : performance.benchmark.symbol

  const config = useMemo(
    () =>
      ({
        value: { label: t('performance.chart.value'), color: seriesColor(0) },
        net_invested: { label: t('performance.chart.netInvested'), color: seriesColor(1) },
        twrPct: { label: t('performance.chart.twr'), color: seriesColor(0) },
        benchmarkPct: { label: benchmarkLabel, color: seriesColor(1) },
        drawdownPct: { label: t('performance.chart.drawdown'), color: polarityColor(-1) },
      }) satisfies ChartConfig,
    [t, benchmarkLabel],
  )

  const xAxis = (
    <XAxis
      dataKey="date"
      tickLine={false}
      axisLine={false}
      tickMargin={8}
      minTickGap={32}
      tickFormatter={(value: string) => formatDate(value)}
    />
  )
  const pctAxis = (
    <YAxis
      tickLine={false}
      axisLine={false}
      width={44}
      tickMargin={4}
      tickFormatter={(value: number) => pct(value)}
    />
  )
  const tooltip = (rows: (point: (typeof data)[number]) => ReactNode) => (
    <ChartTooltip
      cursor={{ stroke: 'var(--muted-foreground)', strokeDasharray: '3 3' }}
      // Recharts' tooltip wrapper carries no z-index of its own, so it
      // loses to any later sibling tile on the grid.
      wrapperStyle={{ zIndex: 30 }}
      content={
        <ChartTooltipContent
          hideIndicator
          labelFormatter={(value) => formatDate(String(value))}
          // One row per series would repeat the date's group, so the first
          // item renders every figure from the shared data point.
          formatter={(_value, _name, item, index) =>
            index === 0 ? (
              <div className="flex w-full flex-col gap-1">{rows(item.payload)}</div>
            ) : null
          }
        />
      }
    />
  )

  const maxDrawdown = performance?.summary.max_drawdown
  const note = performance && (
    <span className="flex flex-col gap-0.5 text-[0.65rem] leading-snug">
      {performance.benchmark && <span>{t('performance.chart.benchmarkNote')}</span>}
      {performance.flows_source !== 'reported' && <span>{t('performance.chart.flowsInferred')}</span>}
    </span>
  )

  let body: ReactNode
  if (loading) {
    body = <Skeleton className={cn(CHART_HEIGHT, 'w-full rounded-lg')} />
  } else if (error) {
    body = <PerformanceError error={error} />
  } else if (data.length < 2) {
    body = <TileEmpty>{t('performance.chart.noData')}</TileEmpty>
  } else {
    body = (
      <Tabs value={tab} onValueChange={setTab} className="gap-2">
        <TabsList className="self-start">
          {(['value', 'performance', 'drawdown'] as const).map((tab) => (
            <TabsTrigger key={tab} value={tab} className="text-xs">
              {t(`performance.tabs.${tab}`)}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="value">
          <ChartContainer config={config} className={cn('aspect-auto w-full', CHART_HEIGHT)}>
            <AreaChart data={data} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              {xAxis}
              <YAxis
                hide={hidden}
                tickLine={false}
                axisLine={false}
                width={52}
                tickMargin={4}
                domain={['auto', 'auto']}
                tickFormatter={(value: number) => axisMoney.format(value)}
              />
              {tooltip((point) => (
                <>
                  <TooltipRow label={config.value.label} text={money(point.value)} />
                  <TooltipRow label={config.net_invested.label} text={money(point.net_invested)} />
                  {point.flow !== 0 && (
                    <TooltipRow
                      label={point.flow > 0 ? t('performance.chart.deposit') : t('performance.chart.withdrawal')}
                      text={`${point.flow > 0 ? '+' : ''}${money(point.flow)}`}
                      color={polarityColor(point.flow)}
                    />
                  )}
                </>
              ))}
              <Area
                {...motion}
                dataKey="value"
                type="monotone"
                stroke="var(--color-value)"
                strokeWidth={2}
                fill="var(--color-value)"
                fillOpacity={0.15}
                // Only days money moved get a marker, so a gain isn't mistaken for a deposit.
                dot={({ cx, cy, payload, index }) =>
                  payload.flow !== 0 ? (
                    <circle
                      key={index}
                      cx={cx}
                      cy={cy}
                      r={3.5}
                      fill={polarityColor(payload.flow)}
                      stroke="var(--card)"
                      strokeWidth={1}
                    />
                  ) : (
                    <g key={index} />
                  )
                }
                activeDot={false}
              />
              <Line
                {...motion}
                dataKey="net_invested"
                type="stepAfter"
                stroke="var(--color-net_invested)"
                strokeWidth={1.5}
                dot={false}
              />
            </AreaChart>
          </ChartContainer>
          <p className="mt-1 flex items-center gap-3 text-[0.65rem] text-muted-foreground">
            <LegendKey color={config.value.color} label={config.value.label} />
            <LegendKey color={config.net_invested.color} label={config.net_invested.label} />
          </p>
        </TabsContent>

        <TabsContent value="performance">
          <ChartContainer config={config} className={cn('aspect-auto w-full', CHART_HEIGHT)}>
            <LineChart data={data} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              {xAxis}
              {pctAxis}
              {tooltip((point) => (
                <>
                  <TooltipRow label={config.twrPct.label} text={signedPct(point.twrPct)} />
                  {point.benchmarkPct != null && (
                    <TooltipRow label={config.benchmarkPct.label} text={signedPct(point.benchmarkPct)} />
                  )}
                </>
              ))}
              <ReferenceLine y={0} stroke="var(--muted-foreground)" strokeOpacity={0.6} />
              <Line
                {...motion}
                dataKey="twrPct"
                type="monotone"
                stroke="var(--color-twrPct)"
                strokeWidth={2}
                dot={false}
              />
              <Line
                {...motion}
                dataKey="benchmarkPct"
                type="monotone"
                stroke="var(--color-benchmarkPct)"
                strokeWidth={1.5}
                strokeDasharray="5 4"
                dot={false}
                connectNulls
              />
            </LineChart>
          </ChartContainer>
          <p className="mt-1 flex items-center gap-3 text-[0.65rem] text-muted-foreground">
            <LegendKey color={config.twrPct.color} label={config.twrPct.label} />
            {performance?.benchmark && (
              <LegendKey color={config.benchmarkPct.color} label={benchmarkLabel} dashed />
            )}
          </p>
        </TabsContent>

        <TabsContent value="drawdown">
          <ChartContainer config={config} className={cn('aspect-auto w-full', CHART_HEIGHT)}>
            <AreaChart data={data} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              {xAxis}
              {pctAxis}
              {tooltip((point) => (
                <TooltipRow label={config.drawdownPct.label} text={pct(point.drawdownPct)} />
              ))}
              <Area
                {...motion}
                dataKey="drawdownPct"
                type="monotone"
                stroke="var(--color-drawdownPct)"
                strokeWidth={1.5}
                fill="var(--color-drawdownPct)"
                fillOpacity={0.2}
                dot={false}
              />
            </AreaChart>
          </ChartContainer>
          {maxDrawdown != null && (
            <p className="mt-1 text-[0.65rem] font-medium text-flow-out">
              {t('performance.chart.maxDrawdown', { pct: pct(maxDrawdown * 100) })}
            </p>
          )}
        </TabsContent>
      </Tabs>
    )
  }

  return (
    <Tile
      title={t('performance.title')}
      className={className}
      allowOverflow
      footer={!loading && !error && note ? note : undefined}
      action={
        <div className="-mr-0.5 flex max-w-[60vw] items-center gap-0.5 overflow-x-auto rounded-full bg-muted/60 p-0.5 sm:max-w-none">
          {PERFORMANCE_RANGES.map((key) => (
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
              {t(`performance.ranges.${key}`)}
            </button>
          ))}
        </div>
      }
    >
      {body}
    </Tile>
  )
}

/** The empty state for a performance request that failed; a 422 carries the reason (mixed currencies). */
export function PerformanceError({ error }: { error: Error }) {
  const { t } = useTranslation('investments')
  return (
    <TileEmpty>
      {error instanceof ApiError && error.status === 422 ? error.message : t('performance.chart.loadFailed')}
    </TileEmpty>
  )
}

function TooltipRow({ label, text, color }: { label: ReactNode; text: string; color?: string }) {
  return (
    <div className="flex w-full items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums" style={color ? { color } : undefined}>
        {text}
      </span>
    </div>
  )
}

function LegendKey({ color, label, dashed }: { color: string; label: ReactNode; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="inline-block w-4 border-t-2"
        style={{ borderColor: color, borderTopStyle: dashed ? 'dashed' : 'solid' }}
      />
      {label}
    </span>
  )
}
