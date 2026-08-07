import { Fragment, useMemo, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { Line, LineChart } from 'recharts'
import { ChartContainer } from '@/components/ui/chart'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { seriesColor } from '../chartConfig'
import { GLOSSARY } from '../metricGlossary'
import { Tile, TileEmpty } from './Tile'
import type { InstrumentComparison, PairwiseBlock } from '../comparisonApi'

/** Both pair keys are tried because the backend only stores one direction per
 *  unordered pair — `symbols[i]|symbols[j]` for `i < j` in comparison order. */
function lookupPair<T>(map: Record<string, T>, a: string, b: string): T | undefined {
  return map[`${a}|${b}`] ?? map[`${b}|${a}`]
}

/**
 * Deliberately inverted colour: high correlation is coloured with the
 * `flow-out` (bad/loss) token and negative correlation with `flow-in`
 * (good/gain), because here the usual "green means good" instinct is wrong —
 * two holdings moving together is the thing to be wary of, not celebrate.
 * `color-mix` rather than a Tailwind opacity utility because the opacity is a
 * continuous function of the correlation value, not one of Tailwind's fixed
 * steps that a static class scan could pick up.
 */
function cellStyle(corr: number | undefined): CSSProperties {
  if (corr == null) return {}
  const opacity = Math.min(0.08 + Math.abs(corr) * 0.35, 0.43)
  const token = corr >= 0 ? '--flow-out' : '--flow-in'
  return { backgroundColor: `color-mix(in oklab, var(${token}) ${(opacity * 100).toFixed(0)}%, transparent)` }
}

/** A minimal 90-day correlation trend, just a line with no axes — the popover
 *  wants "has this been drifting" at a glance, not a readable chart. */
function RollingCorrelationSparkline({ series }: { series: Array<{ date: string; value: number }> }) {
  if (series.length < 2) return null
  return (
    <ChartContainer config={{}} className="aspect-auto h-10 w-full">
      <LineChart data={series} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Line
          type="monotone"
          dataKey="value"
          stroke="var(--muted-foreground)"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartContainer>
  )
}

function PairPopoverBody({
  labelA,
  labelB,
  correlation,
  rolling,
}: {
  labelA: string
  labelB: string
  correlation: number | undefined
  rolling: Array<{ date: string; value: number }>
}) {
  const { t } = useTranslation('investments')
  const entry = GLOSSARY.correlation
  return (
    <div className="flex flex-col gap-2">
      <div>
        <p className="text-xs font-semibold text-foreground">
          {labelA} · {labelB}
        </p>
        <p className="mt-0.5 font-heading text-lg font-semibold tabular-nums">
          {correlation != null ? correlation.toFixed(2) : '—'}
        </p>
      </div>
      {rolling.length >= 2 && (
        <div className="flex flex-col gap-1">
          <p className="text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
            {t('compare.metrics.correlation.label')}
          </p>
          <RollingCorrelationSparkline series={rolling} />
        </div>
      )}
      <div className="flex flex-col gap-1 text-left">
        <p className="text-xs font-semibold text-foreground">{t(entry.shortKey)}</p>
        <p className="text-xs leading-relaxed text-muted-foreground">{t(entry.bodyKey)}</p>
        {entry.scaleKey && (
          <p className="text-xs leading-relaxed text-muted-foreground/80">{t(entry.scaleKey)}</p>
        )}
      </div>
    </div>
  )
}

/**
 * How every pair of instruments moves together, as a heatmap rather than a
 * table — a table of N² numbers asks the reader to scan, a coloured grid lets
 * the eye find the redundant pairs (the dark cells) immediately. Deliberately
 * plain CSS grid, not a chart: there is no continuous axis here, just a fixed
 * matrix of discrete cells.
 */
export function CorrelationMatrix({
  instruments,
  pairwise,
  loading,
}: {
  instruments: InstrumentComparison[]
  pairwise: PairwiseBlock
  loading: boolean
}) {
  const { t } = useTranslation('investments')

  const symbols = useMemo(() => instruments.map((instrument) => instrument.symbol), [instruments])

  return (
    <Tile title={t('compare.tiles.correlation')} footer={t('compare.tiles.correlationLegend')}>
      {loading ? (
        <Skeleton className="h-[13rem] w-full rounded-lg" />
      ) : symbols.length < 2 ? (
        <TileEmpty>{t('compare.tiles.correlationEmpty')}</TileEmpty>
      ) : (
        <div className="overflow-x-auto">
          <div
            className="grid min-w-fit gap-0.5"
            style={{
              gridTemplateColumns: `minmax(2.25rem, auto) repeat(${symbols.length}, minmax(2rem, 1fr))`,
            }}
          >
            {/* Corner cell */}
            <div />
            {symbols.map((symbol, index) => (
              <div
                key={`col-${symbol}`}
                className="flex min-w-0 items-center justify-center gap-1 px-0.5 pb-1 text-[0.6rem] font-medium text-muted-foreground"
                title={symbol}
              >
                <span
                  aria-hidden="true"
                  className="size-1.5 shrink-0 rounded-full"
                  style={{ backgroundColor: seriesColor(index) }}
                />
                <span className="truncate">{symbol}</span>
              </div>
            ))}

            {symbols.map((rowSymbol, rowIndex) => (
              <Fragment key={`row-${rowSymbol}`}>
                <div
                  className="flex items-center gap-1 truncate pr-1 text-[0.6rem] font-medium text-muted-foreground"
                  title={rowSymbol}
                >
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: seriesColor(rowIndex) }}
                  />
                  <span className="truncate">{rowSymbol}</span>
                </div>
                {symbols.map((colSymbol, colIndex) => {
                  if (rowIndex === colIndex) {
                    return (
                      <div
                        key={`${rowSymbol}-${colSymbol}`}
                        className="flex min-w-8 items-center justify-center rounded-sm bg-muted/40 py-1.5 text-[0.65rem] tabular-nums text-muted-foreground/60"
                      >
                        —
                      </div>
                    )
                  }
                  const corr = lookupPair(pairwise.correlation, rowSymbol, colSymbol)
                  const rolling = lookupPair(pairwise.rolling_correlation, rowSymbol, colSymbol) ?? []
                  return (
                    <Popover key={`${rowSymbol}-${colSymbol}`}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className={cn(
                            'flex min-w-8 items-center justify-center rounded-sm py-1.5 text-[0.65rem] font-medium tabular-nums transition-opacity hover:opacity-80',
                            'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                          )}
                          style={cellStyle(corr)}
                          aria-label={t('compare.help', {
                            metric: `${rowSymbol} · ${colSymbol} ${t('compare.metrics.correlation.label')}`,
                          })}
                        >
                          {corr != null ? corr.toFixed(2) : '—'}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        className="w-[min(22rem,calc(100vw-2rem))] max-h-[min(24rem,70vh)] overflow-y-auto"
                        collisionPadding={12}
                      >
                        <PairPopoverBody
                          labelA={rowSymbol}
                          labelB={colSymbol}
                          correlation={corr}
                          rolling={rolling}
                        />
                      </PopoverContent>
                    </Popover>
                  )
                })}
              </Fragment>
            ))}
          </div>
        </div>
      )}
    </Tile>
  )
}
