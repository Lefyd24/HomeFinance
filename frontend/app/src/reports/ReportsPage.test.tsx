import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as reportsApi from '../dashboard/reportsApi'
import * as reportsPageApi from './reportsPageApi'
import { ReportsPage } from './ReportsPage'

vi.mock('echarts-for-react', () => ({ default: () => <div data-testid="chart" /> }))

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ReportsPage />
    </QueryClientProvider>,
  )
}

describe('ReportsPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('renders the three headline charts', async () => {
    vi.spyOn(reportsApi, 'getSpendingReport').mockResolvedValue({
      labels: ['Food'],
      data: [100],
    })
    vi.spyOn(reportsPageApi, 'getCashflowReport').mockResolvedValue({
      labels: ['Jan'],
      income: [1000],
      expenses: [400],
    })
    vi.spyOn(reportsPageApi, 'getNetWorthHistory').mockResolvedValue([
      { date: '2026-01-01', net_worth: 5000 },
    ])

    renderPage()

    expect(await screen.findAllByTestId('chart')).toHaveLength(3)
  })
})
