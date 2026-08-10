import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TradingCostsTile } from './TradingCostsTile'
import type { InvestmentTransaction } from '../investmentsApi'

function txn(overrides: Partial<InvestmentTransaction> = {}): InvestmentTransaction {
  return {
    id: 1,
    account_id: 1,
    external_id: 'trade-1-fee',
    type: 'fee',
    symbol: 'AAPL.US',
    quantity: null,
    price: null,
    amount: -1.5,
    currency: 'USD',
    date: '2026-01-05T00:00:00Z',
    ...overrides,
  }
}

describe('TradingCostsTile', () => {
  it('totals commissions across every fee transaction, not just the ones shown', () => {
    const transactions = [
      txn({ id: 1, amount: -1.5 }),
      txn({ id: 2, amount: -2.5 }),
      txn({ id: 3, type: 'buy', amount: -100 }), // not a fee — excluded
    ]
    render(<TradingCostsTile transactions={transactions} currency="USD" loading={false} />)
    expect(screen.getByText(/4,00/)).toBeInTheDocument()
  })

  it('shows a quiet empty state when no fees were charged', () => {
    render(
      <TradingCostsTile
        transactions={[txn({ type: 'buy', amount: -100 })]}
        currency="USD"
        loading={false}
      />,
    )
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })
})
