import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as recurringApi from './recurringApi'
import type {
  RecurringExpenseInput,
  RecurringExpenseUpdate,
  RecurringPaymentInput,
} from './recurringApi'

export const recurringKeys = {
  all: ['recurring-expenses'] as const,
  linked: (id: number) => ['recurring-expenses', id, 'transactions'] as const,
}

export function useRecurringExpenses() {
  return useQuery({
    queryKey: recurringKeys.all,
    queryFn: async () => {
      const items = await recurringApi.listRecurringExpenses()
      return [...items].sort((a, b) => a.next_due_date.localeCompare(b.next_due_date))
    },
  })
}

export function useLinkedTransactions(id: number | null) {
  return useQuery({
    queryKey: id != null ? recurringKeys.linked(id) : ['recurring-expenses', 'transactions', 'idle'],
    queryFn: () => recurringApi.getLinkedTransactions(id!),
    enabled: id != null,
  })
}

export function useCreateRecurringExpense() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: RecurringExpenseInput) => recurringApi.createRecurringExpense(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recurringKeys.all }),
  })
}

export function useUpdateRecurringExpense() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: RecurringExpenseUpdate }) =>
      recurringApi.updateRecurringExpense(id, input),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: recurringKeys.all })
      queryClient.invalidateQueries({ queryKey: recurringKeys.linked(vars.id) })
    },
  })
}

export function useDeleteRecurringExpense() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => recurringApi.deleteRecurringExpense(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: recurringKeys.all }),
  })
}

export function useSetRecurringActive() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, active }: { id: number; active: boolean }) =>
      recurringApi.setRecurringExpenseActive(id, active),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: recurringKeys.all })
      queryClient.invalidateQueries({ queryKey: recurringKeys.linked(vars.id) })
    },
  })
}

function invalidateRecurringPaymentQueries(
  queryClient: ReturnType<typeof useQueryClient>,
  expenseId: number,
) {
  queryClient.invalidateQueries({ queryKey: recurringKeys.all })
  queryClient.invalidateQueries({ queryKey: recurringKeys.linked(expenseId) })
  queryClient.invalidateQueries({ queryKey: ['upcomingRecurringPayments'] })
  // Linked payments surface as “Recurring · …” on the transactions list.
  queryClient.invalidateQueries({ queryKey: ['transactions'] })
}

export function useRecordRecurringPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: RecurringPaymentInput }) =>
      recurringApi.recordRecurringPayment(id, input),
    onSuccess: (_data, vars) => {
      invalidateRecurringPaymentQueries(queryClient, vars.id)
    },
  })
}

export function useUpdateRecurringPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({
      expenseId,
      paymentId,
      input,
    }: {
      expenseId: number
      paymentId: number
      input: recurringApi.RecurringPaymentUpdate
    }) => recurringApi.updateRecurringPayment(expenseId, paymentId, input),
    onSuccess: (_data, vars) => {
      invalidateRecurringPaymentQueries(queryClient, vars.expenseId)
    },
  })
}

export function useDeleteRecurringPayment() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ expenseId, paymentId }: { expenseId: number; paymentId: number }) =>
      recurringApi.deleteRecurringPayment(expenseId, paymentId),
    onSuccess: (_data, vars) => {
      invalidateRecurringPaymentQueries(queryClient, vars.expenseId)
    },
  })
}
