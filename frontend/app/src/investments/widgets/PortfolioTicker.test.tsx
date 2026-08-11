import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PortfolioTicker } from './PortfolioTicker'
import { BalanceVisibilityProvider } from '../../ui/BalanceVisibilityContext'
import type { PortfolioTotals } from '../portfolioInsights'
import type { InvestmentAccount } from '../investmentsApi'

function totals(overrides: Partial<PortfolioTotals> = {}): PortfolioTotals {
  return {
    currency: 'EUR',
    value: 10000,
    invested: 8000,
    cash: 2000,
    costBasis: 7000,
    pnl: 1000,
    returnPct: 14.3,
    dayChange: 50,
    dayChangePct: 0.5,
    positionCount: 3,
    accountCount: 1,
    ...overrides,
  }
}

function account(overrides: Partial<InvestmentAccount> = {}): InvestmentAccount {
  return {
    id: 1,
    user_id: 1,
    name: 'Broker',
    provider: 'freedom24',
    currency: 'EUR',
    balance: 10000,
    icon: null,
    is_active: true,
    last_synced_at: null,
    sync_status: 'ok',
    sync_error: null,
    total_cost_basis: 7000,
    total_market_value: 8000,
    total_return_pct: 14.3,
    total_unrealized_pnl: 1000,
    cash_balance: 2000,
    positions_value: 8000,
    day_change: 50,
    day_change_pct: 0.5,
    position_count: 3,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('PortfolioTicker', () => {
  it('shows total value, today, all-time and cash as distinct stat cells', () => {
    render(
      <BalanceVisibilityProvider>
        <PortfolioTicker
          totals={totals()}
          scopeLabel="Broker"
          accounts={[account()]}
          onSync={vi.fn()}
          syncing={false}
          syncDisabled={false}
        />
      </BalanceVisibilityProvider>,
    )
    expect(screen.getByText(/10\.000/)).toBeInTheDocument()
    expect(screen.getByText(/\+50/)).toBeInTheDocument()
    expect(screen.getByText(/\+1\.000/)).toBeInTheDocument()
    expect(screen.getByText(/2\.000/)).toBeInTheDocument()
  })

  it("falls back to a no-quote message when today's change is unknown", () => {
    render(
      <BalanceVisibilityProvider>
        <PortfolioTicker
          totals={totals({ dayChange: null, dayChangePct: null })}
          scopeLabel="Broker"
          accounts={[account()]}
          onSync={vi.fn()}
          syncing={false}
          syncDisabled={false}
        />
      </BalanceVisibilityProvider>,
    )
    expect(screen.getByText(/no live quote/i)).toBeInTheDocument()
  })
})
