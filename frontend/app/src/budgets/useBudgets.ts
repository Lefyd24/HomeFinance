import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import * as budgetsApi from './budgetsApi'
import type { BudgetInput } from './budgetsApi'

export function useBudgets(activeOnly = true) {
  return useQuery({
    queryKey: [...queryKeys.budgets, { activeOnly }],
    queryFn: () => budgetsApi.listBudgets(activeOnly),
  })
}

export function useBudgetSummary(budgetId: number | null, year: number) {
  return useQuery({
    queryKey: [...queryKeys.budgets, budgetId, 'summary', year],
    queryFn: () => budgetsApi.getBudgetSummary(budgetId!, year),
    enabled: budgetId != null,
  })
}

export function useCreateBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: BudgetInput) => budgetsApi.createBudget(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.budgets }),
  })
}

export function useUpdateBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: Partial<BudgetInput> & { is_active?: boolean } }) =>
      budgetsApi.updateBudget(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.budgets }),
  })
}

export function useDeleteBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => budgetsApi.deleteBudget(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.budgets }),
  })
}
