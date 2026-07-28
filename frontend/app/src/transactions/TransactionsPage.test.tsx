import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { formatCurrency } from '../lib/format'
import * as accountsApi from '../accounts/accountsApi'
import * as categoriesApi from '../categories/categoriesApi'
import * as transactionsApi from './transactionsApi'
import { TransactionsPage } from './TransactionsPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <TransactionsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const sampleTransaction: transactionsApi.Transaction = {
  id: 1,
  user_id: 1,
  account_id: 1,
  destination_account_id: null,
  category_id: 2,
  amount: 42.5,
  type: 'expense',
  description: 'Groceries run',
  date: '2026-07-01T12:00:00',
  notes: null,
  is_imported: false,
  import_batch_id: null,
  source_file: null,
  created_at: '',
  updated_at: '',
  account_name: 'Checking',
  category_name: 'Groceries',
}

describe('TransactionsPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists transactions with description and account name', async () => {
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([
      {
        id: 1,
        user_id: 1,
        name: 'Checking',
        type: 'checking',
        currency: 'EUR',
        balance: 100,
        description: null,
        icon: null,
        is_active: true,
        created_at: '',
        updated_at: '',
      },
    ])
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([
      {
        id: 2,
        user_id: 1,
        name: 'Groceries',
        type: 'expense',
        color: '#000',
        icon: null,
        parent_id: null,
        is_system: false,
        created_at: '',
      },
    ])
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      items: [sampleTransaction],
      total: 1,
      page: 1,
      per_page: 50,
    })

    renderPage()

    expect(await screen.findByText('Groceries run')).toBeInTheDocument()
    const table = within(screen.getByRole('table'))
    expect(table.getByText('Checking')).toBeInTheDocument()
    expect(table.getByText(`−${formatCurrency(42.5)}`)).toBeInTheDocument()
  })

  it('summarises what is on the current page', async () => {
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([])
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([])
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      items: [
        sampleTransaction,
        { ...sampleTransaction, id: 2, type: 'income', amount: 100, description: 'Salary' },
      ],
      total: 2,
      page: 1,
      per_page: 50,
    })

    renderPage()

    expect(await screen.findByText('On this page')).toBeInTheDocument()
    // 100 in, 42.50 out — the net figure only appears in the summary strip.
    expect(screen.getByText(`+${formatCurrency(57.5)}`)).toBeInTheDocument()
  })

  it('opens the add-transaction dialog', async () => {
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([])
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([])
    vi.spyOn(transactionsApi, 'listTransactions').mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      per_page: 50,
    })

    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /add transaction/i }))
    expect(screen.getByRole('heading', { name: /add transaction/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/^description$/i)).toBeInTheDocument()
  })
})
