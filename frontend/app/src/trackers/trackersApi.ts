import { apiFetch } from '../lib/apiClient'

export interface Tracker {
  id: number
  user_id: number
  name: string
  description: string | null
  /** Optional by design — a tracker answers "what did this cost", not "what's my limit". */
  target_amount: number | null
  currency: string
  icon: string | null
  color: string | null
  is_active: boolean
  created_at: string
  updated_at: string | null
  transaction_count: number
  total_amount: number
  first_transaction_date: string | null
  last_transaction_date: string | null
  progress_percentage: number | null
  remaining_amount: number | null
}

export interface TrackerInput {
  name: string
  description?: string | null
  target_amount?: number | null
  currency?: string
  icon?: string | null
  color?: string | null
  is_active?: boolean
}

export type TrackerUpdateInput = Partial<TrackerInput>

export interface TrackerEntry {
  id: number
  transaction_id: number
  amount: number
  type: 'income' | 'expense' | 'transfer'
  description: string
  date: string
  notes: string | null
  account_name: string | null
  category_name: string | null
  category_color: string | null
  added_at: string | null
}

export interface TrackerEntryList {
  items: TrackerEntry[]
  total_amount: number
  count: number
}

export interface TrackerTransactionInput {
  account_id: number
  amount: number
  type: 'income' | 'expense'
  description: string
  date: string
  category_id?: number | null
  notes?: string | null
}

export function listTrackers(activeOnly = false): Promise<Tracker[]> {
  return apiFetch<Tracker[]>(`/trackers/${activeOnly ? '?active_only=true' : ''}`)
}

export function getTracker(id: number): Promise<Tracker> {
  return apiFetch<Tracker>(`/trackers/${id}`)
}

export function createTracker(input: TrackerInput): Promise<Tracker> {
  return apiFetch<Tracker>('/trackers/', { method: 'POST', body: JSON.stringify(input) })
}

export function updateTracker(id: number, input: TrackerUpdateInput): Promise<Tracker> {
  return apiFetch<Tracker>(`/trackers/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

export function deleteTracker(id: number): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/trackers/${id}`, { method: 'DELETE' })
}

export function listTrackerTransactions(id: number): Promise<TrackerEntryList> {
  return apiFetch<TrackerEntryList>(`/trackers/${id}/transactions`)
}

/** Creates a real transaction (moving the account balance) and files it here. */
export function addTrackerTransaction(
  id: number,
  input: TrackerTransactionInput,
): Promise<Tracker> {
  return apiFetch<Tracker>(`/trackers/${id}/transactions`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function removeTrackerTransaction(
  id: number,
  transactionId: number,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/trackers/${id}/transactions/${transactionId}`, {
    method: 'DELETE',
  })
}
