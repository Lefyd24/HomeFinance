import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as accountsApi from '../accounts/accountsApi'
import * as budgetsApi from '../budgets/budgetsApi'
import * as reportsApi from './reportsApi'
import { DashboardPage } from './DashboardPage'

vi.mock('echarts-for-react', () => ({
  default: () => <div data-testid="spending-chart-mock" />,
}))

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <DashboardPage />
    </QueryClientProvider>,
  )
}

describe('DashboardPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows total balance, chart, and budgets', async () => {
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([
      {
        id: 1,
        user_id: 1,
        name: 'Checking',
        type: 'checking',
        currency: 'EUR',
        balance: 1000,
        description: null,
        icon: null,
        is_active: true,
        created_at: '',
        updated_at: '',
      },
      {
        id: 2,
        user_id: 1,
        name: 'Savings',
        type: 'savings',
        currency: 'EUR',
        balance: 500,
        description: null,
        icon: null,
        is_active: true,
        created_at: '',
        updated_at: '',
      },
    ])
    vi.spyOn(budgetsApi, 'listBudgets').mockResolvedValue([
      {
        id: 1,
        user_id: 1,
        name: 'Food',
        amount: 300,
        period: 'monthly',
        start_date: null,
        end_date: null,
        category_ids: [],
        is_active: true,
        created_at: '',
        spent: 90,
        remaining: 210,
        percentage: 30,
        period_start: null,
        period_end: null,
      },
    ])
    vi.spyOn(reportsApi, 'getSpendingReport').mockResolvedValue({
      labels: ['Groceries', 'Transport'],
      data: [120, 80],
    })

    renderPage()

    expect(await screen.findByText('€1,500.00')).toBeInTheDocument()
    expect(screen.getByTestId('spending-chart-mock')).toBeInTheDocument()
    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(screen.getByText('€90.00 of €300.00')).toBeInTheDocument()
  })
})
