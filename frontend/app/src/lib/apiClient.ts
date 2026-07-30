declare global {
  interface Window {
    API_BASE_URL?: string
  }
}

export function getApiBaseUrl(): string {
  if (window.API_BASE_URL) {
    return window.API_BASE_URL
  }
  const stored = window.localStorage.getItem('backendUrl')
  if (stored) {
    return stored
  }
  return '/api'
}

/** Thrown by `apiFetch` so callers can branch on HTTP status (e.g. skip retries on 404). */
export class ApiError extends Error {
  status: number
  detail: string | null

  constructor(status: number, statusText: string, detail?: string | null) {
    const message = detail?.trim() || `API request failed: ${status} ${statusText}`
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail ?? null
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = window.localStorage.getItem('token')
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    let detail: string | null = null
    try {
      const body = (await response.json()) as { detail?: unknown }
      if (typeof body?.detail === 'string') detail = body.detail
    } catch {
      // Non-JSON error bodies are fine — fall back to status text.
    }
    throw new ApiError(response.status, response.statusText, detail)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}
