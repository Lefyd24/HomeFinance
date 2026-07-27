import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as adminApi from './adminApi'
import { AdminPage } from './AdminPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AdminPage />
    </QueryClientProvider>,
  )
}

describe('AdminPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists users and invite codes', async () => {
    vi.spyOn(adminApi, 'listUsers').mockResolvedValue([
      {
        id: 1,
        email: 'jane@example.com',
        full_name: 'Jane',
        is_active: true,
        is_admin: true,
        email_verified: true,
        created_at: '',
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
        created_at: '',
        status: 'active',
      },
    ])

    renderPage()

    expect(await screen.findByText('jane@example.com')).toBeInTheDocument()
    expect(screen.getByText('Friend invite')).toBeInTheDocument()
  })
})
