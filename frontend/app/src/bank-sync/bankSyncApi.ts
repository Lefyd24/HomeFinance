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

export function deleteConnection(id: number, deleteAccounts = false): Promise<void> {
  return apiFetch<void>(
    `/bank-sync/connections/${id}?delete_accounts=${deleteAccounts ? 'true' : 'false'}`,
    { method: 'DELETE' },
  )
}
