import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { HelpCircleIcon } from '@hugeicons/core-free-icons'
import {
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { formatDate } from '../../lib/format'
import { polarityColor, seriesColor, useChartMotion } from '../chartConfig'
import { GLOSSARY, type GlossaryEntry } from '../metricGlossary'
import { Tile, TileEmpty } from './Tile'
import { adxStrengthLabel } from './SignalPanel'
import type { Signal, TechnicalResponse } from '../technicalApi'

type Kind = 'rsi' | 'macd' | 'obv'

type PaneChartRow = TechnicalResponse['panes'][number] & { close: number | null }

const TITLE_KEY: Record<Kind, string> = {
  rsi: 'technical.panes.rsi',
  macd: 'technical.panes.macd',
  obv: 'technical.panes.obv',
}

const GLOSSARY_ENTRY: Record<Kind, GlossaryEntry> = {
  rsi: GLOSSARY.rsi,
  macd: GLOSSARY.macd,
  obv: GLOSSARY.obv,
}

/** The number of trailing bars shaded when a divergence signal is active. */
const OBV_DIVERGENCE_WINDOW = 15
const PANE_HEIGHT = '7.5rem'

function hasAny(rows: TechnicalResponse['panes'], key: string): boolean {
  return rows.some((row) => typeof row[key] === 'number')
}

/** The most recent non-null value for `key`, scanning from the end since a
 * trailing bar can occasionally be null (e.g. an as-yet-unconfirmed pivot day). */
function lastValue(rows: PaneChartRow[], key: string): number | null {
  for (let i = rows.length - 1; i >= 0; i -= 1) {
    const value = rows[i][key as keyof PaneChartRow]
    if (typeof value === 'number') return value
  }
  return null
}

function formatCurrentValue(kind: Kind, value: number | null): string {
  if (value == null) return '—'
  if (kind === 'obv') return value.toLocaleString()
  return value.toFixed(kind === 'rsi' ? 1 : 2)
}

/** Header help affordance shared by every pane — the same tap-or-click Popover
 * pattern `MonteCarloFan`'s title already uses, so glossary access is consistent
 * everywhere on the page. */
function PaneTitle({ kind }: { kind: Kind }) {
  const { t } = useTranslation('investments')
  const entry = GLOSSARY_ENTRY[kind]
  return (
    <span className="inline-flex items-center gap-1.5">
      {t(TITLE_KEY[kind])}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={t(entry.labelKey)}
            className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <HugeiconsIcon icon={HelpCircleIcon} strokeWidth={2} className="size-3.5" />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(22rem,calc(100vw-2rem))]" collisionPadding={12}>
          <div className="flex flex-col gap-1.5 text-left">
            <p className="text-xs font-semibold text-foreground">{t(entry.shortKey)}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{t(entry.bodyKey)}</p>
          </div>
        </PopoverContent>
      </Popover>
    </span>
  )
}

/**
 * Generic ~120px monitoring pane, sharing `syncId="ta"` with `PriceChart` so
 * the crosshair reads as one instrument. One component rather than three so
 * the height/skeleton/empty scaffolding is written once — `kind` picks which
 * indicator draws inside it.
 *
 * Every pane surfaces its current value prominently and a one-line
 * plain-language caption underneath. For RSI the caption is the same
 * context-aware sentence (trending vs range-bound) the backend already
 * computed for the signal panel — passed in via `signal` so the two surfaces
 * never disagree — rather than a second, possibly-drifting heuristic here.
 */
export function IndicatorPane({
  kind,
  panes,
  price,
  loading,
  trending = false,
  divergenceActive = false,
  signal,
  regimeAdx,
  varianceP,
}: {
  kind: Kind
  panes: TechnicalResponse['panes']
  price?: TechnicalResponse['price']
  loading: boolean
  /** RSI only: `regime.adx >= 25` — the caller decides the threshold. */
  trending?: boolean
  /** OBV only: an `obv` signal is currently flagged bullish/bearish divergence. */
  divergenceActive?: boolean
  /** The matching entry from `TechnicalResponse.signals` (id === kind), whose
   * `detail_key` already carries the context-aware explanation for this pane. */
  signal?: Signal
  /** Interpolation values for `signal.detail_key` templates like `rsi.trending_overbought`. */
  regimeAdx?: number | null
  varianceP?: number | null
}) {
  const { t } = useTranslation('investments')
  const motion = useChartMotion()

  const closeByDate = useMemo(
    () => new Map((price ?? []).map((bar) => [bar.date, bar.close])),
    [price],
  )
  const data = useMemo<PaneChartRow[]>(
    () =>
      panes.map((row) => ({ ...row, close: closeByDate.get(row.date) ?? null }) as PaneChartRow),
    [panes, closeByDate],
  )

  const hasObv = hasAny(panes, 'obv')
  const hasData =
    !loading &&
    panes.length > 0 &&
    ((kind === 'rsi' && hasAny(panes, 'rsi')) ||
      (kind === 'macd' && (hasAny(panes, 'macd_hist') || hasAny(panes, 'macd_line'))) ||
      (kind === 'obv' && hasObv))

  const currentValue =
    kind === 'rsi' ? lastValue(data, 'rsi') : kind === 'macd' ? lastValue(data, 'macd_hist') : lastValue(data, 'obv')

  const caption = signal
    ? t(signal.detail_key, {
        rsi: signal.value?.toFixed(1) ?? '—',
        adx: (regimeAdx ?? signal.value ?? 0).toFixed(1),
        p: (varianceP ?? signal.value ?? 0).toFixed(3),
        state: adxStrengthLabel(regimeAdx ?? signal.value ?? 0),
      })
    : t(GLOSSARY_ENTRY[kind].shortKey)

  const config = useMemo(
    () =>
      ({
        rsi: { label: 'RSI', color: seriesColor(0) },
        macd_line: { label: 'MACD', color: seriesColor(0) },
        macd_signal: { label: 'Signal', color: seriesColor(1) },
        obv: { label: 'OBV', color: seriesColor(0) },
        close: { label: 'Close', color: 'var(--muted-foreground)' },
      }) satisfies ChartConfig,
    [],
  )

  const divergenceStart =
    divergenceActive && data.length > 0
      ? data[Math.max(0, data.length - OBV_DIVERGENCE_WINDOW)].date
      : null
  const divergenceEnd = divergenceActive && data.length > 0 ? data[data.length - 1].date : null

  return (
    <Tile
      title={<PaneTitle kind={kind} />}
      action={
        !loading && hasData ? (
          <span className="text-sm font-semibold tabular-nums text-foreground">
            {formatCurrentValue(kind, currentValue)}
          </span>
        ) : undefined
      }
      allowOverflow
      footer={!loading && hasData ? <p className="leading-relaxed">{caption}</p> : undefined}
    >
      {loading ? (
        <Skeleton style={{ height: PANE_HEIGHT }} className="w-full rounded-lg" />
      ) : kind === 'obv' && !hasObv ? (
        <TileEmpty>{t('technical.states.noVolume')}</TileEmpty>
      ) : !hasData ? (
        <TileEmpty>No data available for this period.</TileEmpty>
      ) : (
        // A fixed height must land on this content-bearing child, not on Tile's body
        // div: that div is `flex-1` (flex-basis 0%) inside Tile's `flex-col` section,
        // so in an auto-sized column it collapses to 0 unless a real child height
        // gives it a min-content floor — the same reason PriceChart's `h-72` on its
        // ChartContainer (not on the Tile body) is what makes that chart render.
        <div className="flex flex-col" style={{ height: PANE_HEIGHT }}>
          <ChartContainer config={config} className="aspect-auto h-full w-full flex-1">
            <ComposedChart
              data={data}
              margin={{ left: 4, right: 4, top: 4, bottom: 0 }}
              syncId="ta"
            >
              <CartesianGrid vertical={false} strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={4}
                minTickGap={40}
                tick={{ fontSize: 10 }}
                tickFormatter={(value: string) =>
                  formatDate(value, { day: 'numeric', month: 'short' })
                }
              />
              {kind === 'rsi' && (
                <>
                  <YAxis
                    yAxisId="rsi"
                    domain={[0, 100]}
                    tickLine={false}
                    axisLine={false}
                    width={28}
                    tickMargin={2}
                    tick={{ fontSize: 10 }}
                    ticks={[0, 30, 50, 70, 100]}
                  />
                  <ReferenceArea
                    yAxisId="rsi"
                    y1={70}
                    y2={100}
                    fill={seriesColor(0)}
                    fillOpacity={0.05}
                    stroke="none"
                  />
                  <ReferenceArea
                    yAxisId="rsi"
                    y1={0}
                    y2={30}
                    fill={seriesColor(0)}
                    fillOpacity={0.05}
                    stroke="none"
                  />
                  <ReferenceLine
                    yAxisId="rsi"
                    y={70}
                    stroke="var(--flow-out)"
                    strokeOpacity={trending ? 0.35 : 0.7}
                    strokeDasharray={trending ? '4 3' : undefined}
                  />
                  <ReferenceLine
                    yAxisId="rsi"
                    y={30}
                    stroke="var(--flow-in)"
                    strokeOpacity={trending ? 0.35 : 0.7}
                    strokeDasharray={trending ? '4 3' : undefined}
                  />
                  <ReferenceLine
                    yAxisId="rsi"
                    y={50}
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                  />
                  <ChartTooltip
                    wrapperStyle={{ zIndex: 30 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const value = payload.find((item) => item.dataKey === 'rsi')?.value
                      if (typeof value !== 'number') return null
                      return (
                        <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                          <div className="mb-1 font-medium text-muted-foreground">
                            {formatDate(String(label))}
                          </div>
                          <div className="tabular-nums font-medium">RSI {value.toFixed(1)}</div>
                        </div>
                      )
                    }}
                  />
                  <Line
                    {...motion}
                    yAxisId="rsi"
                    dataKey="rsi"
                    type="monotone"
                    stroke={seriesColor(0)}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                </>
              )}
              {kind === 'macd' && (
                <>
                  <YAxis
                    yAxisId="macd"
                    tickLine={false}
                    axisLine={false}
                    width={32}
                    tickMargin={2}
                    tick={{ fontSize: 10 }}
                    domain={['auto', 'auto']}
                  />
                  <ReferenceLine yAxisId="macd" y={0} stroke="var(--border)" />
                  <ChartTooltip
                    wrapperStyle={{ zIndex: 30 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const hist = payload.find((item) => item.dataKey === 'macd_hist')?.value
                      const line = payload.find((item) => item.dataKey === 'macd_line')?.value
                      const signalVal = payload.find((item) => item.dataKey === 'macd_signal')?.value
                      return (
                        <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                          <div className="mb-1 font-medium text-muted-foreground">
                            {formatDate(String(label))}
                          </div>
                          <div className="flex flex-col gap-0.5 tabular-nums">
                            {typeof line === 'number' && <div>MACD {line.toFixed(2)}</div>}
                            {typeof signalVal === 'number' && <div>Signal {signalVal.toFixed(2)}</div>}
                            {typeof hist === 'number' && <div>Hist {hist.toFixed(2)}</div>}
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Bar yAxisId="macd" {...motion} dataKey="macd_hist" maxBarSize={6}>
                    {data.map((row) => (
                      <Cell key={row.date} fill={polarityColor(row.macd_hist)} fillOpacity={0.6} />
                    ))}
                  </Bar>
                  <Line
                    {...motion}
                    yAxisId="macd"
                    dataKey="macd_line"
                    type="monotone"
                    stroke={seriesColor(0)}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    {...motion}
                    yAxisId="macd"
                    dataKey="macd_signal"
                    type="monotone"
                    stroke={seriesColor(1)}
                    strokeWidth={1.25}
                    strokeDasharray="3 3"
                    dot={false}
                    connectNulls
                  />
                </>
              )}
              {kind === 'obv' && (
                <>
                  <YAxis
                    yAxisId="obv"
                    tickLine={false}
                    axisLine={false}
                    width={0}
                    hide
                    domain={['auto', 'auto']}
                  />
                  <YAxis yAxisId="price" orientation="right" hide domain={['auto', 'auto']} />
                  {divergenceStart && divergenceEnd && (
                    <ReferenceArea
                      yAxisId="obv"
                      x1={divergenceStart}
                      x2={divergenceEnd}
                      fill="var(--chart-4)"
                      fillOpacity={0.08}
                      stroke="none"
                      ifOverflow="extendDomain"
                    />
                  )}
                  <ChartTooltip
                    wrapperStyle={{ zIndex: 30 }}
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null
                      const value = payload.find((item) => item.dataKey === 'obv')?.value
                      if (typeof value !== 'number') return null
                      return (
                        <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                          <div className="mb-1 font-medium text-muted-foreground">
                            {formatDate(String(label))}
                          </div>
                          <div className="tabular-nums font-medium">
                            OBV {value.toLocaleString()}
                          </div>
                        </div>
                      )
                    }}
                  />
                  <Line
                    {...motion}
                    yAxisId="price"
                    dataKey="close"
                    type="monotone"
                    stroke="var(--muted-foreground)"
                    strokeWidth={1}
                    strokeOpacity={0.25}
                    dot={false}
                    connectNulls
                  />
                  <Line
                    {...motion}
                    yAxisId="obv"
                    dataKey="obv"
                    type="monotone"
                    stroke={seriesColor(0)}
                    strokeWidth={1.5}
                    dot={false}
                    connectNulls
                  />
                </>
              )}
            </ComposedChart>
          </ChartContainer>
          {kind === 'rsi' && trending && (
            <p className="mt-1 shrink-0 text-[0.65rem] text-muted-foreground/70">
              {t('technical.panes.rsiOverboughtMuted')}
            </p>
          )}
          {kind === 'obv' && divergenceActive && (
            <p className="mt-1 shrink-0 text-[0.65rem] text-muted-foreground/70">
              {t('technical.panes.obvDivergenceHint')}
            </p>
          )}
        </div>
      )}
    </Tile>
  )
}
