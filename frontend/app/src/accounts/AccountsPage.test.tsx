import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { formatCurrency } from '../lib/format'
import * as accountsApi from './accountsApi'
import type { Account } from './accountsApi'
import { AccountsPage } from './AccountsPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <AccountsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function makeAccount(overrides: Partial<Account> = {}): Account {
  return {
    id: 1,
    user_id: 1,
    name: 'Checking',
    type: 'checking',
    currency: 'EUR',
    balance: 100,
    description: null,
    icon: null,
    is_active: true,
    is_linked: false,
    bank_connection_id: null,
    last_synced_at: null,
    sync_status: null,
    provider: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
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
        is_linked: false,
        bank_connection_id: null,
        last_synced_at: null,
        sync_status: null,
        provider: null,
        created_at: '',
        updated_at: '',
      },
    ])

    renderPage()

    expect(await screen.findAllByText('Checking')).not.toHaveLength(0)
    expect(screen.getAllByText(formatCurrency(250.5)).length).toBeGreaterThan(0)

    await userEvent.click(screen.getByRole('button', { name: /add account/i }))
    expect(screen.getByRole('heading', { name: /add an account/i })).toBeInTheDocument()
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
      is_linked: false,
      bank_connection_id: null,
      last_synced_at: null,
      sync_status: null,
      provider: null,
      created_at: '',
      updated_at: '',
    })

    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /add account/i }))
    await userEvent.type(screen.getByLabelText(/account name/i), 'Cash')
    await userEvent.type(screen.getByLabelText(/current balance/i), '20')
    await userEvent.click(screen.getByRole('button', { name: /create account/i }))

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ name: 'Cash', balance: 20 })),
    )
  })

  it('keeps inactive accounts out of the grid and the totals', async () => {
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([
      makeAccount({ id: 1, name: 'Everyday', balance: 100 }),
      makeAccount({ id: 2, name: 'Closed card', balance: 900, is_active: false }),
    ])

    renderPage()

    expect(await screen.findAllByText('Everyday')).not.toHaveLength(0)
    // Behind the collapsed Inactive section, so absent until asked for.
    expect(screen.queryByText('Closed card')).not.toBeInTheDocument()
    // Total held is the active account alone, not 1000.
    expect(screen.getAllByText(formatCurrency(100)).length).toBeGreaterThan(0)
    expect(screen.queryByText(formatCurrency(1000))).not.toBeInTheDocument()
  })

  it('reveals inactive accounts on demand', async () => {
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([
      makeAccount({ id: 1, name: 'Everyday' }),
      makeAccount({ id: 2, name: 'Closed card', is_active: false }),
    ])

    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /inactive/i }))

    expect(screen.getByText('Closed card')).toBeInTheDocument()
  })

  it('deactivates an account rather than deleting it', async () => {
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([
      makeAccount({ id: 1, name: 'Everyday' }),
    ])
    const setActive = vi
      .spyOn(accountsApi, 'setAccountActive')
      .mockResolvedValue(makeAccount({ id: 1, name: 'Everyday', is_active: false }))

    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /account actions/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /deactivate/i }))
    await userEvent.click(screen.getByRole('button', { name: /^deactivate$/i }))

    await waitFor(() => expect(setActive).toHaveBeenCalledWith(1, false))
  })
})
