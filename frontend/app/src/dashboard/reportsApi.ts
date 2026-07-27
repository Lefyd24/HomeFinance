import { apiFetch } from '../lib/apiClient'

export interface SpendingReport {
  labels: string[]
  data: number[]
  transaction_count?: number
}

export interface SpendingReportParams {
  start_date?: string
  end_date?: string
  account_ids?: string
  category_ids?: string
}

export interface CashflowReport {
  labels: string[]
  income: number[]
  expenses: number[]
}

export interface CashflowReportParams {
  start_date?: string
  end_date?: string
  group_by?: 'day' | 'week' | 'month'
}

export interface NetWorthReport {
  labels: string[]
  data: number[]
}

export interface NetWorthReportParams {
  start_date?: string
  end_date?: string
}

function buildQueryString(params: object): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params as Record<string, string | undefined>)) {
    if (value !== undefined && value !== '') {
      search.set(key, value)
    }
  }
  const qs = search.toString()
  return qs ? `?${qs}` : ''
}

export function getSpendingReport(params: SpendingReportParams = {}): Promise<SpendingReport> {
  return apiFetch<SpendingReport>(`/reports/spending${buildQueryString(params)}`)
}

export function getCashflowReport(params: CashflowReportParams = {}): Promise<CashflowReport> {
  return apiFetch<CashflowReport>(
    `/reports/cashflow${buildQueryString({
      start_date: params.start_date,
      end_date: params.end_date,
      group_by: params.group_by ?? 'month',
    })}`,
  )
}

export function getNetWorthReport(params: NetWorthReportParams = {}): Promise<NetWorthReport> {
  return apiFetch<NetWorthReport>(`/reports/net-worth${buildQueryString(params)}`)
}
