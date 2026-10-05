import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, getApiBaseUrl, apiFetch, setUnauthorizedHandler } from './apiClient'

describe('getApiBaseUrl', () => {
  afterEach(() => {
    delete (window as unknown as { API_BASE_URL?: string }).API_BASE_URL
    window.localStorage.clear()
  })

  it('defaults to the relative /api path', () => {
    expect(getApiBaseUrl()).toBe('/api')
  })

  it('prefers window.API_BASE_URL when set', () => {
    ;(window as unknown as { API_BASE_URL?: string }).API_BASE_URL = 'http://192.168.1.50:8223/api'
    expect(getApiBaseUrl()).toBe('http://192.168.1.50:8223/api')
  })

  it('falls back to a stored backendUrl override', () => {
    window.localStorage.setItem('backendUrl', 'http://192.168.1.50:8223/api')
    expect(getApiBaseUrl()).toBe('http://192.168.1.50:8223/api')
  })
})

describe('apiFetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    window.localStorage.clear()
  })

  it('joins the base URL with the given path and parses JSON', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 1, name: 'Checking' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await apiFetch<{ id: number; name: string }>('/accounts/1')

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/accounts/1',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      }),
    )
    expect(result).toEqual({ id: 1, name: 'Checking' })
  })

  it('throws on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.reject(new Error('no body')),
      }),
    )

    await expect(apiFetch('/accounts/')).rejects.toThrow('API request failed: 401 Unauthorized')
  })

  it('prefers FastAPI detail and exposes status on ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: () => Promise.resolve({ detail: 'No company data for symbol: ZZZ' }),
      }),
    )

    await expect(apiFetch('/investments/company/ZZZ')).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
      message: 'No company data for symbol: ZZZ',
    } satisfies Partial<ApiError>)
  })

  it('returns undefined for a 204 No Content response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve(undefined) }),
    )

    await expect(apiFetch('/accounts/1')).resolves.toBeUndefined()
  })

  it("surfaces the API's own detail message", async () => {
    // For bank sync the detail IS the instruction to the user (sync cooldowns,
    // expired consent), so it must not be swallowed in favour of status text.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: () => Promise.resolve({ detail: 'Synced recently. Try again in 12 minute(s).' }),
      }),
    )

    await expect(apiFetch('/bank-sync/connections/1/sync')).rejects.toThrow(
      'Synced recently. Try again in 12 minute(s).',
    )
  })

  it('exposes the status code on the thrown ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        statusText: 'Conflict',
        json: () => Promise.resolve({ detail: 'Consent expired' }),
      }),
    )

    await expect(apiFetch('/x')).rejects.toBeInstanceOf(ApiError)
    await expect(apiFetch('/x')).rejects.toMatchObject({ status: 409, name: 'ApiError' })
  })

  it('joins pydantic validation errors into one message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        statusText: 'Unprocessable Entity',
        json: () =>
          Promise.resolve({
            detail: [
              { loc: ['body', 'aspsp_name'], msg: 'field required' },
              { loc: ['body', 'aspsp_country'], msg: 'string too short' },
            ],
          }),
      }),
    )

    await expect(apiFetch('/x')).rejects.toThrow('field required; string too short')
  })

  it('falls back to status text when the body is not JSON', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        json: () => Promise.reject(new Error('not json')),
      }),
    )

    await expect(apiFetch('/x')).rejects.toThrow('API request failed: 502 Bad Gateway')
  })

  /**
   * A dead session used to be completely silent: the token expired, every
   * request 401'd, and nothing anywhere turned that into "you are logged out".
   * The stored `user` object kept RequireAuth satisfied, so the app sat there
   * rendering empty pages forever.
   */
  describe('401 handling', () => {
    afterEach(() => {
      setUnauthorizedHandler(null)
    })

    const unauthorized = () =>
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ detail: 'Could not validate credentials' }),
      })

    it('notifies the handler when an authenticated request is rejected', async () => {
      window.localStorage.setItem('token', 'expired-token')
      vi.stubGlobal('fetch', unauthorized())
      const onUnauthorized = vi.fn()
      setUnauthorizedHandler(onUnauthorized)

      await expect(apiFetch('/accounts/')).rejects.toBeInstanceOf(ApiError)

      expect(onUnauthorized).toHaveBeenCalledTimes(1)
    })

    it('stays quiet for a failed login, which 401s on a wrong password', async () => {
      vi.stubGlobal('fetch', unauthorized())
      const onUnauthorized = vi.fn()
      setUnauthorizedHandler(onUnauthorized)

      await expect(apiFetch('/auth/login', { method: 'POST' })).rejects.toBeInstanceOf(ApiError)

      expect(onUnauthorized).not.toHaveBeenCalled()
    })

    it('stays quiet when the caller never had a token to begin with', async () => {
      vi.stubGlobal('fetch', unauthorized())
      const onUnauthorized = vi.fn()
      setUnauthorizedHandler(onUnauthorized)

      await expect(apiFetch('/accounts/')).rejects.toBeInstanceOf(ApiError)

      expect(onUnauthorized).not.toHaveBeenCalled()
    })

    it('still throws so callers can render their own error state', async () => {
      window.localStorage.setItem('token', 'expired-token')
      vi.stubGlobal('fetch', unauthorized())
      setUnauthorizedHandler(vi.fn())

      await expect(apiFetch('/accounts/')).rejects.toMatchObject({ status: 401 })
    })

    it('does not fire for other error statuses', async () => {
      window.localStorage.setItem('token', 'good-token')
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: false,
          status: 403,
          statusText: 'Forbidden',
          json: () => Promise.resolve({ detail: 'Not permitted' }),
        }),
      )
      const onUnauthorized = vi.fn()
      setUnauthorizedHandler(onUnauthorized)

      await expect(apiFetch('/admin/users')).rejects.toBeInstanceOf(ApiError)

      expect(onUnauthorized).not.toHaveBeenCalled()
    })
  })

  it('attaches Authorization Bearer when a token is present', async () => {
    window.localStorage.setItem('token', 'test-token')
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await apiFetch('/accounts/')

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/accounts/',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer test-token',
          'Content-Type': 'application/json',
        }),
      }),
    )
  })
})

describe('apiFetch with FormData', () => {
  it('lets the browser set the multipart Content-Type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    await apiFetch('/import/upload', { method: 'POST', body: new FormData() })
    const headers = fetchMock.mock.calls[0][1].headers as Record<string, string>
    expect(headers['Content-Type']).toBeUndefined()
    vi.unstubAllGlobals()
  })
})
