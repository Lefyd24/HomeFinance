import { useTranslation } from 'react-i18next'
import { Alert01Icon } from '@hugeicons/core-free-icons'
import { HugeiconsIcon } from '@hugeicons/react'
import { formatCurrency, formatDate } from '../../lib/format'
import {
  ConfidenceBand,
  DataSourceNote,
  DeltaAmount,
  DeltaPill,
  Metric,
  MetricWithHelp,
} from '../InvestmentPrimitives'
import { GLOSSARY } from '../metricGlossary'
import { Tile } from './Tile'
import { JourneyChart } from './JourneyChart'
import { SensitivityStrip } from './SensitivityStrip'
import { HonestyPanel } from './HonestyPanel'
import type { BacktestResult, ScenarioKind } from '../scenariosApi'

function fmtPct(value: number | null): string {
  if (value == null) return '—'
  return `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`
}

function fmtRatio(value: number | null): string {
  return value == null ? '—' : value.toFixed(2)
}

/**
 * The result area shared by `BacktestPage` (a fresh preview) and
 * `ScenarioDetailPage` (a saved scenario, recomputed on read). One subject —
 * the plain-language sentence — everything else supports it. See
 * docs/investments/02-backtesting-sandbox.md §5.1–§5.4.
 */
export function BacktestResultView({
  result,
  symbol,
  benchmarkSymbol,
  currency,
  kind,
  resultKey,
}: {
  result: BacktestResult
  symbol: string
  benchmarkSymbol: string | null
  currency: string
  kind: ScenarioKind
  resultKey: string
}) {
  const { t } = useTranslation('investments')
  const { scenario, benchmark, spec_resolved, comparison, sensitivity, deflated, costs } = result
  const money = (value: number | null | undefined) => (value == null ? '—' : formatCurrency(value, currency))

  const twrMwrGap =
    scenario.twr_cagr != null && scenario.mwr_irr != null ? scenario.twr_cagr - scenario.mwr_irr : null
  const showTwrMwrNote = twrMwrGap != null && Math.abs(twrMwrGap) > 0.01

  const drawdown = scenario.max_drawdown
  const daysUnderWater = drawdown?.days_under_water

  return (
    <div className="flex flex-col gap-4">
      {spec_resolved.stale_data && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
          <HugeiconsIcon icon={Alert01Icon} strokeWidth={2} className="mt-0.5 size-3.5 shrink-0" />
          <span>{t('backtest.warnings.staleData', { date: formatDate(spec_resolved.resolved_end) })}</span>
        </div>
      )}
      {spec_resolved.start_note && (
        <p className="text-xs text-muted-foreground">{spec_resolved.start_note}</p>
      )}
      {spec_resolved.end_note && <p className="text-xs text-muted-foreground">{spec_resolved.end_note}</p>}
      {spec_resolved.data_gaps.length > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-xs text-amber-700 dark:text-amber-400">
          <HugeiconsIcon icon={Alert01Icon} strokeWidth={2} className="mt-0.5 size-3.5 shrink-0" />
          <span>{t('backtest.warnings.dataGaps', { count: spec_resolved.data_gaps.length })}</span>
        </div>
      )}
      {spec_resolved.fx_applied && <p className="text-xs text-muted-foreground">{t('backtest.warnings.fxApplied')}</p>}

      {/* Headline — the benchmark figure sits right beside the scenario's own,
          never hidden, per §5.1. */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric
          label={t('backtest.headline.finalValue')}
          value={money(scenario.final_value)}
          hint={<DeltaPill pct={scenario.total_return_pct != null ? scenario.total_return_pct * 100 : null} />}
          size="lg"
        />
        <Metric label={t('backtest.headline.invested')} value={money(scenario.total_invested)} size="md" />
        <Metric
          label={t('backtest.headline.profit')}
          value={<DeltaAmount amount={scenario.profit} format={(v) => formatCurrency(v, currency)} />}
          size="md"
        />
        {benchmark && (
          <Metric
            label={t('backtest.headline.vsBenchmark', { symbol: benchmarkSymbol ?? '' })}
            value={money(benchmark.final_value)}
            hint={
              comparison?.excess_return_pct != null ? (
                <DeltaAmount
                  amount={benchmark.final_value != null ? scenario.final_value - benchmark.final_value : null}
                  format={(v) => formatCurrency(v, currency)}
                />
              ) : undefined
            }
            size="md"
          />
        )}
      </div>

      {!spec_resolved.period_too_short ? (
        <p className="rounded-xl bg-card p-3 shadow-card text-sm leading-relaxed">
          {benchmark
            ? t('backtest.sentence.base', {
                amount: formatCurrency(scenario.total_invested, currency),
                symbol,
                date: formatDate(spec_resolved.resolved_start),
                finalValue: formatCurrency(scenario.final_value, currency),
                returnPct: fmtPct(scenario.total_return_pct),
                cagr: fmtPct(scenario.twr_cagr),
                benchmarkValue: formatCurrency(benchmark.final_value, currency),
              })
            : t('backtest.sentence.baseNoBenchmark', {
                amount: formatCurrency(scenario.total_invested, currency),
                symbol,
                date: formatDate(spec_resolved.resolved_start),
                finalValue: formatCurrency(scenario.final_value, currency),
                returnPct: fmtPct(scenario.total_return_pct),
                cagr: fmtPct(scenario.twr_cagr),
              })}
          {drawdown && drawdown.trough_date && (
            <>
              {' '}
              {t('backtest.sentence.drawdown', {
                worst: fmtPct(drawdown.depth),
                worstDate: formatDate(drawdown.trough_date, { month: 'long', year: 'numeric' }),
              })}
            </>
          )}
          {drawdown && daysUnderWater != null && (
            <> {t('backtest.sentence.recovery', { days: daysUnderWater })}</>
          )}
        </p>
      ) : (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 shadow-sm text-sm text-amber-700 dark:text-amber-400">
          {t('backtest.warnings.periodTooShort')}
        </p>
      )}

      {showTwrMwrNote && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('backtest.sentence.twrMwrGap', {
            twr: fmtPct(scenario.twr_cagr),
            mwr: fmtPct(scenario.mwr_irr),
          })}
        </p>
      )}

      <JourneyChart
        series={result.series}
        scenarioSymbol={symbol}
        benchmarkSymbol={benchmark ? benchmarkSymbol : null}
        currency={currency}
        maxDrawdown={drawdown}
      />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Tile title={t('backtest.tiles.worstMoment')}>
          {drawdown ? (
            <div className="flex flex-col gap-2">
              <MetricWithHelp
                label={t('compare.metrics.maxDrawdown.label')}
                value={<span className="text-flow-out">{fmtPct(drawdown.depth)}</span>}
                entry={GLOSSARY.maxDrawdown}
                size="md"
              />
              <dl className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                <dt className="text-muted-foreground">{t('backtest.tiles.peak')}</dt>
                <dd className="text-end tabular-nums">{drawdown.peak_date ? formatDate(drawdown.peak_date) : '—'}</dd>
                <dt className="text-muted-foreground">{t('backtest.tiles.trough')}</dt>
                <dd className="text-end tabular-nums">{drawdown.trough_date ? formatDate(drawdown.trough_date) : '—'}</dd>
                <dt className="text-muted-foreground">{t('backtest.tiles.recovered')}</dt>
                <dd className="text-end tabular-nums">
                  {drawdown.recovery_date
                    ? formatDate(drawdown.recovery_date)
                    : t('backtest.tiles.notRecovered')}
                </dd>
              </dl>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">{t('backtest.tiles.noDrawdown')}</p>
          )}
        </Tile>

        <Tile title={t('backtest.tiles.riskAdjusted')}>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t('compare.metrics.sharpe.label')}</span>
              <ConfidenceBand
                value={scenario.sharpe?.value}
                ciLow={scenario.sharpe?.ci_low}
                ciHigh={scenario.sharpe?.ci_high}
              />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t('compare.metrics.sortino.label')}</span>
              <span className="tabular-nums font-medium">{fmtRatio(scenario.sortino)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t('compare.metrics.calmar.label')}</span>
              <span className="tabular-nums font-medium">{fmtRatio(scenario.calmar)}</span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{t('compare.metrics.volatility.label')}</span>
              <span className="tabular-nums font-medium">{fmtPct(scenario.annualized_vol)}</span>
            </div>
          </div>
        </Tile>

        <Tile title={t('backtest.tiles.cost')}>
          <div className="flex flex-col gap-2">
            <MetricWithHelp
              label={t('backtest.metrics.costDrag.label')}
              value={money(costs.cumulative)}
              entry={GLOSSARY.costDrag}
              size="md"
              hint={costs.pct_of_final_value != null ? fmtPct(costs.pct_of_final_value) : undefined}
            />
            {scenario.hypothetical_exit_cost > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t('backtest.tiles.exitCost')}</span>
                <span className="tabular-nums font-medium">{money(scenario.hypothetical_exit_cost)}</span>
              </div>
            )}
            {scenario.dividends_received > 0 && (
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t('backtest.tiles.dividendsReceived')}</span>
                <span className="tabular-nums font-medium">{money(scenario.dividends_received)}</span>
              </div>
            )}
          </div>
        </Tile>
      </div>

      {kind === 'backtest' && sensitivity && (
        <SensitivityStrip sensitivity={sensitivity} currency={currency} chosenDate={spec_resolved.resolved_start} />
      )}

      <HonestyPanel key={resultKey} deflated={deflated} resultKey={resultKey} />

      <DataSourceNote>{t('backtest.footer.dataSource')}</DataSourceNote>
    </div>
  )
}
