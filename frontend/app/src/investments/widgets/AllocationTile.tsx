import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { Cell, Pie, PieChart } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { formatCurrency } from '../../lib/format'
import { seriesColor, useChartMotion } from '../chartConfig'
import { positionValue } from '../portfolioInsights'
import { Tile, TileEmpty } from './Tile'
import type { PortfolioPosition } from '../investmentsApi'

/** Beyond this many slices the ring is stripes, so the tail becomes one "Other". */
const MAX_SLICES = 5

interface Slice {
  key: string
  label: string
  value: number
  pct: number
  color: string
}

/**
 * What the money is actually spread across.
 *
 * A ring rather than a treemap: the question here is "what fraction", and a
 * ring answers that at a glance where rectangles ask you to compare areas.
 * The total sits in the hole, so the tile reads as one figure broken down
 * rather than a chart that needs a caption.
 */
export function AllocationTile({
  positions,
  currency,
  loading,
  className,
}: {
  positions: PortfolioPosition[]
  currency: string
  loading: boolean
  className?: string
}) {
  const { t } = useTranslation('investments')
  const motion = useChartMotion()

  const { slices, total } = useMemo(() => {
    const valued = positions
      .map((position) => ({ position, value: positionValue(position) }))
      .filter((entry) => entry.value > 0)
      .sort((a, b) => b.value - a.value)

    const sum = valued.reduce((acc, entry) => acc + entry.value, 0)
    if (sum <= 0) return { slices: [] as Slice[], total: 0 }

    const head = valued.slice(0, MAX_SLICES).map((entry, index) => ({
      key: `${entry.position.account_id}-${entry.position.symbol}`,
      label: entry.position.symbol,
      value: entry.value,
      pct: (entry.value / sum) * 100,
      color: seriesColor(index),
    }))

    const tail = valued.slice(MAX_SLICES)
    if (tail.length > 0) {
      const tailValue = tail.reduce((acc, entry) => acc + entry.value, 0)
      head.push({
        key: 'other',
        label: t('tiles.otherHoldings', { count: tail.length }),
        value: tailValue,
        pct: (tailValue / sum) * 100,
        color: seriesColor(MAX_SLICES),
      })
    }

    return { slices: head, total: sum }
  }, [positions, t])

  const config = useMemo(
    () =>
      Object.fromEntries(
        slices.map((slice) => [slice.key, { label: slice.label, color: slice.color }]),
      ) satisfies ChartConfig,
    [slices],
  )

  return (
    <Tile title={t('tiles.allocation')} className={className} allowOverflow>
      {loading ? (
        <Skeleton className="h-[13rem] w-full rounded-lg" />
      ) : slices.length === 0 ? (
        <TileEmpty>{t('detail.noPositions')}</TileEmpty>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="relative">
            <ChartContainer config={config} className="aspect-auto h-[8.5rem] w-full">
              <PieChart>
                <ChartTooltip
                  // Recharts positions the tooltip in an absolutely-placed
                  // wrapper with no z-index of its own, so it loses to any
                  // later sibling tile on the grid.
                  wrapperStyle={{ zIndex: 30 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const slice = payload[0].payload as Slice
                    return (
                      <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                        <div className="font-medium">{slice.label}</div>
                        <div className="tabular-nums text-muted-foreground">
                          {formatCurrency(slice.value, currency)} · {slice.pct.toFixed(1)}%
                        </div>
                      </div>
                    )
                  }}
                />
                <Pie
                  {...motion}
                  data={slices}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="62%"
                  outerRadius="92%"
                  paddingAngle={1.5}
                  strokeWidth={0}
                >
                  {slices.map((slice) => (
                    <Cell key={slice.key} fill={slice.color} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>

            {/* The figure the ring is a breakdown of. Non-interactive so it
                never intercepts a hover meant for a slice. */}
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t('tiles.invested')}
              </span>
              <span className="font-heading text-base font-semibold tabular-nums">
                {formatCurrency(total, currency)}
              </span>
            </div>
          </div>

          {/* The legend doubles as the numbers, so a slice never has to be
              hovered to find out what it is worth. */}
          <ul className="flex flex-col gap-1">
            {slices.map((slice) => (
              <li key={slice.key} className="flex items-center gap-2 text-xs">
                <span
                  aria-hidden="true"
                  className="size-2 shrink-0 rounded-[3px]"
                  style={{ backgroundColor: slice.color }}
                />
                <span className="min-w-0 flex-1 truncate">{slice.label}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">
                  {slice.pct.toFixed(1)}%
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Tile>
  )
}
