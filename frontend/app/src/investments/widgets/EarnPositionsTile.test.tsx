import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '../../lib/apiClient'
import * as investmentsApi from '../investmentsApi'
import { BalanceVisibilityProvider } from '../../ui/BalanceVisibilityContext'
import { EarnPositionsTile } from './EarnPositionsTile'
import type { EarnPosition } from '../investmentsApi'

function renderTile(accountId = 1) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <BalanceVisibilityProvider>
        <EarnPositionsTile accountId={accountId} />
      </BalanceVisibilityProvider>
    </QueryClientProvider>,
  )
}

describe('EarnPositionsTile', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists flexible and locked earn positions once loaded', async () => {
    const positions: EarnPosition[] = [
      { asset: 'USDT', amount: 100, kind: 'flexible', apr: 0.025, accrued_yield: 1.5, lock_end_time: null },
      { asset: 'BNB', amount: 10, kind: 'locked', apr: null, accrued_yield: null, lock_end_time: '2026-06-01T00:00:00Z' },
    ]
    vi.spyOn(investmentsApi, 'getEarnPositions').mockResolvedValue(positions)

    renderTile()
    await waitFor(() => expect(screen.getByText('USDT')).toBeInTheDocument())
    expect(screen.getByText('BNB')).toBeInTheDocument()
  })

  it('treats a 501 (provider has no earn product) as an empty state, not an error', async () => {
    vi.spyOn(investmentsApi, 'getEarnPositions').mockRejectedValue(
      new ApiError(501, 'Not Implemented', 'Freedom24Provider does not support earn positions'),
    )

    renderTile()
    await waitFor(() => expect(screen.getByText(/no simple earn/i)).toBeInTheDocument())
  })
})
