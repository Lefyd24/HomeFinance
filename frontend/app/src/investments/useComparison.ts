import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import * as comparisonApi from './comparisonApi'
import type { ComparisonPeriod, SavedComparisonInput } from './comparisonApi'

export function useComparisonBenchmarks() {
  return useQuery({
    queryKey: queryKeys.investmentCompareBenchmarks,
    queryFn: comparisonApi.listBenchmarks,
    staleTime: Infinity,
  })
}

export function useComparison(options: {
  symbols: string[]
  period: ComparisonPeriod
  benchmark?: string | null
  currency?: string | null
}) {
  const { symbols, period, benchmark, currency } = options
  return useQuery({
    queryKey: queryKeys.investmentCompare(symbols, period, benchmark, currency),
    queryFn: () => comparisonApi.compareTickers({ symbols, period, benchmark, currency }),
    enabled: symbols.length >= 2,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
  })
}

export function useSavedComparisons() {
  return useQuery({
    queryKey: queryKeys.investmentSavedComparisons,
    queryFn: comparisonApi.listSavedComparisons,
  })
}

export function useCreateSavedComparison() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: SavedComparisonInput) => comparisonApi.createSavedComparison(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.investmentSavedComparisons }),
  })
}

export function useDeleteSavedComparison() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => comparisonApi.deleteSavedComparison(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.investmentSavedComparisons }),
  })
}
