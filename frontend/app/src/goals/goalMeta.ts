import type { TFunction } from 'i18next'
import type { Goal } from './goalsApi'
import { todayIsoDate } from '../lib/format'

export const CATEGORY_VALUES = [
  'emergency_fund',
  'vacation',
  'car',
  'home',
  'education',
  'retirement',
  'other',
] as const

const CATEGORY_I18N_KEYS: Record<string, string> = {
  emergency_fund: 'categories.emergencyFund',
  vacation: 'categories.vacation',
  car: 'categories.car',
  home: 'categories.home',
  education: 'categories.education',
  retirement: 'categories.retirement',
  other: 'categories.other',
}

/** @deprecated Use categoryLabel with t from goals namespace */
export const CATEGORY_OPTIONS = CATEGORY_VALUES.map((value) => ({ value, label: value }))

export const ICON_OPTIONS = [
  { value: '🎯', labelKey: 'icons.target' },
  { value: '💰', labelKey: 'icons.money' },
  { value: '🏠', labelKey: 'icons.home' },
  { value: '🚗', labelKey: 'icons.car' },
  { value: '✈️', labelKey: 'icons.travel' },
  { value: '🎓', labelKey: 'icons.education' },
  { value: '🏥', labelKey: 'icons.health' },
  { value: '🎁', labelKey: 'icons.gift' },
] as const

export const CURRENCY_OPTIONS = [
  { value: 'EUR', label: 'EUR (€)' },
  { value: 'USD', label: 'USD ($)' },
  { value: 'GBP', label: 'GBP (£)' },
] as const

export const NONE_CATEGORY = '__none__'

export function categoryLabel(
  category: string | null | undefined,
  t: TFunction<'goals'>,
): string {
  if (!category) return t('categories.general')
  const key = CATEGORY_I18N_KEYS[category]
  return key ? t(key as 'categories.general') : category
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
  return todayIsoDate()
}
