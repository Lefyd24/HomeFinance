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

export interface BudgetSummaryTransaction {
  id: number
  date: string
  description: string
  amount: number
  category_id: number | null
  category_name: string | null
  category_color: string | null
  account_name: string | null
}

export interface BudgetSummaryPeriod {
  period_start: string
  period_end: string
  label: string
  budget_amount: number
  spent: number
  remaining: number
  percentage: number
  transactions: BudgetSummaryTransaction[]
}

export interface BudgetSummary {
  budget: {
    id: number
    name: string
    amount: number
    period: BudgetPeriod
    start_date: string | null
    end_date: string | null
  }
  year: number
  periods: BudgetSummaryPeriod[]
  year_total: {
    budget_amount: number
    spent: number
    remaining: number
    percentage: number
  }
}

export function listBudgets(activeOnly = true): Promise<Budget[]> {
  const qs = activeOnly ? '?active_only=true' : '?active_only=false'
  return apiFetch<Budget[]>(`/budgets/${qs}`)
}

export function getBudget(id: number): Promise<Budget> {
  return apiFetch<Budget>(`/budgets/${id}`)
}

export function createBudget(input: BudgetInput): Promise<Budget> {
  return apiFetch<Budget>('/budgets/', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateBudget(id: number, input: Partial<BudgetInput> & { is_active?: boolean }): Promise<Budget> {
  return apiFetch<Budget>(`/budgets/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteBudget(id: number): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/budgets/${id}`, {
    method: 'DELETE',
  })
}

export function getBudgetSummary(id: number, year?: number): Promise<BudgetSummary> {
  const qs = year != null ? `?year=${year}` : ''
  return apiFetch<BudgetSummary>(`/budgets/${id}/summary${qs}`)
}
