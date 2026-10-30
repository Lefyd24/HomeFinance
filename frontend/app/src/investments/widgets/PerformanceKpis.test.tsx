import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { PerformanceKpis } from './PerformanceKpis'
import { BalanceVisibilityProvider } from '../../ui/BalanceVisibilityContext'
import type { PortfolioTotals } from '../portfolioInsights'
import type { PortfolioPerformance } from '../investmentsApi'

const totals: PortfolioTotals = {
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
}

const performance: PortfolioPerformance = {
  currency: 'EUR',
  start_date: '2026-01-01',
  end_date: '2026-10-30',
  flows_source: 'reported',
  series: [],
  summary: {
    start_value: 8000,
    end_value: 10000,
    net_flows: 1000,
    gain: 1234,
    twr: 0.1,
    twr_annualized: null,
    mwr: 0.12,
    volatility: null,
    max_drawdown: null,
    sharpe: null,
    best_day: null,
    worst_day: null,
  },
  breakdown: {
    unrealized: 900,
    realized: 100,
    dividends: 0,
    taxes: 0,
    fees: 0,
    fees_estimated: 0,
    fx_and_other: 0,
    total_gain: 1000,
    net_invested: 9000,
  },
  benchmark: null,
}

function renderKpis() {
  render(
    <BalanceVisibilityProvider>
      <PerformanceKpis
        totals={totals}
        scopeLabel="Broker"
        performance={performance}
        loading={false}
        rangeLabel="3 months"
      />
    </BalanceVisibilityProvider>,
  )
}

describe('PerformanceKpis', () => {
  beforeEach(() => window.localStorage.clear())

  it('shows range gain, TWR and XIRR from the performance payload', () => {
    renderKpis()
    expect(screen.getByText(/1\.234/)).toBeInTheDocument()
    expect(screen.getByText('+10.00%')).toBeInTheDocument()
    expect(screen.getByText('+12.00%')).toBeInTheDocument()
    // All-time gain as a share of net invested: 1000 / 9000.
    expect(screen.getByText('+11.11%')).toBeInTheDocument()
  })

  it('masks every amount when balances are hidden', () => {
    window.localStorage.setItem('balance-visibility-hidden', '1')
    renderKpis()
    expect(screen.queryByText(/10\.000/)).not.toBeInTheDocument()
    expect(screen.queryByText(/1\.234/)).not.toBeInTheDocument()
    expect(screen.getAllByText(/\*{5}/).length).toBeGreaterThan(0)
  })
})
