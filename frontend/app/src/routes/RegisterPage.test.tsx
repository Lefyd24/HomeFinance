import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import * as authApi from '../auth/authApi'
import { RegisterPage } from './RegisterPage'

describe('RegisterPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('submits email, password, and invite code', async () => {
    const registerSpy = vi.spyOn(authApi, 'register').mockResolvedValue({
      id: 1,
      email: 'jane@example.com',
      full_name: null,
      is_active: true,
      is_admin: false,
      email_verified: false,
      created_at: '2026-01-01T00:00:00Z',
    })

    render(
      <MemoryRouter>
        <RegisterPage />
      </MemoryRouter>,
    )

    await userEvent.type(screen.getByLabelText(/email address/i), 'jane@example.com')
    await userEvent.type(screen.getByLabelText(/^password$/i), 'hunter22')
    await userEvent.type(screen.getByLabelText(/invite code/i), 'ABC123')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(registerSpy).toHaveBeenCalledWith({
        email: 'jane@example.com',
        password: 'hunter22',
        invite_code: 'ABC123',
      }),
    )
  })
})
