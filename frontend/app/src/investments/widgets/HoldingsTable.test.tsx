import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HoldingsTable } from './HoldingsTable'
import { BalanceVisibilityProvider } from '../../ui/BalanceVisibilityContext'
import type { PortfolioPosition } from '../investmentsApi'

// The detail card enriches itself from the company-research endpoint, which is
// not what any of this is about — and an unmocked fetch in jsdom is a hang.
vi.mock('../useInvestments', () => ({
  useCompanyProfile: () => ({ data: null, isLoading: false }),
}))

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
    currency: 'USD',
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
    fees_paid_base: 1.5,
    fee_count: 2,
    ...overrides,
  }
}

function renderTable(positions: PortfolioPosition[], hidden = false) {
  if (hidden) {
    window.localStorage.setItem('balance-visibility-hidden', '1')
  } else {
    window.localStorage.removeItem('balance-visibility-hidden')
  }
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <BalanceVisibilityProvider>
        <HoldingsTable positions={positions} currency="EUR" loading={false} />
      </BalanceVisibilityProvider>
    </QueryClientProvider>,
  )
}

 afterEach(() => {
  window.localStorage.removeItem('balance-visibility-hidden')
})

function bodyRows(): HTMLElement[] {
  const groups = screen.getAllByRole('rowgroup')
  const tbody = groups.find((group) => group.tagName === 'TBODY') as HTMLElement
  return within(tbody).getAllByRole('row')
}

describe('HoldingsTable', () => {
  it('renders one row per position with its symbol and totals in the footer', () => {
    const rows = [
      position({ id: 1, symbol: 'AAA', market_value_base: 100 }),
      position({ id: 2, symbol: 'BBB', market_value_base: 300 }),
    ]
    renderTable(rows)
    expect(bodyRows()).toHaveLength(2)
    expect(bodyRows()[0]).toHaveTextContent('BBB')
    expect(bodyRows()[1]).toHaveTextContent('AAA')
    // The table's footer total and the mobile list's footer total both carry it.
    expect(screen.getAllByText('400,00 €')).toHaveLength(2)
  })

  it('sorts by market value, largest first, before any header is touched', () => {
    renderTable([
      position({ id: 1, symbol: 'AAA', market_value_base: 100 }),
      position({ id: 2, symbol: 'BBB', market_value_base: 300 }),
      position({ id: 3, symbol: 'CCC', market_value_base: 200 }),
    ])
    expect(bodyRows()[0]).toHaveTextContent('BBB')
    expect(bodyRows()[1]).toHaveTextContent('CCC')
    expect(bodyRows()[2]).toHaveTextContent('AAA')
  })

  it('re-sorts another column when its header is clicked', async () => {
    const user = userEvent.setup()
    renderTable([
      position({ id: 1, symbol: 'AAA', quantity: 30 }),
      position({ id: 2, symbol: 'BBB', quantity: 10 }),
      position({ id: 3, symbol: 'CCC', quantity: 20 }),
    ])
    // Numeric columns toggle descending first.
    await user.click(screen.getByRole('button', { name: /Qty/ }))
    expect(bodyRows()[0]).toHaveTextContent('AAA')
    await user.click(screen.getByRole('button', { name: /Qty/ }))
    expect(bodyRows()[0]).toHaveTextContent('BBB')
    expect(bodyRows()[1]).toHaveTextContent('CCC')
    expect(bodyRows()[2]).toHaveTextContent('AAA')
  })

  it('prints a dash for a missing day change, not 0.00%', () => {
    renderTable([position({ day_change_pct: null, day_change_base: null, day_change: null })])
    const row = bodyRows()[0]
    // Both the percentage and the amount beneath it are dashes.
    expect(within(row).getAllByText('—').length).toBe(2)
    expect(within(row).queryByText('0.00%')).not.toBeInTheDocument()
  })

  it('masks every money figure while balances are hidden', () => {
    renderTable(
      [
        position({
          id: 1,
          symbol: 'AAA',
          avg_price: 10,
          current_price: 12,
          market_value_base: 120,
          unrealized_pnl_base: 20,
          unrealized_pnl: 20,
          day_change_base: 2,
          day_change: 2,
          fees_paid_base: 1.5,
        }),
      ],
      true,
    )
    expect(bodyRows()[0]).toHaveTextContent('*****')
    const masks = screen.getAllByText('*****')
    expect(masks.length).toBeGreaterThan(1)
  })
})
