import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as transactionsApi from './transactionsApi'
import { ReimbursementDialog } from './ReimbursementDialog'

const expense: transactionsApi.Transaction = {
  id: 1,
  user_id: 1,
  account_id: 1,
  destination_account_id: null,
  category_id: 2,
  amount: 100,
  type: 'expense',
  description: 'Dinner',
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
  reimbursed_amount: 40,
  effective_amount: 60,
  reimbursements: [],
}

const george: transactionsApi.ReimbursementCandidate = {
  id: 7,
  description: 'George paid back',
  date: '2026-07-02T09:00:00',
  amount: 50,
  remaining: 50,
  account_name: 'Checking',
}

function renderDialog() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ReimbursementDialog open onOpenChange={() => {}} transaction={expense} />
    </QueryClientProvider>,
  )
}

describe('ReimbursementDialog', () => {
  afterEach(() => vi.restoreAllMocks())

  it('pre-fills the amount with the smaller remainder, rejects more, and links the amount', async () => {
    vi.spyOn(transactionsApi, 'getReimbursementCandidates').mockResolvedValue([george])
    const link = vi.spyOn(transactionsApi, 'linkReimbursement').mockResolvedValue(expense)
    const user = userEvent.setup()
    renderDialog()

    await user.click(await screen.findByText('George paid back'))

    // 60 left on the expense, 50 left on the income -> 50.
    const input = screen.getByLabelText('Amount to link')
    expect(input).toHaveValue('50.00')

    await user.clear(input)
    await user.type(input, '60')
    expect(screen.getByRole('button', { name: 'Link' })).toBeDisabled()

    await user.clear(input)
    await user.type(input, '25.5')
    await user.click(screen.getByRole('button', { name: 'Link' }))

    await waitFor(() =>
      expect(link).toHaveBeenCalledWith(1, { counterpart_id: 7, amount: 25.5 }),
    )
  })
})
