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

export function useCreateBudget() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: BudgetInput) => budgetsApi.createBudget(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.budgets }),
  })
}
