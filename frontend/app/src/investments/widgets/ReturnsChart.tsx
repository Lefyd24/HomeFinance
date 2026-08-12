import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { polarityColor, polarityGlow, useChartMotion } from '../chartConfig'
import { Tile, TileEmpty } from './Tile'
import type { InstrumentComparison } from '../comparisonApi'

function formatPct(value: number): string {
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`
}

/**
 * The single most direct answer a comparison can give: which one actually
 * made more money over the period, in plain percentage terms. The other
 * charts on this page frame return through a risk lens (Sortino-led headline
 * cards, the growth-of-100 line); this bar exists so that framing never
 * substitutes for the raw number an average person is actually asking for.
 */
export function ReturnsChart({
  instruments,
  loading,
}: {
  instruments: InstrumentComparison[]
  loading: boolean
}) {
  const { t } = useTranslation('investments')
  const motion = useChartMotion()

  const rows = useMemo(
    () =>
      instruments
        .filter((instrument) => instrument.performance.cumulative_return != null)
        .map((instrument) => ({
          symbol: instrument.symbol,
          name: instrument.name,
          isBenchmark: instrument.is_benchmark,
          value: instrument.performance.cumulative_return as number,
        })),
    [instruments],
  )

  const config = useMemo(
    () => ({ value: { label: t('compare.metrics.cumulativeReturn.label') } }) satisfies ChartConfig,
    [t],
  )

  const hasData = !loading && rows.length > 0
  // Recharts sizes a categorical axis by item count; without a floor a
  // 2-instrument comparison renders a cramped sliver of a chart.
  const chartHeight = Math.max(rows.length * 44, 120)

  return (
    <Tile title={t('compare.tiles.returns')}>
      <p className="mb-2 text-xs text-muted-foreground">{t('compare.tiles.returnsSubtitle')}</p>
      {loading ? (
        <Skeleton className="h-32 w-full rounded-lg" />
      ) : !hasData ? (
        <TileEmpty>{t('compare.empty.title')}</TileEmpty>
      ) : (
        <ChartContainer config={config} style={{ height: chartHeight }} className="aspect-auto w-full">
          <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 28, top: 4, bottom: 0 }}>
            <CartesianGrid horizontal={false} strokeDasharray="3 3" />
            <XAxis
              type="number"
              tickLine={false}
              axisLine={false}
              tickMargin={6}
              tickFormatter={(value: number) => formatPct(value)}
            />
            <YAxis
              type="category"
              dataKey="symbol"
              tickLine={false}
              axisLine={false}
              width={64}
              tick={{ fontSize: 12 }}
            />
            <ReferenceLine x={0} stroke="var(--border)" />
            <ChartTooltip
              wrapperStyle={{ zIndex: 30 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const row = payload[0].payload as (typeof rows)[number]
                return (
                  <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                    <div className="font-medium">{row.name ?? row.symbol}</div>
                    <div
                      className={cn(
                        'tabular-nums',
                        row.value >= 0 ? 'text-flow-in' : 'text-flow-out',
                      )}
                    >
                      {formatPct(row.value)}
                    </div>
                  </div>
                )
              }}
            />
            <Bar {...motion} dataKey="value" radius={4} maxBarSize={22}>
              {rows.map((row) => (
                <Cell
                  key={row.symbol}
                  fill={polarityColor(row.value)}
                  fillOpacity={row.isBenchmark ? 0.45 : 1}
                  style={row.isBenchmark ? undefined : { filter: polarityGlow(row.value) }}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </Tile>
  )
}
