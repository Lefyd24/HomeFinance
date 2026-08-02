import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as rulesApi from './rulesApi'
import type { CategoryRuleInput, RuleCondition, RuleMatchType } from './rulesApi'

const keys = {
  all: ['category-rules'] as const,
}

export function useRules() {
  return useQuery({ queryKey: keys.all, queryFn: rulesApi.listRules })
}

export function useCreateRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (payload: CategoryRuleInput) => rulesApi.createRule(payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useUpdateRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<CategoryRuleInput> }) =>
      rulesApi.updateRule(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useDeleteRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => rulesApi.deleteRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useApplyRule() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ id, includeCategorised }: { id: number; includeCategorised?: boolean }) =>
      rulesApi.applyRule(id, includeCategorised ?? false),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export function useApplyAllRules() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (includeCategorised?: boolean) =>
      rulesApi.applyAllRules(includeCategorised ?? false),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.all }),
  })
}

export function usePreviewRule() {
  return useMutation({
    mutationFn: (payload: {
      match_type: RuleMatchType
      conditions: RuleCondition[]
      include_categorised?: boolean
    }) => rulesApi.previewRule(payload),
  })
}
