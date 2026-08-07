import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import {
  ReferenceLine,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from 'recharts'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { seriesColor, useChartMotion } from '../chartConfig'
import { Tile, TileEmpty } from './Tile'
import type { InstrumentComparison } from '../comparisonApi'

interface Point {
  symbol: string
  name: string | null
  isBenchmark: boolean
  x: number
  y: number
  z: number
  color: string
}

function formatPct(value: number, decimals = 1): string {
  return `${(value * 100).toFixed(decimals)}%`
}

/**
 * The two questions "how much did it return" and "how rough was the ride" side
 * by side as one point per instrument, rather than two separate figures the
 * reader has to hold in their head and mentally divide. Up and to the left is
 * unambiguously better, which is why the benchmark's own position becomes a
 * pair of reference lines: everything in the upper-left quadrant beat it on
 * both axes at once.
 */
export function RiskScatter({
  instruments,
  loading,
}: {
  instruments: InstrumentComparison[]
  loading: boolean
}) {
  const { t } = useTranslation('investments')
  const motion = useChartMotion()

  const points = useMemo<Point[]>(
    () =>
      instruments
        .map((instrument, index) => ({ instrument, index }))
        .filter(
          ({ instrument }) =>
            instrument.risk.volatility != null && instrument.performance.cagr != null,
        )
        .map(({ instrument, index }) => ({
          symbol: instrument.symbol,
          name: instrument.name,
          isBenchmark: instrument.is_benchmark,
          x: instrument.risk.volatility as number,
          y: instrument.performance.cagr as number,
          z: Math.abs(instrument.risk.max_drawdown?.depth ?? 0),
          color: instrument.is_benchmark ? 'var(--muted-foreground)' : seriesColor(index),
        })),
    [instruments],
  )

  const benchmark = points.find((point) => point.isBenchmark) ?? null

  return (
    <Tile
      title={t('compare.tiles.riskVsReturn')}
      allowOverflow
      footer={t('compare.tiles.riskVsReturnCaption')}
    >
      {loading ? (
        <Skeleton className="h-[13rem] w-full rounded-lg" />
      ) : points.length < 1 ? (
        <TileEmpty>{t('compare.tiles.riskVsReturnEmpty')}</TileEmpty>
      ) : (
        <ChartContainer config={{}} className="aspect-auto h-[13rem] w-full">
          <ScatterChart margin={{ left: 4, right: 12, top: 12, bottom: 0 }}>
            <XAxis
              type="number"
              dataKey="x"
              name={t('compare.metrics.volatility.label')}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              tickFormatter={(value: number) => formatPct(value, 0)}
            />
            <YAxis
              type="number"
              dataKey="y"
              name={t('compare.metrics.cagr.label')}
              tickLine={false}
              axisLine={false}
              width={44}
              tickMargin={4}
              tickFormatter={(value: number) => formatPct(value, 0)}
            />
            <ZAxis type="number" dataKey="z" range={[60, 400]} />
            {benchmark && (
              <ReferenceLine
                x={benchmark.x}
                stroke="var(--muted-foreground)"
                strokeDasharray="3 3"
                strokeOpacity={0.5}
              />
            )}
            {benchmark && (
              <ReferenceLine
                y={benchmark.y}
                stroke="var(--muted-foreground)"
                strokeDasharray="3 3"
                strokeOpacity={0.5}
              />
            )}
            <ChartTooltip
              // Recharts positions the tooltip in an absolutely-placed wrapper
              // with no z-index of its own, so it loses to any later sibling
              // tile on the grid.
              wrapperStyle={{ zIndex: 30 }}
              cursor={{ strokeDasharray: '3 3' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const point = payload[0].payload as Point
                return (
                  <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                    <div className="font-medium">{point.name ?? point.symbol}</div>
                    <dl className="mt-1 flex flex-col gap-0.5 text-muted-foreground">
                      <div className="flex items-center justify-between gap-3">
                        <dt>{t('compare.metrics.volatility.label')}</dt>
                        <dd className="tabular-nums text-foreground">{formatPct(point.x)}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt>{t('compare.metrics.cagr.label')}</dt>
                        <dd className="tabular-nums text-foreground">{formatPct(point.y)}</dd>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <dt>{t('compare.metrics.maxDrawdown.label')}</dt>
                        <dd className="tabular-nums text-foreground">{formatPct(-point.z)}</dd>
                      </div>
                    </dl>
                  </div>
                )
              }}
            />
            {/* One Scatter per instrument rather than a shared series with
                per-point Cells — each point needs its own colour and, for the
                benchmark, its own marker shape, and Scatter is what lets a
                single point carry both. */}
            {points.map((point) => (
              <Scatter
                key={point.symbol}
                {...motion}
                data={[point]}
                fill={point.color}
                shape={point.isBenchmark ? 'diamond' : 'circle'}
                stroke={point.isBenchmark ? 'var(--foreground)' : 'none'}
                strokeWidth={point.isBenchmark ? 1.5 : 0}
              />
            ))}
          </ScatterChart>
        </ChartContainer>
      )}
    </Tile>
  )
}
