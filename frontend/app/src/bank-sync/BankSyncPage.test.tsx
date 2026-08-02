import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { toast } from 'sonner'
import type { ReactNode } from 'react'
import * as bankSyncApi from './bankSyncApi'
import type { BankConnection } from './bankSyncApi'
import { BankSyncPage } from './BankSyncPage'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}))

function makeConnection(overrides: Partial<BankConnection> = {}): BankConnection {
  return {
    id: 1,
    aspsp_name: 'Eurobank',
    aspsp_country: 'GR',
    status: 'active',
    consent_valid_until: null,
    last_sync_at: null,
    last_sync_error: null,
    created_at: '2026-08-01T10:00:00',
    accounts: [],
    ...overrides,
  }
}

function renderPage(initialPath = '/connections') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }
  return render(<BankSyncPage />, { wrapper: Wrapper })
}

describe('BankSyncPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows an empty state when no banks are connected', async () => {
    vi.spyOn(bankSyncApi, 'listConnections').mockResolvedValue([])
    renderPage()
    expect(await screen.findByText('No banks connected')).toBeInTheDocument()
  })

  it('lists a connection with its linked accounts', async () => {
    vi.spyOn(bankSyncApi, 'listConnections').mockResolvedValue([
      makeConnection({
        accounts: [
          {
            id: 10,
            name: 'Eurobank Current',
            currency: 'EUR',
            balance: 1234.5,
            last_synced_at: null,
            sync_status: 'ok',
          },
        ],
      }),
    ])
    renderPage()
    expect(await screen.findByText('Eurobank')).toBeInTheDocument()
    expect(screen.getByText('Eurobank Current')).toBeInTheDocument()
  })

  it('warns that a connection with no accounts needs whitelisting', async () => {
    // The most confusing failure in restricted mode: the bank login succeeds
    // but returns nothing, because the accounts were never whitelisted.
    vi.spyOn(bankSyncApi, 'listConnections').mockResolvedValue([makeConnection()])
    renderPage()
    expect(
      await screen.findByText(/whitelisted in the\s+Enable Banking Control Panel/i),
    ).toBeInTheDocument()
  })

  it('flags an expired connection as needing reconnection', async () => {
    vi.spyOn(bankSyncApi, 'listConnections').mockResolvedValue([
      makeConnection({ status: 'expired' }),
    ])
    renderPage()
    expect(await screen.findByText(/no longer syncing/i)).toBeInTheDocument()
  })

  it('warns when consent expires soon', async () => {
    const inThreeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
    vi.spyOn(bankSyncApi, 'listConnections').mockResolvedValue([
      makeConnection({ consent_valid_until: inThreeDays }),
    ])
    renderPage()
    expect(await screen.findByText(/Access expires in 3 day/i)).toBeInTheDocument()
  })

  it('disables Sync now for a connection that is not active', async () => {
    vi.spyOn(bankSyncApi, 'listConnections').mockResolvedValue([
      makeConnection({ status: 'expired' }),
    ])
    renderPage()
    expect(await screen.findByRole('button', { name: /sync now/i })).toBeDisabled()
  })

  it('reports success after returning from the bank', async () => {
    vi.spyOn(bankSyncApi, 'listConnections').mockResolvedValue([makeConnection()])
    renderPage('/connections?linked=1&accounts=2')
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Bank connected — 2 account(s) linked'),
    )
  })

  it('explains a callback failure in the user’s terms', async () => {
    vi.spyOn(bankSyncApi, 'listConnections').mockResolvedValue([])
    renderPage('/connections?error=no_accounts')
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        expect.stringContaining('Enable Banking Control Panel'),
      ),
    )
  })

  it('falls back to a generic message for an unknown callback error', async () => {
    vi.spyOn(bankSyncApi, 'listConnections').mockResolvedValue([])
    renderPage('/connections?error=something_new')
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'The bank connection could not be completed.',
      ),
    )
  })
})
