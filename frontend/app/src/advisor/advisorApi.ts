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
  savings_plans: { months: number; monthly_savings: number; weekly_savings: number }[]
}

export function getNetWorth(): Promise<NetWorth> {
  return apiFetch<NetWorth>('/advisor/net-worth')
}

export function getEmergencyFundRecommendation(): Promise<EmergencyFundRecommendation> {
  return apiFetch<EmergencyFundRecommendation>('/advisor/emergency-fund/recommendation')
}

export interface NetWorthHistoryEntry {
  date: string
  net_worth: number
}

export function getNetWorthHistory(months = 12): Promise<NetWorthHistoryEntry[]> {
  return apiFetch<NetWorthHistoryEntry[]>(`/advisor/net-worth/history?months=${months}`)
}

export interface NetWorthProjection {
  current_net_worth: number
  monthly_savings_rate: number
  projections: { date: string; projected_net_worth: number; month_number: number }[]
  final_projected_net_worth: number
  total_growth: number
}

export function getNetWorthProjection(months = 12): Promise<NetWorthProjection> {
  return apiFetch<NetWorthProjection>(`/advisor/net-worth/projection?months=${months}`)
}

// Investment calculator

export interface YearlyBreakdown {
  year: number
  balance: number
  contributions: number
  interest_earned: number
  year_growth: number
}

export interface InvestmentCalculationRequest {
  principal: number
  annual_rate: number
  years: number
  monthly_contribution?: number
  compounds_per_year?: number
}

export interface InvestmentCalculationResponse {
  final_balance: number
  total_contributions: number
  total_interest_earned: number
  effective_return: number
  parameters: Record<string, unknown>
  yearly_breakdown: YearlyBreakdown[]
}

export function calculateInvestment(
  payload: InvestmentCalculationRequest,
): Promise<InvestmentCalculationResponse> {
  return apiFetch<InvestmentCalculationResponse>('/advisor/investment/calculate', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export interface RetirementProjectionRequest {
  current_age: number
  retirement_age: number
  current_savings: number
  monthly_contribution: number
  annual_return?: number
  inflation_rate?: number
  withdrawal_rate?: number
}

export interface RetirementProjectionResponse {
  retirement_balance: number
  retirement_balance_today_dollars: number
  annual_retirement_income: number
  monthly_retirement_income: number
  total_contributions: number
  total_growth: number
  years_to_retirement: number
  estimated_years_funds_last: number
  parameters: { current_age: number; retirement_age: number } & Record<string, unknown>
  milestones: { target: number; years: number; age: number }[]
  yearly_projection: YearlyBreakdown[]
}

export function calculateRetirement(
  payload: RetirementProjectionRequest,
): Promise<RetirementProjectionResponse> {
  return apiFetch<RetirementProjectionResponse>('/advisor/investment/retirement', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

// Loan calculator

export interface LoanAmortizationRequest {
  principal: number
  annual_rate: number
  term_months: number
}

export interface AmortizationEntry {
  month: number
  payment: number
  principal: number
  interest: number
  balance: number
  total_interest_paid: number
}

export interface LoanAmortizationResponse {
  monthly_payment: number
  total_payments: number
  total_interest: number
  principal: number
  parameters: Record<string, unknown>
  schedule: AmortizationEntry[]
}

export function calculateLoanAmortization(
  payload: LoanAmortizationRequest,
): Promise<LoanAmortizationResponse> {
  return apiFetch<LoanAmortizationResponse>('/advisor/loan/amortization', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export interface EarlyPayoffRequest {
  principal: number
  annual_rate: number
  term_months: number
  extra_monthly_payment: number
}

export interface EarlyPayoffResponse {
  original_term_months: number
  new_term_months: number
  months_saved: number
  years_saved: number
  original_total_interest: number
  new_total_interest: number
  interest_saved: number
  original_monthly_payment: number
  new_monthly_payment: number
  extra_monthly_payment: number
  total_extra_paid: number
}

export function calculateEarlyPayoff(payload: EarlyPayoffRequest): Promise<EarlyPayoffResponse> {
  return apiFetch<EarlyPayoffResponse>('/advisor/loan/early-payoff', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}
