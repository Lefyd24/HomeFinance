import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { AuthProvider } from '../auth/AuthContext'
import * as authApi from '../auth/authApi'
import { LoginPage } from './LoginPage'

function renderPage() {
  return render(
    <MemoryRouter>
      <AuthProvider>
        <LoginPage />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows a validation error when submitted empty', async () => {
    renderPage()
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))
    expect(await screen.findByText(/email is required/i)).toBeInTheDocument()
  })

  it('calls login with the entered credentials', async () => {
    const loginSpy = vi.spyOn(authApi, 'login').mockResolvedValue({
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

    renderPage()
    await userEvent.type(screen.getByLabelText(/email address/i), 'jane@example.com')
    await userEvent.type(screen.getByLabelText(/^password$/i), 'hunter2')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => expect(loginSpy).toHaveBeenCalledWith('jane@example.com', 'hunter2'))
  })

  it('shows the server error message on failed login', async () => {
    vi.spyOn(authApi, 'login').mockRejectedValue(new Error('API request failed: 401 Unauthorized'))

    renderPage()
    await userEvent.type(screen.getByLabelText(/email address/i), 'jane@example.com')
    await userEvent.type(screen.getByLabelText(/^password$/i), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText(/invalid email or password/i)).toBeInTheDocument()
  })
})
