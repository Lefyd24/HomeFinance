import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceDot,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatCurrency, formatDate } from '../../lib/format'
import { seriesColor, useChartMotion } from '../chartConfig'
import { Tile, TileEmpty } from './Tile'
import {
  POSITION_HISTORY_RANGES,
  type PositionHistoryPoint,
  type PositionHistoryRange,
} from '../investmentsApi'

const MARKET_COLOR = seriesColor(0)
const COST_COLOR = 'var(--muted-foreground)'
const GAIN_COLOR = 'var(--flow-in)'
const LOSS_COLOR = 'var(--flow-out)'

/** Unique per instance so two charts on a page can't share a <defs> id. */
const GRADIENT_ID = 'position-pnl-band'

/**
 * Which pair of lines the chart is drawing.
 *
 * Both views compare the same two things — what the market says versus what
 * you paid — and the only difference is whether that is stated per unit or in
 * total. They are never mixed on one chart: a price and a position value differ
 * by a factor of the quantity held, so plotting a 3-unit holding's €54 value
 * against its €18 price flattens one of them and makes any shading between
 * them meaningless.
 */
type ViewMode = 'price' | 'value'

interface ChartPoint {
  date: string
  /** The two comparable series for the active view, and the band between them. */
  market: number | null
  cost: number | null
  band: [number, number] | null
  quantity: number
  /** Kept for the tooltip, which reports both scales whichever view is active. */
  price: number | null
  value: number | null
  invested: number | null
}

function toChartPoints(series: PositionHistoryPoint[], view: ViewMode): ChartPoint[] {
  return series.map((point) => {
    // Average cost per unit — the break-even price. The per-unit twin of the
    // invested-capital line: with one buy it is flat, with several it steps,
    // exactly as the money version does.
    const avgCost =
      point.invested != null && point.quantity > 0 ? point.invested / point.quantity : null
    const market = view === 'price' ? point.price : point.value
    const cost = view === 'price' ? avgCost : point.invested
    return {
      date: point.date,
      market,
      cost,
      band: market != null && cost != null ? [cost, market] : null,
      quantity: point.quantity,
      price: point.price,
      value: point.value,
      invested: point.invested,
    }
  })
}

/**
 * Colour stops that switch the band from green to red wherever the market line
 * crosses the cost line.
 *
 * A single `Area` can only take one fill, so the fill is a gradient laid along
 * the x-axis with hard transitions at each crossing. That keeps the shading
 * continuous — two separate profit/loss Areas would each go null on the other's
 * days and leave a gap at every crossover, exactly where the eye is looking.
 */
function pnlGradientStops(points: ChartPoint[]) {
  const stops: { offset: number; color: string }[] = []
  const last = points.length - 1
  if (last <= 0) return stops

  let current: boolean | null = null
  points.forEach((point, index) => {
    if (point.market == null || point.cost == null) return
    const ahead = point.market >= point.cost
    if (ahead === current) return
    const offset = (index / last) * 100
    if (current != null) {
      // Two stops at the same offset make the switch a hard edge at the
      // crossing rather than a wash blending the two colours together.
      stops.push({ offset, color: current ? GAIN_COLOR : LOSS_COLOR })
    }
    stops.push({ offset, color: ahead ? GAIN_COLOR : LOSS_COLOR })
    current = ahead
  })

  if (stops.length > 0) {
    stops.push({ offset: 100, color: current ? GAIN_COLOR : LOSS_COLOR })
  }
  return stops
}

/**
 * A real holding's journey, in the scenario sandbox's visual language.
 *
 * Two things the sandbox chart doesn't have to deal with, because a scenario
 * begins the day it is created and a real position does not:
 *
 * - **The window can start before the position did.** Every range except
 *   "since entry" is a plain lookback from today, and "since entry" still
 *   backs up a month, because you cannot judge an entry against a chart that
 *   begins at the entry. In the per-unit view that stretch is simply the
 *   instrument's price with no cost line yet to compare it against.
 * - **The gap between the two lines is shaded**, green while the market is
 *   ahead of what was paid and red while it is behind, so profit and loss are
 *   readable without doing arithmetic between two lines.
 */
export function PositionJourneyChart({
  series,
  currency,
  openedOn,
  buyDates,
  range,
  onRangeChange,
  loading = false,
}: {
  series: PositionHistoryPoint[]
  currency: string
  /** The first buy — marked on the line rather than left to be inferred. */
  openedOn: string | null
  /** Every subsequent purchase, dotted, when there are few enough to read. */
  buyDates: string[]
  range: PositionHistoryRange
  onRangeChange: (range: PositionHistoryRange) => void
  loading?: boolean
}) {
  const { t } = useTranslation('investments')
  const motion = useChartMotion()
  // Per unit by default: it is the only view whose lines mean anything before
  // the position existed, and the pre-entry stretch is half the point of
  // letting the window start early.
  const [view, setView] = useState<ViewMode>('price')

  const data = useMemo(() => toChartPoints(series, view), [series, view])
  const stops = useMemo(() => pnlGradientStops(data), [data])
  const hasData = !loading && data.length > 1
  const hasPosition = data.some((point) => point.cost != null)

  const marketLabel =
    view === 'price' ? t('holding.history.marketPriceLine') : t('holding.history.legendValue')
  const costLabel =
    view === 'price' ? t('holding.history.avgCostLine') : t('holding.history.investedLine')

  const config = {
    market: { label: marketLabel, color: MARKET_COLOR },
    cost: { label: costLabel, color: COST_COLOR },
  } satisfies ChartConfig

  const openingPoint = openedOn ? data.find((point) => point.date === openedOn) : null
  // The opening is already marked; later buys are what move the cost line after it.
  const laterBuys = buyDates.filter((date) => date !== openedOn)
  const showBuyDots = laterBuys.length > 0 && laterBuys.length <= 24

  const money = (value: number) => formatCurrency(value, currency)

  return (
    <Tile
      title={t('holding.history.chartTitle')}
      allowOverflow
      action={
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(next) => next && setView(next as ViewMode)}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label={t('holding.history.viewLabel')}
          >
            <ToggleGroupItem value="price" className="px-2 text-xs">
              {t('holding.history.viewPrice')}
            </ToggleGroupItem>
            <ToggleGroupItem value="value" className="px-2 text-xs">
              {t('holding.history.viewValue')}
            </ToggleGroupItem>
          </ToggleGroup>
          <ToggleGroup
            type="single"
            value={range}
            onValueChange={(next) => next && onRangeChange(next as PositionHistoryRange)}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label={t('holding.history.rangeLabel')}
          >
            {POSITION_HISTORY_RANGES.map((key) => (
              <ToggleGroupItem key={key} value={key} className="px-2 text-xs">
                {t(`holding.history.range.${key}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      }
      footer={
        hasPosition ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.65rem] text-muted-foreground">
            <LegendSwatch color={MARKET_COLOR} label={marketLabel} />
            <LegendSwatch color={COST_COLOR} label={costLabel} />
            <LegendSwatch color={GAIN_COLOR} label={t('holding.history.legendAhead')} filled />
            <LegendSwatch color={LOSS_COLOR} label={t('holding.history.legendBehind')} filled />
          </div>
        ) : undefined
      }
    >
      {loading ? (
        <Skeleton className="h-72 w-full rounded-lg" />
      ) : !hasData ? (
        <TileEmpty>{t('holding.history.noSeries')}</TileEmpty>
      ) : (
        <ChartContainer config={config} className="aspect-auto h-60 w-full sm:h-80">
          <ComposedChart data={data} margin={{ left: 4, right: 4, top: 12, bottom: 0 }}>
            <defs>
              <linearGradient id={GRADIENT_ID} x1="0" y1="0" x2="1" y2="0">
                {stops.map((stop, index) => (
                  <stop
                    key={`${stop.offset}-${index}`}
                    offset={`${stop.offset}%`}
                    stopColor={stop.color}
                    stopOpacity={0.22}
                  />
                ))}
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={40}
              tickFormatter={(value: string) => formatDate(value, { day: 'numeric', month: 'short' })}
            />
            {/* One axis, because both series are now the same kind of number. */}
            <YAxis
              tickLine={false}
              axisLine={false}
              width={62}
              tickMargin={4}
              domain={['auto', 'auto']}
              tickFormatter={money}
            />
            <ChartTooltip
              wrapperStyle={{ zIndex: 30 }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null
                const point = payload[0]?.payload as ChartPoint | undefined
                if (!point) return null

                // The shaded band is the only thing on this chart with no axis
                // label of its own. Its two edges are the two rows already
                // printed above, so restating them here would be the same
                // numbers twice — what the band adds is its sign and its
                // height, which is all this block says.
                const band =
                  point.market != null && point.cost != null
                    ? {
                        ahead: point.market >= point.cost,
                        gap: point.market - point.cost,
                        pct: point.cost ? ((point.market - point.cost) / point.cost) * 100 : null,
                      }
                    : null

                return (
                  <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                    <div className="mb-1 font-medium text-muted-foreground">
                      {formatDate(String(label))}
                    </div>
                    <div className="flex flex-col gap-1">
                      {point.market != null && (
                        <TooltipRow color={MARKET_COLOR} label={marketLabel} value={money(point.market)} />
                      )}
                      {point.cost != null && (
                        <TooltipRow color={COST_COLOR} label={costLabel} value={money(point.cost)} />
                      )}
                      {/* The other scale, once, as context rather than as a
                          second line fighting for the same axis. */}
                      {view === 'price' && point.value != null && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span className="min-w-0 flex-1 truncate">
                            {t('holding.history.unitsHeld', { count: point.quantity })}
                          </span>
                          <span className="shrink-0 tabular-nums">{money(point.value)}</span>
                        </div>
                      )}
                      {view === 'value' && point.price != null && (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <span className="min-w-0 flex-1 truncate">
                            {t('holding.history.marketPriceLine')}
                          </span>
                          <span className="shrink-0 tabular-nums">{money(point.price)}</span>
                        </div>
                      )}

                      {band && (
                        <div className="mt-0.5 flex flex-col gap-1 border-t border-border/60 pt-1.5">
                          <div className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="size-2 shrink-0 rounded-[3px]"
                              style={{
                                backgroundColor: band.ahead ? GAIN_COLOR : LOSS_COLOR,
                                opacity: 0.45,
                              }}
                            />
                            <span
                              className="min-w-0 flex-1 truncate font-medium"
                              style={{ color: band.ahead ? GAIN_COLOR : LOSS_COLOR }}
                            >
                              {t(
                                band.ahead
                                  ? 'holding.history.legendAhead'
                                  : 'holding.history.legendBehind',
                              )}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 ps-4">
                            <span className="min-w-0 flex-1 truncate">
                              {t('holding.history.bandHeight')}
                            </span>
                            <span
                              className="shrink-0 tabular-nums font-semibold"
                              style={{ color: band.ahead ? GAIN_COLOR : LOSS_COLOR }}
                            >
                              {money(band.gap)}
                              {band.pct != null &&
                                ` (${band.pct >= 0 ? '+' : ''}${band.pct.toFixed(2)}%)`}
                            </span>
                          </div>
                        </div>
                      )}

                      {/* Said explicitly rather than left as a half-empty
                          tooltip: on these days the window is showing the
                          instrument, not a holding. */}
                      {point.cost == null && (
                        <div className="text-muted-foreground">
                          {t('holding.history.notHeldYet')}
                        </div>
                      )}
                    </div>
                  </div>
                )
              }}
            />
            <Area
              dataKey="band"
              type="monotone"
              stroke="none"
              fill={`url(#${GRADIENT_ID})`}
              isAnimationActive={false}
              connectNulls={false}
              activeDot={false}
            />
            <Line
              {...motion}
              dataKey="cost"
              type="stepAfter"
              stroke={COST_COLOR}
              strokeWidth={1}
              strokeDasharray="4 3"
              strokeOpacity={0.8}
              dot={false}
              connectNulls={false}
            />
            <Line
              {...motion}
              dataKey="market"
              type="monotone"
              stroke={MARKET_COLOR}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
            />
            {/* The entry, as a full-height rule as well as a dot: with the
                window now reaching back before the purchase, "where does the
                position start" is the first thing to find on the chart. */}
            {openingPoint && (
              <ReferenceLine
                x={openingPoint.date}
                stroke={MARKET_COLOR}
                strokeDasharray="3 3"
                strokeOpacity={0.5}
                label={{
                  value: t('holding.history.openedMarker'),
                  position: 'insideTopLeft',
                  fill: 'var(--muted-foreground)',
                  fontSize: 11,
                }}
              />
            )}
            {showBuyDots &&
              laterBuys.map((date) => {
                const point = data.find((p) => p.date === date)
                if (!point || point.market == null) return null
                return (
                  <ReferenceDot
                    key={date}
                    x={date}
                    y={point.market}
                    r={2.5}
                    fill={MARKET_COLOR}
                    stroke="var(--background)"
                    strokeWidth={1}
                  />
                )
              })}
          </ComposedChart>
        </ChartContainer>
      )}
    </Tile>
  )
}

function TooltipRow({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden="true"
        className="size-2 shrink-0 rounded-[3px]"
        style={{ backgroundColor: color }}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="shrink-0 tabular-nums font-medium">{value}</span>
    </div>
  )
}

function LegendSwatch({
  color,
  label,
  filled = false,
}: {
  color: string
  label: string
  filled?: boolean
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={filled ? 'h-2.5 w-2.5 rounded-[3px]' : 'h-0 w-3.5 border-t-2'}
        style={filled ? { backgroundColor: color, opacity: 0.35 } : { borderColor: color }}
      />
      {label}
    </span>
  )
}
