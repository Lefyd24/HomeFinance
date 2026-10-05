import { apiFetch } from '../lib/apiClient'

export type ApiKeyScope = 'read' | 'full'

export interface ApiKey {
  id: number
  name: string
  scope: ApiKeyScope
  key_prefix: string
  last_four: string
  created_at: string
  last_used_at: string | null
}

export interface ApiKeyCreateInput {
  name: string
  scope: ApiKeyScope
}

/** The plaintext `key` is only ever returned by this call. */
export interface ApiKeyCreated {
  key: string
  api_key: ApiKey
}

export const MAX_API_KEYS = 10

export function listApiKeys(): Promise<ApiKey[]> {
  return apiFetch<ApiKey[]>('/auth/api-keys')
}

export function createApiKey(input: ApiKeyCreateInput): Promise<ApiKeyCreated> {
  return apiFetch<ApiKeyCreated>('/auth/api-keys', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function revokeApiKey(id: number): Promise<void> {
  return apiFetch<void>(`/auth/api-keys/${id}`, { method: 'DELETE' })
}
