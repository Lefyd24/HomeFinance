import { apiFetch } from '../lib/apiClient'

export type ComparisonPeriod = '1m' | '3m' | '6m' | 'ytd' | '1y' | '3y' | '5y' | '10y' | 'max'

export interface BenchmarkOption {
  symbol: string
  label: string
}

export interface SharpeMetric {
  value: number
  ci_low: number
  ci_high: number
  n: number
}

export interface DrawdownMetric {
  depth: number
  peak_date: string | null
  trough_date: string | null
  recovery_date: string | null
  days_under_water: number | null
}

export interface PerformanceBlock {
  cumulative_return: number | null
  cagr: number | null
  best_month: number | null
  worst_month: number | null
  rolling_1y_win_rate_vs_benchmark: number | null
  worst_rolling_1y: number | null
}

export interface RiskBlock {
  volatility: number | null
  max_drawdown: DrawdownMetric | null
  ulcer_index: number | null
  var95: number | null
  cvar95: number | null
  mvar95: number | null
  skew: number | null
  excess_kurtosis: number | null
  jarque_bera_p: number | null
}

export interface RiskAdjustedBlock {
  sharpe: SharpeMetric | null
  sortino: number | null
  calmar: number | null
  martin: number | null
  omega_curve: [number, number | null][] | null
  psr_vs_zero: number | null
}

export interface VsBenchmarkBlock {
  beta: number | null
  beta_ci: [number, number] | null
  r_squared: number | null
  downside_beta: number | null
  alpha_annual: number | null
  alpha_tstat: number | null
  alpha_pvalue: number | null
  tracking_error: number | null
  information_ratio: number | null
  up_capture: number | null
  down_capture: number | null
  downside_correlation: number | null
}

export type ValuationKind = 'stock' | 'fund' | 'crypto' | 'index'

export interface ValuationBlock {
  kind: ValuationKind
  fields: Record<string, number | string | null>
  sources: Record<string, string>
}

export interface StressEpisode {
  label: string
  start: string
  end: string
  return: number | null
  max_drawdown: number | null
}

export interface InstrumentComparison {
  symbol: string
  name: string | null
  quote_type: string | null
  currency: string | null
  fx_applied: boolean
  total_return: boolean
  is_benchmark: boolean
  last_price: number | null
  warnings: string[]
  performance: PerformanceBlock
  risk: RiskBlock
  risk_adjusted: RiskAdjustedBlock
  vs_benchmark: VsBenchmarkBlock
  valuation: ValuationBlock
  stress: StressEpisode[]
}

export interface PairwiseBlock {
  correlation: Record<string, number>
  rolling_correlation: Record<string, Array<{ date: string; value: number }>>
  diversification_ratio: number | null
  overlap: Record<string, number> | null
}

export type VerdictKey =
  | 'clearly_better_risk_adjusted'
  | 'likely_better'
  | 'too_close_to_call'
  | 'likely_worse'
  | 'clearly_worse_risk_adjusted'

export interface HeadToHead {
  leader: string
  runner_up: string
  psr_leader_vs_runner_up: number | null
  verdict_key: VerdictKey
}

export type RiskFreeSource = 'irx' | 'fallback_constant' | 'user_override'

export interface ComparisonMeta {
  period: string
  start: string
  end: string
  aligned_days: number
  currency: string
  series_frequency: 'daily' | 'weekly' | 'monthly'
  risk_free_annual: number
  risk_free_source: RiskFreeSource
  benchmark_symbol: string | null
  alignment_note: string | null
  warnings: string[]
  generated_at: string
}

export interface SeriesBlock {
  normalized: Array<Record<string, number | string | null>>
  drawdown: Array<Record<string, number | string | null>>
}

export interface ComparisonResponse {
  meta: ComparisonMeta
  instruments: InstrumentComparison[]
  pairwise: PairwiseBlock
  head_to_head: HeadToHead | null
  series: SeriesBlock
}

export interface SavedComparison {
  id: number
  name: string
  symbols: string[]
  benchmark: string | null
  period: string
  created_at: string
}

export interface SavedComparisonInput {
  name: string
  symbols: string[]
  benchmark?: string | null
  period: string
}

export function compareTickers(options: {
  symbols: string[]
  period: ComparisonPeriod
  benchmark?: string | null
  currency?: string | null
  riskFree?: number | null
}): Promise<ComparisonResponse> {
  const params = new URLSearchParams({
    symbols: options.symbols.join(','),
    period: options.period,
  })
  if (options.benchmark) params.set('benchmark', options.benchmark)
  if (options.currency) params.set('currency', options.currency)
  if (options.riskFree != null) params.set('risk_free', String(options.riskFree))
  return apiFetch<ComparisonResponse>(`/investments/compare?${params}`)
}

export function listBenchmarks(): Promise<BenchmarkOption[]> {
  return apiFetch<BenchmarkOption[]>('/investments/compare/benchmarks')
}

export function listSavedComparisons(): Promise<SavedComparison[]> {
  return apiFetch<SavedComparison[]>('/investments/compare/saved')
}

export function createSavedComparison(input: SavedComparisonInput): Promise<SavedComparison> {
  return apiFetch<SavedComparison>('/investments/compare/saved', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function deleteSavedComparison(id: number): Promise<void> {
  return apiFetch<void>(`/investments/compare/saved/${id}`, { method: 'DELETE' })
}
