import type { Goal } from './goalsApi'

export const CATEGORY_OPTIONS = [
  { value: 'emergency_fund', label: 'Emergency Fund' },
  { value: 'vacation', label: 'Vacation' },
  { value: 'car', label: 'Car Purchase' },
  { value: 'home', label: 'Home Purchase' },
  { value: 'education', label: 'Education' },
  { value: 'retirement', label: 'Retirement' },
  { value: 'other', label: 'Other' },
] as const

export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
)

export const ICON_OPTIONS = [
  { value: '🎯', label: 'Target' },
  { value: '💰', label: 'Money' },
  { value: '🏠', label: 'Home' },
  { value: '🚗', label: 'Car' },
  { value: '✈️', label: 'Travel' },
  { value: '🎓', label: 'Education' },
  { value: '🏥', label: 'Health' },
  { value: '🎁', label: 'Gift' },
] as const

export const CURRENCY_OPTIONS = [
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'GBP', label: 'GBP (£)' },
] as const

export const NONE_CATEGORY = '__none__'

export function categoryLabel(category: string | null | undefined): string {
  if (!category) return 'General'
  return CATEGORY_LABELS[category] ?? category
}

export function goalPercentage(goal: Goal): number {
  if (typeof goal.progress_percentage === 'number') return goal.progress_percentage
  if (goal.target_amount <= 0) return 0
  return (goal.current_amount / goal.target_amount) * 100
}

export function isGoalComplete(goal: Goal): boolean {
  return goal.status === 'completed' || goalPercentage(goal) >= 100
}

export function remainingAmount(goal: Goal): number {
  return goal.remaining_amount ?? Math.max(goal.target_amount - goal.current_amount, 0)
}

export function pickPrimaryGoal(goals: Goal[]): Goal | null {
  if (goals.length === 0) return null
  const active = goals.filter((g) => !isGoalComplete(g) && g.status !== 'cancelled')
  const pool = active.length > 0 ? active : goals
  return pool.find((g) => g.is_primary) ?? pool[0] ?? null
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}
