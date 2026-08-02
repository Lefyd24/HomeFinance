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
 * An error carrying the API's own message.
 *
 * FastAPI puts the useful text in `detail`; without it the UI can only ever say
 * "request failed", which is useless for things like sync cooldowns or expired
 * bank consents where the message IS the instruction to the user.
 */
export class ApiError extends Error {
  readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    if (typeof body?.detail === 'string' && body.detail.trim()) {
      return body.detail
    }
    // Pydantic validation errors arrive as a list of {loc, msg, type}.
    if (Array.isArray(body?.detail)) {
      const messages = body.detail
        .map((item) => (item as { msg?: string })?.msg)
        .filter((msg): msg is string => Boolean(msg))
      if (messages.length) return messages.join('; ')
    }
  } catch {
    // Non-JSON body (proxy error page, empty response) — fall through.
  }
  return `API request failed: ${response.status} ${response.statusText}`
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
    throw new ApiError(await readErrorMessage(response), response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}
