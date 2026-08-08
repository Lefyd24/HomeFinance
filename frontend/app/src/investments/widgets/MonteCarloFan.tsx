import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { HelpCircleIcon } from '@hugeicons/core-free-icons'
import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, XAxis, YAxis } from 'recharts'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { formatCurrency, formatDate } from '../../lib/format'
import { seriesColor, useChartMotion } from '../chartConfig'
import { MetricWithHelp } from '../InvestmentPrimitives'
import { GLOSSARY } from '../metricGlossary'
import { Tile, TileEmpty } from './Tile'
import type { DriftMode, SimulationModel, SimulationResponse } from '../technicalApi'

const HORIZON_OPTIONS: Array<{ days: number; key: '30d' | '90d' | '180d' | '1y' }> = [
  { days: 30, key: '30d' },
  { days: 90, key: '90d' },
  { days: 180, key: '180d' },
  { days: 365, key: '1y' },
]

const MODEL_OPTIONS: SimulationModel[] = ['bootstrap', 'gbm', 'student_t']
const DRIFT_OPTIONS: DriftMode[] = ['zero', 'historical', 'risk_free']

/** Identity color for the fan — one instrument's own distribution, not a
 *  multi-series comparison, so it borrows a single slot rather than cycling. */
const FAN_COLOR = seriesColor(0)

interface FanRow {
  date: string
  historical: number | null
  p50: number | null
  band5595Low: number | null
  band5595Width: number | null
  band2575Low: number | null
  band2575Width: number | null
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function formatPrice(value: number, currency?: string): string {
  return currency ? formatCurrency(value, currency) : value.toFixed(2)
}

function formatPct0(fraction: number): string {
  return `${Math.round(fraction * 100)}%`
}

export function MonteCarloFan({
  data,
  loading,
  symbol,
  horizon,
  model,
  drift,
  onHorizonChange,
  onModelChange,
  onDriftChange,
  targetPrice,
  currency,
  historicalTail,
}: {
  data: SimulationResponse | undefined
  loading: boolean
  symbol: string
  horizon: number
  model: SimulationModel
  drift: DriftMode
  onHorizonChange: (horizon: number) => void
  onModelChange: (model: SimulationModel) => void
  onDriftChange: (drift: DriftMode) => void
  targetPrice?: number | null
  currency?: string
  /**
   * `SimulationResponse` has no historical price series of its own — the fan
   * is drawn from percentiles only. The page already loads `TechnicalResponse`
   * for the same symbol, which does carry `price`, so it can pass a trailing
   * slice of that here to let the fan visually continue from real history.
   * Without it, the fan still anchors at `(last_bar_date, last_price)` so the
   * bands originate from a sensible point rather than floating in space.
   */
  historicalTail?: Array<{ date: string; close: number }>
}) {
  const { t } = useTranslation('investments')
  const motion = useChartMotion()

  const rows = useMemo<FanRow[]>(() => {
    if (!data) return []
    const out: FanRow[] = []
    const tail = historicalTail ?? []
    for (const bar of tail) {
      if (bar.date >= data.last_bar_date) continue
      out.push({
        date: bar.date,
        historical: bar.close,
        p50: null,
        band5595Low: null,
        band5595Width: null,
        band2575Low: null,
        band2575Width: null,
      })
    }
    out.push({
      date: data.last_bar_date,
      historical: data.last_price,
      p50: data.last_price,
      band5595Low: data.last_price,
      band5595Width: 0,
      band2575Low: data.last_price,
      band2575Width: 0,
    })
    for (const row of data.percentiles) {
      if (row.day <= 0) continue
      out.push({
        date: addDays(data.last_bar_date, row.day),
        historical: null,
        p50: row.p50,
        band5595Low: row.p5,
        band5595Width: row.p95 - row.p5,
        band2575Low: row.p25,
        band2575Width: row.p75 - row.p25,
      })
    }
    return out
  }, [data, historicalTail])

  const config = useMemo(
    () =>
      ({
        historical: { label: t('technical.monteCarlo.title'), color: 'var(--muted-foreground)' },
        p50: { label: 'median', color: FAN_COLOR },
      }) satisfies ChartConfig,
    [t],
  )

  const hasData = !loading && Boolean(data) && rows.length > 0

  const yearsBack = data
    ? Math.max(
        1,
        Math.round(
          (new Date(data.calibration.lookback_end).getTime() -
            new Date(data.calibration.lookback_start).getTime()) /
            (365.25 * 24 * 3600 * 1000),
        ),
      )
    : 0

  let driftNote = ''
  if (data) {
    if (drift === 'zero') {
      driftNote = t('technical.monteCarlo.driftNoteZero')
    } else if (drift === 'historical') {
      const annualDrift = data.calibration.drift_used * 252 * 100
      const annualSe = (data.calibration.drift_se ?? 0) * 252 * 100
      driftNote = t('technical.monteCarlo.driftNoteHistorical', {
        drift: `${annualDrift.toFixed(1)}%`,
        se: `${annualSe.toFixed(1)}%`,
      })
    } else {
      driftNote = t('technical.monteCarlo.driftNoteRiskFree')
    }
  }

  const calibrationNote = data
    ? t('technical.monteCarlo.calibrationNote', {
        symbol,
        start: formatDate(data.calibration.lookback_start),
        end: formatDate(data.calibration.lookback_end),
        driftNote,
      }) +
      (data.calibration.vol_percentile_vs_3y != null
        ? t('technical.monteCarlo.calibrationVolNote', {
            percentile: Math.round(data.calibration.vol_percentile_vs_3y),
          })
        : '')
    : ''

  const showTarget = targetPrice != null && data?.probabilities.p_above_target != null

  return (
    <Tile
      title={
        <span className="inline-flex items-center gap-1.5">
          {t('technical.monteCarlo.title')}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={t(GLOSSARY.monteCarlo.labelKey)}
                className="inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/70 transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                <HugeiconsIcon icon={HelpCircleIcon} strokeWidth={2} className="size-3.5" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-[min(22rem,calc(100vw-2rem))]" collisionPadding={12}>
              <div className="flex flex-col gap-1.5 text-left">
                <p className="text-xs font-semibold text-foreground">{t(GLOSSARY.monteCarlo.shortKey)}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{t(GLOSSARY.monteCarlo.bodyKey)}</p>
              </div>
            </PopoverContent>
          </Popover>
        </span>
      }
      allowOverflow
    >
      <div className="mb-4 flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
        <span className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {t('technical.monteCarlo.settingsLabel')}
        </span>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <ToggleGroup
            type="single"
            value={String(horizon)}
            onValueChange={(next) => {
              if (next) onHorizonChange(Number(next))
            }}
            variant="outline"
            size="sm"
            spacing={0}
            disabled={loading}
            aria-label={t('technical.monteCarlo.horizon.30d')}
          >
            {HORIZON_OPTIONS.map((option) => (
              <ToggleGroupItem key={option.days} value={String(option.days)} className="px-2.5">
                {t(`technical.monteCarlo.horizon.${option.key}`)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>

          <Select value={model} onValueChange={(next) => onModelChange(next as SimulationModel)} disabled={loading}>
            <SelectTrigger className="h-8 w-auto min-w-40 text-xs" aria-label={t('technical.monteCarlo.modelLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MODEL_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  <div className="flex flex-col gap-0.5 py-0.5">
                    <span>{t(`technical.monteCarlo.models.${option}`)}</span>
                    <span className="text-[0.65rem] leading-snug text-muted-foreground">
                      {t(`technical.monteCarlo.modelHints.${option}`)}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={drift} onValueChange={(next) => onDriftChange(next as DriftMode)} disabled={loading}>
            <SelectTrigger className="h-8 w-auto min-w-32 text-xs" aria-label={t('technical.monteCarlo.driftLabel')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DRIFT_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {t(`technical.monteCarlo.drifts.${option}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-80 w-full rounded-lg" />
      ) : !hasData || !data ? (
        <TileEmpty>{t('technical.monteCarlo.title')}</TileEmpty>
      ) : (
        <>
          <ChartContainer config={config} className="aspect-auto h-[26rem] w-full">
            <ComposedChart data={rows} margin={{ left: 4, right: 4, top: 4, bottom: 0 }}>
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
                width={48}
                tickMargin={4}
                domain={['auto', 'auto']}
                tickFormatter={(value: number) => formatPrice(value, currency)}
              />
              <ChartTooltip
                wrapperStyle={{ zIndex: 30 }}
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null
                  const row = payload[0]?.payload as FanRow | undefined
                  if (!row) return null
                  return (
                    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                      <div className="mb-1 font-medium text-muted-foreground">{formatDate(String(label))}</div>
                      {row.historical != null && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">{t('technical.monteCarlo.title')}</span>
                          <span className="tabular-nums font-medium">{formatPrice(row.historical, currency)}</span>
                        </div>
                      )}
                      {row.p50 != null && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">median</span>
                          <span className="tabular-nums font-medium">{formatPrice(row.p50, currency)}</span>
                        </div>
                      )}
                      {row.band5595Low != null && row.band5595Width != null && (
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-muted-foreground">5–95%</span>
                          <span className="tabular-nums">
                            {formatPrice(row.band5595Low, currency)} – {formatPrice(row.band5595Low + row.band5595Width, currency)}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                }}
              />
              <Area
                {...motion}
                dataKey="band5595Low"
                stackId="outer"
                stroke="none"
                fill="transparent"
                connectNulls
              />
              <Area
                {...motion}
                dataKey="band5595Width"
                stackId="outer"
                stroke="none"
                fill={FAN_COLOR}
                fillOpacity={0.1}
                connectNulls
              />
              <Area
                {...motion}
                dataKey="band2575Low"
                stackId="inner"
                stroke="none"
                fill="transparent"
                connectNulls
              />
              <Area
                {...motion}
                dataKey="band2575Width"
                stackId="inner"
                stroke="none"
                fill={FAN_COLOR}
                fillOpacity={0.2}
                connectNulls
              />
              <Line
                {...motion}
                dataKey="historical"
                type="monotone"
                stroke="var(--muted-foreground)"
                strokeWidth={1.5}
                dot={false}
                connectNulls
              />
              <Line
                {...motion}
                dataKey="p50"
                type="monotone"
                stroke={FAN_COLOR}
                strokeWidth={2}
                dot={false}
                connectNulls
              />
              <ReferenceLine
                x={data.last_bar_date}
                stroke="var(--foreground)"
                strokeDasharray="4 4"
                label={{
                  value: t('technical.monteCarlo.todayLabel'),
                  position: 'top',
                  fontSize: 10,
                  fill: 'var(--muted-foreground)',
                }}
              />
              {showTarget && (
                <ReferenceLine
                  y={targetPrice as number}
                  stroke="var(--foreground)"
                  strokeDasharray="4 4"
                  label={{
                    value: t('technical.monteCarlo.targetLabel'),
                    position: 'insideTopRight',
                    fontSize: 10,
                    fill: 'var(--muted-foreground)',
                  }}
                />
              )}
            </ComposedChart>
          </ChartContainer>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MetricWithHelp
              label={t('technical.monteCarlo.kpiMiddleHalfLabel')}
              value={`${formatPrice(data.terminal.p25, currency)} – ${formatPrice(data.terminal.p75, currency)}`}
              entry={GLOSSARY.monteCarlo}
              size="sm"
            />
            <MetricWithHelp
              label={t('technical.monteCarlo.kpiWorstCaseLabel')}
              value={formatPrice(data.terminal.p5, currency)}
              entry={GLOSSARY.monteCarlo}
              size="sm"
            />
            <MetricWithHelp
              label={t('technical.monteCarlo.kpiAboveTodayLabel')}
              value={formatPct0(data.probabilities.p_above_today)}
              entry={GLOSSARY.monteCarlo}
              size="sm"
            />
            <MetricWithHelp
              label={t('technical.monteCarlo.kpiDrawdownLabel')}
              value={formatPct0(data.probabilities.p_drawdown_20)}
              entry={GLOSSARY.monteCarlo}
              size="sm"
            />
          </div>

          <ul className="mt-4 flex flex-col gap-1 text-xs text-muted-foreground">
            <li className="text-foreground/90">
              {t('technical.monteCarlo.sentenceIntro', { symbol, years: yearsBack, horizon: data.horizon_days })}
            </li>
            <li>
              •{' '}
              {t('technical.monteCarlo.bulletMiddleHalf', {
                low: formatPrice(data.terminal.p25, currency),
                high: formatPrice(data.terminal.p75, currency),
              })}
            </li>
            <li>• {t('technical.monteCarlo.bulletOneIn20Below', { value: formatPrice(data.terminal.p5, currency) })}</li>
            <li>
              • {t('technical.monteCarlo.bulletAboveToday', { pct: formatPct0(data.probabilities.p_above_today) })}
            </li>
            <li>
              • {t('technical.monteCarlo.bulletDrawdown20', { pct: formatPct0(data.probabilities.p_drawdown_20) })}
            </li>
            {showTarget && (
              <li>
                •{' '}
                {t('technical.monteCarlo.probAboveTarget', {
                  pct: formatPct0(data.probabilities.p_above_target as number),
                  target: formatPrice(targetPrice as number, currency),
                })}
              </li>
            )}
          </ul>

          <div className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <p>{calibrationNote}</p>
          </div>
        </>
      )}
    </Tile>
  )
}
