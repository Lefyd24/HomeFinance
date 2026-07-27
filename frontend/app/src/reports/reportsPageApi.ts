import { apiFetch } from '../lib/apiClient'

export interface CashflowReport {
  labels: string[]
  income: number[]
  expenses: number[]
}

export interface NetWorthHistoryEntry {
  date: string
  net_worth: number
}

export function getCashflowReport(): Promise<CashflowReport> {
  return apiFetch<CashflowReport>('/reports/cashflow')
}

export function getNetWorthHistory(): Promise<NetWorthHistoryEntry[]> {
  return apiFetch<NetWorthHistoryEntry[]>('/advisor/net-worth/history')
}
