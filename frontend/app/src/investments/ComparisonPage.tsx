import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { HugeiconsIcon } from '@hugeicons/react'
import { Analytics01Icon } from '@hugeicons/core-free-icons'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { formatCurrency } from '../lib/format'
import { PageContainer } from '../ui/PageContainer'
import { PageHeader } from '../ui/PageHeader'
import { seriesColor } from './chartConfig'
import { ConfidenceBand, InvestmentsBreadcrumb, MetricWithHelp } from './InvestmentPrimitives'
import { GLOSSARY } from './metricGlossary'
import { ExportPdfButton } from './pdf/ExportPdfButton'
import { useExportComparisonPdf } from './pdf/usePdfExport'
import { useComparison, useComparisonBenchmarks } from './useComparison'
import { useInvestmentAccounts, useInvestmentPositionsForAccounts } from './useInvestments'
import { SavedComparisonsControl } from './widgets/SavedComparisonsMenu'
import { TickerPicker } from './widgets/TickerPicker'
import { NormalizedChart } from './widgets/NormalizedChart'
import { ReturnsChart } from './widgets/ReturnsChart'
import { DrawdownChart } from './widgets/DrawdownChart'
import { RiskScatter } from './widgets/RiskScatter'
import { CorrelationMatrix } from './widgets/CorrelationMatrix'
import { MetricTable, type MetricTableRow } from './widgets/MetricTable'
import type { ComparisonPeriod, InstrumentComparison, SavedComparison } from './comparisonApi'

const DEFAULT_PERIOD: ComparisonPeriod = '3y'
const DEFAULT_CURRENCY = 'USD'
const VALID_PERIODS: ComparisonPeriod[] = ['1m', '3m', '6m', 'ytd', '1y', '3y', '5y', '10y', 'max']

function parsePeriod(value: string | null): ComparisonPeriod {
  return VALID_PERIODS.includes(value as ComparisonPeriod)
    ? (value as ComparisonPeriod)
    : DEFAULT_PERIOD
}

function fmtPct(value: number | string | null): string {
  if (typeof value !== 'number') return '—'
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`
}

function fmtRatio(value: number | string | null): string {
  if (typeof value !== 'number') return '—'
  return value.toFixed(2)
}

const PRESETS: Array<{ key: string; symbols: string[]; benchmark: string }> = [
  { key: 'presetSp500Nasdaq', symbols: ['SPY', 'QQQ'], benchmark: '^GSPC' },
  { key: 'presetVooVti', symbols: ['VOO', 'VTI'], benchmark: '^GSPC' },
  { key: 'presetBtcGold', symbols: ['BTC-USD', 'GLD'], benchmark: '^GSPC' },
]

/**
 * Side-by-side risk-adjusted comparison of 2-5 instruments, led by Sortino per
 * the brief — not a portfolio optimizer, never a buy/sell signal (see
 * docs/investments/00-research-foundations.md Part D). All state lives in the
 * URL so a comparison is linkable, matching `MarketDataProviderSwitch`'s
 * documented convention elsewhere in this sub-app.
 */
export function ComparisonPage() {
  const { t } = useTranslation('investments')
  const [params, setParams] = useSearchParams()

  const symbols = useMemo(
    () =>
      (params.get('symbols') ?? '')
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
    [params],
  )
  const period = parsePeriod(params.get('period'))
  const benchmark = params.get('benchmark') ?? '^GSPC'
  const currency = params.get('currency') ?? DEFAULT_CURRENCY

  function updateParams(next: {
    symbols?: string[]
    period?: ComparisonPeriod
    benchmark?: string | null
    currency?: string
  }) {
    const merged = new URLSearchParams(params)
    if (next.symbols !== undefined) merged.set('symbols', next.symbols.join(','))
    if (next.period !== undefined) merged.set('period', next.period)
    if (next.benchmark !== undefined) {
      if (next.benchmark) merged.set('benchmark', next.benchmark)
      else merged.delete('benchmark')
    }
    if (next.currency !== undefined) merged.set('currency', next.currency)
    setParams(merged, { replace: true })
  }

  const { data: benchmarkOptions } = useComparisonBenchmarks()
  const { data: accounts } = useInvestmentAccounts()
  const accountIds = useMemo(() => (accounts ?? []).map((a) => a.id), [accounts])
  const { data: positions } = useInvestmentPositionsForAccounts(accountIds)
  const quickAddSymbols = useMemo(() => {
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const position of positions ?? []) {
      const symbol = position.symbol.toUpperCase()
      if (!seen.has(symbol)) {
        seen.add(symbol)
        ordered.push(symbol)
      }
    }
    return ordered.slice(0, 8)
  }, [positions])

  const {
    data: comparison,
    isLoading,
    isError,
    error,
  } = useComparison({ symbols, period, benchmark, currency })

  const { exportComparison, isExporting } = useExportComparisonPdf()

  const nonBenchmarkInstruments = useMemo(
    () => (comparison?.instruments ?? []).filter((i) => !i.is_benchmark),
    [comparison],
  )

  const riskAdjustedRows: MetricTableRow[] = [
    {
      id: 'sortino',
      getValue: (i) => i.risk_adjusted.sortino,
      format: (v) => fmtRatio(v),
      higherIsBetter: true,
    },
    {
      id: 'sharpe',
      getValue: (i) => i.risk_adjusted.sharpe?.value ?? null,
      format: (_v, i) => (
        <ConfidenceBand
          value={i.risk_adjusted.sharpe?.value}
          ciLow={i.risk_adjusted.sharpe?.ci_low}
          ciHigh={i.risk_adjusted.sharpe?.ci_high}
        />
      ),
      higherIsBetter: true,
    },
    {
      id: 'calmar',
      getValue: (i) => i.risk_adjusted.calmar,
      format: (v) => fmtRatio(v),
      higherIsBetter: true,
    },
    {
      id: 'volatility',
      getValue: (i) => i.risk.volatility,
      format: (v) => fmtPct(v),
      higherIsBetter: false,
    },
    {
      id: 'maxDrawdown',
      getValue: (i) => i.risk.max_drawdown?.depth ?? null,
      format: (v) => fmtPct(v),
      higherIsBetter: true,
    },
    {
      id: 'timeUnderWater',
      getValue: (i) => i.risk.max_drawdown?.days_under_water ?? null,
      format: (v) => (typeof v === 'number' ? `${v}d` : '—'),
      higherIsBetter: false,
    },
    {
      id: 'ulcerIndex',
      getValue: (i) => i.risk.ulcer_index,
      format: (v) => fmtRatio(v),
      higherIsBetter: false,
    },
    { id: 'var95', getValue: (i) => i.risk.var95, format: (v) => fmtPct(v), higherIsBetter: false },
    {
      id: 'cvar95',
      getValue: (i) => i.risk.cvar95,
      format: (v) => fmtPct(v),
      higherIsBetter: false,
    },
    {
      id: 'beta',
      getValue: (i) => i.vs_benchmark.beta,
      format: (v, i) =>
        v == null
          ? '—'
          : `${fmtRatio(v)} (R² ${i.vs_benchmark.r_squared != null ? i.vs_benchmark.r_squared.toFixed(2) : '—'})`,
    },
    { id: 'alpha', getValue: (i) => i.vs_benchmark.alpha_annual, format: (v) => fmtPct(v) },
    {
      id: 'upCapture',
      getValue: (i) => i.vs_benchmark.up_capture,
      format: (v) => fmtPct(v),
      higherIsBetter: true,
    },
    {
      id: 'downCapture',
      getValue: (i) => i.vs_benchmark.down_capture,
      format: (v) => fmtPct(v),
      higherIsBetter: false,
    },
    {
      id: 'informationRatio',
      getValue: (i) => i.vs_benchmark.information_ratio,
      format: (v) => fmtRatio(v),
      higherIsBetter: true,
    },
  ]

  function fieldNaReason(field: string) {
    return (i: InstrumentComparison) => {
      if (i.valuation.kind === 'index') return t('compare.tiles.notApplicableIndex')
      if (i.valuation.kind === 'crypto') return t('compare.tiles.notApplicableCrypto')
      if (i.valuation.fields[field] === undefined) return t('compare.tiles.notApplicableFund')
      return null
    }
  }

  const valuationRows: MetricTableRow[] = [
    {
      id: 'trailingPe',
      getValue: (i) => (i.valuation.fields.trailing_pe as number) ?? null,
      format: (v) => fmtRatio(v),
      naReason: fieldNaReason('trailing_pe'),
      higherIsBetter: false,
    },
    {
      id: 'forwardPe',
      getValue: (i) => (i.valuation.fields.forward_pe as number) ?? null,
      format: (v) => fmtRatio(v),
      naReason: fieldNaReason('forward_pe'),
      higherIsBetter: false,
    },
    {
      id: 'priceToBook',
      getValue: (i) => (i.valuation.fields.price_to_book as number) ?? null,
      format: (v) => fmtRatio(v),
      naReason: fieldNaReason('price_to_book'),
      higherIsBetter: false,
    },
    {
      id: 'evToEbitda',
      getValue: (i) => (i.valuation.fields.ev_to_ebitda as number) ?? null,
      format: (v) => fmtRatio(v),
      naReason: fieldNaReason('ev_to_ebitda'),
      higherIsBetter: false,
    },
    {
      id: 'dividendYield',
      getValue: (i) => (i.valuation.fields.dividend_yield as number) ?? null,
      format: (v) => fmtPct(v),
      naReason: fieldNaReason('dividend_yield'),
      higherIsBetter: true,
    },
    {
      id: 'fcfYield',
      getValue: (i) => (i.valuation.fields.fcf_yield as number) ?? null,
      format: (v) => fmtPct(v),
      naReason: fieldNaReason('fcf_yield'),
      higherIsBetter: true,
    },
    {
      id: 'roe',
      getValue: (i) => (i.valuation.fields.roe as number) ?? null,
      format: (v) => fmtPct(v),
      naReason: fieldNaReason('roe'),
      higherIsBetter: true,
    },
    {
      id: 'debtToEquity',
      getValue: (i) => (i.valuation.fields.debt_to_equity as number) ?? null,
      format: (v) => fmtRatio(v),
      naReason: fieldNaReason('debt_to_equity'),
      higherIsBetter: false,
    },
    {
      id: 'expenseRatio',
      getValue: (i) => (i.valuation.fields.expense_ratio as number) ?? null,
      format: (v) => fmtPct(v),
      naReason: (i) => (i.valuation.kind === 'fund' ? null : t('compare.tiles.notApplicableFund')),
      higherIsBetter: false,
    },
  ]

  const showEmpty = symbols.length < 2

  return (
    <PageContainer wide className="flex flex-col gap-5">
      <div>
        <InvestmentsBreadcrumb current={t('compare.title')} />
        <PageHeader
          title={t('compare.title')}
          description={t('compare.description')}
          className="mb-0"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <SavedComparisonsControl
                symbols={symbols}
                benchmark={benchmark}
                period={period}
                onLoad={(entry: SavedComparison) =>
                  updateParams({
                    symbols: entry.symbols,
                    benchmark: entry.benchmark,
                    period: parsePeriod(entry.period),
                  })
                }
              />
              <ExportPdfButton
                onExport={() => comparison && exportComparison(comparison)}
                isExporting={isExporting}
                disabled={!comparison}
              />
            </div>
          }
        />
      </div>

      <TickerPicker
        symbols={symbols}
        onSymbolsChange={(next) => updateParams({ symbols: next })}
        benchmark={benchmark}
        onBenchmarkChange={(next) => updateParams({ benchmark: next })}
        benchmarkOptions={benchmarkOptions ?? []}
        period={period}
        onPeriodChange={(next) => updateParams({ period: next })}
        currency={currency}
        onCurrencyChange={(next) => updateParams({ currency: next })}
        quickAddSymbols={quickAddSymbols}
      />

      {showEmpty ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Analytics01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>{t('compare.empty.title')}</EmptyTitle>
            <EmptyDescription>{t('compare.empty.description')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <div className="flex flex-wrap justify-center gap-2">
              {PRESETS.map((preset) => (
                <Button
                  key={preset.key}
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    updateParams({ symbols: preset.symbols, benchmark: preset.benchmark })
                  }
                >
                  {t(`compare.empty.${preset.key}`)}
                </Button>
              ))}
            </div>
          </EmptyContent>
        </Empty>
      ) : isError ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>{t('compare.error.generic')}</EmptyTitle>
            <EmptyDescription>{error instanceof Error ? error.message : ''}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : isLoading || !comparison ? (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {symbols.map((s) => (
              <Skeleton key={s} className="h-28 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Headline row */}
          <div
            className="grid gap-3"
            style={{ gridTemplateColumns: `repeat(auto-fit, minmax(11rem, 1fr))` }}
          >
            {nonBenchmarkInstruments.map((instrument) => {
              const cumReturn = instrument.performance.cumulative_return
              const positive = cumReturn != null && cumReturn >= 0
              // Same index every other tile on this page walks `seriesColor` in
              // (position within the full instrument list, benchmark included).
              const colorIndex = comparison.instruments.findIndex(
                (i) => i.symbol === instrument.symbol,
              )
              const color = seriesColor(colorIndex)
              return (
                <div
                  key={instrument.symbol}
                  className="flex flex-col gap-2.5 rounded-xl bg-card p-3 shadow-card"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <span
                        aria-hidden="true"
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: color }}
                      />
                      <span className="truncate text-sm font-semibold">{instrument.symbol}</span>
                    </span>
                    {instrument.name && (
                      <span className="truncate text-xs text-muted-foreground">
                        {instrument.name}
                      </span>
                    )}
                  </div>

                  {/* Total return leads: it is the single number an average person
                      reads a comparison for, ahead of any risk-adjusted framing.
                      Current price sits right beside it — what it costs now,
                      not itself a return, so it never competes for the same
                      color language (flow-in/flow-out) as the return figure. */}
                  <MetricWithHelp
                    label={t('compare.headline.totalReturn')}
                    value={
                      <span className="inline-flex items-baseline gap-2">
                        <span
                          className={cn(
                            'tabular-nums',
                            positive ? 'text-flow-in' : 'text-flow-out',
                          )}
                        >
                          {fmtPct(cumReturn)}
                        </span>
                        {instrument.last_price != null && (
                          <span className="text-sm font-medium text-muted-foreground">
                            {formatCurrency(
                              instrument.last_price,
                              instrument.currency ?? comparison.meta.currency,
                            )}
                          </span>
                        )}
                      </span>
                    }
                    entry={GLOSSARY.cumulativeReturn}
                    size="lg"
                  />

                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t border-border/60 pt-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {t('compare.metrics.cagr.label')}
                      </span>
                      <span className="tabular-nums">{fmtPct(instrument.performance.cagr)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {t('compare.headline.riskAdjusted')}
                      </span>
                      <span className="tabular-nums font-medium">
                        {fmtRatio(instrument.risk_adjusted.sortino)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {t('compare.metrics.sharpe.label')}
                      </span>
                      <ConfidenceBand
                        value={instrument.risk_adjusted.sharpe?.value}
                        ciLow={instrument.risk_adjusted.sharpe?.ci_low}
                        ciHigh={instrument.risk_adjusted.sharpe?.ci_high}
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">
                        {t('compare.metrics.maxDrawdown.label')}
                      </span>
                      <span className="tabular-nums text-flow-out">
                        {fmtPct(instrument.risk.max_drawdown?.depth ?? null)}
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Verdict strip */}
          {comparison.head_to_head && (
            <div className="rounded-xl bg-card p-3 shadow-card text-sm">
              {t(`compare.verdict.${comparison.head_to_head.verdict_key}`, {
                leader: comparison.head_to_head.leader,
                runnerUp: comparison.head_to_head.runner_up,
                confidence:
                  comparison.head_to_head.psr_leader_vs_runner_up != null
                    ? Math.round(comparison.head_to_head.psr_leader_vs_runner_up * 100)
                    : '—',
              })}
            </div>
          )}

          {comparison.meta.alignment_note && (
            <p className="text-xs text-muted-foreground">{comparison.meta.alignment_note}</p>
          )}

          {/* Returns, on its own row and full-width: the one chart every other
              tile on this page contextualises, so it leads. */}
          <ReturnsChart instruments={comparison.instruments} loading={false} />

          {/* Charts */}
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            <NormalizedChart
              series={comparison.series.normalized}
              symbols={comparison.instruments.map((i) => i.symbol)}
              benchmarkSymbol={comparison.meta.benchmark_symbol}
              seriesFrequency={comparison.meta.series_frequency}
              loading={false}
            />
            <DrawdownChart
              series={comparison.series.drawdown}
              symbols={comparison.instruments.map((i) => i.symbol)}
              instruments={comparison.instruments}
              loading={false}
            />
            <RiskScatter instruments={comparison.instruments} loading={false} />
            <CorrelationMatrix
              instruments={comparison.instruments}
              pairwise={comparison.pairwise}
              loading={false}
            />
          </div>

          {/* Tables */}
          <MetricTable
            instruments={comparison.instruments}
            rows={riskAdjustedRows}
            title={t('compare.tiles.riskAdjustedMetrics')}
          />
          <MetricTable
            instruments={comparison.instruments}
            rows={valuationRows}
            title={t('compare.tiles.valuation')}
          />

          {/* Stress episodes */}
          {nonBenchmarkInstruments.some((i) => i.stress.length > 0) && (
            <div className="flex flex-col gap-2 rounded-xl bg-card p-3 shadow-card">
              <h2 className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                {t('compare.tiles.stress')}
              </h2>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {nonBenchmarkInstruments.map((instrument) => (
                      <tr key={instrument.symbol} className="border-t border-border/60">
                        <td className="py-1.5 pe-3 font-medium">{instrument.symbol}</td>
                        {instrument.stress.map((episode) => (
                          <td
                            key={episode.label}
                            className="py-1.5 pe-4 tabular-nums text-muted-foreground"
                          >
                            {episode.label}: {fmtPct(episode.return)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Honesty footer */}
          <footer className="flex flex-col gap-1 border-t border-border/60 pt-3 text-xs text-muted-foreground">
            <p>{t('compare.footer.period', { period: comparison.meta.period })}</p>
            <p>{t('compare.footer.dataSource')}</p>
            <p>{t('compare.footer.totalReturnBasis')}</p>
            <p>{t(`compare.footer.riskFreeSource.${comparison.meta.risk_free_source}`)}</p>
            <p className="font-medium text-foreground/80">{t('compare.footer.disclaimer')}</p>
          </footer>
        </div>
      )}
    </PageContainer>
  )
}
