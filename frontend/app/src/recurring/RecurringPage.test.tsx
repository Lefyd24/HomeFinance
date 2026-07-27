import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { formatCurrency } from '../lib/format'
import * as accountsApi from '../accounts/accountsApi'
import * as categoriesApi from '../categories/categoriesApi'
import * as recurringApi from './recurringApi'
import { RecurringPage } from './RecurringPage'
import type { RecurringExpense } from './recurringApi'

function expense(partial: Partial<RecurringExpense> & Pick<RecurringExpense, 'id' | 'name'>): RecurringExpense {
  return {
    user_id: 1,
    amount: 15.99,
    category_id: 1,
    account_id: 1,
    recurrence_interval: 1,
    recurrence_unit: 'months',
    start_date: '2026-01-01',
    next_due_date: '2026-08-01',
    notes: null,
    is_active: true,
    notify_enabled: false,
    notify_days_before: null,
    days_until_due: 5,
    is_overdue: false,
    created_at: '',
    updated_at: '',
    ...partial,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <RecurringPage />
    </QueryClientProvider>,
  )
}

describe('RecurringPage', () => {
  afterEach(() => vi.restoreAllMocks())

  function mockLookups() {
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([
      {
        id: 1,
        user_id: 1,
        name: 'Checking',
        type: 'checking',
        balance: 100,
        currency: 'EUR',
        description: null,
        icon: null,
        is_active: true,
        created_at: '',
        updated_at: '',
      },
    ])
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([
      {
        id: 1,
        user_id: 1,
        name: 'Subscriptions',
        type: 'expense',
        color: '#000',
        icon: null,
        parent_id: null,
        is_system: false,
        created_at: '',
      },
      {
        id: 2,
        user_id: 1,
        name: 'Salary',
        type: 'income',
        color: '#0f0',
        icon: null,
        parent_id: null,
        is_system: false,
        created_at: '',
      },
    ])
  }

  it('lists recurring expenses on a due-date agenda with cadence and amount', async () => {
    mockLookups()
    vi.spyOn(recurringApi, 'listRecurringExpenses').mockResolvedValue([
      expense({ id: 1, name: 'Netflix', amount: 15.99, next_due_date: '2026-08-01', days_until_due: 5 }),
    ])

    renderPage()

    expect(await screen.findByText('Netflix')).toBeInTheDocument()
    expect(screen.getByText('Monthly')).toBeInTheDocument()
    expect(screen.getByText(formatCurrency(15.99))).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Upcoming due dates' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Due date agenda' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Mark paid/i })).toBeInTheDocument()
  })

  it('opens linked transactions sheet from Transactions action', async () => {
    mockLookups()
    const user = userEvent.setup()
    vi.spyOn(recurringApi, 'listRecurringExpenses').mockResolvedValue([
      expense({ id: 7, name: 'Rent', amount: 800, next_due_date: '2026-07-28', days_until_due: 1 }),
    ])
    vi.spyOn(recurringApi, 'getLinkedTransactions').mockResolvedValue({
      recurring_expense: {
        id: 7,
        name: 'Rent',
        amount: 800,
        recurrence_interval: 1,
        recurrence_unit: 'months',
        next_due_date: '2026-07-28',
        category_id: 1,
        account_id: 1,
      },
      transactions: [
        {
          payment_id: 1,
          payment_date: '2026-06-28',
          amount: 800,
          transaction_id: 99,
          description: 'June rent',
          transaction_date: '2026-06-28',
          category_id: 1,
          category_name: 'Subscriptions',
          category_color: null,
          account_id: 1,
          account_name: 'Checking',
          notes: null,
        },
      ],
      summary: {
        total_paid: 800,
        payment_count: 1,
        last_payment_date: '2026-06-28',
      },
    })

    renderPage()
    expect(await screen.findByText('Rent')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Transactions' }))

    expect(await screen.findByText('June rent')).toBeInTheDocument()
    expect(screen.getByText('Total paid')).toBeInTheDocument()
    expect(screen.getByText('Payments')).toBeInTheDocument()
    expect(screen.getAllByText(formatCurrency(800)).length).toBeGreaterThan(0)
  })

  it('exposes edit in the overflow menu', async () => {
    mockLookups()
    const user = userEvent.setup()
    vi.spyOn(recurringApi, 'listRecurringExpenses').mockResolvedValue([
      expense({ id: 3, name: 'Gym', amount: 40 }),
    ])

    renderPage()
    expect(await screen.findByText('Gym')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'More actions' }))
    expect(await screen.findByRole('menuitem', { name: /Edit/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Disable/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: /Delete/i })).toBeInTheDocument()
  })

  it('shows disabled items in a disclosure', async () => {
    mockLookups()
    const user = userEvent.setup()
    vi.spyOn(recurringApi, 'listRecurringExpenses').mockResolvedValue([
      expense({ id: 1, name: 'Active Sub', is_active: true }),
      expense({
        id: 2,
        name: 'Old Magazine',
        is_active: false,
        amount: 9,
        days_until_due: null,
        is_overdue: false,
      }),
    ])

    renderPage()
    expect(await screen.findByText('Active Sub')).toBeInTheDocument()
    expect(screen.queryByText('Old Magazine')).not.toBeInTheDocument()

    await user.click(
      screen.getByRole('button', { name: /Disabled recurring expenses \(1\)/i }),
    )
    expect(await screen.findByText('Old Magazine')).toBeInTheDocument()
    expect(within(screen.getByText('Old Magazine').closest('li')!).getByRole('button', { name: /Enable/i })).toBeInTheDocument()
  })
})
