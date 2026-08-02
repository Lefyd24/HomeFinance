/**
 * Turns a period's numbers into the sentence a person would actually say.
 *
 * Charts show what happened; this says it. Kept as a pure function so the
 * wording can be tested without rendering anything.
 */
import type { TFunction } from 'i18next'
import { formatCurrency } from '../lib/format'

export interface PeriodTotals {
  income: number
  expenses: number
  /** Per-period expense totals, oldest first — used for the trend sparkline. */
  expenseSeries: number[]
  incomeSeries: number[]
  netSeries: number[]
}

export function totalsFrom(report: { income: number[]; expenses: number[] }): PeriodTotals {
  const income = report.income.reduce((sum, value) => sum + value, 0)
  const expenses = report.expenses.reduce((sum, value) => sum + value, 0)
  return {
    income,
    expenses,
    incomeSeries: report.income,
    expenseSeries: report.expenses,
    netSeries: report.income.map((value, index) => value - (report.expenses[index] ?? 0)),
  }
}

export function savingsRate(totals: PeriodTotals): number | null {
  if (totals.income <= 0) return null
  return ((totals.income - totals.expenses) / totals.income) * 100
}

/** Percentage change, or null when there is no meaningful base to compare to. */
export function percentChange(current: number, previous: number): number | null {
  if (!Number.isFinite(previous) || previous === 0) return null
  return ((current - previous) / Math.abs(previous)) * 100
}

export interface PeriodRead {
  /** The one-sentence summary. */
  headline: string
  /** A follow-up clause, or null when there is nothing worth adding. */
  detail: string | null
  /** Whether the period ended up ahead. Drives the accent, not the wording. */
  tone: 'positive' | 'negative' | 'neutral'
}

export function buildRead(
  current: PeriodTotals,
  previous: PeriodTotals | null,
  t: TFunction<'reports'>,
  currency = 'EUR',
): PeriodRead {
  const net = current.income - current.expenses
  const rate = savingsRate(current)
  const money = (value: number) => formatCurrency(Math.abs(value), currency)

  if (current.income === 0 && current.expenses === 0) {
    return {
      headline: t('read.noActivityHeadline'),
      detail: t('read.noActivityDetail'),
      tone: 'neutral',
    }
  }

  const headline =
    net >= 0
      ? t('read.keptHeadline', { net: money(net), income: money(current.income) })
      : t('read.overspentHeadline', { net: money(net) })

  const parts: string[] = []

  if (rate !== null) {
    parts.push(t('read.savingsRateDetail', { rate: rate.toFixed(0) }))
  }

  if (previous) {
    const spendChange = percentChange(current.expenses, previous.expenses)
    if (spendChange !== null && Math.abs(spendChange) >= 1) {
      const pct = Math.abs(spendChange).toFixed(0)
      const clause =
        spendChange > 0
          ? parts.length
            ? t('read.spendingUpJoined', { pct })
            : t('read.yourSpendingUp', { pct })
          : parts.length
            ? t('read.spendingDownJoined', { pct })
            : t('read.yourSpendingDown', { pct })
      parts.push(clause)
    }
  }

  return {
    headline,
    detail: parts.length ? `${parts.join(', ')}.` : null,
    tone: net > 0 ? 'positive' : net < 0 ? 'negative' : 'neutral',
  }
}

/**
 * The question to hand the advisor when someone wants to dig into the period
 * they are looking at. Written as a person would ask it, with the window
 * spelled out so the model does not have to guess what "this period" means.
 */
const ADVISOR_FOCUS_KEYS = {
  overview: 'advisorPrompt.focus.overview',
  cashflow: 'advisorPrompt.focus.cashflow',
  spending: 'advisorPrompt.focus.spending',
  budgets: 'advisorPrompt.focus.budgets',
  debt: 'advisorPrompt.focus.debt',
} as const

export function advisorPrompt(
  startDate: string,
  endDate: string,
  tab: string,
  t: TFunction<'reports'>,
): string {
  const focusKey = tab in ADVISOR_FOCUS_KEYS ? (tab as keyof typeof ADVISOR_FOCUS_KEYS) : 'overview'
  const focus = t(ADVISOR_FOCUS_KEYS[focusKey])
  return t('advisorPrompt.template', { start: startDate, end: endDate, focus })
}
