import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { formatCurrency } from '../lib/format'
import * as budgetsApi from './budgetsApi'
import * as categoriesApi from '../categories/categoriesApi'
import { BudgetsPage } from './BudgetsPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <BudgetsPage />
    </QueryClientProvider>,
  )
}

const groceryBudget: budgetsApi.Budget = {
  id: 1,
  user_id: 1,
  name: 'Groceries',
  amount: 400,
  period: 'monthly',
  start_date: '2026-01-01',
  end_date: null,
  category_ids: [10],
  is_active: true,
  created_at: '',
  spent: 150,
  remaining: 250,
  percentage: 37.5,
  period_start: '2026-07-01',
  period_end: '2026-07-31',
}

describe('BudgetsPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows portfolio utilization and selected budget spent versus limit', async () => {
    vi.spyOn(budgetsApi, 'listBudgets').mockResolvedValue([groceryBudget])
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([
      {
        id: 10,
        user_id: 1,
        name: 'Food',
        type: 'expense',
        color: '#000',
        icon: null,
        parent_id: null,
        is_system: false,
        created_at: '',
      },
    ])

    renderPage()

    expect(await screen.findByText('Portfolio utilization')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Groceries' })).toBeInTheDocument()
    expect(
      screen.getByText((_, el) => el?.textContent === `${formatCurrency(150)} of ${formatCurrency(400)}`),
    ).toBeInTheDocument()
    expect(screen.getByText('37.5% used')).toBeInTheDocument()
    expect(screen.getByText('Food')).toBeInTheDocument()
  })

  it('opens the create-budget dialog', async () => {
    vi.spyOn(budgetsApi, 'listBudgets').mockResolvedValue([])
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([])

    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /create budget/i }))
    expect(screen.getByRole('heading', { name: /create budget/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/budget name/i)).toBeInTheDocument()
    expect(screen.getByText('Categories')).toBeInTheDocument()
  })

  it('opens edit dialog from the focus panel', async () => {
    vi.spyOn(budgetsApi, 'listBudgets').mockResolvedValue([groceryBudget])
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([])

    renderPage()
    await screen.findByText('Groceries')

    const editButtons = screen.getAllByRole('button', { name: /^edit$/i })
    await userEvent.click(editButtons[0]!)

    expect(await screen.findByRole('heading', { name: /edit budget/i })).toBeInTheDocument()
    expect(screen.getByDisplayValue('Groceries')).toBeInTheDocument()
  })

  it('loads period details in a sheet with year navigation', async () => {
    vi.spyOn(budgetsApi, 'listBudgets').mockResolvedValue([groceryBudget])
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([])
    const summarySpy = vi.spyOn(budgetsApi, 'getBudgetSummary').mockResolvedValue({
      budget: {
        id: 1,
        name: 'Groceries',
        amount: 400,
        period: 'monthly',
        start_date: '2026-01-01',
        end_date: null,
      },
      year: 2026,
      periods: [
        {
          period_start: '2026-07-01',
          period_end: '2026-07-31',
          label: 'July 2026',
          budget_amount: 400,
          spent: 150,
          remaining: 250,
          percentage: 37.5,
          transactions: [
            {
              id: 99,
              date: '2026-07-10',
              description: 'Supermarket',
              amount: 150,
              category_id: 10,
              category_name: 'Food',
              category_color: null,
              account_name: 'Cash',
            },
          ],
        },
      ],
      year_total: {
        budget_amount: 400,
        spent: 150,
        remaining: 250,
        percentage: 37.5,
      },
    })

    renderPage()
    await screen.findByText('Groceries')
    await userEvent.click(screen.getByRole('button', { name: /view period details/i }))

    expect(await screen.findByText('Year usage')).toBeInTheDocument()
    expect(screen.getByText('July 2026')).toBeInTheDocument()
    expect(summarySpy).toHaveBeenCalledWith(1, 2026)

    await userEvent.click(screen.getByRole('button', { name: /next year/i }))
    expect(summarySpy).toHaveBeenCalledWith(1, 2027)
  })

  it('deletes a budget after confirmation', async () => {
    vi.spyOn(budgetsApi, 'listBudgets').mockResolvedValue([groceryBudget])
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([])
    const deleteSpy = vi.spyOn(budgetsApi, 'deleteBudget').mockResolvedValue({ message: 'ok' })
    renderPage()
    await screen.findByText('Groceries')

    await userEvent.click(screen.getByRole('button', { name: /budget actions/i }))
    const menu = await screen.findByRole('menu')
    await userEvent.click(within(menu).getByRole('menuitem', { name: /delete/i }))

    const dialog = await screen.findByRole('alertdialog')
    await userEvent.click(within(dialog).getByRole('button', { name: /delete budget/i }))

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(1))
  })
})
