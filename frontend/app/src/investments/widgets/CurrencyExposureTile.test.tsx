import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CurrencyExposureTile } from './CurrencyExposureTile'
import { BalanceVisibilityProvider } from '../../ui/BalanceVisibilityContext'
import type { PortfolioPosition } from '../investmentsApi'

function position(overrides: Partial<PortfolioPosition> = {}): PortfolioPosition {
  return {
    id: 1,
    account_id: 1,
    symbol: 'AAA',
    name: 'Alpha',
    quantity: 10,
    avg_price: 10,
    current_price: 12,
    market_value: 120,
    currency: 'EUR',
    synced_at: '2026-01-01T00:00:00Z',
    cost_basis: 100,
    unrealized_pnl: 20,
    unrealized_return_pct: 20,
    market_value_base: 120,
    cost_basis_base: 100,
    unrealized_pnl_base: 20,
    fx_rate: 1,
    day_change: 2,
    day_change_pct: 1.5,
    exchange: 'XETRA',
    weight_pct: 50,
    ...overrides,
  }
}

describe('CurrencyExposureTile', () => {
  it('groups positions by currency and ranks by exposure', () => {
    render(
      <BalanceVisibilityProvider>
        <CurrencyExposureTile
          positions={[
            position({ id: 1, currency: 'USD', market_value_base: 300 }),
            position({ id: 2, currency: 'EUR', market_value_base: 100 }),
          ]}
          currency="EUR"
          loading={false}
        />
      </BalanceVisibilityProvider>,
    )
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('USD')
    expect(rows[0]).toHaveTextContent('75.0%')
    expect(rows[1]).toHaveTextContent('EUR')
  })

  it('shows a quiet message when everything is already in one currency', () => {
    render(
      <BalanceVisibilityProvider>
        <CurrencyExposureTile
          positions={[position({ currency: 'EUR' })]}
          currency="EUR"
          loading={false}
        />
      </BalanceVisibilityProvider>,
    )
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
    expect(screen.getByText(/EUR/)).toBeInTheDocument()
  })
})
