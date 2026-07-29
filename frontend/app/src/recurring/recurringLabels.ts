import type { TFunction } from 'i18next'
import { formatDate } from '../lib/format'
import type { RecurringExpense } from './recurringApi'

function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

function startOfToday(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate())
}

export function daysUntilDue(expense: RecurringExpense, now = new Date()): number {
  if (typeof expense.days_until_due === 'number') return expense.days_until_due
  const due = parseLocalDate(expense.next_due_date.slice(0, 10))
  return Math.round((due.getTime() - startOfToday(now).getTime()) / 86_400_000)
}

export function isOverdue(expense: RecurringExpense): boolean {
  if (typeof expense.is_overdue === 'boolean') return expense.is_overdue
  return daysUntilDue(expense) < 0
}

export function cadenceLabel(expense: RecurringExpense, t: TFunction<'recurring'>): string {
  const { recurrence_interval: interval, recurrence_unit: unit } = expense
  if (interval === 1) {
    const key = { days: 'cadence.daily', weeks: 'cadence.weekly', months: 'cadence.monthly' }[
      unit
    ] as 'cadence.daily'
    return t(key)
  }
  const unitKey = { days: 'units.days', weeks: 'units.weeks', months: 'units.months' }[unit]
  return t('cadence.every', { interval, unit: t(unitKey) })
}

export function dueLabel(expense: RecurringExpense, t: TFunction<'recurring'>): string {
  if (!expense.is_active) return t('due.paused')
  const days = daysUntilDue(expense)
  if (days < 0) return t('due.overdue', { count: Math.abs(days) })
  if (days === 0) return t('due.today')
  if (days === 1) return t('due.tomorrow')
  if (days <= 30) return t('due.inDays', { count: days })
  return formatDate(parseLocalDate(expense.next_due_date.slice(0, 10)))
}
