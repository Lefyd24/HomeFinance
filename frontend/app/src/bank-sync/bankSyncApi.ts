import { apiFetch } from '../lib/apiClient'

export type ConnectionStatus = 'pending' | 'active' | 'expired' | 'revoked' | 'error'

export interface Institution {
  name: string
  country: string
  logo: string | null
  psu_types: string[]
  maximum_consent_validity: number | null
}

export interface LinkedAccount {
  id: number
  name: string
  currency: string
  balance: number
  last_synced_at: string | null
  sync_status: string | null
}

export interface BankConnection {
  id: number
  aspsp_name: string
  aspsp_country: string
  status: ConnectionStatus
  consent_valid_until: string | null
  last_sync_at: string | null
  last_sync_error: string | null
  created_at: string
  accounts: LinkedAccount[]
}

export interface SyncResult {
  connection_id: number
  imported: number
  accounts: Array<Record<string, unknown>>
  errors: Array<Record<string, unknown>>
}

export function listInstitutions(country: string): Promise<Institution[]> {
  return apiFetch<Institution[]>(`/bank-sync/institutions?country=${encodeURIComponent(country)}`)
}

export function listConnections(): Promise<BankConnection[]> {
  return apiFetch<BankConnection[]>('/bank-sync/connections')
}

export function startConnection(input: {
  aspsp_name: string
  aspsp_country: string
}): Promise<{ connection_id: number; authorization_url: string }> {
  return apiFetch('/bank-sync/connections/start', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function syncConnection(id: number): Promise<SyncResult> {
  return apiFetch<SyncResult>(`/bank-sync/connections/${id}/sync`, { method: 'POST' })
}

export interface DisconnectResult {
  message: string
  accounts_deleted: number
  accounts_unlinked: number
  transactions_deleted: number
  /** Transactions freed from bank ownership, and so editable again. */
  transactions_released: number
}

export function deleteConnection(
  id: number,
  deleteAccounts = false,
): Promise<DisconnectResult> {
  return apiFetch<DisconnectResult>(
    `/bank-sync/connections/${id}?delete_accounts=${deleteAccounts ? 'true' : 'false'}`,
    { method: 'DELETE' },
  )
}

export interface UnlinkAccountResult {
  message: string
  account_deleted: boolean
  transactions_deleted: number
  transactions_released: number
  /** True when that was the bank's last account and the connection went too. */
  connection_removed: boolean
}

/** Stop syncing one account, leaving the bank's other accounts connected. */
export function unlinkAccount(
  accountId: number,
  deleteAccount = false,
): Promise<UnlinkAccountResult> {
  return apiFetch<UnlinkAccountResult>(
    `/bank-sync/accounts/${accountId}?delete_account=${deleteAccount ? 'true' : 'false'}`,
    { method: 'DELETE' },
  )
}
