import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CashFlowTile } from './CashFlowTile'
import type { InvestmentTransaction } from '../investmentsApi'

function txn(overrides: Partial<InvestmentTransaction> = {}): InvestmentTransaction {
  return {
    id: 1,
    account_id: 1,
    external_id: 'deposit-1',
    type: 'deposit',
    symbol: 'BTC',
    quantity: 0.5,
    price: null,
    amount: 0.5,
    currency: 'BTC',
    date: '2026-01-05T00:00:00Z',
    ...overrides,
  }
}

describe('CashFlowTile', () => {
  it('keeps deposits and withdrawals separate per asset rather than blending currencies', () => {
    render(
      <CashFlowTile
        transactions={[
          txn({ id: 1, type: 'deposit', currency: 'BTC', amount: 0.5 }),
          txn({ id: 2, type: 'withdrawal', currency: 'USDT', amount: -100 }),
        ]}
        loading={false}
      />,
    )
    const rows = screen.getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(screen.getByText('BTC')).toBeInTheDocument()
    expect(screen.getByText('USDT')).toBeInTheDocument()
  })

  it('ignores trades and fees, only counting deposits/withdrawals', () => {
    render(
      <CashFlowTile transactions={[txn({ type: 'buy', amount: -50 })]} loading={false} />,
    )
    expect(screen.queryByRole('listitem')).not.toBeInTheDocument()
  })
})
