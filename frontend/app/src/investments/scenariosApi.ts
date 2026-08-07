import { apiFetch } from '../lib/apiClient'

/**
 * The backtesting & forward sandbox API — plan `docs/investments/02-backtesting-sandbox.md`.
 * Shapes mirror `backend/app/schemas/scenario.py` field-for-field; see that
 * file (not this comment) as the source of truth if the two ever drift.
 */

export type ScenarioKind = 'backtest' | 'forward'
export type ContributionFreq = 'none' | 'weekly' | 'monthly' | 'quarterly'
export type DividendTreatment = 'reinvest' | 'cash' | 'ignore'
export type ScenarioStatus = 'active' | 'closed' | 'error'

export interface ScenarioSpecIn {
  symbol: string
  start_date: string
  end_date: string | null
  initial_amount: number
  currency: string
  contribution_amount: number
  contribution_freq: ContributionFreq
  benchmark: string | null
  cost_bps: number
  cost_flat: number
  dividend_treatment: DividendTreatment
  dividend_withholding_pct: number
  kind: ScenarioKind
}

export interface ScenarioCreateInput extends ScenarioSpecIn {
  name: string
  note?: string | null
}

export interface SpecResolved {
  resolved_start: string
  resolved_end: string
  start_note: string | null
  end_note: string | null
  trading_days: number
  fx_applied: boolean
  data_gaps: Array<{ start: string; end: string; days: number }>
  stale_data: boolean
  period_too_short: boolean
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

export interface LegResult {
  final_value: number
  total_invested: number
  profit: number
  total_return_pct: number | null
  twr_cagr: number | null
  mwr_irr: number | null
  annualized_vol: number | null
  sharpe: SharpeMetric | null
  sortino: number | null
  calmar: number | null
  max_drawdown: DrawdownMetric | null
  best_month: number | null
  worst_month: number | null
  cumulative_costs: number
  dividends_received: number
  hypothetical_exit_cost: number
}

export interface Comparison {
  excess_return_pct: number | null
  excess_cagr: number | null
  beat_benchmark: boolean | null
  rolling_1y_win_rate: number | null
  worst_rolling_1y: number | null
  alpha_annual: number | null
  beta: number | null
  r_squared: number | null
}

export interface SensitivityEntry {
  date: string
  final_value: number
  return_pct: number | null
}

export interface Sensitivity {
  entry_dates: SensitivityEntry[]
  min: number
  p25: number
  median: number
  p75: number
  max: number
  chosen_percentile: number
}

export interface Deflated {
  n_trials: number
  expected_max_sharpe: number | null
  sharpe: number | null
  dsr: number | null
}

export interface Costs {
  cumulative: number
  pct_of_final_value: number | null
  series: Array<{ date: string; cumulative: number }>
}

export interface SeriesPoint {
  date: string
  value: number
  invested: number
  benchmark_value?: number | null
  drawdown: number | null
}

export interface BacktestResult {
  spec_resolved: SpecResolved
  scenario: LegResult
  benchmark: LegResult | null
  comparison: Comparison | null
  sensitivity: Sensitivity | null
  deflated: Deflated | null
  costs: Costs
  series: SeriesPoint[]
}

export interface ScenarioSummary {
  id: number
  name: string
  kind: ScenarioKind
  symbol: string
  benchmark: string | null
  currency: string
  start_date: string
  end_date: string | null
  status: ScenarioStatus
  last_error: string | null
  last_valued_on: string | null
  last_value: number | null
  last_return_pct: number | null
  last_benchmark_return_pct: number | null
  created_at: string
}

export interface ScenarioResponse extends ScenarioSummary {
  note: string | null
  initial_amount: number
  contribution_amount: number
  contribution_freq: string
  cost_bps: number
  cost_flat: number
  dividend_treatment: string
  dividend_withholding_pct: number
}

export interface ScenarioDetail extends ScenarioResponse {
  result: BacktestResult | null
}

export interface TrackRecordEntry {
  id: number
  name: string
  symbol: string
  excess_return_pct: number | null
}

export interface TrackRecord {
  count: number
  count_beating_benchmark: number
  hit_rate: number | null
  mean_excess_return: number | null
  median_excess_return: number | null
  best: { id: number; name: string; excess_return_pct: number } | null
  worst: { id: number; name: string; excess_return_pct: number } | null
  hit_rate_p_value: number | null
  verdict_key: 'too_few' | 'no_evidence_of_skill' | 'some_evidence'
  scenarios: TrackRecordEntry[]
}

export interface ListScenariosParams {
  kind?: ScenarioKind
  status?: ScenarioStatus
  sort?: 'newest' | 'best' | 'worst'
}

export interface ScenarioPatchInput {
  name?: string
  note?: string | null
  status?: ScenarioStatus
}

export function previewScenario(spec: ScenarioSpecIn): Promise<BacktestResult> {
  return apiFetch<BacktestResult>('/scenarios/preview', {
    method: 'POST',
    body: JSON.stringify(spec),
  })
}

export function createScenario(input: ScenarioCreateInput): Promise<ScenarioResponse> {
  return apiFetch<ScenarioResponse>('/scenarios', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function listScenarios(params?: ListScenariosParams): Promise<ScenarioSummary[]> {
  const search = new URLSearchParams()
  if (params?.kind) search.set('kind', params.kind)
  if (params?.status) search.set('status', params.status)
  if (params?.sort) search.set('sort', params.sort)
  const qs = search.toString()
  return apiFetch<ScenarioSummary[]>(`/scenarios${qs ? `?${qs}` : ''}`)
}

export function getScenario(id: number): Promise<ScenarioDetail> {
  return apiFetch<ScenarioDetail>(`/scenarios/${id}`)
}

export function patchScenario(id: number, input: ScenarioPatchInput): Promise<ScenarioResponse> {
  return apiFetch<ScenarioResponse>(`/scenarios/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export function deleteScenario(id: number): Promise<void> {
  return apiFetch<void>(`/scenarios/${id}`, { method: 'DELETE' })
}

export function rebuildScenario(id: number): Promise<ScenarioResponse> {
  return apiFetch<ScenarioResponse>(`/scenarios/${id}/rebuild`, { method: 'POST' })
}

export function getTrackRecord(): Promise<TrackRecord> {
  return apiFetch<TrackRecord>('/scenarios/track-record')
}
