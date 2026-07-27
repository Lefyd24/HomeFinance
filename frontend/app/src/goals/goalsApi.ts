import { apiFetch } from '../lib/apiClient'

export interface Goal {
  id: number
  user_id: number
  name: string
  description: string | null
  target_amount: number
  current_amount: number
  currency: string
  category: string | null
  icon: string | null
  color: string | null
  target_date: string | null
  status: string
  is_primary: boolean
  linked_budget_id: number | null
  linked_account_id: number | null
  progress_percentage?: number
  remaining_amount?: number
  days_remaining?: number | null
  monthly_contribution_needed?: number | null
  estimated_completion_date?: string | null
  created_at: string
  completed_at?: string | null
}

export interface GoalInput {
  name: string
  target_amount: number
  description?: string | null
  currency?: string
  category?: string | null
  icon?: string | null
  color?: string | null
  target_date?: string | null
  is_primary?: boolean
}

export type GoalUpdateInput = Partial<GoalInput> & {
  status?: string
}

export interface GoalTransaction {
  id: number
  goal_id: number
  user_id: number
  amount: number
  type: 'contribution' | 'withdrawal'
  description: string | null
  date: string
  transaction_id?: number | null
  created_at: string
}

export interface GoalTransactionInput {
  amount: number
  type: 'contribution' | 'withdrawal'
  description?: string | null
  date: string
}

export interface GoalSummary {
  total_goals: number
  active_goals: number
  completed_goals: number
  total_target_amount: number
  total_current_amount: number
  overall_progress_percentage: number
}

export interface GoalProgress {
  goal_id: number
  goal_name: string
  current_amount: number
  target_amount: number
  progress_percentage: number
  remaining_amount: number
  days_remaining: number | null
  monthly_contribution_needed: number | null
  estimated_completion_date: string | null
  on_track: boolean
  average_monthly_contribution: number
}

export function listGoals(statusFilter?: string): Promise<Goal[]> {
  const qs = statusFilter ? `?status_filter=${encodeURIComponent(statusFilter)}` : ''
  return apiFetch<Goal[]>(`/goals/${qs}`)
}

export function getGoal(id: number): Promise<Goal> {
  return apiFetch<Goal>(`/goals/${id}`)
}

export function createGoal(input: GoalInput): Promise<Goal> {
  return apiFetch<Goal>('/goals/', { method: 'POST', body: JSON.stringify(input) })
}

export function updateGoal(id: number, input: GoalUpdateInput): Promise<Goal> {
  return apiFetch<Goal>(`/goals/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

export function deleteGoal(id: number): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/goals/${id}`, { method: 'DELETE' })
}

export function getGoalsSummary(): Promise<GoalSummary> {
  return apiFetch<GoalSummary>('/goals/summary')
}

export function getGoalProgress(id: number): Promise<GoalProgress> {
  return apiFetch<GoalProgress>(`/goals/${id}/progress`)
}

export function listGoalTransactions(id: number, limit = 50): Promise<GoalTransaction[]> {
  return apiFetch<GoalTransaction[]>(`/goals/${id}/transactions?limit=${limit}`)
}

export function addGoalTransaction(
  id: number,
  input: GoalTransactionInput,
): Promise<GoalTransaction> {
  return apiFetch<GoalTransaction>(`/goals/${id}/transactions`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
