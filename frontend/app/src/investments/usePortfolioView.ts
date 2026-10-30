import { useMemo } from 'react'
import {
  useInvestmentPositions,
  useInvestmentPositionsForAccounts,
  useInvestmentTransactions,
  useInvestmentTransactionsForAccounts,
  usePortfolioPerformance,
} from './useInvestments'
import {
  aggregateTotals,
  buildInsights,
  type Insight,
  type PortfolioScope,
  type PortfolioTotals,
} from './portfolioInsights'
import type { PerformanceRangeKey } from './performanceView'
import type {
  InvestmentAccount,
  InvestmentTransaction,
  PortfolioPerformance,
  PortfolioPosition,
} from './investmentsApi'

export interface PortfolioView {
  /** The accounts the current scope covers — one, or all of them. */
  accounts: InvestmentAccount[]
  /** Null only when the scope spans currencies that cannot be summed. */
  totals: PortfolioTotals | null
  positions: PortfolioPosition[]
  transactions: InvestmentTransaction[]
  /** Flow-adjusted performance for the scope and range; undefined until it loads or if it failed. */
  performance: PortfolioPerformance | undefined
  /** Why performance is missing, e.g. the 422 for accounts in different currencies. */
  performanceError: Error | null
  insights: Insight[]
  isLoading: boolean
  isPerformanceLoading: boolean
}

/**
 * Everything the investments overview renders, for whichever scope is selected.
 *
 * The page used to be a list of accounts with a detail panel underneath, which
 * meant the same figures were computed in two places and shown twice. Here the
 * scope is the only state that matters: picking an account re-points every tile
 * at it, and "all accounts" is just the scope that happens to cover all of them.
 *
 * Both branches run their hooks unconditionally — `useQueries` with an empty
 * list is a no-op — so the hook order is stable regardless of scope.
 */
export function usePortfolioView(
  allAccounts: InvestmentAccount[],
  scope: PortfolioScope,
  range: PerformanceRangeKey,
): PortfolioView {
  const accounts = useMemo(
    () =>
      scope.kind === 'all'
        ? allAccounts
        : allAccounts.filter((account) => account.id === scope.id),
    [allAccounts, scope],
  )

  const singleId = scope.kind === 'account' ? scope.id : null
  const manyIds = useMemo(
    () => (scope.kind === 'all' ? allAccounts.map((a) => a.id) : []),
    [allAccounts, scope],
  )

  const singlePositions = useInvestmentPositions(singleId)
  const singleTransactions = useInvestmentTransactions(singleId)

  const manyPositions = useInvestmentPositionsForAccounts(manyIds)
  const manyTransactions = useInvestmentTransactionsForAccounts(manyIds)
  const performance = usePortfolioPerformance(singleId != null ? [singleId] : manyIds, range)

  const isAll = scope.kind === 'all'
  // Memoised because the single-account branch's `?? []` would otherwise mint a
  // new array every render and invalidate everything downstream of it.
  const positions = useMemo(
    () => (isAll ? manyPositions.data : (singlePositions.data ?? [])),
    [isAll, manyPositions.data, singlePositions.data],
  )

  const transactions = useMemo(() => {
    const rows = isAll ? manyTransactions.data : (singleTransactions.data ?? [])
    // Several accounts arrive as separate already-sorted runs, so the combined
    // list has to be re-sorted before anything can call it "recent activity".
    return [...rows].sort((a, b) => b.date.localeCompare(a.date))
  }, [isAll, manyTransactions.data, singleTransactions.data])

  const totals = useMemo(() => aggregateTotals(accounts), [accounts])

  const insights = useMemo(
    () => (totals ? buildInsights(totals, positions) : []),
    [totals, positions],
  )

  return {
    accounts,
    totals,
    positions,
    transactions,
    performance: performance.data,
    performanceError: performance.error,
    insights,
    isLoading: isAll ? manyPositions.isLoading : singlePositions.isLoading,
    isPerformanceLoading: performance.isLoading,
  }
}
