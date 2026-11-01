import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from './AuthContext'
import * as authApi from './authApi'
import { apiFetch, getAccessToken, setAccessToken } from '../lib/apiClient'

function TestConsumer() {
  const { user, isAuthenticated, login, logout } = useAuth()
  return (
    <div>
      <span>{isAuthenticated ? 'authed' : 'anon'}</span>
      <span>{user?.email ?? 'no-user'}</span>
      <button onClick={() => login('jane@example.com', 'hunter2')}>login</button>
      <button onClick={() => logout()}>logout</button>
    </div>
  )
}

describe('AuthContext', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    setAccessToken(null)
    window.localStorage.clear()
  })

  it('starts unauthenticated with no stored token', () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )
    expect(screen.getByText('anon')).toBeInTheDocument()
  })

  it('boots logged out when the refresh cookie is rejected', async () => {
    window.localStorage.setItem(
      'user',
      JSON.stringify({ id: 1, email: 'jane@example.com', full_name: null }),
    )
    vi.spyOn(authApi, 'refresh').mockRejectedValue(new Error('401'))

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText('anon')).toBeInTheDocument())
    expect(window.localStorage.getItem('user')).toBeNull()
  })

  it('restores the session on reload by refreshing into memory', async () => {
    window.localStorage.setItem('token', 'legacy')
    window.localStorage.setItem('refresh_token', 'legacy')
    window.localStorage.setItem(
      'user',
      JSON.stringify({ id: 1, email: 'jane@example.com', full_name: null }),
    )
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ access_token: 'fresh', token_type: 'bearer' })

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    await waitFor(() => expect(screen.getByText('authed')).toBeInTheDocument())
    expect(getAccessToken()).toBe('fresh')
    expect(window.localStorage.getItem('token')).toBeNull()
    expect(window.localStorage.getItem('refresh_token')).toBeNull()
  })

  it('a 401 from any authenticated request ends the session', async () => {
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ access_token: 'expired', token_type: 'bearer' })
    window.localStorage.setItem(
      'user',
      JSON.stringify({ id: 1, email: 'jane@example.com', full_name: null }),
    )
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: () => Promise.resolve({ detail: 'Could not validate credentials' }),
      }),
    )

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )
    expect(await screen.findByText('authed')).toBeInTheDocument()

    await act(async () => {
      await apiFetch('/accounts/').catch(() => {})
    })

    await waitFor(() => expect(screen.getByText('anon')).toBeInTheDocument())
    expect(getAccessToken()).toBeNull()
    expect(window.localStorage.getItem('user')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('login keeps the token in memory and flips to authenticated', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValue({
      access_token: 'a',
      token_type: 'bearer',
    })
    vi.spyOn(authApi, 'getMe').mockResolvedValue({
      id: 1,
      email: 'jane@example.com',
      full_name: null,
      is_active: true,
      is_admin: false,
      email_verified: true,
      created_at: '2026-01-01T00:00:00Z',
    })

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    await userEvent.click(screen.getByText('login'))

    await waitFor(() => expect(screen.getByText('authed')).toBeInTheDocument())
    expect(screen.getByText('jane@example.com')).toBeInTheDocument()
    expect(getAccessToken()).toBe('a')
    expect(window.localStorage.getItem('token')).toBeNull()
    expect(window.localStorage.getItem('refresh_token')).toBeNull()
  })

  it('logout clears storage and flips to unauthenticated', async () => {
    setAccessToken('a')
    window.localStorage.setItem('user', JSON.stringify({ email: 'jane@example.com' }))
    vi.spyOn(authApi, 'refresh').mockResolvedValue({ access_token: 'a', token_type: 'bearer' })
    vi.spyOn(authApi, 'logout').mockResolvedValue(undefined)

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    await userEvent.click(await screen.findByText('logout'))

    await waitFor(() => expect(screen.getByText('anon')).toBeInTheDocument())
    expect(getAccessToken()).toBeNull()
    expect(screen.getByText('anon')).toBeInTheDocument()
  })
})
