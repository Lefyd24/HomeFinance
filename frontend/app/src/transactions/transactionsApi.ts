import { apiFetch } from '../lib/apiClient'

export type TransactionType = 'income' | 'expense' | 'transfer'

export interface Transaction {
  id: number
  user_id: number
  account_id: number
  destination_account_id: number | null
  category_id: number | null
  amount: number
  type: TransactionType
  description: string
  date: string
  notes: string | null
  is_imported: boolean
  /** Not yet booked by the bank — may change or vanish on the next sync. */
  is_pending: boolean
  import_batch_id: string | null
  source_file: string | null
  debt_payment_id?: number | null
  debt_name?: string | null
  created_at: string
  updated_at: string
  account_name?: string | null
  destination_account_name?: string | null
  category_name?: string | null
  category_color?: string | null
}

export interface TransactionList {
  items: Transaction[]
  total: number
  page: number
  per_page: number
}

export interface TransactionFilters {
  page?: number
  per_page?: number
  start_date?: string
  end_date?: string
  account_id?: number
  category_id?: number
  type?: TransactionType
  search?: string
}

export interface TransactionInput {
  account_id: number
  destination_account_id?: number | null
  category_id?: number | null
  amount: number
  type: TransactionType
  description: string
  date: string
  notes?: string | null
}

function buildQueryString(filters: TransactionFilters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function listTransactions(filters: TransactionFilters = {}): Promise<TransactionList> {
  return apiFetch<TransactionList>(`/transactions/${buildQueryString(filters)}`)
}

export function getTransaction(id: number): Promise<Transaction> {
  return apiFetch<Transaction>(`/transactions/${id}`)
}

export function createTransaction(input: TransactionInput): Promise<Transaction> {
  return apiFetch<Transaction>('/transactions/', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateTransaction(id: number, input: TransactionInput): Promise<Transaction> {
  return apiFetch<Transaction>(`/transactions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteTransaction(id: number): Promise<void> {
  return apiFetch<void>(`/transactions/${id}`, { method: 'DELETE' })
}
