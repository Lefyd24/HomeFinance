// frontend/app/src/auth/authApi.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { login, register, getMe, refresh } from './authApi'

describe('authApi', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('login posts form-encoded username/password to /api/auth/login', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ access_token: 'a', refresh_token: 'r', token_type: 'bearer' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const result = await login('jane@example.com', 'hunter2')

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/auth/login')
    expect(init.method).toBe('POST')
    expect(init.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(init.body).toBe('username=jane%40example.com&password=hunter2')
    expect(result).toEqual({ access_token: 'a', refresh_token: 'r', token_type: 'bearer' })
  })

  it('register posts JSON to /api/auth/register', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () => Promise.resolve({ id: 1, email: 'jane@example.com', is_active: true, is_admin: false, email_verified: false, created_at: '2026-01-01T00:00:00Z' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await register({ email: 'jane@example.com', password: 'hunter2', invite_code: 'ABC123' })

    const [url, init] = mockFetch.mock.calls[0]
    expect(url).toBe('/api/auth/register')
    expect(JSON.parse(init.body)).toEqual({ email: 'jane@example.com', password: 'hunter2', invite_code: 'ABC123' })
  })

  it('getMe calls /api/auth/me', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 1, email: 'jane@example.com', is_active: true, is_admin: false, email_verified: true, created_at: '2026-01-01T00:00:00Z' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    const user = await getMe()

    expect(mockFetch).toHaveBeenCalledWith('/api/auth/me', expect.any(Object))
    expect(user.email).toBe('jane@example.com')
  })

  it('refresh posts the refresh token as a query param', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ access_token: 'a2', refresh_token: 'r2', token_type: 'bearer' }),
    })
    vi.stubGlobal('fetch', mockFetch)

    await refresh('r')

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/auth/refresh?refresh_token=r',
      expect.objectContaining({ method: 'POST' }),
    )
  })
})
