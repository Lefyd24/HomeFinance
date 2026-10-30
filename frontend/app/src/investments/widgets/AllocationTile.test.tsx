import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AllocationTile } from './AllocationTile'
import { BalanceVisibilityProvider } from '../../ui/BalanceVisibilityContext'
import type { InvestmentAccount, PortfolioPosition } from '../investmentsApi'

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
    day_change_base: 2,
    day_change_pct: 1.5,
    exchange: 'XETRA',
    weight_pct: 50,
    fees_paid_base: null,
    fee_count: 0,
    ...overrides,
  }
}

function renderTile(positions: PortfolioPosition[], accounts: InvestmentAccount[] = [], cash?: number) {
  return render(
    <BalanceVisibilityProvider>
      <AllocationTile positions={positions} accounts={accounts} currency="EUR" loading={false} cash={cash} />
    </BalanceVisibilityProvider>,
  )
}

const SHARED_FAHRENHEIT = [300, 300, 200, 150, 100, 80, 60, 40]

describe('AllocationTile', () => {
  it('folds holdings past the top six into Other and shows seven legend rows', () => {
    const positions = SHARED_FAHRENHEIT.map((value, index) =>
      position({ id: index + 1, symbol: `STK${index + 1}`, market_value_base: value }),
    )
    renderTile(positions)

    const legendRows = screen.getAllByRole('listitem')
    expect(legendRows).toHaveLength(7)
    // Largest first; the last row is the fold-in.
    expect(legendRows[0]).toHaveTextContent('STK1')
    expect(legendRows[6]).toHaveTextContent('Other')
    expect(legendRows[6]).toHaveTextContent('100,00 €')
  })

  it('shows percentages that sum to 100', () => {
    const oddSet = [300, 200, 100, 133]
    const symbols = ['ALF', 'BTA', 'GLT', 'IRN']
    const positions = oddSet.map((value, index) =>
      position({ id: index + 1, symbol: symbols[index], market_value_base: value }),
    )
    renderTile(positions)

    const legendRows = screen.getAllByRole('listitem')
    const sum = legendRows.reduce((total, row) => {
      const match = row.textContent?.match(/([\d.,]+)%/)
      return total + Number(match?.[1].replace(',', '.'))
    }, 0)
    expect(Math.round(sum * 10) / 10).toBe(100)
  })

  it('adds a Cash slice so the donut reconciles with the total value', () => {
    renderTile([position({ market_value_base: 300 })], [], 100)

    const legendRows = screen.getAllByRole('listitem')
    expect(legendRows).toHaveLength(2)
    expect(legendRows[1]).toHaveTextContent('Cash')
    expect(legendRows[1]).toHaveTextContent('25.0%')
  })

  it('groups exposure by currency when asked', async () => {
    const user = userEvent.setup()
    renderTile([
      position({ id: 1, symbol: 'AAA', currency: 'USD', market_value_base: 300 }),
      position({ id: 2, symbol: 'BBB', currency: 'EUR', market_value_base: 100 }),
    ])
    await user.click(screen.getByRole('radio', { name: 'By currency' }))
    const legendRows = screen.getAllByRole('listitem')
    expect(legendRows).toHaveLength(2)
    expect(legendRows[0]).toHaveTextContent('USD')
    expect(legendRows[1]).toHaveTextContent('EUR')
  })
})
