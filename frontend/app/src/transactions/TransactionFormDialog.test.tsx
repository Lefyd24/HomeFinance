import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as accountsApi from '../accounts/accountsApi'
import * as categoriesApi from '../categories/categoriesApi'
import * as debtsApi from '../debts/debtsApi'
import * as recurringApi from '../recurring/recurringApi'
import * as trackersApi from '../trackers/trackersApi'
import * as transactionsApi from './transactionsApi'
import { TransactionFormDialog } from './TransactionFormDialog'
import type { Tracker } from '../trackers/trackersApi'

const italy: Tracker = {
  id: 3,
  user_id: 1,
  name: 'Trip to Italy',
  description: null,
  target_amount: null,
  currency: 'EUR',
  icon: 'travel',
  color: '#6366F1',
  is_active: true,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: null,
  transaction_count: 0,
  total_amount: 0,
  first_transaction_date: null,
  last_transaction_date: null,
  progress_percentage: null,
  remaining_amount: null,
}

const kitchen: Tracker = { ...italy, id: 4, name: 'Kitchen renovation', icon: 'tools' }

const transaction: transactionsApi.Transaction = {
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
  is_pending: false,
  is_bank_synced: false,
  import_batch_id: null,
  source_file: null,
  created_at: '',
  updated_at: '',
  account_name: 'Checking',
  category_name: 'Groceries',
  tracker_ids: [],
  tracker_names: [],
}

function renderDialog(tx: transactionsApi.Transaction | null = transaction) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <TransactionFormDialog open onOpenChange={() => {}} transaction={tx} />
    </QueryClientProvider>,
  )
}

function stubSupportingQueries() {
  vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([
    {
      id: 1,
      user_id: 1,
      name: 'Checking',
      type: 'checking',
      balance: 1000,
      currency: 'EUR',
      is_active: true,
      is_linked: false,
      created_at: '',
      updated_at: '',
    } as never,
  ])
  vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([
    { id: 2, user_id: 1, name: 'Groceries', type: 'expense', color: '#EF4444' } as never,
  ])
  vi.spyOn(debtsApi, 'listDebts').mockResolvedValue([])
  vi.spyOn(recurringApi, 'listRecurringExpenses').mockResolvedValue([])
}

describe('TransactionFormDialog tracker picker', () => {
  afterEach(() => vi.restoreAllMocks())

  it('offers only active trackers and saves the selection', async () => {
    stubSupportingQueries()
    const listSpy = vi.spyOn(trackersApi, 'listTrackers').mockResolvedValue([italy, kitchen])
    vi.spyOn(transactionsApi, 'updateTransaction').mockResolvedValue(transaction)
    const setTrackersSpy = vi
      .spyOn(transactionsApi, 'setTransactionTrackers')
      .mockResolvedValue({ ...transaction, tracker_ids: [italy.id] })

    renderDialog()

    // active_only=true — an inactive tracker must never reach this modal.
    await waitFor(() => expect(listSpy).toHaveBeenCalledWith(true))

    const chip = await screen.findByRole('button', { name: /trip to italy/i })
    expect(chip).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(chip)
    expect(chip).toHaveAttribute('aria-pressed', 'true')

    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() =>
      expect(setTrackersSpy).toHaveBeenCalledWith(1, [italy.id]),
    )
  })

  it('preselects the trackers a transaction already belongs to', async () => {
    stubSupportingQueries()
    vi.spyOn(trackersApi, 'listTrackers').mockResolvedValue([italy, kitchen])

    renderDialog({ ...transaction, tracker_ids: [kitchen.id] })

    expect(await screen.findByRole('button', { name: /kitchen renovation/i })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: /trip to italy/i })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('does not call the tracker endpoint when the selection is unchanged', async () => {
    stubSupportingQueries()
    vi.spyOn(trackersApi, 'listTrackers').mockResolvedValue([italy])
    vi.spyOn(transactionsApi, 'updateTransaction').mockResolvedValue(transaction)
    const setTrackersSpy = vi.spyOn(transactionsApi, 'setTransactionTrackers')

    renderDialog({ ...transaction, tracker_ids: [italy.id] })

    await screen.findByRole('button', { name: /trip to italy/i })
    await userEvent.click(screen.getByRole('button', { name: /save/i }))

    await waitFor(() => expect(transactionsApi.updateTransaction).toHaveBeenCalled())
    expect(setTrackersSpy).not.toHaveBeenCalled()
  })
})
