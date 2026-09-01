import { useTranslation } from 'react-i18next'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Metric } from '../InvestmentPrimitives'
import type { CompanyHistory, CompanyProfile, HistoryPeriod } from '../investmentsApi'
import { AboutCard } from './AboutCard'
import { CompanyFactsCard } from './CompanyFactsCard'
import { CompanyNewsCard } from './CompanyNewsCard'
import { FundCompositionCard, TopHoldingsCard } from './FundHoldingsCard'
import {
  BalanceSheetTable,
  EarningsTable,
  ProfitabilityTable,
  ValuationTable,
} from './FundamentalTables'
import { HorizonTable } from './HorizonTable'
import { IdentityHero } from './IdentityHero'
import { PriceRangeChart } from './PriceRangeChart'
import { ReturnsHistogram } from './ReturnsHistogram'
import { RollingMetricsStrip } from './RollingMetricsStrip'
import { SnapshotChips } from './SnapshotChips'
import { TechnicalSignalsRow } from './TechnicalSignalsRow'
import { fmtCompactMoney, fmtInt, fmtPct } from './researchFormat'

/**
 * The company research report, as a bento grid.
 *
 * Twelve columns at lg, six at md, one below. Cards declare their own span so
 * the arrangement lives in one place. Charts sit above the fundamentals tables
 * deliberately — the price story is the anchor, the tables are reference you
 * scroll to.
 *
 * Two queries feed this: the profile (fundamentals) and the history (bars and
 * analytics, re-fetched on range change without disturbing the profile). Both
 * are owned by the page rather than by this component — the PDF export action
 * lives in the page header and needs the same history the charts are drawing.
 */
export function CompanyProfileView({
  profile,
  history,
  historyLoading,
  period,
  onPeriodChange,
  isWatched,
  onToggleWatch,
}: {
  profile: CompanyProfile
  history: CompanyHistory | undefined
  historyLoading: boolean
  period: HistoryPeriod
  onPeriodChange: (next: HistoryPeriod) => void
  isWatched: boolean
  onToggleWatch: () => void
}) {
  const { t } = useTranslation('investments')
  const currency = profile.currency ?? 'USD'
  const isStock = profile.quote_type === 'stock'
  const isFund = profile.quote_type === 'etf' || profile.quote_type === 'mutual_fund'

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-6 lg:grid-cols-12">
      {/* A — identity */}
      <IdentityHero
        profile={profile}
        isWatched={isWatched}
        onToggleWatch={onToggleWatch}
        className="md:col-span-6 lg:col-span-8"
      />
      <SnapshotChips profile={profile} className="md:col-span-6 lg:col-span-4" />

      {/* B — narrative */}
      <AboutCard profile={profile} className="md:col-span-6 lg:col-span-7" />
      <CompanyFactsCard profile={profile} className="md:col-span-6 lg:col-span-5" />

      {/* C — charts and signals */}
      <PriceRangeChart
        history={history}
        isLoading={historyLoading}
        period={period}
        onPeriodChange={onPeriodChange}
        currency={currency}
        className="md:col-span-6 lg:col-span-12"
      />
      <RollingMetricsStrip
        history={history}
        isLoading={historyLoading}
        className="md:col-span-6 lg:col-span-8"
      />
      <ReturnsHistogram
        history={history}
        isLoading={historyLoading}
        className="md:col-span-6 lg:col-span-4"
      />
      <TechnicalSignalsRow symbol={profile.symbol} className="md:col-span-6 lg:col-span-12" />

      {/* D — fundamentals */}
      <HorizonTable
        history={history}
        isLoading={historyLoading}
        className="md:col-span-6 lg:col-span-5"
      />

      {isStock ? (
        <>
          <ValuationTable profile={profile} className="md:col-span-3 lg:col-span-4" />
          <ProfitabilityTable profile={profile} className="md:col-span-3 lg:col-span-3" />
          <BalanceSheetTable profile={profile} className="md:col-span-6 lg:col-span-6" />
          <EarningsTable profile={profile} className="md:col-span-6 lg:col-span-6" />
        </>
      ) : isFund ? (
        <>
          <FundCompositionCard profile={profile} className="md:col-span-6 lg:col-span-7" />
          <Card size="sm" className="md:col-span-6 lg:col-span-12">
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                {t('research.valuationTitle')}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric
                  label={t('research.expenseRatio')}
                  value={fmtPct(profile.expense_ratio, { decimals: 2 })}
                  size="sm"
                />
                <Metric
                  label={t('research.aum')}
                  value={fmtCompactMoney(profile.aum, currency)}
                  size="sm"
                />
                <Metric label={t('research.category')} value={profile.category ?? '—'} size="sm" />
                <Metric
                  label={t('research.yield')}
                  value={fmtPct(profile.yield_, { decimals: 2 })}
                  size="sm"
                />
              </div>
            </CardContent>
          </Card>
          <TopHoldingsCard profile={profile} className="md:col-span-6 lg:col-span-12" />
        </>
      ) : (
        <Card size="sm" className="md:col-span-6 lg:col-span-7">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground">
              {t('research.valuationTitle')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Metric
                label={t('research.stats.marketCap')}
                value={fmtCompactMoney(profile.market_cap, currency)}
                size="sm"
              />
              <Metric
                label={t('research.circulatingSupply')}
                value={fmtInt(profile.circulating_supply)}
                size="sm"
              />
              <Metric
                label={t('research.volume24h')}
                value={fmtInt(profile.volume_24h)}
                size="sm"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* E — news */}
      <CompanyNewsCard symbol={profile.symbol} className="md:col-span-6 lg:col-span-12" />
    </div>
  )
}
