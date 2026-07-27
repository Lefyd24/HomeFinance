import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import * as transactionsApi from './transactionsApi'
import type { TransactionFilters, TransactionInput } from './transactionsApi'

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useDeleteTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => transactionsApi.deleteTransaction(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}
