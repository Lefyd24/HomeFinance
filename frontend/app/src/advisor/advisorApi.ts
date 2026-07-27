import { apiFetch } from '../lib/apiClient'

export interface NetWorth {
  net_worth: number
  total_assets: number
  total_liabilities: number
  assets_breakdown: Record<string, number>
  liabilities_breakdown: Record<string, number>
  debt_to_asset_ratio: number
  calculated_at: string
}

export interface EmergencyFundRecommendation {
  current_liquid_assets: number
  monthly_expenses: number
  recommendations: {
    minimum: number
    recommended: number
    maximum: number
  }
  current_coverage: {
    months_covered: number
    percentage_of_recommended: number
  }
  status: string
  message: string
  gap_to_recommended: number
}

export function getNetWorth(): Promise<NetWorth> {
  return apiFetch<NetWorth>('/advisor/net-worth')
}

export function getEmergencyFundRecommendation(): Promise<EmergencyFundRecommendation> {
  return apiFetch<EmergencyFundRecommendation>('/advisor/emergency-fund/recommendation')
}
