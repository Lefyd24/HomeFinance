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
      vi.fn().mockResolvedValue({ ok: false, status: 401, statusText: 'Unauthorized' }),
    )

    await expect(apiFetch('/accounts/')).rejects.toThrow('API request failed: 401 Unauthorized')
  })

  it('returns undefined for a 204 No Content response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, status: 204, json: () => Promise.resolve(undefined) }),
    )

    await expect(apiFetch('/accounts/1')).resolves.toBeUndefined()
  })
})
