import { apiFetch } from '../lib/apiClient'

export type BudgetPeriod = 'monthly' | 'yearly' | 'custom'

export interface Budget {
  id: number
  user_id: number
  name: string
  amount: number
  period: BudgetPeriod
  start_date: string | null
  end_date: string | null
  category_ids: number[]
  is_active: boolean
  created_at: string
  spent: number
  remaining: number
  percentage: number
  period_start: string | null
  period_end: string | null
}

export interface BudgetInput {
  name: string
  amount: number
  period: BudgetPeriod
  start_date?: string | null
  end_date?: string | null
  category_ids?: number[]
}

export function listBudgets(activeOnly = true): Promise<Budget[]> {
  const qs = activeOnly ? '?active_only=true' : '?active_only=false'
  return apiFetch<Budget[]>(`/budgets/${qs}`)
}

export function createBudget(input: BudgetInput): Promise<Budget> {
  return apiFetch<Budget>('/budgets/', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
