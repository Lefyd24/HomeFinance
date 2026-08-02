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

/**
 * Thrown by `apiFetch` so callers can branch on HTTP status (e.g. skip retries
 * on 404) and still show the API's own words.
 *
 * FastAPI puts the useful text in `detail`; without it the UI can only ever say
 * "request failed", which is useless for things like sync cooldowns or expired
 * bank consents where the message IS the instruction to the user.
 */
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

/** Pull the human-readable message out of an error body, in either shape FastAPI uses. */
async function readErrorDetail(response: Response): Promise<string | null> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body?.detail === 'string' && body.detail.trim()) {
      return body.detail
    }
    // Validation errors arrive as a list of {loc, msg, type} rather than a string.
    if (Array.isArray(body?.detail)) {
      const messages = body.detail
        .map((item) => (item as { msg?: string })?.msg)
        .filter((msg): msg is string => Boolean(msg))
      if (messages.length) return messages.join('; ')
    }
  } catch {
    // Non-JSON error bodies are fine — the caller falls back to status text.
  }
  return null
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
    throw new ApiError(response.status, response.statusText, await readErrorDetail(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}
