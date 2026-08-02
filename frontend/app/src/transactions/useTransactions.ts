import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import * as transactionsApi from './transactionsApi'
import type { TransactionFilters, TransactionInput } from './transactionsApi'

function invalidateFinanceQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ['transactions'] })
  queryClient.invalidateQueries({ queryKey: queryKeys.accounts })
  queryClient.invalidateQueries({ queryKey: queryKeys.budgets })
  queryClient.invalidateQueries({ queryKey: ['spendingReport'] })
  queryClient.invalidateQueries({ queryKey: ['cashflowReport'] })
  queryClient.invalidateQueries({ queryKey: ['netWorthReport'] })
}

export function useTransactions(filters: TransactionFilters = {}) {
  return useQuery({
    queryKey: queryKeys.transactions(filters),
    queryFn: () => transactionsApi.listTransactions(filters),
  })
}

export function useCreateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: TransactionInput) => transactionsApi.createTransaction(input),
    onSuccess: () => invalidateFinanceQueries(queryClient),
  })
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<TransactionInput> }) =>
      transactionsApi.updateTransaction(id, input),
    onSuccess: () => invalidateFinanceQueries(queryClient),
  })
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      id,
      affectLinked = false,
    }: {
      id: number
      affectLinked?: boolean
    }) => transactionsApi.deleteTransaction(id, { affectLinked }),
    onSuccess: () => {
      invalidateFinanceQueries(queryClient)
      queryClient.invalidateQueries({ queryKey: queryKeys.debts })
      queryClient.invalidateQueries({ queryKey: ['recurring-expenses'] })
    },
  })
}

export function useSplitTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, parts }: { id: number; parts: transactionsApi.TransactionSplitPart[] }) =>
      transactionsApi.splitTransaction(id, parts),
    onSuccess: () => invalidateFinanceQueries(queryClient),
  })
}
