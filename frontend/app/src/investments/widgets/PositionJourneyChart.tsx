import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import ReactECharts from 'echarts-for-react'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { cn } from '@/lib/utils'
import { formatCurrency, formatDate } from '../../lib/format'
import {
  baseAxisStyle,
  compactNumber,
  tooltipStyle,
  useChartTheme,
  type ChartTheme,
} from '../../reports/chartTheme'
import { useMediaQuery } from '../../ui/useMediaQuery'
import {
  drawdownSeries,
  hasCandleData,
  journeyStats,
  movingAverage,
  toJourneyPoints,
  type JourneyPoint,
  type JourneyView,
} from '../positionSeries'
import { Tile, TileEmpty } from './Tile'
import {
  POSITION_HISTORY_RANGES,
  type PositionHistoryPoint,
  type PositionHistoryRange,
} from '../investmentsApi'

/** Line, candles, or the position's total value. Candles need real bars, so they can be absent. */
type PriceMode = 'line' | 'candle' | 'value'

/** What the panel under the price answers. */
type LowerPanel = 'pnl' | 'drawdown'

/**
 * One holding, read the way a trader reads a chart.
 *
 * The previous version drew a line and shaded the gap to what you paid, which
 * answers one question ("am I up?") that the four figures above it already
 * answer. This one is built for the questions a chart is actually the only
 * place to answer:
 *
 * - **What did the day look like, not just where did it close** — candles when
 *   the source carried a real high/low, a line when it didn't. Never candles
 *   invented from a close.
 * - **What was the trend** — optional 20/50-day moving averages, off by default
 *   so the chart stays quiet until asked.
 * - **What would holding it have felt like** — a second panel under the price
 *   showing either profit and loss against what was paid, or the underwater
 *   curve: how far below its own running peak the instrument has been. A
 *   position that ends the window up 4% and spent two months 30% down is not
 *   the same investment as one that walked there in a straight line, and the
 *   price line alone cannot tell them apart.
 * - **Where the decisions were** — the opening marked with a rule, every later
 *   buy with a marker on the price it was bought at.
 *
 * It is ECharts rather than recharts, which the rest of the investments feature
 * uses (see `chartConfig.ts`), for two things recharts has no answer to and
 * this chart cannot do without: candlesticks, and pinch-and-drag zoom into a
 * window — the difference between a chart you can only look at on a phone and
 * one you can actually use.
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
  /** Every subsequent purchase, marked, when there are few enough to read. */
  buyDates: string[]
  range: PositionHistoryRange
  onRangeChange: (range: PositionHistoryRange) => void
  loading?: boolean
}) {
  const { t } = useTranslation('investments')
  const theme = useChartTheme()
  const compact = !useMediaQuery('(min-width: 640px)')

  const [mode, setMode] = useState<PriceMode>('line')
  const [lower, setLower] = useState<LowerPanel>('pnl')
  const [showMa, setShowMa] = useState(false)

  // Which pair of numbers is being compared. Candles and the line are both
  // per-unit views; only "total" restates everything in position value.
  const view: JourneyView = mode === 'value' ? 'value' : 'price'
  const points = useMemo(() => toJourneyPoints(series, view), [series, view])
  const stats = useMemo(() => journeyStats(points), [points])
  const candlesAvailable = useMemo(() => hasCandleData(points), [points])
  // The source can lose its bars between ranges (the broker fallback carries
  // closes only), and being left on an empty candle chart is worse than being
  // moved back to the line that still works.
  const effectiveMode: PriceMode = mode === 'candle' && !candlesAvailable ? 'line' : mode

  const hasData = !loading && points.length > 1
  const hasPosition = points.some((point) => point.cost != null)

  const marketLabel =
    view === 'price' ? t('holding.history.marketPriceLine') : t('holding.history.legendValue')
  const costLabel =
    view === 'price' ? t('holding.history.avgCostLine') : t('holding.history.investedLine')

  const option = useMemo(
    () =>
      hasData
        ? buildOption({
            points,
            theme,
            compact,
            mode: effectiveMode,
            lower,
            showMa,
            openedOn,
            buyDates,
            currency,
            labels: {
              market: marketLabel,
              cost: costLabel,
              pnl: t('holding.history.panelPnl'),
              drawdown: t('holding.history.panelDrawdown'),
              opened: t('holding.history.openedMarker'),
              bought: t('holding.history.boughtMarker'),
              held: t('holding.history.unitsHeldShort'),
              notHeld: t('holding.history.notHeldYet'),
            },
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [points, theme, compact, effectiveMode, lower, showMa, openedOn, buyDates, currency, marketLabel, costLabel, t],
  )

  const height = compact ? 340 : 460

  return (
    <Tile
      title={t('holding.history.chartTitle')}
      allowOverflow
      footer={
        hasData ? (
          <StatStrip
            stats={stats}
            hasPosition={hasPosition}
            marketLabel={marketLabel}
            costLabel={costLabel}
            mode={effectiveMode}
            theme={theme}
          />
        ) : undefined
      }
    >
      {/* Controls live in the body rather than the tile header: on a phone a
          header row of toggle groups either overflows or crushes the title,
          and these are three separate decisions that need to wrap
          independently. The range group scrolls sideways rather than
          wrapping — it is one axis of choice and reads as one strip. */}
      <div className="mb-2 flex flex-col gap-1.5">
        <div className="-mx-1 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ToggleGroup
            type="single"
            value={range}
            onValueChange={(next) => next && onRangeChange(next as PositionHistoryRange)}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label={t('holding.history.rangeLabel')}
            className="w-max"
          >
            {POSITION_HISTORY_RANGES.map((key) => (
              <ToggleGroupItem key={key} value={key} className="px-2.5 text-xs">
                {t(`holding.history.range.${key}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <ToggleGroup
            type="single"
            value={effectiveMode}
            onValueChange={(next) => next && setMode(next as PriceMode)}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label={t('holding.history.viewLabel')}
          >
            <ToggleGroupItem value="line" className="px-2 text-xs">
              {t('holding.history.viewPrice')}
            </ToggleGroupItem>
            {candlesAvailable && (
              <ToggleGroupItem value="candle" className="px-2 text-xs">
                {t('holding.history.viewCandles')}
              </ToggleGroupItem>
            )}
            <ToggleGroupItem value="value" className="px-2 text-xs">
              {t('holding.history.viewValue')}
            </ToggleGroupItem>
          </ToggleGroup>

          <ToggleGroup
            type="single"
            value={lower}
            onValueChange={(next) => next && setLower(next as LowerPanel)}
            variant="outline"
            size="sm"
            spacing={0}
            aria-label={t('holding.history.panelLabel')}
          >
            <ToggleGroupItem value="pnl" className="px-2 text-xs">
              {t('holding.history.panelPnl')}
            </ToggleGroupItem>
            <ToggleGroupItem value="drawdown" className="px-2 text-xs">
              {t('holding.history.panelDrawdown')}
            </ToggleGroupItem>
          </ToggleGroup>

          <button
            type="button"
            onClick={() => setShowMa((on) => !on)}
            aria-pressed={showMa}
            className={cn(
              'h-7 rounded-md border px-2 text-xs font-medium transition-colors',
              showMa
                ? 'border-primary/40 bg-primary/10 text-primary'
                : 'border-border bg-transparent text-muted-foreground hover:bg-muted/60',
            )}
          >
            {t('holding.history.overlayMa')}
          </button>
        </div>
      </div>

      {loading ? (
        <Skeleton className="w-full rounded-lg" style={{ height }} />
      ) : !hasData || !option ? (
        <TileEmpty>{t('holding.history.noSeries')}</TileEmpty>
      ) : (
        <>
          <ReactECharts
            option={option}
            notMerge
            opts={{ renderer: 'svg' }}
            style={{ height, width: '100%' }}
          />
          <p className="mt-1 text-center text-[0.65rem] text-muted-foreground sm:text-start">
            {t('holding.history.zoomHint')}
          </p>
        </>
      )}
    </Tile>
  )
}

/** The window's character, under the chart it was measured from. */
function StatStrip({
  stats,
  hasPosition,
  marketLabel,
  costLabel,
  mode,
  theme,
}: {
  stats: ReturnType<typeof journeyStats>
  hasPosition: boolean
  marketLabel: string
  costLabel: string
  mode: PriceMode
  theme: ChartTheme
}) {
  const { t } = useTranslation('investments')
  const pct = (value: number | null, sign = true) =>
    value == null ? '—' : `${sign && value > 0 ? '+' : ''}${value.toFixed(2)}%`

  return (
    <div className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 sm:grid-cols-5">
        <Figure
          label={t('holding.history.stats.periodReturn')}
          value={pct(stats.periodReturnPct)}
          tone={stats.periodReturnPct}
          theme={theme}
        />
        <Figure
          label={t('holding.history.stats.maxDrawdown')}
          value={pct(stats.maxDrawdownPct, false)}
          tone={stats.maxDrawdownPct != null ? -1 : null}
          theme={theme}
        />
        <Figure
          label={t('holding.history.stats.volatility')}
          value={stats.volatilityPct == null ? '—' : `${stats.volatilityPct.toFixed(1)}%`}
        />
        <Figure
          label={t('holding.history.stats.bestDay')}
          value={pct(stats.best?.pct ?? null)}
          hint={stats.best ? formatDate(stats.best.date) : undefined}
          tone={stats.best?.pct ?? null}
          theme={theme}
        />
        <Figure
          label={t('holding.history.stats.worstDay')}
          value={pct(stats.worst?.pct ?? null)}
          hint={stats.worst ? formatDate(stats.worst.date) : undefined}
          tone={stats.worst?.pct ?? null}
          theme={theme}
        />
      </dl>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-1.5 text-[0.65rem] text-muted-foreground">
        <LegendSwatch color={theme.neutral} label={marketLabel} />
        {hasPosition && <LegendSwatch color={theme.muted} label={costLabel} dashed />}
        {mode === 'candle' && (
          <>
            <LegendSwatch color={theme.positive} label={t('holding.history.candleUp')} filled />
            <LegendSwatch color={theme.negative} label={t('holding.history.candleDown')} filled />
          </>
        )}
        {stats.totalDays > 0 && (
          <span>
            {t('holding.history.stats.upDays', { up: stats.upDays, total: stats.totalDays })}
          </span>
        )}
      </div>
    </div>
  )
}

function Figure({
  label,
  value,
  hint,
  tone,
  theme,
}: {
  label: string
  value: string
  hint?: string
  tone?: number | null
  theme?: ChartTheme
}) {
  const color =
    tone == null || theme == null || tone === 0
      ? undefined
      : tone > 0
        ? theme.positive
        : theme.negative
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="truncate text-[0.6rem] uppercase tracking-[0.12em] text-muted-foreground">
        {label}
      </dt>
      <dd className="truncate text-xs font-semibold tabular-nums" style={{ color }}>
        {value}
        {hint && <span className="ms-1 font-normal text-muted-foreground">{hint}</span>}
      </dd>
    </div>
  )
}

function LegendSwatch({
  color,
  label,
  filled = false,
  dashed = false,
}: {
  color: string
  label: string
  filled?: boolean
  dashed?: boolean
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={filled ? 'h-2.5 w-2.5 rounded-[3px]' : 'h-0 w-3.5 border-t-2'}
        style={
          filled
            ? { backgroundColor: color, opacity: 0.75 }
            : { borderColor: color, borderStyle: dashed ? 'dashed' : 'solid' }
        }
      />
      {label}
    </span>
  )
}

/**
 * An axis formatter scaled to what the axis actually holds.
 *
 * `compactNumber` rounds to whole units, which is right for a portfolio in the
 * tens of thousands and useless for an €18 share price — five ticks all
 * reading "18". So the number of decimals comes from the range being labelled:
 * thousands get the compact treatment, ordinary prices get two decimals, and a
 * sub-unit instrument (most crypto, penny stocks) gets four.
 */
function axisFormatter(values: (number | null)[]): (value: number) => string {
  const finite = values.filter((value): value is number => value != null && Number.isFinite(value))
  const span = finite.length
    ? Math.max(...finite.map(Math.abs))
    : 0
  if (span >= 1000) return compactNumber
  const decimals = span >= 10 ? 2 : span >= 1 ? 3 : 4
  return (value: number) => value.toFixed(decimals)
}

interface OptionInput {
  points: JourneyPoint[]
  theme: ChartTheme
  compact: boolean
  mode: PriceMode
  lower: LowerPanel
  showMa: boolean
  openedOn: string | null
  buyDates: string[]
  currency: string
  labels: Record<string, string>
}

/**
 * The ECharts option, assembled in one place so the component above stays
 * about state and the layout maths stays readable.
 *
 * Two stacked grids sharing one x-axis and one axis pointer, so a date read on
 * the price panel is the same date on the panel below it — a second chart with
 * its own tooltip would make the reader do that alignment by eye.
 */
function buildOption({
  points,
  theme,
  compact,
  mode,
  lower,
  showMa,
  openedOn,
  buyDates,
  currency,
  labels,
}: OptionInput) {
  const dates = points.map((point) => point.date)
  const market = points.map((point) => point.market)
  const cost = points.map((point) => point.cost)
  const money = (value: number) => formatCurrency(value, currency)

  // Candles need [open, close, low, high]; a day with no bar is '-' rather
  // than a fabricated flat candle at the carried-forward close.
  const candles = points.map((point) =>
    point.open != null && point.high != null && point.low != null && point.price != null
      ? [point.open, point.price, point.low, point.high]
      : ['-', '-', '-', '-'],
  )

  const lowerValues =
    lower === 'pnl'
      ? points.map((point) => point.pnl)
      : drawdownSeries(points.map((point) => point.price))

  const sliderHeight = 18
  const lowerHeight = compact ? 52 : 74
  const axisRoom = 24

  const grids = [
    {
      left: 4,
      right: compact ? 8 : 14,
      top: 14,
      bottom: lowerHeight + axisRoom + sliderHeight + 18,
      containLabel: true,
    },
    {
      left: 4,
      right: compact ? 8 : 14,
      height: lowerHeight,
      bottom: sliderHeight + 18,
      containLabel: true,
    },
  ]

  /*
   * Hover reads the chart; it does not restyle it.
   *
   * ECharts' default is to emphasise whatever is under the pointer and blur
   * everything else, which on an axis-triggered tooltip means the cost line
   * and the shaded area fade out at the exact moment you are trying to read
   * them against the price, and the bars below twitch as their emphasis
   * geometry is recomputed on every mouse move. Nothing on this chart is
   * selectable, so the whole mechanism is switched off — at the series, and
   * again at the axis pointer that drives it.
   */
  const noEmphasis = { emphasis: { disabled: true }, silent: false }

  const priceSeries =
    mode === 'candle'
      ? {
          ...noEmphasis,
          name: labels.market,
          type: 'candlestick' as const,
          data: candles,
          itemStyle: {
            color: theme.positive,
            color0: theme.negative,
            borderColor: theme.positive,
            borderColor0: theme.negative,
          },
        }
      : {
          ...noEmphasis,
          name: labels.market,
          type: 'line' as const,
          data: market,
          smooth: false,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { width: 2, color: theme.neutral },
          itemStyle: { color: theme.neutral },
          areaStyle: {
            opacity: 0.12,
            color: theme.neutral,
          },
        }

  const openingIndex = openedOn ? dates.indexOf(openedOn) : -1
  const laterBuys = buyDates.filter((date) => date !== openedOn && dates.includes(date))
  // Beyond a couple of dozen markers the price line disappears under them, and
  // a chart of markers answers nothing.
  const buyMarkers =
    laterBuys.length > 0 && laterBuys.length <= 24
      ? laterBuys
          .map((date) => {
            const point = points[dates.indexOf(date)]
            const value = mode === 'value' ? point?.market : point?.price
            return point && value != null ? { xAxis: date, yAxis: value, name: labels.bought } : null
          })
          .filter((marker): marker is { xAxis: string; yAxis: number; name: string } => marker != null)
      : []

  const overlays = showMa
    ? [
        { window: 20, color: theme.categorical[3], width: 1 },
        { window: 50, color: theme.categorical[6], width: 1.5 },
      ].map(({ window, color, width }) => ({
        ...noEmphasis,
        name: `MA${window}`,
        type: 'line' as const,
        data: movingAverage(mode === 'candle' ? points.map((p) => p.price) : market, window),
        showSymbol: false,
        connectNulls: true,
        lineStyle: { width, color, opacity: 0.9 },
        itemStyle: { color },
        tooltip: { show: false },
      }))
    : []

  const costSeries = {
    ...noEmphasis,
    name: labels.cost,
    type: 'line' as const,
    data: cost,
    // The cost line only moves when money moves, so it steps at the buy rather
    // than sloping between two purchases as if it had drifted there.
    step: 'end' as const,
    showSymbol: false,
    connectNulls: false,
    lineStyle: { width: 1.25, type: 'dashed' as const, color: theme.muted },
    itemStyle: { color: theme.muted },
    markLine:
      openingIndex >= 0
        ? {
            silent: true,
            symbol: 'none' as const,
            label: {
              formatter: labels.opened,
              color: theme.muted,
              fontSize: 10,
              position: 'insideEndTop' as const,
            },
            lineStyle: { color: theme.muted, type: 'dashed' as const, opacity: 0.7 },
            data: [{ xAxis: dates[openingIndex] }],
          }
        : undefined,
    markPoint: buyMarkers.length
      ? {
          symbol: 'triangle' as const,
          symbolSize: 9,
          symbolOffset: [0, '65%'] as [number, string],
          itemStyle: { color: theme.categorical[0] },
          label: { show: false },
          data: buyMarkers,
        }
      : undefined,
  }

  /**
   * Bars rather than a line, so each day carries its own colour.
   *
   * A single line coloured by sign needs a `visualMap`, which ECharts resolves
   * against the coordinate system and throws on once a second grid is in play.
   * Bars sidestep it entirely: they hang from zero, which is exactly the shape
   * both of these quantities have — profit above the line, loss and drawdown
   * below it — and no day borrows its colour from a neighbour.
   */
  const lowerSeries = {
    ...noEmphasis,
    name: lower === 'pnl' ? labels.pnl : labels.drawdown,
    type: 'bar' as const,
    xAxisIndex: 1,
    yAxisIndex: 1,
    data: lowerValues.map((value) => ({
      value,
      itemStyle: {
        color: (value ?? 0) >= 0 ? theme.positive : theme.negative,
        opacity: 0.75,
      },
    })),
    barCategoryGap: '10%',
    tooltip: { show: false },
  }

  const series = [priceSeries, costSeries, ...overlays, lowerSeries]

  return {
    animation: false,
    grid: grids,
    // One pointer across both panels: the date under the crosshair on the
    // price is the date under it on the panel below, without the reader
    // aligning two charts by eye.
    axisPointer: {
      link: [{ xAxisIndex: 'all' }],
      label: { backgroundColor: theme.surface, color: theme.ink, fontSize: 11 },
      lineStyle: { color: theme.axis, type: 'dashed' as const },
    },
    tooltip: {
      trigger: 'axis' as const,
      // Without this the axis tooltip highlights the hovered series and blurs
      // the rest — the fade this chart must not have.
      axisPointer: {
        type: 'line' as const,
        triggerEmphasis: false,
        lineStyle: { color: theme.axis, type: 'dashed' as const },
      },
      ...tooltipStyle(theme),
      formatter: (params: unknown) => {
        const rows = Array.isArray(params) ? params : [params]
        const first = rows[0] as { dataIndex?: number } | undefined
        const index = first?.dataIndex
        if (index == null) return ''
        const point = points[index]
        if (!point) return ''
        return renderTooltip({ point, theme, money, labels, mode })
      },
    },
    xAxis: [
      {
        type: 'category' as const,
        data: dates,
        gridIndex: 0,
        boundaryGap: mode === 'candle',
        ...baseAxisStyle(theme),
        axisLabel: { show: false },
        splitLine: { show: false },
      },
      {
        type: 'category' as const,
        data: dates,
        gridIndex: 1,
        boundaryGap: mode === 'candle',
        ...baseAxisStyle(theme),
        axisLabel: {
          color: theme.muted,
          fontSize: 10,
          hideOverlap: true,
          formatter: (value: string) =>
            formatDate(value, compact ? { month: 'short' } : { day: 'numeric', month: 'short' }),
        },
        splitLine: { show: false },
      },
    ],
    yAxis: [
      {
        type: 'value' as const,
        gridIndex: 0,
        // Never zero-based: a price that has moved 3% would be a flat line at
        // the top of a chart that starts at zero.
        scale: true,
        ...baseAxisStyle(theme),
        axisLabel: {
          color: theme.muted,
          fontSize: 10,
          formatter: axisFormatter([...market, ...cost, ...points.map((p) => p.low)]),
        },
      },
      {
        type: 'value' as const,
        gridIndex: 1,
        // The underwater curve is a fall from a peak, so it lives at or below
        // zero and the axis says so rather than floating the peak mid-panel.
        max: lower === 'drawdown' ? 0 : undefined,
        ...baseAxisStyle(theme),
        splitNumber: 2,
        axisLabel: {
          color: theme.muted,
          fontSize: 10,
          formatter:
            lower === 'drawdown'
              ? (value: number) => `${Math.round(value)}%`
              : axisFormatter(lowerValues),
        },
      },
    ],
    dataZoom: [
      // Pinch and drag on a phone, wheel and drag on a desktop — the reason
      // this chart is ECharts at all.
      { type: 'inside' as const, xAxisIndex: [0, 1], start: 0, end: 100, zoomOnMouseWheel: true },
      {
        type: 'slider' as const,
        xAxisIndex: [0, 1],
        height: sliderHeight,
        bottom: 4,
        // Every colour here is a literal rgba rather than a theme token:
        // the tokens are resolved CSS values (`oklch(...)`), which an SVG
        // fill accepts but string-concatenated alpha does not, and the
        // slider's own defaults are near-black in both themes.
        borderColor: 'transparent',
        backgroundColor: theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)',
        fillerColor: theme.isDark ? 'rgba(255,255,255,0.10)' : 'rgba(15,23,42,0.07)',
        dataBackground: {
          lineStyle: { color: theme.muted, opacity: 0.5 },
          areaStyle: { color: theme.muted, opacity: 0.15 },
        },
        selectedDataBackground: {
          lineStyle: { color: theme.neutral, opacity: 0.8 },
          areaStyle: { color: theme.neutral, opacity: 0.2 },
        },
        handleStyle: { color: theme.surface, borderColor: theme.muted, borderWidth: 1 },
        moveHandleStyle: { color: theme.muted, opacity: 0.4 },
        moveHandleSize: 4,
        labelFormatter: (_: number, value: string) => formatDate(value, { month: 'short', year: '2-digit' }),
        textStyle: { color: theme.muted, fontSize: 9 },
      },
    ],
    series,
  }
}

/**
 * The tooltip, written by hand rather than from the series list: what matters
 * on a given day is the position (price, what it cost, the gap between them,
 * how much was held), not one row per drawn line.
 */
function renderTooltip({
  point,
  theme,
  money,
  labels,
  mode,
}: {
  point: JourneyPoint
  theme: ChartTheme
  money: (value: number) => string
  labels: Record<string, string>
  mode: PriceMode
}) {
  const row = (label: string, value: string, color?: string) =>
    `<div style="display:flex;gap:10px;justify-content:space-between;align-items:baseline">
       <span style="opacity:.75">${label}</span>
       <span style="font-variant-numeric:tabular-nums;font-weight:600${color ? `;color:${color}` : ''}">${value}</span>
     </div>`

  const lines = [
    `<div style="opacity:.65;margin-bottom:4px">${formatDate(point.date)}</div>`,
  ]

  if (mode === 'candle' && point.open != null && point.high != null && point.low != null) {
    lines.push(row('O', money(point.open)))
    lines.push(row('H', money(point.high)))
    lines.push(row('L', money(point.low)))
    lines.push(row('C', money(point.price as number), theme.ink))
  } else if (point.market != null) {
    lines.push(row(labels.market, money(point.market), theme.neutral))
  }

  if (point.cost != null) {
    lines.push(row(labels.cost, money(point.cost), theme.muted))
  }

  if (point.pnl != null) {
    const ahead = point.pnl >= 0
    const pct = point.pnlPct != null ? ` (${ahead ? '+' : ''}${point.pnlPct.toFixed(2)}%)` : ''
    lines.push(
      row(labels.pnl, `${ahead ? '+' : ''}${money(point.pnl)}${pct}`, ahead ? theme.positive : theme.negative),
    )
  } else {
    lines.push(`<div style="opacity:.65">${labels.notHeld}</div>`)
  }

  if (point.quantity > 0 && mode !== 'value' && point.value != null) {
    lines.push(row(`${labels.held} × ${point.quantity}`, money(point.value)))
  }

  return `<div style="min-width:9rem;display:flex;flex-direction:column;gap:2px">${lines.join('')}</div>`
}
