import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '../../lib/format'
import { useChartMotion } from '../chartConfig'
import { Tile, TileEmpty } from './Tile'
import type { SimulationResponse } from '../technicalApi'

function formatPrice(value: number, currency?: string): string {
  return currency ? formatCurrency(value, currency) : value.toFixed(2)
}

interface HistogramRow {
  binLow: number
  binHigh: number
  midpoint: number
  count: number
}

export function OutcomeHistogram({
  data,
  loading,
  currency,
}: {
  data: SimulationResponse | undefined
  loading: boolean
  currency?: string
}) {
  const { t } = useTranslation('investments')
  const motion = useChartMotion()

  const rows = useMemo<HistogramRow[]>(
    () =>
      (data?.terminal.histogram ?? []).map((bin) => ({
        binLow: bin.bin_low,
        binHigh: bin.bin_high,
        midpoint: (bin.bin_low + bin.bin_high) / 2,
        count: bin.count,
      })),
    [data],
  )

  const config = useMemo(() => ({ count: { label: t('technical.outcomeHistogram.title') } }) satisfies ChartConfig, [t])

  const hasData = !loading && Boolean(data) && rows.length > 0

  return (
    <Tile title={t('technical.outcomeHistogram.title')} allowOverflow>
      {loading ? (
        <Skeleton className="h-56 w-full rounded-lg" />
      ) : !hasData || !data ? (
        <TileEmpty>{t('technical.outcomeHistogram.title')}</TileEmpty>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-56 w-full">
          <BarChart data={rows} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="midpoint"
              type="number"
              domain={['dataMin', 'dataMax']}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={40}
              label={{
                value: t('technical.outcomeHistogram.xAxisLabel'),
                position: 'insideBottom',
                offset: -2,
                fontSize: 10,
                fill: 'var(--muted-foreground)',
              }}
              tickFormatter={(value: number) => formatPrice(value, currency)}
            />
            <YAxis tickLine={false} axisLine={false} width={36} tickMargin={4} allowDecimals={false} />
            <ChartTooltip
              wrapperStyle={{ zIndex: 30 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const row = payload[0]?.payload as HistogramRow | undefined
                if (!row) return null
                return (
                  <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                    <div className="font-medium">
                      {formatPrice(row.binLow, currency)} – {formatPrice(row.binHigh, currency)}
                    </div>
                    <div className="tabular-nums text-muted-foreground">{row.count}</div>
                  </div>
                )
              }}
            />
            <ReferenceLine
              x={data.terminal.p5}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.3}
              strokeDasharray="1 3"
              label={{ value: '5%', position: 'top', fontSize: 9, fill: 'var(--muted-foreground)' }}
            />
            <ReferenceLine x={data.terminal.p25} stroke="var(--muted-foreground)" strokeOpacity={0.3} strokeDasharray="1 3" />
            <ReferenceLine x={data.terminal.p75} stroke="var(--muted-foreground)" strokeOpacity={0.3} strokeDasharray="1 3" />
            <ReferenceLine
              x={data.terminal.p95}
              stroke="var(--muted-foreground)"
              strokeOpacity={0.3}
              strokeDasharray="1 3"
              label={{ value: '95%', position: 'top', fontSize: 9, fill: 'var(--muted-foreground)' }}
            />
            <ReferenceLine
              x={data.terminal.mean}
              stroke="var(--chart-2)"
              strokeDasharray="2 2"
              label={{ value: t('technical.outcomeHistogram.meanLabel'), position: 'top', fontSize: 10, fill: 'var(--chart-2)' }}
            />
            <ReferenceLine
              x={data.last_price}
              stroke="var(--foreground)"
              strokeDasharray="4 4"
              label={{ value: 'today', position: 'top', fontSize: 10, fill: 'var(--muted-foreground)' }}
            />
            <ReferenceLine
              x={data.terminal.p50}
              stroke="var(--muted-foreground)"
              strokeDasharray="2 2"
              label={{ value: 'median', position: 'top', fontSize: 10, fill: 'var(--muted-foreground)' }}
            />
            <Bar {...motion} dataKey="count" radius={2} maxBarSize={16}>
              {rows.map((row) => (
                <Cell
                  key={`${row.binLow}-${row.binHigh}`}
                  fill={row.midpoint >= data.terminal.p50 ? 'var(--flow-in)' : 'var(--flow-out)'}
                  fillOpacity={0.75}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </Tile>
  )
}
