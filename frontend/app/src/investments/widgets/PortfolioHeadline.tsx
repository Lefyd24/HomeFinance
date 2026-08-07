import { useTranslation } from 'react-i18next'
import { formatCurrency } from '../../lib/format'
import { DeltaPill } from '../InvestmentPrimitives'
import type { PortfolioTotals } from '../portfolioInsights'

/**
 * The whole portfolio, in the page header.
 *
 * Deliberately not a card: it sits on the header row opposite the title, as a
 * figure rather than a panel, so the eye reads "Investments — €124,340" as one
 * line. Everything below is scoped to one account, so this is the only place
 * the grand total appears, and it should feel like part of the page's identity
 * rather than one more tile competing with the tiles.
 *
 * The return gets a badge because it is a judgement (good/bad) and needs the
 * colour; the total does not, because it is just a number and a tinted pill
 * around it would imply one.
 */
export function PortfolioHeadline({ totals }: { totals: PortfolioTotals }) {
  const { t } = useTranslation('investments')

  return (
    <div className="flex flex-col items-end gap-0.5 text-end">
      <span className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        {t('headline.totalAssets')}
      </span>
      {/* Stacks on the narrowest screens so a long total and its badge never
          squeeze the page title beside them. */}
      <div className="flex flex-col items-end gap-1 min-[380px]:flex-row min-[380px]:items-baseline min-[380px]:gap-2">
        <span className="font-heading text-lg font-semibold leading-none tabular-nums tracking-tight sm:text-2xl">
          {formatCurrency(totals.value, totals.currency)}
        </span>
        <DeltaPill pct={totals.returnPct} />
      </div>
    </div>
  )
}
