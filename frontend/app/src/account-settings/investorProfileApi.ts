import { apiFetch } from '../lib/apiClient'

export type RiskTolerance = 'conservative' | 'moderate' | 'balanced' | 'growth' | 'aggressive'
export type PrimaryObjective = 'preservation' | 'income' | 'balanced' | 'growth'
export type IncomeStability = 'stable' | 'variable' | 'uncertain'
export type ExperienceLevel = 'beginner' | 'intermediate' | 'experienced'

export interface InvestorProfile {
  is_set: boolean
  /** True when never set, or not reviewed in over six months. */
  is_stale: boolean
  /** "user" or "agent" — who last changed it. */
  updated_by: string | null
  updated_at: string | null

  risk_tolerance: RiskTolerance | null
  primary_objective: PrimaryObjective | null
  horizon_years: number | null
  liquidity_needs_months: number | null
  target_allocation: Record<string, number> | null
  max_single_position_pct: number | null
  excluded_sectors: string[] | null
  excluded_symbols: string[] | null
  income_stability: IncomeStability | null
  experience_level: ExperienceLevel | null
  base_currency: string | null
  tax_residency: string | null
  notes: string | null
}

/** A partial update. Omitted fields are left alone; explicit null clears one. */
export type InvestorProfileUpdate = Partial<
  Omit<InvestorProfile, 'is_set' | 'is_stale' | 'updated_by' | 'updated_at'>
>

export interface InvestorProfileOptions {
  risk_tolerances: RiskTolerance[]
  primary_objectives: PrimaryObjective[]
  income_stabilities: IncomeStability[]
  experience_levels: ExperienceLevel[]
  allocation_classes: string[]
  editable_fields: string[]
}

export interface InvestorProfileRevision {
  id: number
  field: string
  old_value: unknown
  new_value: unknown
  source: 'user' | 'agent'
  reason: string | null
  undone_at: string | null
  created_at: string | null
}

export function getInvestorProfile(): Promise<InvestorProfile> {
  return apiFetch<InvestorProfile>('/investor-profile')
}

export function updateInvestorProfile(body: InvestorProfileUpdate): Promise<InvestorProfile> {
  return apiFetch<InvestorProfile>('/investor-profile', {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export function getInvestorProfileOptions(): Promise<InvestorProfileOptions> {
  return apiFetch<InvestorProfileOptions>('/investor-profile/options')
}

export function getInvestorProfileRevisions(limit = 50): Promise<InvestorProfileRevision[]> {
  return apiFetch<InvestorProfileRevision[]>(`/investor-profile/revisions?limit=${limit}`)
}

export function undoInvestorProfileRevision(revisionId: number): Promise<InvestorProfile> {
  return apiFetch<InvestorProfile>(`/investor-profile/revisions/${revisionId}/undo`, {
    method: 'POST',
  })
}
