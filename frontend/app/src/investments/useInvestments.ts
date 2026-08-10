import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import { ApiError } from '../lib/apiClient'
import { deleteAccount } from '../accounts/accountsApi'
import * as investmentsApi from './investmentsApi'
import type { ConnectInvestmentAccountInput, UpdateInvestmentAccountInput } from './investmentsApi'

export function useInvestmentAccounts() {
  return useQuery({
    queryKey: queryKeys.investmentAccounts,
    queryFn: investmentsApi.listInvestmentAccounts,
  })
}

export function useConnectInvestmentAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: ConnectInvestmentAccountInput) =>
      investmentsApi.connectInvestmentAccount(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.investmentAccounts }),
  })
}

export function useUpdateInvestmentAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: UpdateInvestmentAccountInput }) =>
      investmentsApi.updateInvestmentAccount(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.investmentAccounts }),
  })
}

export function useUpdateInvestmentCredentials() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: { public_key: string; private_key: string } }) =>
      investmentsApi.updateInvestmentCredentials(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.investmentAccounts }),
  })
}

export function useDeleteInvestmentAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => deleteAccount(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.investmentAccounts }),
  })
}

export function useInvestmentPositions(accountId: number | null) {
  return useQuery({
    queryKey: queryKeys.investmentPositions(accountId ?? -1),
    queryFn: () => investmentsApi.getInvestmentPositions(accountId as number),
    enabled: accountId != null,
  })
}

export function useInvestmentTransactions(accountId: number | null) {
  return useQuery({
    queryKey: queryKeys.investmentTransactions(accountId ?? -1),
    queryFn: () => investmentsApi.getInvestmentTransactions(accountId as number),
    enabled: accountId != null,
  })
}

/**
 * Yield-bearing balances outside the regular position list. A provider with
 * no such product (Freedom24) answers 501 — treated as "no earn positions"
 * rather than a fetch error, so the tile can render an empty state quietly.
 */
export function useEarnPositions(accountId: number | null) {
  return useQuery({
    queryKey: queryKeys.investmentEarnPositions(accountId ?? -1),
    queryFn: () => investmentsApi.getEarnPositions(accountId as number),
    enabled: accountId != null,
    retry: (count, error) => {
      if (error instanceof ApiError && error.status === 501) return false
      return count < 2
    },
  })
}

export function useInvestmentHistory(
  accountId: number | null,
  range?: { start_date?: string; end_date?: string },
) {
  return useQuery({
    queryKey: queryKeys.investmentHistory(accountId ?? -1, range),
    queryFn: () => investmentsApi.getInvestmentHistory(accountId as number, range),
    enabled: accountId != null,
  })
}

/**
 * Positions across several accounts at once, for the "all accounts" view.
 *
 * Deliberately built on the same per-account query keys as
 * `useInvestmentPositions` rather than a combined key: a sync invalidates one
 * account, and this then re-fetches exactly that one and leaves the rest cached.
 */
export function useInvestmentPositionsForAccounts(accountIds: number[]) {
  return useQueries({
    queries: accountIds.map((id) => ({
      queryKey: queryKeys.investmentPositions(id),
      queryFn: () => investmentsApi.getInvestmentPositions(id),
    })),
    combine: (results) => ({
      data: results.flatMap((result) => result.data ?? []),
      isLoading: results.some((result) => result.isLoading),
      isError: results.some((result) => result.isError),
    }),
  })
}

export function useInvestmentTransactionsForAccounts(accountIds: number[]) {
  return useQueries({
    queries: accountIds.map((id) => ({
      queryKey: queryKeys.investmentTransactions(id),
      queryFn: () => investmentsApi.getInvestmentTransactions(id),
    })),
    combine: (results) => ({
      data: results.flatMap((result) => result.data ?? []),
      isLoading: results.some((result) => result.isLoading),
      isError: results.some((result) => result.isError),
    }),
  })
}

/**
 * History for several accounts, left as one series per account — merging them
 * needs to know which dates every account actually reported, so that decision
 * belongs to `mergeHistory` rather than here.
 */
export function useInvestmentHistoryForAccounts(
  accountIds: number[],
  range?: { start_date?: string; end_date?: string },
) {
  return useQueries({
    queries: accountIds.map((id) => ({
      queryKey: queryKeys.investmentHistory(id, range),
      queryFn: () => investmentsApi.getInvestmentHistory(id, range),
    })),
    combine: (results) => ({
      data: results.map((result) => result.data ?? []),
      isLoading: results.some((result) => result.isLoading),
      isError: results.some((result) => result.isError),
    }),
  })
}

export function useSyncInvestmentAccount() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (accountId: number) => investmentsApi.syncInvestmentAccount(accountId),
    onSuccess: (_data, accountId) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.investmentAccounts })
      queryClient.invalidateQueries({ queryKey: queryKeys.investmentPositions(accountId) })
      queryClient.invalidateQueries({ queryKey: queryKeys.investmentTransactions(accountId) })
      queryClient.invalidateQueries({ queryKey: ['investmentHistory', accountId] })
    },
  })
}

/** Ticker search. Disabled until the query is long enough to be worth a provider call. */
export function useSymbolSearch(
  query: string,
  options?: { minLength?: number; provider?: investmentsApi.MarketDataProviderId },
) {
  const trimmed = query.trim()
  const minLength = options?.minLength ?? 2
  const provider = options?.provider ?? investmentsApi.DEFAULT_MARKET_DATA_PROVIDER
  const providerReady = investmentsApi.isMarketDataProviderReady(provider)
  return useQuery({
    queryKey: queryKeys.investmentSymbolSearch(trimmed, provider),
    queryFn: () => investmentsApi.searchSymbols(trimmed, { provider }),
    enabled: providerReady && trimmed.length >= minLength,
    staleTime: 60_000,
  })
}

export function useNews(options?: {
  query?: string
  symbol?: string
  limit?: number
  offset?: number
  language?: string
  provider?: investmentsApi.MarketDataProviderId
  /** Extra gate on top of provider readiness — e.g. "only once scrolled into view". */
  enabled?: boolean
}) {
  const provider = options?.provider ?? investmentsApi.DEFAULT_MARKET_DATA_PROVIDER
  const providerReady = investmentsApi.isMarketDataProviderReady(provider)
  return useQuery({
    queryKey: queryKeys.investmentNews({ ...options, provider }),
    queryFn: () => investmentsApi.getNews({ ...options, provider }),
    enabled: providerReady && (options?.enabled ?? true),
    staleTime: 60_000,
  })
}

/** One story with its body — fetched only once a story is opened. */
export function useNewsStory(
  storyId: string | null,
  provider: investmentsApi.MarketDataProviderId = investmentsApi.DEFAULT_MARKET_DATA_PROVIDER,
) {
  const providerReady = investmentsApi.isMarketDataProviderReady(provider)
  return useQuery({
    queryKey: queryKeys.investmentNewsStory(storyId ?? '', provider),
    queryFn: () => investmentsApi.getNewsStory(storyId as string, { provider }),
    enabled: providerReady && !!storyId,
  })
}

export function useCompanyProfile(symbol: string | null) {
  const trimmed = symbol?.trim() ?? ''
  return useQuery({
    queryKey: queryKeys.investmentCompany(trimmed),
    queryFn: () => investmentsApi.getCompanyProfile(trimmed, 'yahoo'),
    enabled: trimmed.length > 0,
    staleTime: 5 * 60_000,
    // Missing tickers are a permanent 404 from Yahoo — don't hammer retries.
    retry: (count, error) => {
      if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return false
      return count < 2
    },
  })
}

/**
 * Chart bars and risk analytics for the research page.
 *
 * Separate from `useCompanyProfile` so changing the chart range refetches only
 * the (cached, cheap) price series — never the slow `ticker.info` payload.
 * `placeholderData` keeps the previous range's bars on screen while the next
 * range loads, so the chart never collapses to a skeleton mid-interaction.
 */
export function useCompanyHistory(
  symbol: string | null,
  period: investmentsApi.HistoryPeriod = '1y',
) {
  const trimmed = symbol?.trim() ?? ''
  return useQuery({
    queryKey: queryKeys.investmentCompanyHistory(trimmed, period),
    queryFn: () => investmentsApi.getCompanyHistory(trimmed, period),
    enabled: trimmed.length > 0,
    staleTime: 5 * 60_000,
    placeholderData: (previous) => previous,
    retry: (count, error) => {
      if (error instanceof ApiError && (error.status === 404 || error.status === 400)) return false
      return count < 2
    },
  })
}

export function useWatches() {
  return useQuery({
    queryKey: queryKeys.investmentWatches,
    queryFn: investmentsApi.listWatches,
    staleTime: 30_000,
  })
}

export function useSaveWatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { symbol: string; name?: string; notes?: string }) =>
      investmentsApi.saveWatch(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.investmentWatches }),
  })
}

export function useDeleteWatch() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => investmentsApi.deleteWatch(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.investmentWatches }),
  })
}
