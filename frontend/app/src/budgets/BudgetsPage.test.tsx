import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as budgetsApi from './budgetsApi'
import { BudgetsPage } from './BudgetsPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <BudgetsPage />
    </QueryClientProvider>,
  )
}

describe('BudgetsPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows spent versus budget amount with progress', async () => {
    vi.spyOn(budgetsApi, 'listBudgets').mockResolvedValue([
      {
        id: 1,
        user_id: 1,
        name: 'Groceries',
        amount: 400,
        period: 'monthly',
        start_date: null,
        end_date: null,
        category_ids: [],
        is_active: true,
        created_at: '',
        spent: 150,
        remaining: 250,
        percentage: 37.5,
        period_start: null,
        period_end: null,
      },
    ])

    renderPage()

    expect(await screen.findByText('Groceries')).toBeInTheDocument()
    expect(screen.getByText('€150.00 of €400.00')).toBeInTheDocument()
    expect(screen.getByText('37.5% used')).toBeInTheDocument()
  })

  it('opens the add-budget dialog', async () => {
    vi.spyOn(budgetsApi, 'listBudgets').mockResolvedValue([])

    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /add budget/i }))
    expect(screen.getByRole('heading', { name: /add budget/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/budget name/i)).toBeInTheDocument()
  })
})
