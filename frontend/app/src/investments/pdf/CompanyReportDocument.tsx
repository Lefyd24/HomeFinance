/**
 * The company research report, as paper.
 *
 * The bento grid on screen (`research/CompanyProfileView`) becomes a linear
 * document here: identity and price, the business summary and facts, the price
 * story and its risk shape, the technical read, then the fundamentals tables
 * that the grid puts below the fold. Which fundamentals blocks appear still
 * depends on `quote_type`, exactly as the screen decides it — a fund has no
 * balance sheet and a coin has no P/E.
 *
 * News and technical signals are lazy on screen (they cost a rate-limited
 * request each), so the caller fetches them on demand at export time and
 * passes whatever it got; both are optional here.
 */
import { Document, Text, View, type DocumentProps } from '@react-pdf/renderer'
import type { ReactElement } from 'react'
import {
  ChartLegend,
  Cover,
  DataTable,
  FactCard,
  Footnotes,
  ReportPage,
  Section,
  registerPdfFonts,
  s,
  upper,
  type TableColumn,
} from './pdfPrimitives'
import {
  HistogramChart,
  LineSeriesChart,
  RangeBar,
  Sparkline,
  WeightBar,
  type LineSeries,
} from './pdfCharts'
import { PAGE, PRINT, TYPE, printPolarityColor, printSeriesColor } from './pdfTheme'
import { formatDate } from '../../lib/format'
import {
  fmtCompactMoney,
  fmtCompactNumber,
  fmtInt,
  fmtMoney,
  fmtPct,
  fmtRatio,
  pctOfRange,
} from '../research/researchFormat'
import type {
  CompanyHistory,
  CompanyProfile,
  HistoryPeriod,
  HorizonStats,
  NewsItem,
} from '../investmentsApi'
import type { TechnicalResponse } from '../technicalApi'
import type { Translate } from './ComparisonReportDocument'

const DASH = '—'

/** The same four the research page surfaces — the rest stay on /technical. */
const HEADLINE_SIGNALS = ['rsi', 'macd', 'smaCross', 'bollinger'] as const

export interface CompanyReportInput {
  profile: CompanyProfile
  history?: CompanyHistory
  technical?: TechnicalResponse
  news?: NewsItem[]
  period: HistoryPeriod
  t: Translate
  generatedAt: Date
}

function axisDate(value: string): string {
  return formatDate(value, { month: 'short', year: '2-digit' })
}

/** `financial_services` -> `Financial services`, as `FundHoldingsCard` does it. */
function humanizeSector(id: string): string {
  const spaced = id.replace(/_/g, ' ')
  return spaced.charAt(0).toUpperCase() + spaced.slice(1)
}

function deltaTone(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value === 0) return PRINT.inkMuted
  return value > 0 ? PRINT.positive : PRINT.negative
}

// ---------------------------------------------------------------------------
// Identity + price
// ---------------------------------------------------------------------------

function IdentityBlock({ profile, t }: { profile: CompanyProfile; t: Translate }) {
  const currency = profile.currency ?? 'USD'
  const markerPct = pctOfRange(
    profile.current_price,
    profile.fifty_two_week_low,
    profile.fifty_two_week_high,
  )
  const barWidth = PAGE.contentWidth * 0.5

  const chips: Array<{ label: string; value: string; hint?: string }> = [
    { label: t('research.stats.marketCap'), value: fmtCompactMoney(profile.market_cap, currency) },
    { label: t('research.stats.avgVolume'), value: fmtCompactNumber(profile.average_volume) },
    { label: t('research.stats.beta'), value: fmtRatio(profile.beta) },
    {
      label: t('research.stats.recommendation'),
      value: profile.recommendation ? profile.recommendation.replace(/_/g, ' ') : DASH,
      hint:
        profile.target_mean_price != null
          ? t('research.targetHint', { value: fmtMoney(profile.target_mean_price, currency) })
          : undefined,
    },
  ]

  return (
    <View style={[s.card, { marginTop: 4 }]} wrap={false}>
      <View style={[s.row, { justifyContent: 'space-between', alignItems: 'flex-start' }]}>
        <View style={{ flex: 1, paddingRight: 10 }}>
          <Text style={s.cardTitle}>{profile.name ?? profile.short_name ?? profile.symbol}</Text>
          <Text style={[s.label, { marginTop: 2 }]}>
            {[profile.sector, profile.industry].filter(Boolean).join(' › ') || DASH}
          </Text>
        </View>
        <View style={{ alignItems: 'flex-end', paddingLeft: 8 }}>
          <Text style={s.figureLg}>{fmtMoney(profile.current_price, currency)}</Text>
          <Text
            style={[
              s.td,
              { fontWeight: 600, marginTop: 1, color: deltaTone(profile.day_change_pct) },
            ]}
          >
            {fmtPct(profile.day_change_pct != null ? profile.day_change_pct / 100 : null, {
              decimals: 2,
              signed: true,
            })}
          </Text>
        </View>
      </View>

      {markerPct != null ? (
        <View style={{ marginTop: 8, width: barWidth }}>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={s.label}>{t('research.stats.weekLow')}</Text>
            <Text style={s.label}>{t('research.rangeBarLabel')}</Text>
            <Text style={s.label}>{t('research.stats.weekHigh')}</Text>
          </View>
          <View style={{ marginVertical: 2 }}>
            <RangeBar markerPct={markerPct} width={barWidth} />
          </View>
          <View style={[s.row, { justifyContent: 'space-between' }]}>
            <Text style={[s.label, { color: PRINT.inkMuted }]}>
              {fmtMoney(profile.fifty_two_week_low, currency)}
            </Text>
            <Text style={[s.label, { color: PRINT.inkMuted }]}>
              {fmtMoney(profile.fifty_two_week_high, currency)}
            </Text>
          </View>
        </View>
      ) : null}

      <View
        style={[
          s.row,
          {
            marginTop: 9,
            borderTopWidth: 1,
            borderTopColor: PRINT.ruleSoft,
            paddingTop: 7,
            alignItems: 'flex-start',
          },
        ]}
      >
        {chips.map((chip) => (
          <View key={chip.label} style={{ flex: 1, paddingRight: 6 }}>
            <Text style={s.label}>{chip.label}</Text>
            <Text style={[s.figureSm, { marginTop: 1 }]}>{chip.value}</Text>
            {chip.hint ? <Text style={s.footnote}>{chip.hint}</Text> : null}
          </View>
        ))}
      </View>
    </View>
  )
}

// ---------------------------------------------------------------------------
// Risk & return, by horizon
// ---------------------------------------------------------------------------

interface HorizonRowSpec {
  id: string
  label: string
  render: (stats: HorizonStats) => string
  tone?: (stats: HorizonStats) => string
}

function HorizonMatrix({ horizons, t }: { horizons: HorizonStats[]; t: Translate }) {
  const rows: HorizonRowSpec[] = [
    {
      id: 'cagr',
      label: t('compare.metrics.cagr.label'),
      render: (h) => fmtPct(h.annualized_return, { signed: true }),
      tone: (h) => deltaTone(h.annualized_return),
    },
    {
      id: 'volatility',
      label: t('compare.metrics.volatility.label'),
      render: (h) => fmtPct(h.volatility),
    },
    { id: 'sharpe', label: t('compare.metrics.sharpe.label'), render: (h) => fmtRatio(h.sharpe) },
    {
      id: 'sortino',
      label: t('compare.metrics.sortino.label'),
      render: (h) => fmtRatio(h.sortino),
    },
    {
      id: 'maxDrawdown',
      label: t('compare.metrics.maxDrawdown.label'),
      render: (h) => fmtPct(h.max_drawdown),
      tone: (h) => deltaTone(h.max_drawdown),
    },
    {
      id: 'timeUnderWater',
      label: t('compare.metrics.timeUnderWater.label'),
      render: (h) => fmtInt(h.days_under_water),
    },
    { id: 'beta', label: t('compare.metrics.beta.label'), render: (h) => fmtRatio(h.beta) },
    {
      id: 'alpha',
      label: t('compare.metrics.alpha.label'),
      render: (h) => fmtPct(h.alpha, { signed: true }),
      tone: (h) => deltaTone(h.alpha),
    },
    {
      id: 'upCapture',
      label: t('compare.metrics.upCapture.label'),
      render: (h) => fmtRatio(h.up_capture),
    },
    {
      id: 'downCapture',
      label: t('compare.metrics.downCapture.label'),
      render: (h) => fmtRatio(h.down_capture),
    },
  ]

  const columns: TableColumn<HorizonRowSpec>[] = [
    {
      key: '__label',
      header: t('research.metricColumn'),
      width: 2.2,
      render: (row) => <Text style={[s.td, { fontWeight: 500 }]}>{row.label}</Text>,
    },
    ...horizons.map<TableColumn<HorizonRowSpec>>((horizon) => ({
      key: horizon.horizon,
      header: horizon.horizon.toUpperCase(),
      width: 1,
      align: 'right' as const,
      render: (row) => (
        <Text style={[s.td, { color: row.tone?.(horizon) ?? PRINT.ink }]}>
          {row.render(horizon)}
        </Text>
      ),
    })),
  ]

  return <DataTable columns={columns} rows={rows} keyOf={(row) => row.id} />
}

// ---------------------------------------------------------------------------
// The document
// ---------------------------------------------------------------------------

export function buildCompanyReport(input: CompanyReportInput): ReactElement<DocumentProps> {
  registerPdfFonts()

  const { profile, history, technical, news, period, t, generatedAt } = input
  const currency = profile.currency ?? 'USD'
  const isStock = profile.quote_type === 'stock'
  const isFund = profile.quote_type === 'etf' || profile.quote_type === 'mutual_fund'

  const chartWidth = PAGE.contentWidth
  const halfWidth = (PAGE.contentWidth - 8) / 2

  // --- price history -------------------------------------------------------
  const bars = history?.bars ?? []
  const priceSeries: LineSeries[] = [
    {
      key: 'close',
      color: printSeriesColor(0),
      values: bars.map((bar) => bar.close),
      fillOpacity: 0.09,
      strokeWidth: 1.2,
    },
    {
      key: 'sma50',
      color: printSeriesColor(1),
      values: bars.map((bar) => bar.sma50),
      strokeWidth: 0.8,
    },
    {
      key: 'sma200',
      color: printSeriesColor(2),
      values: bars.map((bar) => bar.sma200),
      strokeWidth: 0.8,
      dashed: true,
    },
  ]

  const rollingCards = history
    ? [
        {
          id: 'volatility',
          label: t('compare.metrics.volatility.label'),
          points: history.rolling_volatility,
          color: PRINT.negative,
          format: (value: number | null) => fmtPct(value),
        },
        {
          id: 'beta',
          label: t('compare.metrics.beta.label'),
          points: history.rolling_beta,
          color: PRINT.inkFaint,
          format: (value: number | null) => fmtRatio(value),
        },
        {
          id: 'sharpe',
          label: t('compare.metrics.sharpe.label'),
          points: history.rolling_sharpe,
          color: PRINT.positive,
          format: (value: number | null) => fmtRatio(value),
        },
      ]
    : []

  const signals = (technical?.signals ?? []).filter((signal) =>
    (HEADLINE_SIGNALS as readonly string[]).includes(signal.id),
  )

  const location = [profile.city, profile.state, profile.country].filter(Boolean).join(', ')
  const earningsYield =
    profile.trailing_pe != null && profile.trailing_pe !== 0 ? 1 / profile.trailing_pe : null
  const netCash =
    profile.total_cash != null && profile.total_debt != null
      ? profile.total_cash - profile.total_debt
      : null

  const sectors = profile.sector_weightings ?? []
  const maxSectorWeight = sectors.reduce((acc, sector) => Math.max(acc, sector.weight), 0)
  const holdings = profile.top_holdings ?? []
  const maxHoldingWeight = holdings.reduce((acc, holding) => Math.max(acc, holding.weight ?? 0), 0)
  const assetMix = profile.asset_classes
  const assetMixRows = assetMix
    ? (['stock', 'bond', 'cash', 'preferred', 'other'] as const)
        .map((key, index) => ({ key, value: assetMix[key] ?? 0, color: printSeriesColor(index) }))
        .filter((entry) => entry.value > 0)
    : []

  const newsItems = news ?? []

  return (
    <Document
      title={`${t('research.title')} — ${profile.symbol}`}
      author="Personal Finance"
      subject={profile.name ?? profile.symbol}
      creator="Personal Finance"
      producer="Personal Finance"
    >
      <ReportPage
        headerLeft={`${profile.symbol}${profile.exchange ? ` · ${profile.exchange}` : ''}`}
        headerRight={t('research.title')}
        footerNote={t('compare.footer.disclaimer')}
        pageLabel={(page, total) => t('pdf.page', { page, total })}
      >
        <Cover
          eyebrow={t('pdf.research.eyebrow')}
          title={profile.symbol}
          subtitle={profile.name ?? profile.short_name ?? undefined}
          meta={[
            ...(profile.quote_type ? [profile.quote_type] : []),
            ...(profile.exchange ? [profile.exchange] : []),
            `${t('research.currency')}: ${currency}`,
            t('pdf.generatedOn', { date: formatDate(generatedAt) }),
          ]}
        />

        <IdentityBlock profile={profile} t={t} />

        {profile.summary ? (
          <Section title={t('research.aboutTitle')}>
            <Text style={[s.body, { color: PRINT.inkMuted, textAlign: 'justify' }]}>
              {profile.summary}
            </Text>
          </Section>
        ) : null}

        <Section title={t('research.factsTitle')} wrap={false}>
          <FactCard
            rows={[
              { label: t('research.headquarters'), value: location || DASH },
              { label: t('research.stats.employees'), value: fmtInt(profile.employees) },
              {
                label: t('research.firstTraded'),
                value: profile.first_trade_date ? formatDate(profile.first_trade_date) : DASH,
              },
              { label: t('search.table.exchange'), value: profile.exchange ?? DASH },
              { label: t('research.currency'), value: profile.currency ?? DASH },
              {
                label: t('research.website'),
                value: profile.website ? profile.website.replace(/^https?:\/\/(www\.)?/, '') : DASH,
              },
            ]}
          />
        </Section>

        {bars.length > 1 ? (
          <Section
            title={t('research.chartTitle')}
            caption={t('research.rangeLabel') + ': ' + t(`research.ranges.${period}`)}
            wrap={false}
          >
            <LineSeriesChart
              series={priceSeries}
              xLabels={bars.map((bar) => axisDate(bar.date))}
              width={chartWidth}
              height={165}
              formatY={(value) => value.toFixed(value >= 100 ? 0 : 2)}
            />
            <ChartLegend
              entries={[
                { label: t('research.series.close'), color: printSeriesColor(0) },
                { label: t('research.series.sma50'), color: printSeriesColor(1) },
                { label: t('research.series.sma200'), color: printSeriesColor(2), dashed: true },
              ]}
            />
          </Section>
        ) : null}

        <View style={[s.row, { alignItems: 'flex-start' }]} wrap={false}>
          {rollingCards.length > 0 ? (
            <View style={{ width: halfWidth, marginRight: 8 }}>
              <Section title={t('research.rollingTitle')} wrap={false}>
                {rollingCards.map((card) => {
                  const latest =
                    card.points.length > 0 ? card.points[card.points.length - 1]!.value : null
                  return (
                    <View
                      key={card.id}
                      style={[s.card, s.cardTinted, { marginBottom: 4, paddingVertical: 5 }]}
                      wrap={false}
                    >
                      <View style={[s.row, { justifyContent: 'space-between' }]}>
                        <Text style={s.label}>{card.label}</Text>
                        <Text style={{ fontSize: TYPE.small, fontWeight: 600 }}>
                          {card.format(latest)}
                        </Text>
                      </View>
                      <View style={{ marginTop: 2 }}>
                        <Sparkline
                          values={card.points.map((point) => point.value)}
                          width={halfWidth - 18}
                          height={18}
                          color={card.color}
                        />
                      </View>
                    </View>
                  )
                })}
              </Section>
            </View>
          ) : null}

          {history && history.return_histogram.length > 0 ? (
            <View style={{ width: halfWidth }}>
              <Section
                title={t('research.distributionTitle')}
                caption={t('research.distributionCount', { count: history.return_observations })}
                wrap={false}
              >
                <HistogramChart
                  bins={history.return_histogram}
                  width={halfWidth}
                  height={112}
                  formatX={(value) => fmtPct(value, { decimals: 1 })}
                />
              </Section>
            </View>
          ) : null}
        </View>

        {signals.length > 0 ? (
          <Section title={t('research.signalsTitle')} wrap={false}>
            <View style={s.row}>
              {signals.map((signal) => (
                <View
                  key={signal.id}
                  style={[
                    s.card,
                    {
                      flex: 1,
                      marginRight: 5,
                      borderLeftWidth: 2,
                      borderLeftColor: printPolarityColor(signal.direction),
                    },
                  ]}
                >
                  <Text style={s.label}>{t(`technical.signals.ids.${signal.id}`)}</Text>
                  <Text style={[s.figureSm, { marginTop: 1 }]}>{fmtRatio(signal.value)}</Text>
                </View>
              ))}
            </View>
          </Section>
        ) : null}

        {history && history.horizons.length > 0 ? (
          <Section title={t('research.horizonsTitle')} wrap={false}>
            <HorizonMatrix horizons={history.horizons} t={t} />
          </Section>
        ) : null}

        {isStock ? (
          <>
            <View break>
              <Section title={t('pdf.research.fundamentals')} first wrap={false}>
                <View style={[s.row, { alignItems: 'flex-start' }]}>
                  <FactCard
                    title={t('research.valuationTitle')}
                    style={{ width: halfWidth, marginRight: 8 }}
                    rows={[
                      { label: t('research.stats.pe'), value: fmtRatio(profile.trailing_pe) },
                      { label: t('research.stats.forwardPe'), value: fmtRatio(profile.forward_pe) },
                      { label: t('research.pegRatio'), value: fmtRatio(profile.peg_ratio) },
                      { label: t('research.priceToBook'), value: fmtRatio(profile.price_to_book) },
                      {
                        label: t('research.priceToSales'),
                        value: fmtRatio(profile.price_to_sales),
                      },
                      { label: t('research.evToEbitda'), value: fmtRatio(profile.ev_to_ebitda) },
                      { label: t('research.evToSales'), value: fmtRatio(profile.ev_to_sales) },
                      { label: t('research.earningsYield'), value: fmtPct(earningsYield) },
                      { label: t('research.fcfYield'), value: fmtPct(profile.fcf_yield) },
                      {
                        label: t('research.stats.dividendYield'),
                        value:
                          profile.dividend_yield != null
                            ? `${profile.dividend_yield.toFixed(2)}%`
                            : DASH,
                      },
                      { label: t('research.payoutRatio'), value: fmtPct(profile.payout_ratio) },
                    ]}
                  />
                  <FactCard
                    title={t('research.profitabilityTitle')}
                    style={{ width: halfWidth }}
                    rows={[
                      { label: t('research.roe'), value: fmtPct(profile.roe) },
                      { label: t('research.roa'), value: fmtPct(profile.return_on_assets) },
                      { label: t('research.grossMargin'), value: fmtPct(profile.gross_margin) },
                      {
                        label: t('research.operatingMargin'),
                        value: fmtPct(profile.operating_margin),
                      },
                      { label: t('research.profitMargin'), value: fmtPct(profile.profit_margin) },
                      {
                        label: t('research.revenueGrowth'),
                        value: fmtPct(profile.revenue_growth, { signed: true }),
                        tone: deltaTone(profile.revenue_growth),
                      },
                      {
                        label: t('research.earningsGrowth'),
                        value: fmtPct(profile.earnings_growth, { signed: true }),
                        tone: deltaTone(profile.earnings_growth),
                      },
                    ]}
                  />
                </View>

                <View style={[s.row, { alignItems: 'flex-start', marginTop: 8 }]}>
                  <FactCard
                    title={t('research.balanceSheetTitle')}
                    style={{ width: halfWidth, marginRight: 8 }}
                    rows={[
                      {
                        label: t('research.totalCash'),
                        value: fmtCompactMoney(profile.total_cash, currency),
                      },
                      {
                        label: t('research.totalDebt'),
                        value: fmtCompactMoney(profile.total_debt, currency),
                      },
                      {
                        label: t('research.netCash'),
                        value: fmtCompactMoney(netCash, currency),
                        tone: deltaTone(netCash),
                      },
                      {
                        label: t('research.debtToEquity'),
                        value: fmtRatio(profile.debt_to_equity),
                      },
                      {
                        label: t('research.debtToEbitda'),
                        value: fmtRatio(profile.debt_to_ebitda),
                      },
                      { label: t('research.currentRatio'), value: fmtRatio(profile.current_ratio) },
                      { label: t('research.quickRatio'), value: fmtRatio(profile.quick_ratio) },
                      {
                        label: t('research.bookValue'),
                        value: fmtMoney(profile.book_value, currency),
                      },
                    ]}
                  />
                  <FactCard
                    title={t('research.earningsTitle')}
                    style={{ width: halfWidth }}
                    rows={[
                      {
                        label: t('research.revenueTtm'),
                        value: fmtCompactMoney(profile.total_revenue, currency),
                      },
                      {
                        label: t('research.ebitda'),
                        value: fmtCompactMoney(profile.ebitda, currency),
                      },
                      {
                        label: t('research.trailingEps'),
                        value: fmtMoney(profile.trailing_eps, currency),
                      },
                      {
                        label: t('research.forwardEps'),
                        value: fmtMoney(profile.forward_eps, currency),
                      },
                      {
                        label: t('research.stats.target'),
                        value: fmtMoney(profile.target_mean_price, currency),
                      },
                      { label: t('research.analystCount'), value: fmtInt(profile.analyst_count) },
                    ]}
                  />
                </View>
              </Section>
            </View>

            {(profile.earnings_history ?? []).length > 0 ? (
              <Section title={t('research.surpriseTitle')} wrap={false}>
                <DataTable
                  columns={[
                    {
                      key: 'quarter',
                      header: t('research.surpriseTitle'),
                      width: 1.4,
                      render: (row) => (
                        <Text style={[s.td, { fontWeight: 500 }]}>{row.quarter}</Text>
                      ),
                    },
                    {
                      key: 'actual',
                      header: t('research.trailingEps'),
                      width: 1,
                      align: 'right' as const,
                      render: (row) => <Text style={s.td}>{fmtRatio(row.eps_actual)}</Text>,
                    },
                    {
                      key: 'estimate',
                      header: t('research.forwardEps'),
                      width: 1,
                      align: 'right' as const,
                      render: (row) => <Text style={s.tdMuted}>{fmtRatio(row.eps_estimate)}</Text>,
                    },
                    {
                      key: 'surprise',
                      header: '%',
                      width: 1,
                      align: 'right' as const,
                      render: (row) => (
                        <Text style={[s.td, { color: deltaTone(row.surprise_pct) }]}>
                          {fmtPct(row.surprise_pct, { signed: true })}
                        </Text>
                      ),
                    },
                  ]}
                  rows={profile.earnings_history}
                  keyOf={(row) => row.quarter}
                />
              </Section>
            ) : null}
          </>
        ) : isFund ? (
          <View break>
            <Section title={t('research.valuationTitle')} first wrap={false}>
              <View style={[s.card, s.row]}>
                {[
                  {
                    label: t('research.expenseRatio'),
                    value: fmtPct(profile.expense_ratio, { decimals: 2 }),
                  },
                  { label: t('research.aum'), value: fmtCompactMoney(profile.aum, currency) },
                  { label: t('research.category'), value: profile.category ?? DASH },
                  { label: t('research.yield'), value: fmtPct(profile.yield_, { decimals: 2 }) },
                ].map((entry) => (
                  <View key={entry.label} style={{ flex: 1, paddingRight: 6 }}>
                    <Text style={s.label}>{entry.label}</Text>
                    <Text style={[s.figureSm, { marginTop: 1 }]}>{entry.value}</Text>
                  </View>
                ))}
              </View>
            </Section>

            {sectors.length > 0 || assetMixRows.length > 0 ? (
              <Section
                title={t('research.compositionTitle')}
                caption={profile.fund_family ?? undefined}
                wrap={false}
              >
                <View style={s.row}>
                  {sectors.length > 0 ? (
                    <View style={[s.card, { width: halfWidth, marginRight: 8 }]}>
                      <Text style={[s.sectionTitle, { marginBottom: 4 }]}>
                        {upper(t('research.sectorWeightings'))}
                      </Text>
                      {sectors.map((sector) => (
                        <View
                          key={sector.sector}
                          style={[s.row, { paddingVertical: 1.5 }]}
                          wrap={false}
                        >
                          <Text style={[s.tdMuted, { width: 72 }]}>
                            {humanizeSector(sector.sector)}
                          </Text>
                          <View style={{ flex: 1, paddingHorizontal: 4 }}>
                            <WeightBar
                              fraction={maxSectorWeight > 0 ? sector.weight / maxSectorWeight : 0}
                              width={halfWidth - 72 - 44}
                              color={printSeriesColor(1)}
                            />
                          </View>
                          <Text style={[s.tdMuted, { width: 28, textAlign: 'right' }]}>
                            {fmtPct(sector.weight, { decimals: 0 })}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}

                  {assetMixRows.length > 0 ? (
                    <View style={[s.card, { width: halfWidth }]}>
                      <Text style={[s.sectionTitle, { marginBottom: 4 }]}>
                        {upper(t('research.assetMix'))}
                      </Text>
                      {assetMixRows.map((entry) => (
                        <View
                          key={entry.key}
                          style={[s.row, { justifyContent: 'space-between', paddingVertical: 2 }]}
                        >
                          <View style={s.row}>
                            <View style={[s.swatch, { backgroundColor: entry.color }]} />
                            <Text style={s.td}>{t(`research.assetClasses.${entry.key}`)}</Text>
                          </View>
                          <Text style={[s.td, { fontWeight: 600 }]}>
                            {fmtPct(entry.value, { decimals: 1 })}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              </Section>
            ) : null}

            {holdings.length > 0 ? (
              <Section title={t('research.holdingsTitle')} wrap={false}>
                <DataTable
                  columns={[
                    {
                      key: 'symbol',
                      header: t('search.table.symbol'),
                      width: 1,
                      render: (row) => (
                        <Text style={[s.td, { fontWeight: 600 }]}>{row.symbol}</Text>
                      ),
                    },
                    {
                      key: 'name',
                      header: t('search.table.name'),
                      width: 3,
                      render: (row) => <Text style={s.tdMuted}>{row.name ?? DASH}</Text>,
                    },
                    {
                      key: 'bar',
                      header: '',
                      width: 2,
                      render: (row) => (
                        <WeightBar
                          fraction={maxHoldingWeight > 0 ? (row.weight ?? 0) / maxHoldingWeight : 0}
                          width={100}
                        />
                      ),
                    },
                    {
                      key: 'weight',
                      header: '%',
                      width: 0.8,
                      align: 'right' as const,
                      render: (row) => <Text style={s.td}>{fmtPct(row.weight)}</Text>,
                    },
                  ]}
                  rows={holdings}
                  keyOf={(row) => row.symbol}
                />
              </Section>
            ) : null}
          </View>
        ) : (
          <Section title={t('research.valuationTitle')} wrap={false}>
            <View style={[s.card, s.row]}>
              {[
                {
                  label: t('research.stats.marketCap'),
                  value: fmtCompactMoney(profile.market_cap, currency),
                },
                {
                  label: t('research.circulatingSupply'),
                  value: fmtInt(profile.circulating_supply),
                },
                { label: t('research.volume24h'), value: fmtInt(profile.volume_24h) },
              ].map((entry) => (
                <View key={entry.label} style={{ flex: 1, paddingRight: 6 }}>
                  <Text style={s.label}>{entry.label}</Text>
                  <Text style={[s.figureSm, { marginTop: 1 }]}>{entry.value}</Text>
                </View>
              ))}
            </View>
          </Section>
        )}

        {newsItems.length > 0 ? (
          <Section title={t('research.newsTitle')}>
            {newsItems.map((item) => (
              <View
                key={item.story_id}
                style={{
                  borderTopWidth: 1,
                  borderTopColor: PRINT.ruleSoft,
                  paddingVertical: 3.5,
                }}
                wrap={false}
              >
                <Text style={[s.td, { fontWeight: 500 }]}>{item.title}</Text>
                <Text style={s.footnote}>
                  {[item.source, item.published_at ? formatDate(item.published_at) : null]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </View>
            ))}
          </Section>
        ) : null}

        <Footnotes
          lines={[
            t('compare.footer.dataSource'),
            ...(history ? [t('research.rangeLabel') + ': ' + t(`research.ranges.${period}`)] : []),
            t('pdf.generatedOn', { date: formatDate(generatedAt) }),
          ]}
          emphasis={t('compare.footer.disclaimer')}
        />
      </ReportPage>
    </Document>
  )
}
