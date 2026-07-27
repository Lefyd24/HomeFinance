import { apiFetch } from '../lib/apiClient'

export interface SpendingReport {
  labels: string[]
  data: number[]
}

export interface SpendingReportParams {
  start_date?: string
  end_date?: string
  account_ids?: string
  category_ids?: string
}

function buildQueryString(params: SpendingReportParams): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
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
