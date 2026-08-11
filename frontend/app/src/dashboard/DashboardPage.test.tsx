import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { formatCurrency } from '../lib/format'
import * as accountsApi from '../accounts/accountsApi'
import * as budgetsApi from '../budgets/budgetsApi'
import * as goalsApi from '../goals/goalsApi'
import * as transactionsApi from '../transactions/transactionsApi'
import * as debtsApi from '../debts/debtsApi'
import * as recurringApi from '../recurring/recurringApi'
import * as reportsApi from './reportsApi'
import { BalanceVisibilityProvider } from '../ui/BalanceVisibilityContext'
import { DashboardPage } from './DashboardPage'

vi.mock('echarts-for-react', () => ({
  default: () => <div data-testid="spending-chart-mock" />,
}))

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <BalanceVisibilityProvider>
          <DashboardPage />
        </BalanceVisibilityProvider>
      </BrowserRouter>
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
        is_linked: false,
        bank_connection_id: null,
        last_synced_at: null,
        sync_status: null,
        provider: null,
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
        is_linked: false,
        bank_connection_id: null,
        last_synced_at: null,
        sync_status: null,
        provider: null,
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

    vi.spyOn(goalsApi, 'listGoals').mockResolvedValue([])

    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      per_page: 100,
    })

    vi.spyOn(debtsApi, 'listUpcomingDebtPayments').mockResolvedValue([])

    vi.spyOn(recurringApi, 'listUpcomingRecurringPayments').mockResolvedValue([])

    vi.spyOn(reportsApi, 'getSpendingReport').mockResolvedValue({
      labels: ['Groceries', 'Transport'],
      data: [120, 80],
    })

    renderPage()

    // Wait for the balance to appear
    expect(await screen.findByText(formatCurrency(1500))).toBeInTheDocument()

    // Check that at least one chart is rendered (could be multiple)
    const charts = screen.getAllByTestId('spending-chart-mock')
    expect(charts.length).toBeGreaterThan(0)

    // Check for budget display
    expect(screen.getByText('Food')).toBeInTheDocument()
    expect(
      screen.getByText(`${formatCurrency(90)} / ${formatCurrency(300)}`),
    ).toBeInTheDocument()
  })
})
