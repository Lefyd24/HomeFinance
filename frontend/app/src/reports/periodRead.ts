/**
 * Turns a period's numbers into the sentence a person would actually say.
 *
 * Charts show what happened; this says it. Kept as a pure function so the
 * wording can be tested without rendering anything.
 */
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
  currency = 'EUR',
): PeriodRead {
  const net = current.income - current.expenses
  const rate = savingsRate(current)
  const money = (value: number) => formatCurrency(Math.abs(value), currency)

  if (current.income === 0 && current.expenses === 0) {
    return {
      headline: 'No activity recorded in this range.',
      detail: 'Widen the date range, or clear a filter, to see something here.',
      tone: 'neutral',
    }
  }

  const headline =
    net >= 0
      ? `You kept ${money(net)} of the ${money(current.income)} that came in.`
      : `You spent ${money(net)} more than you brought in.`

  const parts: string[] = []

  if (rate !== null) {
    parts.push(`That is a ${rate.toFixed(0)}% savings rate`)
  }

  if (previous) {
    const spendChange = percentChange(current.expenses, previous.expenses)
    if (spendChange !== null && Math.abs(spendChange) >= 1) {
      const direction = spendChange > 0 ? 'up' : 'down'
      const clause = `spending is ${direction} ${Math.abs(spendChange).toFixed(0)}% on the period before`
      parts.push(parts.length ? `and ${clause}` : `Your ${clause}`)
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
export function advisorPrompt(startDate: string, endDate: string, tab: string): string {
  const focus: Record<string, string> = {
    overview: 'what stands out about my finances',
    cashflow: 'how my cash flow moved and whether the trend is healthy',
    spending: 'where my spending went and what I could cut',
    budgets: 'which budgets I am at risk of blowing',
    debt: 'which debt I should attack first and why',
  }
  return `Looking at ${startDate} to ${endDate}, tell me ${focus[tab] ?? focus.overview}. Use my actual transactions.`
}
