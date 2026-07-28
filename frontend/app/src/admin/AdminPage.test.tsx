import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from '../auth/AuthContext'
import * as adminApi from './adminApi'
import { AdminPage } from './AdminPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <AdminPage />
      </AuthProvider>
    </QueryClientProvider>,
  )
}

describe('AdminPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists users and invite codes with status badges', async () => {
    vi.spyOn(adminApi, 'listUsers').mockResolvedValue([
      {
        id: 1,
        email: 'jane@example.com',
        full_name: 'Jane',
        is_active: true,
        is_admin: true,
        email_verified: true,
        created_at: '2024-01-15T00:00:00Z',
      },
      {
        id: 2,
        email: 'bob@example.com',
        full_name: null,
        is_active: false,
        is_admin: false,
        email_verified: false,
        created_at: '2024-02-01T00:00:00Z',
      },
    ])
    vi.spyOn(adminApi, 'listInvites').mockResolvedValue([
      {
        id: 1,
        label: 'Friend invite',
        created_by_user_id: 1,
        expires_at: null,
        used_at: null,
        used_by_user_id: null,
        revoked_at: null,
        created_at: '2024-01-10T00:00:00Z',
        status: 'active',
      },
    ])

    renderPage()

    expect(await screen.findByText('jane@example.com')).toBeInTheDocument()
    expect(screen.getByText('Friend invite')).toBeInTheDocument()
    expect(screen.getAllByText('Verified').length).toBeGreaterThan(0)
    expect(screen.getByText('Pending')).toBeInTheDocument()
    expect(screen.getByText('Revoke')).toBeInTheDocument()
  })

  it('opens create invite dialog', async () => {
    vi.spyOn(adminApi, 'listUsers').mockResolvedValue([])
    vi.spyOn(adminApi, 'listInvites').mockResolvedValue([])

    const user = userEvent.setup()
    renderPage()

    await user.click(await screen.findByRole('button', { name: /new invite/i }))
    expect(screen.getByRole('dialog', { name: /new invite code/i })).toBeInTheDocument()
  })
})
