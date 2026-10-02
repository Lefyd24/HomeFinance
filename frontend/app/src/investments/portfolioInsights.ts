import type {
  InvestmentAccount,
  PortfolioPosition,
  PortfolioSnapshot,
} from './investmentsApi'

/**
 * Everything the investments overview derives from the raw API rows.
 *
 * Kept free of React and of i18n on purpose: these are the parts that are easy
 * to get subtly wrong (mixed currencies, missing quotes, empty portfolios), so
 * they should be testable without rendering anything, and the widgets above
 * them should only have to lay out numbers someone else already reasoned about.
 *
 * The one rule that runs through all of it: the app never invents an exchange
 * rate. The backend converts each instrument into its account's currency during
 * sync, so figures are comparable *within* an account. Across accounts they are
 * only comparable when the accounts agree on a currency — otherwise the totals
 * refuse to exist rather than quietly adding euros to dollars.
 */

/** What the page is currently looking at: everything, or one account. */
export type PortfolioScope = { kind: 'all' } | { kind: 'account'; id: number }

export const ALL_ACCOUNTS: PortfolioScope = { kind: 'all' }

export interface PortfolioTotals {
  currency: string
  /** Total value — invested plus cash. */
  value: number
  invested: number
  cash: number
  costBasis: number
  pnl: number
  returnPct: number | null
  /** Null when nothing in scope has a live quote. */
  dayChange: number | null
  dayChangePct: number | null
  positionCount: number
  accountCount: number
}

/** The market value of a position in its account's currency. */
export function positionValue(position: PortfolioPosition): number {
  return position.market_value_base ?? position.market_value
}

/** The unrealised gain of a position in its account's currency. */
export function positionPnl(position: PortfolioPosition): number {
  return position.unrealized_pnl_base ?? position.unrealized_pnl ?? 0
}

/**
 * Whether a set of accounts can be summed at all. One currency across the
 * board, or nothing.
 */
export function sharedCurrency(accounts: InvestmentAccount[]): string | null {
  if (accounts.length === 0) return null
  const first = accounts[0].currency
  return accounts.every((account) => account.currency === first) ? first : null
}

/**
 * Aggregate account rows. Returns null when the accounts disagree on currency —
 * the caller is expected to fall back to a single account rather than show a
 * meaningless sum.
 */
export function aggregateTotals(accounts: InvestmentAccount[]): PortfolioTotals | null {
  const currency = sharedCurrency(accounts)
  if (currency == null) return null

  const costBasis = accounts.reduce((sum, a) => sum + a.total_cost_basis, 0)
  const pnl = accounts.reduce((sum, a) => sum + a.total_unrealized_pnl, 0)

  // Only accounts with a live quote contribute to the day figure. A broker
  // outage should read as a smaller sample, never as a confident 0%.
  const quoted = accounts.filter((a) => a.day_change != null)
  const dayChange = quoted.reduce((sum, a) => sum + (a.day_change ?? 0), 0)
  const dayOpen = quoted.reduce((sum, a) => sum + a.total_market_value - (a.day_change ?? 0), 0)

  return {
    currency,
    value: accounts.reduce((sum, a) => sum + (a.balance ?? 0), 0),
    invested: accounts.reduce((sum, a) => sum + a.total_market_value, 0),
    cash: accounts.reduce((sum, a) => sum + a.cash_balance, 0),
    costBasis,
    pnl,
    returnPct: costBasis ? (pnl / costBasis) * 100 : null,
    dayChange: quoted.length > 0 ? dayChange : null,
    dayChangePct: dayOpen > 0 ? (dayChange / dayOpen) * 100 : null,
    positionCount: accounts.reduce((sum, a) => sum + a.position_count, 0),
    accountCount: accounts.length,
  }
}

/**
 * Merge daily snapshots from several accounts into one series.
 *
 * A date is only included when every account reported on it — a partial date
 * would show as a cliff in the chart, which reads as "you lost money" rather
 * than "one broker hadn't synced yet".
 */
export function mergeHistory(
  series: PortfolioSnapshot[][],
  currency: string,
): PortfolioSnapshot[] {
  if (series.length === 0) return []
  if (series.length === 1) return [...series[0]].sort((a, b) => a.date.localeCompare(b.date))

  const byDate = new Map<string, { snapshot: PortfolioSnapshot; seen: number }>()
  for (const snapshots of series) {
    for (const snapshot of snapshots) {
      const existing = byDate.get(snapshot.date)
      if (existing) {
        existing.snapshot.total_value += snapshot.total_value
        existing.snapshot.cash_balance += snapshot.cash_balance
        existing.snapshot.positions_value += snapshot.positions_value
        existing.seen += 1
      } else {
        byDate.set(snapshot.date, { snapshot: { ...snapshot, currency }, seen: 1 })
      }
    }
  }

  return [...byDate.values()]
    .filter((entry) => entry.seen === series.length)
    .map((entry) => entry.snapshot)
    .sort((a, b) => a.date.localeCompare(b.date))
}

export interface DailyReturn {
  date: string
  /** Percent change in total value since the previous snapshot. */
  pct: number
}

/**
 * Day-over-day change in total value, as a percentage.
 *
 * Snapshots only carry balances, so a deposit or withdrawal shows up as a
 * return on the day it lands. A day is skipped when the previous total was not
 * positive — there is nothing to measure a percentage against.
 */
export function dailyReturns(history: PortfolioSnapshot[]): DailyReturn[] {
  const returns: DailyReturn[] = []
  for (let i = 1; i < history.length; i++) {
    const previous = history[i - 1].total_value
    if (previous <= 0) continue
    returns.push({ date: history[i].date, pct: (history[i].total_value / previous - 1) * 100 })
  }
  return returns
}

/**
 * Holdings that moved today, biggest move first, split by direction.
 *
 * `quoted` is reported alongside so the widget can say how much of the
 * portfolio this actually covers instead of implying it covers all of it.
 */
export function topMovers(positions: PortfolioPosition[], limit = 4) {
  const quoted = positions.filter((p) => p.day_change_pct != null)
  const sorted = [...quoted].sort((a, b) => (b.day_change_pct ?? 0) - (a.day_change_pct ?? 0))
  const gainers = sorted.filter((p) => (p.day_change_pct ?? 0) > 0).slice(0, limit)
  const losers = sorted
    .filter((p) => (p.day_change_pct ?? 0) < 0)
    .reverse()
    .slice(0, limit)
  return { gainers, losers, quoted: quoted.length, total: positions.length }
}

/** Holdings ranked by how much money they have actually made or lost. */
export function topContributors(positions: PortfolioPosition[], limit = 3) {
  const sorted = [...positions].sort((a, b) => positionPnl(b) - positionPnl(a))
  return {
    best: sorted.filter((p) => positionPnl(p) > 0).slice(0, limit),
    worst: sorted.filter((p) => positionPnl(p) < 0).reverse().slice(0, limit),
  }
}

export interface Concentration {
  /** The largest single holding, and what share of the invested money it is. */
  largest: PortfolioPosition | null
  largestPct: number
  /** Herfindahl index over holding weights: 1 is everything in one position. */
  hhi: number
  /** Roughly "how many holdings this portfolio behaves like". */
  effectiveHoldings: number
  /** True once one holding dominates enough to be worth mentioning. */
  isConcentrated: boolean
}

/** How much of the portfolio rides on its biggest position. */
export function concentration(positions: PortfolioPosition[]): Concentration {
  const total = positions.reduce((sum, p) => sum + positionValue(p), 0)
  if (total <= 0 || positions.length === 0) {
    return { largest: null, largestPct: 0, hhi: 0, effectiveHoldings: 0, isConcentrated: false }
  }

  const shares = positions.map((p) => positionValue(p) / total)
  const hhi = shares.reduce((sum, share) => sum + share * share, 0)
  const largestIndex = shares.reduce((best, share, i) => (share > shares[best] ? i : best), 0)
  const largestPct = shares[largestIndex] * 100

  return {
    largest: positions[largestIndex],
    largestPct,
    hhi,
    effectiveHoldings: 1 / hhi,
    // A third of the money in one name is the point where it stops being a
    // diversified portfolio and starts being a bet on one company.
    isConcentrated: largestPct >= 33,
  }
}

export interface CashDrag {
  pct: number
  /** True once idle cash is a large enough share to be a deliberate choice. */
  isHigh: boolean
}

/** How much of the pot is sitting in cash rather than invested. */
export function cashDrag(totals: PortfolioTotals): CashDrag {
  const pct = totals.value > 0 ? (totals.cash / totals.value) * 100 : 0
  return { pct, isHigh: pct >= 20 }
}

/** How loud a plain-English note should be. */
export type InsightTone = 'good' | 'neutral' | 'watch'

export interface Insight {
  id: string
  tone: InsightTone
  /** Key within the `investments` namespace, under `insights.`. */
  messageKey: string
  values: Record<string, string | number>
}

/**
 * The page's plain-English read of the portfolio.
 *
 * Deliberately sentences rather than more labelled numbers: the tiles around it
 * already show the figures, and the thing a non-expert cannot do is turn "AAPL
 * 41% weight" into "you're heavily reliant on one company". Only says things
 * that are actually true of *this* portfolio — no filler, so an empty list is a
 * valid and honest outcome.
 *
 * Returns keys and interpolation values rather than strings so the caller owns
 * translation and currency formatting.
 */
export function buildInsights(
  totals: PortfolioTotals,
  positions: PortfolioPosition[],
): Insight[] {
  const insights: Insight[] = []
  if (positions.length === 0) return insights

  const conc = concentration(positions)
  if (conc.largest && conc.isConcentrated) {
    insights.push({
      id: 'concentration',
      tone: 'watch',
      messageKey: 'insights.concentrated',
      values: { symbol: conc.largest.symbol, pct: conc.largestPct.toFixed(0) },
    })
    // Four effective holdings puts the largest at roughly a quarter, comfortably
    // under the concentration threshold above — so the two branches meet rather
    // than leaving portfolios in between with nothing said about them. Not five:
    // five equal holdings computes as 4.999… in floating point.
  } else if (conc.effectiveHoldings >= 4) {
    insights.push({
      id: 'diversified',
      tone: 'good',
      messageKey: 'insights.diversified',
      values: { count: positions.length, effective: Math.round(conc.effectiveHoldings) },
    })
  }

  const cash = cashDrag(totals)
  if (cash.isHigh) {
    insights.push({
      id: 'cash',
      tone: 'watch',
      messageKey: 'insights.cashHeavy',
      values: { pct: cash.pct.toFixed(0) },
    })
  }

  if (totals.returnPct != null) {
    insights.push({
      id: 'return',
      tone: totals.pnl > 0 ? 'good' : totals.pnl < 0 ? 'watch' : 'neutral',
      messageKey: totals.pnl >= 0 ? 'insights.upOverall' : 'insights.downOverall',
      values: { pct: Math.abs(totals.returnPct).toFixed(1) },
    })
  }

  const { best, worst } = topContributors(positions, 1)
  if (best[0]) {
    insights.push({
      id: 'best',
      tone: 'good',
      messageKey: 'insights.bestHolding',
      values: { symbol: best[0].symbol },
    })
  }
  if (worst[0]) {
    insights.push({
      id: 'worst',
      tone: 'watch',
      messageKey: 'insights.worstHolding',
      values: { symbol: worst[0].symbol },
    })
  }

  const movers = topMovers(positions)
  if (movers.quoted > 0 && movers.quoted < movers.total) {
    insights.push({
      id: 'staleQuotes',
      tone: 'neutral',
      messageKey: 'insights.partialQuotes',
      values: { quoted: movers.quoted, total: movers.total },
    })
  }

  return insights
}
