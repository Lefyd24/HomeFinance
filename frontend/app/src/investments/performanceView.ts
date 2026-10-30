import { computeRange } from '../reports/useReportFilters'
import type { PerformanceBreakdown } from './investmentsApi'

/** Ranges the performance tile offers, shortest first. */
export const PERFORMANCE_RANGES = ['1m', '3m', '6m', 'ytd', '1y', 'all'] as const
export type PerformanceRangeKey = (typeof PERFORMANCE_RANGES)[number]

/** First day of the range, or undefined for "all" (the server starts at the first funded day). */
export function rangeStartDate(range: PerformanceRangeKey, today = new Date()): string | undefined {
  if (range === 'all') return undefined
  return computeRange(range === '1m' ? '30d' : range, today).start
}

export interface WaterfallStep {
  key: string
  /** Signed contribution; for a total bar, the level it stands at. */
  value: number
  /** Invisible bar that lifts the visible one to where the running total was. */
  base: number
  /** Visible bar height. */
  size: number
  total: boolean
}

// shortcut: assumes the running total stays >= 0; upgrade if a negative net-invested ever needs charting.
/** Net invested → each gain/loss component → current value, as stacked base+size bars. */
export function buildWaterfall(b: PerformanceBreakdown): WaterfallStep[] {
  const parts: Array<[string, number]> = [
    ['unrealized', b.unrealized],
    ['realized', b.realized],
    ['dividends', b.dividends],
    ['fees', b.fees],
    ['taxes', b.taxes],
    ['fxAndOther', b.fx_and_other],
  ]
  let running = b.net_invested
  const steps: WaterfallStep[] = [
    { key: 'netInvested', value: running, base: 0, size: running, total: true },
  ]
  for (const [key, value] of parts) {
    const next = running + value
    steps.push({ key, value, base: Math.min(running, next), size: Math.abs(value), total: false })
    running = next
  }
  steps.push({ key: 'currentValue', value: running, base: 0, size: running, total: true })
  return steps
}
