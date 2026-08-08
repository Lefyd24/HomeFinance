import { apiFetch } from '../lib/apiClient'

export type TechnicalPeriod = '3m' | '6m' | '1y' | '2y' | '5y'
export type SimulationModel = 'bootstrap' | 'gbm' | 'student_t'
export type DriftMode = 'zero' | 'historical' | 'risk_free'

export interface PriceBar {
  date: string
  open: number
  high: number
  low: number
  close: number
  volume: number | null
}

export interface TechnicalMeta {
  symbol: string
  name: string | null
  quote_type: string | null
  currency: string | null
  period: string
  last_bar_date: string | null
  stale: boolean
  price_basis: string
  bars: number
  warnings: string[]
}

export interface LevelZone {
  kind: 'support' | 'resistance'
  low: number
  high: number
  centre: number
  touches: number
  last_touch: string | null
  score: number
  distance_pct: number
}

export interface Crossover {
  date: string
  kind: 'golden' | 'death'
  fast: number
  slow: number
}

export interface VarianceRatioPoint {
  q: number
  vr: number
  z: number
  p: number
}

export interface RegimeBlock {
  trend: 'up' | 'down' | 'sideways'
  adx: number | null
  variance_ratio: VarianceRatioPoint[]
  vol_annualized: number | null
  vol_percentile_3y: number | null
  vol_regime: 'low' | 'normal' | 'elevated'
  bollinger_squeeze: boolean
  squeeze_percentile: number | null
}

export type SignalState = 'elevated' | 'neutral' | 'depressed' | string

export interface Signal {
  id: string
  state: SignalState
  value: number | null
  detail_key: string
  direction: -1 | 0 | 1
  confidence: 'low' | 'medium' | 'high'
}

export interface Confluence {
  positive: number
  negative: number
  neutral: number
  note_key: string
}

/** One row per bar date; only the overlays/panes that have a value on that
 * date are present, so recharts consumes this directly as chart `data`. */
export type OverlayRow = { date: string } & Record<string, number | null | undefined>
export type PaneRow = { date: string } & Record<string, number | null | undefined>

export interface TechnicalResponse {
  meta: TechnicalMeta
  price: PriceBar[]
  overlays: OverlayRow[]
  panes: PaneRow[]
  levels: LevelZone[]
  crossovers: Crossover[]
  regime: RegimeBlock
  signals: Signal[]
  confluence: Confluence
}

export interface SimPercentileRow {
  day: number
  p5: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
  p95: number
}

export interface HistogramBin {
  bin_low: number
  bin_high: number
  count: number
}

export interface TerminalBlock {
  p5: number
  p10: number
  p25: number
  p50: number
  p75: number
  p90: number
  p95: number
  mean: number
  histogram: HistogramBin[]
}

export interface ProbabilitiesBlock {
  p_above_today: number
  p_above_target: number | null
  p_drawdown_20: number
  expected_shortfall_5: number
}

export interface CalibrationBlock {
  lookback_start: string
  lookback_end: string
  n_observations: number
  annualized_vol_used: number
  vol_percentile_vs_3y: number | null
  drift_used: number
  drift_se: number | null
  mean_block: number | null
  model: SimulationModel
  seed: number
}

export interface SimulationResponse {
  symbol: string
  horizon_days: number
  last_price: number
  last_bar_date: string
  percentiles: SimPercentileRow[]
  terminal: TerminalBlock
  probabilities: ProbabilitiesBlock
  calibration: CalibrationBlock
}

export function getTechnical(symbol: string, period: TechnicalPeriod): Promise<TechnicalResponse> {
  const params = new URLSearchParams({ period })
  return apiFetch<TechnicalResponse>(`/investments/technical/${encodeURIComponent(symbol)}?${params}`)
}

export function simulateTechnical(
  symbol: string,
  options: { horizon: number; model?: SimulationModel; drift?: DriftMode; paths?: number; targetPrice?: number | null },
): Promise<SimulationResponse> {
  const params = new URLSearchParams({ horizon: String(options.horizon) })
  if (options.model) params.set('model', options.model)
  if (options.drift) params.set('drift', options.drift)
  if (options.paths) params.set('paths', String(options.paths))
  if (options.targetPrice != null) params.set('target_price', String(options.targetPrice))
  return apiFetch<SimulationResponse>(`/investments/simulate/${encodeURIComponent(symbol)}?${params}`)
}
