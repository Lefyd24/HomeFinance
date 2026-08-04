import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AuthProvider, useAuth } from './AuthContext'
import * as authApi from './authApi'
import { apiFetch } from '../lib/apiClient'

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

  it('ignores a stored user when the token is gone', () => {
    // The user object outlives the token (cleared tokens, a half-finished
    // logout, a wiped cookie jar). Trusting it alone kept RequireAuth happy and
    // left the app "logged in" against a server that rejected every request.
    window.localStorage.setItem(
      'user',
      JSON.stringify({ id: 1, email: 'jane@example.com', full_name: null }),
    )

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    expect(screen.getByText('anon')).toBeInTheDocument()
  })

  it('a 401 from any authenticated request ends the session', async () => {
    window.localStorage.setItem('token', 'expired')
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
    expect(screen.getByText('authed')).toBeInTheDocument()

    await act(async () => {
      await apiFetch('/accounts/').catch(() => {})
    })

    await waitFor(() => expect(screen.getByText('anon')).toBeInTheDocument())
    expect(window.localStorage.getItem('token')).toBeNull()
    expect(window.localStorage.getItem('user')).toBeNull()
    vi.unstubAllGlobals()
  })

  it('login stores tokens/user and flips to authenticated', async () => {
    vi.spyOn(authApi, 'login').mockResolvedValue({
      access_token: 'a',
      refresh_token: 'r',
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
    expect(window.localStorage.getItem('token')).toBe('a')
    expect(window.localStorage.getItem('refresh_token')).toBe('r')
  })

  it('logout clears storage and flips to unauthenticated', async () => {
    window.localStorage.setItem('token', 'a')
    window.localStorage.setItem('refresh_token', 'r')
    window.localStorage.setItem('user', JSON.stringify({ email: 'jane@example.com' }))
    vi.spyOn(authApi, 'logout').mockResolvedValue(undefined)

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    )

    await act(async () => {
      await userEvent.click(screen.getByText('logout'))
    })

    expect(window.localStorage.getItem('token')).toBeNull()
    expect(screen.getByText('anon')).toBeInTheDocument()
  })
})
