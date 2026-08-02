import { apiFetch } from '../lib/apiClient'

export type AccountType = 'checking' | 'savings' | 'credit' | 'cash' | 'investment'

export interface Account {
  id: number
  user_id: number
  name: string
  type: AccountType
  currency: string
  balance: number
  description: string | null
  icon: string | null
  is_active: boolean
  /**
   * Owned by the bank: balance is overwritten on every sync and the backend
   * rejects manual transactions, balance edits and deletion.
   */
  is_linked: boolean
  bank_connection_id: number | null
  sync_status: string | null
  /** Set only for accounts synced from an external brokerage (e.g. "freedom24"). */
  provider: string | null
  /** Stamped by whichever sync owns this account — brokerage or bank. */
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export interface AccountInput {
  name: string
  type: AccountType
  currency: string
  balance: number
  description?: string
  icon?: string
}

export function listAccounts(): Promise<Account[]> {
  return apiFetch<Account[]>('/accounts/')
}

export function createAccount(input: AccountInput): Promise<Account> {
  return apiFetch<Account>('/accounts/', { method: 'POST', body: JSON.stringify(input) })
}

export function updateAccount(id: number, input: Partial<AccountInput>): Promise<Account> {
  return apiFetch<Account>(`/accounts/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

export function deleteAccount(id: number): Promise<void> {
  return apiFetch<void>(`/accounts/${id}`, { method: 'DELETE' })
}
