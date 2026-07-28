import { apiFetch } from '../lib/apiClient'

export interface ApiKeyStatus {
  has_api_key: boolean
  api_key_last_four: string | null
}

export interface ApiKeyResponse {
  api_key: string
  message: string
}

export function getApiKeyStatus(): Promise<ApiKeyStatus> {
  return apiFetch<ApiKeyStatus>('/auth/api-key')
}

export function generateApiKey(): Promise<ApiKeyResponse> {
  return apiFetch<ApiKeyResponse>('/auth/api-key', { method: 'POST' })
}

export function revokeApiKey(): Promise<void> {
  return apiFetch<void>('/auth/api-key', { method: 'DELETE' })
}
