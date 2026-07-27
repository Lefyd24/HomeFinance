import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as accountsApi from './accountsApi'
import { AccountsPage } from './AccountsPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AccountsPage />
    </QueryClientProvider>,
  )
}

describe('AccountsPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists accounts and opens the add-account dialog', async () => {
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([
      {
        id: 1,
        user_id: 1,
        name: 'Checking',
        type: 'checking',
        currency: 'EUR',
        balance: 250.5,
        description: null,
        icon: null,
        is_active: true,
        created_at: '',
        updated_at: '',
      },
    ])

    renderPage()

    expect(await screen.findByText('Checking')).toBeInTheDocument()
    expect(screen.getByText('€250.50')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /add account/i }))
    expect(screen.getByRole('heading', { name: /add account/i })).toBeInTheDocument()
  })

  it('submits the new-account form', async () => {
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([])
    const createSpy = vi.spyOn(accountsApi, 'createAccount').mockResolvedValue({
      id: 1,
      user_id: 1,
      name: 'Cash',
      type: 'cash',
      currency: 'EUR',
      balance: 20,
      description: null,
      icon: null,
      is_active: true,
      created_at: '',
      updated_at: '',
    })

    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /add account/i }))
    await userEvent.type(screen.getByLabelText(/account name/i), 'Cash')
    await userEvent.type(screen.getByLabelText(/starting balance/i), '20')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'Cash', balance: 20 })),
    )
  })
})
