import { afterEach, describe, expect, it, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import * as accountsApi from './accountsApi'
import { useAccounts, useCreateAccount } from './useAccounts'

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

describe('useAccounts', () => {
  afterEach(() => vi.restoreAllMocks())

  it('fetches and returns the account list', async () => {
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([
      {
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
      },
    ])

    const { result } = renderHook(() => useAccounts(), { wrapper })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(result.current.data).toHaveLength(1)
    expect(result.current.data?.[0].name).toBe('Checking')
  })
})

describe('useCreateAccount', () => {
  afterEach(() => vi.restoreAllMocks())

  it('calls createAccount with the given input', async () => {
    const createSpy = vi.spyOn(accountsApi, 'createAccount').mockResolvedValue({
      id: 2,
      user_id: 1,
      name: 'Savings',
      type: 'savings',
      currency: 'EUR',
      balance: 0,
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

    const { result } = renderHook(() => useCreateAccount(), { wrapper })
    await result.current.mutateAsync({ name: 'Savings', type: 'savings', currency: 'EUR', balance: 0 })

    expect(createSpy).toHaveBeenCalledWith({
      name: 'Savings',
      type: 'savings',
      currency: 'EUR',
      balance: 0,
    })
  })
})
