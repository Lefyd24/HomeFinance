import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { HoldingDetailCard } from './HoldingDetailCard'
import { BalanceVisibilityProvider } from '../../ui/BalanceVisibilityContext'
import type { PortfolioPosition } from '../investmentsApi'

// The card enriches itself from the company-research endpoint, which is not
// what any of this is about — and an unmocked fetch in jsdom is a hang, not a
// failure.
vi.mock('../useInvestments', () => ({
  useCompanyProfile: () => ({ data: null, isLoading: false }),
}))

function position(overrides: Partial<PortfolioPosition> = {}): PortfolioPosition {
  return {
    id: 1,
    account_id: 7,
    symbol: 'INUV.US',
    name: 'Inuvo Inc',
    quantity: 10,
    avg_price: 1,
    current_price: 1.2,
    market_value: 12,
    currency: 'USD',
    synced_at: '2026-08-11T00:00:00Z',
    cost_basis: 10,
    unrealized_pnl: 2,
    unrealized_return_pct: 20,
    market_value_base: 12,
    cost_basis_base: 10,
    unrealized_pnl_base: 2,
    fx_rate: 1,
    day_change: -0.5,
    day_change_base: -0.5,
    day_change_pct: -4,
    exchange: 'FIX',
    weight_pct: 5,
    fees_paid_base: 3,
    fee_count: 2,
    ...overrides,
  }
}

function renderCard(p: PortfolioPosition) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <BalanceVisibilityProvider>
          <HoldingDetailCard position={p} currency="EUR" provider="freedom24" onClose={() => {}} />
        </BalanceVisibilityProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('HoldingDetailCard', () => {
  it('shows commission alongside cost and adds the two into what was paid', () => {
    renderCard(position())
    const dialog = screen.getByRole('dialog')

    expect(dialog).toHaveTextContent('Commission paid')
    expect(dialog).toHaveTextContent('2 charges')
    // Cost 10 + commission 3, in the account's currency.
    expect(dialog).toHaveTextContent('Total out of pocket')
    expect(dialog).toHaveTextContent('13')
  })

  it('reports the return after the commission, on top of the headline gross', () => {
    renderCard(position())
    const dialog = screen.getByRole('dialog')

    // A +2 gain against 3 of commission is a real loss of 1 on 13 paid in,
    // which is the whole reason the net line exists.
    expect(dialog).toHaveTextContent('Return after fees')
    expect(dialog).toHaveTextContent('-7.69%')
    // The gross figure belongs to the headline and is not restated below it.
    expect(dialog).not.toHaveTextContent('Return before fees')
  })

  it('states quantity and average price once, as the cost line’s working', () => {
    renderCard(position())
    const dialog = screen.getByRole('dialog')

    expect(dialog).toHaveTextContent('10 × 1,00 $')
    expect(dialog).not.toHaveTextContent('Avg price')
    expect(dialog).not.toHaveTextContent('Qty')
  })

  it('drops the market-news link and keeps the actions on one compact row', () => {
    renderCard(position())

    expect(screen.queryByRole('link', { name: /news/i })).not.toBeInTheDocument()
    expect(screen.getAllByRole('link')).toHaveLength(3)
  })

  it('omits the after-fees line when the broker charged nothing', () => {
    renderCard(position({ fees_paid_base: null, fee_count: 0 }))
    const dialog = screen.getByRole('dialog')

    expect(dialog).toHaveTextContent('no commission')
    expect(dialog).not.toHaveTextContent('Return after fees')
    expect(dialog).not.toHaveTextContent('Total out of pocket')
  })

  it('links to the holding’s own history page, scoped to the account', () => {
    renderCard(position())
    expect(screen.getByRole('link', { name: /full history/i })).toHaveAttribute(
      'href',
      '/investments/holdings/7/INUV.US',
    )
  })
})
