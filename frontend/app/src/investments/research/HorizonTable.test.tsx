import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { HorizonTable } from './HorizonTable'
import type { CompanyHistory } from '../investmentsApi'

function historyFixture(): CompanyHistory {
  return {
    symbol: 'AAPL',
    period: '1y',
    currency: 'USD',
    benchmark_symbol: '^GSPC',
    bars: [],
    horizons: [
      {
        horizon: '1y',
        annualized_return: 0.184,
        volatility: 0.271,
        sharpe: 0.62,
        sortino: 0.91,
        max_drawdown: -0.153,
        days_under_water: 87,
        beta: 1.14,
        alpha: 0.031,
        up_capture: 1.08,
        down_capture: 0.94,
      },
      {
        horizon: '3y',
        annualized_return: -0.042,
        volatility: 0.303,
        sharpe: null,
        sortino: null,
        max_drawdown: -0.318,
        days_under_water: 412,
        beta: null,
        alpha: null,
        up_capture: null,
        down_capture: null,
      },
      {
        horizon: '5y',
        annualized_return: 0.121,
        volatility: 0.288,
        sharpe: 0.4,
        sortino: 0.55,
        max_drawdown: -0.318,
        days_under_water: 412,
        beta: 1.02,
        alpha: 0.004,
        up_capture: 1.01,
        down_capture: 0.99,
      },
    ],
    rolling_volatility: [],
    rolling_beta: [],
    rolling_sharpe: [],
    return_histogram: [],
    return_observations: 0,
  }
}

describe('HorizonTable', () => {
  it('renders one column per horizon', () => {
    render(<HorizonTable history={historyFixture()} isLoading={false} />)
    expect(screen.getByText('1Y')).toBeInTheDocument()
    expect(screen.getByText('3Y')).toBeInTheDocument()
    expect(screen.getByText('5Y')).toBeInTheDocument()
  })

  it('formats returns as signed percentages', () => {
    render(<HorizonTable history={historyFixture()} isLoading={false} />)
    expect(screen.getByText('+18.4%')).toBeInTheDocument()
    expect(screen.getByText('-4.2%')).toBeInTheDocument()
  })

  it('renders an em dash where a metric is null rather than NaN', () => {
    render(<HorizonTable history={historyFixture()} isLoading={false} />)
    // The 3y column has four null metrics (sharpe, sortino, beta, alpha)
    // plus two null captures.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(6)
  })

  it('colours a negative return with the outflow token', () => {
    render(<HorizonTable history={historyFixture()} isLoading={false} />)
    expect(screen.getByText('-4.2%')).toHaveClass('text-flow-out')
  })
})
