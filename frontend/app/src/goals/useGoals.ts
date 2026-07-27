import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { queryKeys } from '../lib/queryKeys'
import * as goalsApi from './goalsApi'
import type { GoalInput, GoalTransactionInput, GoalUpdateInput } from './goalsApi'

export function useGoals(statusFilter?: string) {
  return useQuery({
    queryKey: [...queryKeys.goals, statusFilter ?? 'all'] as const,
    queryFn: () => goalsApi.listGoals(statusFilter),
  })
}

export function useGoalsSummary() {
  return useQuery({
    queryKey: [...queryKeys.goals, 'summary'] as const,
    queryFn: goalsApi.getGoalsSummary,
  })
}

export function useGoalTransactions(goalId: number | null) {
  return useQuery({
    queryKey: [...queryKeys.goals, goalId, 'transactions'] as const,
    queryFn: () => goalsApi.listGoalTransactions(goalId!),
    enabled: goalId != null,
  })
}

export function useGoalProgress(goalId: number | null) {
  return useQuery({
    queryKey: [...queryKeys.goals, goalId, 'progress'] as const,
    queryFn: () => goalsApi.getGoalProgress(goalId!),
    enabled: goalId != null,
  })
}

export function useCreateGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: GoalInput) => goalsApi.createGoal(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.goals }),
  })
}

export function useUpdateGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: GoalUpdateInput }) =>
      goalsApi.updateGoal(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.goals }),
  })
}

export function useDeleteGoal() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => goalsApi.deleteGoal(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.goals }),
  })
}

export function useAddGoalTransaction() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: GoalTransactionInput }) =>
      goalsApi.addGoalTransaction(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.goals }),
  })
}
