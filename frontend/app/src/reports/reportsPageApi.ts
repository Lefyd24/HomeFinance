import { apiFetch, getApiBaseUrl } from '../lib/apiClient'

/** Query params every filterable report endpoint accepts. */
export interface ReportParams {
  start_date: string
  end_date: string
  account_ids?: string
  category_ids?: string
}

export interface CashflowReport {
  labels: string[]
  income: number[]
  expenses: number[]
}

export interface NetWorthHistoryEntry {
  date: string
  net_worth: number
}

export interface SeriesReport {
  labels: string[]
  data: number[]
}

export interface CategoryBreakdown {
  categories: Array<{ name: string; color: string | null; amount: number; count: number }>
}

export interface BalanceHistoryReport {
  labels: string[]
  /** One entry per active account, plus a trailing "Total" series. */
  series: Array<{ name: string; data: number[] }>
}

export interface WeekdayHeatmap {
  weekdays: string[]
  data: number[]
}

export interface SpendingMom extends SeriesReport {
  changes: number[]
}

export interface SavingsRateReport {
  labels: string[]
  rate: number[]
}

export interface BudgetPerformance {
  budgets: Array<{ name: string; limit: number; spent: number; pct: number }>
}

export interface DebtInsights {
  debts: Array<{
    name: string
    current_balance: number
    original_balance: number
    paid_pct: number
    interest_rate: number | null
    projected_payoff: string | null
  }>
  total_current: number
  total_interest_paid: number
}

type QueryValue = string | number | undefined

function qs(params: ReportParams | Record<string, QueryValue>): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') search.set(key, String(value))
  }
  const encoded = search.toString()
  return encoded ? `?${encoded}` : ''
}

export function getCashflowReport(params: ReportParams, groupBy = 'month') {
  return apiFetch<CashflowReport>(`/reports/cashflow${qs({ ...params, group_by: groupBy })}`)
}

export function getNetWorthHistory() {
  return apiFetch<NetWorthHistoryEntry[]>('/advisor/net-worth/history')
}

export function getNetWorthSeries(params: ReportParams) {
  return apiFetch<SeriesReport>(`/reports/net-worth${qs(params)}`)
}

export function getSavingsRate(params: ReportParams) {
  return apiFetch<SavingsRateReport>(`/reports/savings-rate${qs(params)}`)
}

export function getCategoryBreakdown(params: ReportParams, type: 'expense' | 'income' = 'expense') {
  return apiFetch<CategoryBreakdown>(`/reports/category-breakdown${qs({ ...params, type })}`)
}

export function getIncomeReport(params: ReportParams) {
  return apiFetch<SeriesReport>(`/reports/income${qs(params)}`)
}

export function getBalanceHistory(params: ReportParams) {
  return apiFetch<BalanceHistoryReport>(`/reports/balance-history${qs(params)}`)
}

export function getTopMerchants(params: ReportParams, limit = 10) {
  return apiFetch<SeriesReport>(`/reports/top-merchants${qs({ ...params, limit })}`)
}

export function getWeekdayHeatmap(params: ReportParams) {
  return apiFetch<WeekdayHeatmap>(`/reports/weekday-heatmap${qs(params)}`)
}

export function getSpendingMom(params: ReportParams) {
  return apiFetch<SpendingMom>(`/reports/spending-mom${qs(params)}`)
}

export function getBudgetPerformance() {
  return apiFetch<BudgetPerformance>('/reports/budget-performance')
}

export function getDebtInsights() {
  return apiFetch<DebtInsights>('/reports/debt-insights')
}

/** Streams a CSV straight to the browser's downloads. */
export async function downloadReportCsv(report: string, params: ReportParams): Promise<void> {
  const token = window.localStorage.getItem('token')
  const response = await fetch(`${getApiBaseUrl()}/reports/export${qs({ report, ...params })}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error(`Export failed: ${response.status}`)

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `${report}-${params.start_date}-to-${params.end_date}.csv`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
