import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { HoldingHistoryPage } from './HoldingHistoryPage'
import type { PositionHistory } from './investmentsApi'

// The chart needs a real layout box to render anything, and none of these
// assertions are about it.
vi.mock('./widgets/PositionJourneyChart', () => ({
  PositionJourneyChart: () => <div data-testid="chart" />,
}))

const history = vi.hoisted(() => ({ current: null as PositionHistory | null }))

const mapped = vi.hoisted(() => ({ mutateAsync: vi.fn().mockResolvedValue(undefined) }))

vi.mock('./useInvestments', () => ({
  useInvestmentAccounts: () => ({ data: [{ id: 7, name: 'Freedom24' }] }),
  usePositionHistory: () => ({
    data: history.current,
    isLoading: false,
    isError: false,
    isFetching: false,
  }),
  useSymbolSearch: () => ({ data: [], isFetching: false }),
  usePositionSymbolMapping: () => ({ mutateAsync: mapped.mutateAsync, isPending: false }),
}))

function build(overrides: Partial<PositionHistory> = {}): PositionHistory {
  return {
    symbol: 'VIO.GR',
    name: 'Viohalco',
    currency: 'EUR',
    basis: 'reconstructed',
    price_source: 'yahoo:VIO.AT',
    range: 'entry',
    start: '2026-07-13',
    end: '2026-08-12',
    mapped_symbol: 'VIO.AT',
    mapped_currency: 'EUR',
    native_currency: 'EUR',
    mapping_source: 'auto',
    mapping_checked: [['VIO.AT', 'matched', 'EUR']],
    opened_on: '2026-08-10',
    quantity: 3,
    market_value: 53.94,
    cost_basis: 54.84,
    fees_paid: 2.06,
    realized_pnl: 0,
    unrealized_pnl: -0.9,
    unrealized_return_pct: -1.64,
    buy_dates: ['2026-08-10'],
    series: [],
    ...overrides,
  }
}

function renderPage(data: PositionHistory) {
  history.current = data
  return render(
    <MemoryRouter initialEntries={['/investments/holdings/7/VIO.GR']}>
      <Routes>
        <Route
          path="/investments/holdings/:accountId/:symbol"
          element={<HoldingHistoryPage />}
        />
      </Routes>
    </MemoryRouter>,
  )
}

describe('HoldingHistoryPage ticker match', () => {
  it('shows which Yahoo listing priced the chart and that its currency agrees', () => {
    renderPage(build())

    expect(screen.getByText('Ticker match')).toBeInTheDocument()
    expect(screen.getByText('VIO.AT')).toBeInTheDocument()
    expect(screen.getByText('EUR confirmed')).toBeInTheDocument()
  })

  it('lists the candidates that were rejected, with the reason', () => {
    renderPage(
      build({
        mapping_checked: [
          ['VIO', 'currency', 'USD'],
          ['VIO.AT', 'matched', 'EUR'],
        ],
      }),
    )

    // The near-miss the currency check exists to catch: a US company sharing
    // the ticker. Showing it is the point — silently picking it would be the bug.
    expect(screen.getByText(/priced in USD, your broker reports EUR/)).toBeInTheDocument()
  })

  it('says so plainly when nothing could be matched', () => {
    renderPage(
      build({
        price_source: 'broker',
        mapped_symbol: null,
        mapped_currency: null,
        mapping_checked: [['VIO.AT', 'no-data', null]],
      }),
    )

    expect(screen.getByText(/Unmatched — using broker prices/)).toBeInTheDocument()
    expect(screen.getByText(/lists no prices for it/)).toBeInTheDocument()
  })

  it('says whether the match was guessed or chosen, and offers to change it', () => {
    renderPage(build())

    expect(screen.getByText('Matched automatically')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Change' })).toBeInTheDocument()
  })

  it('offers a way back to the heuristic only once a ticker has been pinned', () => {
    const { unmount } = renderPage(build())
    expect(screen.queryByRole('button', { name: 'Automatic' })).not.toBeInTheDocument()
    unmount()

    renderPage(build({ mapping_source: 'manual' }))

    expect(screen.getByText('Chosen by you')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Automatic' })).toBeInTheDocument()
  })
})
