import { apiFetch } from '../lib/apiClient'

export type RuleField = 'description' | 'amount' | 'account_id' | 'type' | 'counterparty'
export type RuleMatchType = 'all' | 'any'
export type RuleOperator =
  | 'contains'
  | 'not_contains'
  | 'equals'
  | 'starts_with'
  | 'ends_with'
  | 'regex'
  | 'eq'
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'between'
  | 'not_eq'

export interface RuleCondition {
  id?: number
  field: RuleField
  operator: RuleOperator
  value?: string | null
  value_to?: string | null
}

export interface CategoryRule {
  id: number
  user_id: number
  name: string
  category_id: number
  category_name: string | null
  match_type: RuleMatchType
  priority: number
  is_active: boolean
  stop_on_match: boolean
  times_applied: number
  last_applied_at: string | null
  created_at: string | null
  updated_at: string | null
  conditions: RuleCondition[]
}

export interface CategoryRuleInput {
  name: string
  category_id: number
  match_type: RuleMatchType
  priority?: number
  is_active?: boolean
  stop_on_match?: boolean
  conditions: RuleCondition[]
  apply_to_existing?: boolean
  include_categorised?: boolean
}

export interface RulePreviewResult {
  match_count: number
  sample: Array<{
    id: number
    date: string | null
    description: string
    amount: number
    type: string
    category_id: number | null
    account_id: number
  }>
}

export function listRules(): Promise<CategoryRule[]> {
  return apiFetch<CategoryRule[]>('/rules')
}

export function createRule(payload: CategoryRuleInput): Promise<CategoryRule> {
  return apiFetch<CategoryRule>('/rules', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function updateRule(
  id: number,
  payload: Partial<CategoryRuleInput>,
): Promise<CategoryRule> {
  return apiFetch<CategoryRule>(`/rules/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  })
}

export function deleteRule(id: number): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/rules/${id}`, { method: 'DELETE' })
}

export function previewRule(payload: {
  match_type: RuleMatchType
  conditions: RuleCondition[]
  include_categorised?: boolean
  sample_size?: number
}): Promise<RulePreviewResult> {
  return apiFetch<RulePreviewResult>('/rules/preview', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function applyRule(
  id: number,
  include_categorised = false,
): Promise<{ updated: number }> {
  return apiFetch<{ updated: number }>(`/rules/${id}/apply`, {
    method: 'POST',
    body: JSON.stringify({ include_categorised }),
  })
}

export function applyAllRules(include_categorised = false): Promise<{ updated: number }> {
  return apiFetch<{ updated: number }>('/rules/apply-all', {
    method: 'POST',
    body: JSON.stringify({ include_categorised }),
  })
}

export function reorderRules(ruleIds: number[]): Promise<{ message: string }> {
  return apiFetch<{ message: string }>('/rules/reorder', {
    method: 'POST',
    body: JSON.stringify({ rule_ids: ruleIds }),
  })
}
