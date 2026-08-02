import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import * as debtsApi from './debtsApi'
import type { DebtInput, DebtPaymentInput, DebtUpdateInput } from './debtsApi'

export function useDebts(activeOnly = false) {
  return useQuery({
    queryKey: [...queryKeys.debts, activeOnly] as const,
    queryFn: () => debtsApi.listDebts(activeOnly),
  })
}

export function useDebtSummary() {
  return useQuery({
    queryKey: [...queryKeys.debts, 'summary'] as const,
    queryFn: debtsApi.getDebtSummary,
  })
}

export function useDebtPayments(debtId: number | null, enabled = true) {
  return useQuery({
    queryKey: [...queryKeys.debts, debtId, 'payments'] as const,
    queryFn: () => debtsApi.listDebtPayments(debtId!),
    enabled: enabled && debtId != null,
  })
}

export function usePayoffComparison(enabled = false) {
  return useQuery({
    queryKey: [...queryKeys.debts, 'strategies'] as const,
    queryFn: () => debtsApi.comparePayoffStrategies(0),
    enabled,
  })
}

export function useCreateDebt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: DebtInput) => debtsApi.createDebt(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.debts }),
  })
}

export function useUpdateDebt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: DebtUpdateInput }) =>
      debtsApi.updateDebt(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.debts }),
  })
}

export function useDeleteDebt() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => debtsApi.deleteDebt(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.debts }),
  })
}

export function useAddDebtPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ debtId, input }: { debtId: number; input: DebtPaymentInput }) =>
      debtsApi.addDebtPayment(debtId, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.debts })
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.debts, variables.debtId, 'payments'],
      })
      queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
  })
}

export function useUpdateDebtPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      debtId,
      paymentId,
      input,
    }: {
      debtId: number
      paymentId: number
      input: debtsApi.DebtPaymentUpdateInput
    }) => debtsApi.updateDebtPayment(debtId, paymentId, input),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.debts })
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.debts, variables.debtId, 'payments'],
      })
    },
  })
}

export function useDeleteDebtPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ debtId, paymentId }: { debtId: number; paymentId: number }) =>
      debtsApi.deleteDebtPayment(debtId, paymentId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.debts })
      queryClient.invalidateQueries({
        queryKey: [...queryKeys.debts, variables.debtId, 'payments'],
      })
    },
  })
}
