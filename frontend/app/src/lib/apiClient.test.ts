import { afterEach, describe, expect, it, vi } from 'vitest'
import { getApiBaseUrl, apiFetch } from './apiClient'

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
    const { ApiError } = await import('./apiClient')
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
    } satisfies Partial<InstanceType<typeof ApiError>>)
  })

  it('returns undefined for a 204 No Content response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve(undefined) }),
    )

    await expect(apiFetch('/accounts/1')).resolves.toBeUndefined()
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
