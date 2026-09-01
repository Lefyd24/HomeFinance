/**
 * The ticker-comparison report, as paper.
 *
 * Everything `ComparisonPage` shows, in the order it shows it: the headline
 * cards, the verdict, the four charts, the two metric tables, the stress strip
 * and the honesty footer. The page's own framing rules carry over — Sortino
 * leads the risk-adjusted reading, the benchmark is a yardstick rather than a
 * contender (muted, dashed), and the disclaimer is not optional furniture.
 *
 * `t` is passed in rather than pulled from `useTranslation`: react-pdf renders
 * through its own reconciler, outside the React DOM tree, so there is no
 * i18next provider above these components.
 */
import { Document, Text, View, type DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import {
  ChartLegend,
  Cover,
  DataTable,
  Footnotes,
  ReportPage,
  Section,
  Swatch,
  registerPdfFonts,
  s,
  type TableColumn,
} from './pdfPrimitives'
import {
  BarRowsChart,
  CorrelationHeatmap,
  LineSeriesChart,
  ScatterPlot,
  type BarRow,
  type LineSeries,
  type ScatterPoint,
} from './pdfCharts'
import { PAGE, PRINT, RADIUS, printPolarityColor, printSeriesColor } from './pdfTheme'
import { formatCurrency, formatDate } from '../../lib/format'
import type { ComparisonResponse, InstrumentComparison } from '../comparisonApi'

export type Translate = (key: string, options?: Record<string, unknown>) => string

export interface ComparisonReportInput {
  comparison: ComparisonResponse
  t: Translate
  generatedAt: Date
}

/** Short enough for a chart axis, where a full "01 Jan 2024" will not fit. */
function axisDate(value: string): string {
  return formatDate(value, { month: 'short', year: '2-digit' })
}

const DASH = '—'

function fmtPct(value: number | string | null | undefined, signed = true): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DASH
  return `${signed && value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`
}

function fmtRatio(value: number | string | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DASH
  return value.toFixed(2)
}

/** Both key directions, because the backend stores one per unordered pair. */
function lookupPair<T>(map: Record<string, T>, a: string, b: string): T | undefined {
  return map[`${a}|${b}`] ?? map[`${b}|${a}`]
}

/** An instrument's colour is its position in the full list, benchmark included
 *  — the same index every tile on the screen walks. */
function colorFor(comparison: ComparisonResponse, instrument: InstrumentComparison): string {
  if (instrument.is_benchmark) return PRINT.inkFaint
  return printSeriesColor(comparison.instruments.findIndex((i) => i.symbol === instrument.symbol))
}

// ---------------------------------------------------------------------------
// Headline cards
// ---------------------------------------------------------------------------

function HeadlineCard({
  instrument,
  color,
  width,
  t,
  fallbackCurrency,
}: {
  instrument: InstrumentComparison
  color: string
  width: string
  t: Translate
  fallbackCurrency: string
}) {
  const cumulative = instrument.performance.cumulative_return
  const sharpe = instrument.risk_adjusted.sharpe

  const minor: Array<{ label: string; value: string; tone?: string }> = [
    { label: t('compare.metrics.cagr.label'), value: fmtPct(instrument.performance.cagr) },
    {
      label: t('compare.headline.riskAdjusted'),
      value: fmtRatio(instrument.risk_adjusted.sortino),
    },
    {
      label: t('compare.metrics.sharpe.label'),
      value: sharpe
        ? `${fmtRatio(sharpe.value)} (${fmtRatio(sharpe.ci_low)}–${fmtRatio(sharpe.ci_high)})`
        : DASH,
    },
    {
      label: t('compare.metrics.maxDrawdown.label'),
      value: fmtPct(instrument.risk.max_drawdown?.depth ?? null),
      tone: PRINT.negative,
    },
  ]

  return (
    <View style={[s.card, { width, marginRight: 6, marginBottom: 6 }]} wrap={false}>
      <View style={[s.row, { justifyContent: 'space-between', marginBottom: 3 }]}>
        <View style={s.row}>
          <Swatch color={color} />
          <Text style={[s.body, { fontWeight: 700 }]}>{instrument.symbol}</Text>
        </View>
        {instrument.is_benchmark ? (
          <Text style={s.label}>{t('compare.picker.benchmark')}</Text>
        ) : null}
      </View>

      {instrument.name ? (
        <Text style={[s.label, { marginBottom: 4 }]} wrap={false}>
          {instrument.name.length > 34 ? `${instrument.name.slice(0, 33)}…` : instrument.name}
        </Text>
      ) : null}

      <Text style={s.label}>{t('compare.headline.totalReturn')}</Text>
      <View style={[s.row, { alignItems: 'baseline', marginBottom: 5 }]}>
        <Text style={[s.figure, { color: printPolarityColor(cumulative) }]}>
          {fmtPct(cumulative)}
        </Text>
        {instrument.last_price != null ? (
          <Text style={[s.td, { color: PRINT.inkFaint, marginLeft: 5 }]}>
            {formatCurrency(instrument.last_price, instrument.currency ?? fallbackCurrency)}
          </Text>
        ) : null}
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: PRINT.ruleSoft, paddingTop: 3 }}>
        {minor.map((row) => (
          <View
            key={row.label}
            style={[s.row, { justifyContent: 'space-between', paddingVertical: 0.8 }]}
          >
            <Text style={[s.label, { flex: 1, paddingRight: 4 }]}>{row.label}</Text>
            <Text style={[s.td, { fontWeight: 500, color: row.tone ?? PRINT.ink }]}>
              {row.value}
            </Text>
          </View>
        ))}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Metric tables
// ---------------------------------------------------------------------------

interface MetricRowSpec {
  id: string
  label: string
  value: (instrument: InstrumentComparison) => number | null
  format: (instrument: InstrumentComparison) => string
  higherIsBetter?: boolean
  /** A translated reason to show instead of a value, e.g. "n/a for funds". */
  naReason?: (instrument: InstrumentComparison) => string | null
}

function MetricMatrix({
  instruments,
  rows,
  t,
  comparison,
}: {
  instruments: InstrumentComparison[]
  rows: MetricRowSpec[]
  t: Translate
  comparison: ComparisonResponse
}) {
  const labelWeight = 2.4
  const columns: TableColumn<MetricRowSpec>[] = [
    {
      key: '__label',
      header: t('research.metricColumn'),
      width: labelWeight,
      render: (row) => <Text style={[s.td, { fontWeight: 500 }]}>{row.label}</Text>,
    },
    ...instruments.map<TableColumn<MetricRowSpec>>((instrument) => ({
      key: instrument.symbol,
      header: instrument.symbol,
      width: 1,
      align: 'right' as const,
      render: (row) => {
        const na = row.naReason?.(instrument) ?? null
        if (na) {
          return <Text style={[s.label, { textAlign: 'right' }]}>{na}</Text>
        }
        const best = bestSymbolFor(row, instruments)
        const isBest = best != null && best === instrument.symbol
        return (
          <Text
            style={[
              s.td,
              isBest ? { fontWeight: 700, color: PRINT.accent } : {},
              instrument.is_benchmark ? { color: PRINT.inkMuted } : {},
            ]}
          >
            {row.format(instrument)}
          </Text>
        )
      },
    })),
  ]

  return (
    <View wrap={false}>
      <DataTable columns={columns} rows={rows} keyOf={(row) => row.id} />
      <Text style={[s.footnote, { marginTop: 3 }]}>
        {t('pdf.compare.bestValueNote', {
          benchmark: comparison.meta.benchmark_symbol ?? DASH,
        })}
      </Text>
    </View>
  )
}

/** The winning symbol for a row, or null when the row has no "better" or the
 *  values are not comparable. Benchmarks never win — they are the yardstick. */
function bestSymbolFor(row: MetricRowSpec, instruments: InstrumentComparison[]): string | null {
  if (row.higherIsBetter == null) return null
  const candidates = instruments
    .filter((i) => !i.is_benchmark && (row.naReason?.(i) ?? null) == null)
    .map((i) => ({ symbol: i.symbol, value: row.value(i) }))
    .filter(
      (c): c is { symbol: string; value: number } => c.value != null && Number.isFinite(c.value),
    )
  if (candidates.length < 2) return null
  return candidates.reduce((best, current) =>
    row.higherIsBetter
      ? current.value > best.value
        ? current
        : best
      : current.value < best.value
        ? current
        : best,
  ).symbol
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export function buildComparisonReport(input: ComparisonReportInput): ReactElement<DocumentProps> {
  registerPdfFonts()

  const { comparison, t, generatedAt } = input
  const { meta, instruments, pairwise, head_to_head: headToHead, series } = comparison
  const contenders = instruments.filter((i) => !i.is_benchmark)
  const currency = meta.currency
  const symbolLine = contenders.map((i) => i.symbol).join('  ·  ')

  const cardWidth = contenders.length <= 2 ? '48%' : contenders.length === 3 ? '31.5%' : '23.5%'

  // --- charts -------------------------------------------------------------
  const returnRows: BarRow[] = instruments
    .filter((i) => i.performance.cumulative_return != null)
    .map((i) => ({
      label: i.symbol,
      value: i.performance.cumulative_return as number,
      muted: i.is_benchmark,
      formatted: fmtPct(i.performance.cumulative_return),
    }))

  const normalizedDates = series.normalized.map((row) => String(row.date ?? ''))
  const normalizedSeries: LineSeries[] = instruments.map((instrument) => ({
    key: instrument.symbol,
    color: colorFor(comparison, instrument),
    dashed: instrument.is_benchmark,
    values: series.normalized.map((row) => {
      const value = row[instrument.symbol]
      return typeof value === 'number' ? value : null
    }),
  }))

  const drawdownDates = series.drawdown.map((row) => String(row.date ?? ''))
  const drawdownSeries: LineSeries[] = instruments.map((instrument) => ({
    key: instrument.symbol,
    color: colorFor(comparison, instrument),
    dashed: instrument.is_benchmark,
    fillOpacity: instrument.is_benchmark ? 0 : 0.07,
    values: series.drawdown.map((row) => {
      const value = row[instrument.symbol]
      return typeof value === 'number' ? value : null
    }),
  }))

  const scatterPoints: ScatterPoint[] = instruments
    .filter((i) => i.risk.volatility != null && i.performance.cagr != null)
    .map((i) => ({
      label: i.symbol,
      x: i.risk.volatility as number,
      y: i.performance.cagr as number,
      color: colorFor(comparison, i),
      muted: i.is_benchmark,
    }))
  const benchmarkPoint = scatterPoints.find(
    (point) => instruments.find((i) => i.symbol === point.label)?.is_benchmark,
  )

  const legend = instruments.map((instrument) => ({
    label: instrument.symbol,
    color: colorFor(comparison, instrument),
    dashed: instrument.is_benchmark,
  }))

  // --- tables --------------------------------------------------------------
  const naReason = (field: string) => (i: InstrumentComparison) => {
    if (i.valuation.kind === 'index') return t('compare.tiles.notApplicableIndex')
    if (i.valuation.kind === 'crypto') return t('compare.tiles.notApplicableCrypto')
    if (i.valuation.fields[field] === undefined) return t('compare.tiles.notApplicableFund')
    return null
  }
  const valuationField = (field: string) => (i: InstrumentComparison) => {
    const value = i.valuation.fields[field]
    return typeof value === 'number' ? value : null
  }

  const riskRows: MetricRowSpec[] = [
    {
      id: 'sortino',
      label: t('compare.metrics.sortino.label'),
      value: (i) => i.risk_adjusted.sortino,
      format: (i) => fmtRatio(i.risk_adjusted.sortino),
      higherIsBetter: true,
    },
    {
      id: 'sharpe',
      label: t('compare.metrics.sharpe.label'),
      value: (i) => i.risk_adjusted.sharpe?.value ?? null,
      format: (i) => fmtRatio(i.risk_adjusted.sharpe?.value ?? null),
      higherIsBetter: true,
    },
    {
      id: 'calmar',
      label: t('compare.metrics.calmar.label'),
      value: (i) => i.risk_adjusted.calmar,
      format: (i) => fmtRatio(i.risk_adjusted.calmar),
      higherIsBetter: true,
    },
    {
      id: 'volatility',
      label: t('compare.metrics.volatility.label'),
      value: (i) => i.risk.volatility,
      format: (i) => fmtPct(i.risk.volatility, false),
      higherIsBetter: false,
    },
    {
      id: 'maxDrawdown',
      label: t('compare.metrics.maxDrawdown.label'),
      value: (i) => i.risk.max_drawdown?.depth ?? null,
      format: (i) => fmtPct(i.risk.max_drawdown?.depth ?? null),
      higherIsBetter: true,
    },
    {
      id: 'timeUnderWater',
      label: t('compare.metrics.timeUnderWater.label'),
      value: (i) => i.risk.max_drawdown?.days_under_water ?? null,
      format: (i) => {
        const days = i.risk.max_drawdown?.days_under_water
        return typeof days === 'number' ? `${days}d` : DASH
      },
      higherIsBetter: false,
    },
    {
      id: 'ulcerIndex',
      label: t('compare.metrics.ulcerIndex.label'),
      value: (i) => i.risk.ulcer_index,
      format: (i) => fmtRatio(i.risk.ulcer_index),
      higherIsBetter: false,
    },
    {
      id: 'var95',
      label: t('compare.metrics.var95.label'),
      value: (i) => i.risk.var95,
      format: (i) => fmtPct(i.risk.var95),
      higherIsBetter: false,
    },
    {
      id: 'cvar95',
      label: t('compare.metrics.cvar95.label'),
      value: (i) => i.risk.cvar95,
      format: (i) => fmtPct(i.risk.cvar95),
      higherIsBetter: false,
    },
    {
      id: 'beta',
      label: t('compare.metrics.beta.label'),
      value: (i) => i.vs_benchmark.beta,
      format: (i) =>
        i.vs_benchmark.beta == null
          ? DASH
          : `${fmtRatio(i.vs_benchmark.beta)} (R² ${fmtRatio(i.vs_benchmark.r_squared)})`,
    },
    {
      id: 'alpha',
      label: t('compare.metrics.alpha.label'),
      value: (i) => i.vs_benchmark.alpha_annual,
      format: (i) => fmtPct(i.vs_benchmark.alpha_annual),
    },
    {
      id: 'upCapture',
      label: t('compare.metrics.upCapture.label'),
      value: (i) => i.vs_benchmark.up_capture,
      format: (i) => fmtPct(i.vs_benchmark.up_capture, false),
      higherIsBetter: true,
    },
    {
      id: 'downCapture',
      label: t('compare.metrics.downCapture.label'),
      value: (i) => i.vs_benchmark.down_capture,
      format: (i) => fmtPct(i.vs_benchmark.down_capture, false),
      higherIsBetter: false,
    },
    {
      id: 'informationRatio',
      label: t('compare.metrics.informationRatio.label'),
      value: (i) => i.vs_benchmark.information_ratio,
      format: (i) => fmtRatio(i.vs_benchmark.information_ratio),
      higherIsBetter: true,
    },
  ]

  const valuationSpecs: Array<[string, string, boolean, boolean]> = [
    // [field, label key, higherIsBetter, isPercent]
    ['trailing_pe', 'trailingPe', false, false],
    ['forward_pe', 'forwardPe', false, false],
    ['price_to_book', 'priceToBook', false, false],
    ['ev_to_ebitda', 'evToEbitda', false, false],
    ['dividend_yield', 'dividendYield', true, true],
    ['fcf_yield', 'fcfYield', true, true],
    ['roe', 'roe', true, true],
    ['debt_to_equity', 'debtToEquity', false, false],
  ]

  const valuationRows: MetricRowSpec[] = [
    ...valuationSpecs.map<MetricRowSpec>(([field, key, higherIsBetter, isPercent]) => ({
      id: key,
      label: t(`compare.metrics.${key}.label`),
      value: valuationField(field),
      format: (i) => {
        const value = valuationField(field)(i)
        return isPercent ? fmtPct(value, false) : fmtRatio(value)
      },
      higherIsBetter,
      naReason: naReason(field),
    })),
    {
      id: 'expenseRatio',
      label: t('compare.metrics.expenseRatio.label'),
      value: valuationField('expense_ratio'),
      format: (i) => fmtPct(valuationField('expense_ratio')(i), false),
      higherIsBetter: false,
      naReason: (i) => (i.valuation.kind === 'fund' ? null : t('compare.tiles.notApplicableFund')),
    },
  ]

  const stressInstruments = contenders.filter((i) => i.stress.length > 0)
  const stressEpisodes = stressInstruments[0]?.stress.map((episode) => episode.label) ?? []

  const chartWidth = PAGE.contentWidth
  const halfWidth = (PAGE.contentWidth - 8) / 2

  const headerRight = `${t('compare.footer.period', { period: meta.period })} · ${formatDate(meta.start)} – ${formatDate(meta.end)}`

  return (
    <Document
      title={`${t('compare.title')} — ${contenders.map((i) => i.symbol).join(', ')}`}
      author="Personal Finance"
      subject={t('compare.description')}
      creator="Personal Finance"
      producer="Personal Finance"
    >
      <ReportPage
        headerLeft={symbolLine}
        headerRight={headerRight}
        footerNote={t('compare.footer.disclaimer')}
        pageLabel={(page, total) => t('pdf.page', { page, total })}
      >
        <Cover
          eyebrow={t('pdf.compare.eyebrow')}
          title={contenders.map((i) => i.symbol).join(' vs ')}
          subtitle={t('compare.description')}
          meta={[
            t('compare.footer.period', { period: meta.period }),
            `${formatDate(meta.start)} – ${formatDate(meta.end)}`,
            meta.benchmark_symbol
              ? `${t('compare.picker.benchmark')}: ${meta.benchmark_symbol}`
              : t('compare.picker.benchmarkNone'),
            `${t('compare.picker.currency')}: ${currency}`,
            t('pdf.generatedOn', { date: formatDate(generatedAt) }),
          ]}
        />

        <Section title={t('pdf.compare.headlineSection')}>
          <View style={[s.row, { flexWrap: 'wrap', alignItems: 'stretch' }]}>
            {contenders.map((instrument) => (
              <HeadlineCard
                key={instrument.symbol}
                instrument={instrument}
                color={colorFor(comparison, instrument)}
                width={cardWidth}
                t={t}
                fallbackCurrency={currency}
              />
            ))}
          </View>

          {headToHead ? (
            <View
              style={[
                s.card,
                s.cardTinted,
                { borderLeftWidth: 2.5, borderLeftColor: PRINT.accent, marginTop: 2 },
              ]}
              wrap={false}
            >
              <Text style={[s.label, { marginBottom: 2 }]}>{t('compare.verdict.title')}</Text>
              <Text style={[s.body, { color: PRINT.ink }]}>
                {t(`compare.verdict.${headToHead.verdict_key}`, {
                  leader: headToHead.leader,
                  runnerUp: headToHead.runner_up,
                  confidence:
                    headToHead.psr_leader_vs_runner_up != null
                      ? Math.round(headToHead.psr_leader_vs_runner_up * 100)
                      : DASH,
                })}
              </Text>
            </View>
          ) : null}

          {meta.alignment_note ? (
            <Text style={[s.footnote, { marginTop: 4 }]}>{meta.alignment_note}</Text>
          ) : null}
        </Section>

        {returnRows.length > 0 ? (
          <Section
            title={t('compare.tiles.returns')}
            caption={t('compare.tiles.returnsSubtitle')}
            wrap={false}
          >
            <BarRowsChart rows={returnRows} width={chartWidth} />
          </Section>
        ) : null}

        {series.normalized.length > 1 ? (
          <Section
            title={t('compare.tiles.growth')}
            caption={t('compare.tiles.growthSubtitle')}
            wrap={false}
          >
            <LineSeriesChart
              series={normalizedSeries}
              xLabels={normalizedDates.map(axisDate)}
              width={chartWidth}
              height={168}
              baseline={100}
              formatY={(value) => value.toFixed(0)}
            />
            <ChartLegend entries={legend} />
          </Section>
        ) : null}

        {series.drawdown.length > 1 ? (
          <Section
            title={t('compare.tiles.drawdown')}
            caption={t('compare.tiles.drawdownSubtitle')}
            wrap={false}
          >
            <LineSeriesChart
              series={drawdownSeries}
              xLabels={drawdownDates.map(axisDate)}
              width={chartWidth}
              height={140}
              baseline={0}
              formatY={(value) => `${(value * 100).toFixed(0)}%`}
            />
            <ChartLegend entries={legend} />
          </Section>
        ) : null}

        <View style={[s.row, { alignItems: 'flex-start' }]} wrap={false}>
          <View style={{ width: halfWidth, marginRight: 8 }}>
            <Section title={t('compare.tiles.riskVsReturn')} wrap={false}>
              {scatterPoints.length > 0 ? (
                <>
                  <ScatterPlot
                    points={scatterPoints}
                    width={halfWidth}
                    height={148}
                    formatX={(value) => `${(value * 100).toFixed(0)}%`}
                    formatY={(value) => `${(value * 100).toFixed(0)}%`}
                    crosshair={
                      benchmarkPoint ? { x: benchmarkPoint.x, y: benchmarkPoint.y } : undefined
                    }
                  />
                  <Text style={s.footnote}>{t('compare.tiles.riskVsReturnCaption')}</Text>
                </>
              ) : (
                <Text style={s.bodyMuted}>{t('compare.tiles.riskVsReturnEmpty')}</Text>
              )}
            </Section>
          </View>

          <View style={{ width: halfWidth }}>
            <Section title={t('compare.tiles.correlation')} wrap={false}>
              {instruments.length >= 2 ? (
                <>
                  <CorrelationHeatmap
                    labels={instruments.map((i) => i.symbol)}
                    valueAt={(a, b) => lookupPair(pairwise.correlation, a, b)}
                    width={halfWidth}
                  />
                  <Text style={s.footnote}>{t('compare.tiles.correlationLegend')}</Text>
                  {pairwise.diversification_ratio != null ? (
                    <Text style={s.footnote}>
                      {t('compare.metrics.diversificationRatio.label')}:{' '}
                      {fmtRatio(pairwise.diversification_ratio)}
                    </Text>
                  ) : null}
                </>
              ) : (
                <Text style={s.bodyMuted}>{t('compare.tiles.correlationEmpty')}</Text>
              )}
            </Section>
          </View>
        </View>

        <View break>
          <Section title={t('compare.tiles.riskAdjustedMetrics')} first>
            <MetricMatrix instruments={instruments} rows={riskRows} t={t} comparison={comparison} />
          </Section>
        </View>

        <Section title={t('compare.tiles.valuation')}>
          <MetricMatrix
            instruments={instruments}
            rows={valuationRows}
            t={t}
            comparison={comparison}
          />
        </Section>

        {stressInstruments.length > 0 && stressEpisodes.length > 0 ? (
          <Section title={t('compare.tiles.stress')} wrap={false}>
            <DataTable
              columns={[
                {
                  key: '__symbol',
                  header: t('search.table.symbol'),
                  width: 1.2,
                  render: (instrument: InstrumentComparison) => (
                    <Text style={[s.td, { fontWeight: 600 }]}>{instrument.symbol}</Text>
                  ),
                },
                ...stressEpisodes.map<TableColumn<InstrumentComparison>>((label) => ({
                  key: label,
                  header: label,
                  width: 1,
                  align: 'right' as const,
                  render: (instrument: InstrumentComparison) => {
                    const episode = instrument.stress.find((e) => e.label === label)
                    return (
                      <Text style={[s.td, { color: printPolarityColor(episode?.return ?? null) }]}>
                        {fmtPct(episode?.return ?? null)}
                      </Text>
                    )
                  },
                })),
              ]}
              rows={stressInstruments}
              keyOf={(instrument) => instrument.symbol}
            />
          </Section>
        ) : null}

        {meta.warnings.length > 0 ? (
          <View
            style={[
              s.card,
              {
                marginTop: 12,
                borderColor: PRINT.negative,
                borderLeftWidth: 2.5,
                borderRadius: RADIUS,
              },
            ]}
            wrap={false}
          >
            {meta.warnings.map((warning) => (
              <Text key={warning} style={[s.bodyMuted, { color: PRINT.inkMuted }]}>
                {warning}
              </Text>
            ))}
          </View>
        ) : null}

        <Footnotes
          lines={[
            t('compare.footer.period', { period: meta.period }),
            t('compare.footer.dataSource'),
            t('compare.footer.totalReturnBasis'),
            t(`compare.footer.riskFreeSource.${meta.risk_free_source}`),
            t('pdf.generatedOn', { date: formatDate(generatedAt) }),
          ]}
          emphasis={t('compare.footer.disclaimer')}
        />
      </ReportPage>
    </Document>
  )
}
