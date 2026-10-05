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


/**
 * Called when the server rejects a request we made *as a logged-in user* —
 * i.e. the session is over, not "you typed the wrong password".
 *
 * This lives here because `apiFetch` is the only place that sees every
 * response. AuthProvider registers a handler that tears the session down; the
 * router then bounces to /login on the next render. Without it an expired token
 * was invisible: the stored user object kept the app looking logged in while
 * every request quietly failed.
 */
type UnauthorizedHandler = () => void

let unauthorizedHandler: UnauthorizedHandler | null = null

export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler
}

/**
 * A 401 from the login endpoint means bad credentials — the login form shows
 * that itself, and treating it as a dead session would be nonsense (there is no
 * session yet). Every other 401 on a request that carried a token means the
 * token is no longer good.
 */
function isSessionEndingUnauthorized(path: string, hadToken: boolean): boolean {
  return hadToken && !path.startsWith('/auth/login')
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = window.localStorage.getItem('token')
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      // FormData needs the browser-generated multipart boundary header.
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  })

  if (!response.ok) {
    if (response.status === 401 && isSessionEndingUnauthorized(path, Boolean(token))) {
      unauthorizedHandler?.()
    }
    // Still thrown either way, so callers keep their own error states.
    throw new ApiError(response.status, response.statusText, await readErrorDetail(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}
