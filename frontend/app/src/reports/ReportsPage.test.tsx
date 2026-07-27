import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { TooltipProvider } from '@/components/ui/tooltip'
import * as reportsPageApi from './reportsPageApi'
import { ReportsPage } from './ReportsPage'

vi.mock('echarts-for-react', () => ({ default: () => <div data-testid="chart" /> }))

// The filter bar's dimension pickers are not what these tests are about.
vi.mock('../accounts/accountsApi', () => ({ listAccounts: () => Promise.resolve([]) }))
vi.mock('../categories/categoriesApi', () => ({ listCategories: () => Promise.resolve([]) }))

function renderPage(initialEntry = '/reports') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <TooltipProvider>
          <QueryClientProvider client={queryClient}>
            <ReportsPage />
          </QueryClientProvider>
        </TooltipProvider>
      </ThemeProvider>
    </MemoryRouter>,
  )
}

/** Two months: 3000 in / 1000 out, then 3000 in / 1500 out. */
function mockCashflow() {
  return vi.spyOn(reportsPageApi, 'getCashflowReport').mockResolvedValue({
    labels: ['2026-01', '2026-02'],
    income: [3000, 3000],
    expenses: [1000, 1500],
  })
}

function mockOverviewSupport() {
  vi.spyOn(reportsPageApi, 'getCategoryBreakdown').mockResolvedValue({
    categories: [{ name: 'Groceries', color: null, amount: 2500, count: 40 }],
  })
  vi.spyOn(reportsPageApi, 'getSavingsRate').mockResolvedValue({
    labels: ['2026-01', '2026-02'],
    rate: [66.7, 50],
  })
}

describe('ReportsPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('opens with a plain-language read of the period', async () => {
    mockCashflow()
    mockOverviewSupport()

    renderPage()

    // 6000 in, 2500 out → 3500 kept.
    expect(await screen.findByText(/You kept .*3\.500,00.*of the .*6\.000,00/)).toBeInTheDocument()
    expect(screen.getByText(/58% savings rate/)).toBeInTheDocument()
  })

  it('renders the overview charts', async () => {
    mockCashflow()
    mockOverviewSupport()

    renderPage()

    // Cashflow combo, ranked categories, savings rate — each on its own query.
    await waitFor(() => expect(screen.getAllByTestId('chart')).toHaveLength(3))
  })

  it('says so plainly when the range has no activity', async () => {
    vi.spyOn(reportsPageApi, 'getCashflowReport').mockResolvedValue({
      labels: [],
      income: [],
      expenses: [],
    })
    vi.spyOn(reportsPageApi, 'getCategoryBreakdown').mockResolvedValue({ categories: [] })
    vi.spyOn(reportsPageApi, 'getSavingsRate').mockResolvedValue({ labels: [], rate: [] })

    renderPage()

    expect(await screen.findByText(/No activity recorded in this range/)).toBeInTheDocument()
  })

  it('reads the active tab from the URL', async () => {
    mockCashflow()
    vi.spyOn(reportsPageApi, 'getDebtInsights').mockResolvedValue({
      debts: [
        {
          name: 'Card',
          current_balance: 400,
          original_balance: 1000,
          paid_pct: 60,
          interest_rate: 18.5,
          projected_payoff: '2026-12-01',
        },
      ],
      total_current: 400,
      total_interest_paid: 120,
    })

    renderPage('/reports?tab=debt')

    expect(await screen.findByText(/Clear Card first/)).toBeInTheDocument()
  })

  it('links to the advisor with the selected period baked into the question', async () => {
    mockCashflow()
    mockOverviewSupport()

    renderPage('/reports?range=custom&from=2026-01-01&to=2026-02-28')

    const link = await screen.findByRole('link', { name: /ask the advisor about this/i })
    expect(link).toHaveAttribute('href', expect.stringContaining('2026-01-01'))
    expect(link).toHaveAttribute('href', expect.stringContaining('2026-02-28'))
  })

  it('fetches the matching prior window so every number is a comparison', async () => {
    const cashflowSpy = mockCashflow()
    mockOverviewSupport()

    renderPage('/reports?range=custom&from=2026-03-01&to=2026-03-31')

    await screen.findAllByTestId('chart')

    expect(cashflowSpy).toHaveBeenCalledWith(
      expect.objectContaining({ start_date: '2026-03-01', end_date: '2026-03-31' }),
    )
    // The equally-long window immediately before it (31 days, inclusive).
    expect(cashflowSpy).toHaveBeenCalledWith(
      expect.objectContaining({ start_date: '2026-01-29', end_date: '2026-02-28' }),
    )
  })

  it('switches tabs on click', async () => {
    mockCashflow()
    mockOverviewSupport()
    vi.spyOn(reportsPageApi, 'getBudgetPerformance').mockResolvedValue({
      budgets: [{ name: 'Eating out', limit: 200, spent: 260, pct: 130 }],
    })

    renderPage()
    await screen.findAllByTestId('chart')

    await userEvent.click(screen.getByRole('tab', { name: 'Budgets' }))

    expect(await screen.findByText(/1 budget is over the limit/)).toBeInTheDocument()
  })
})
