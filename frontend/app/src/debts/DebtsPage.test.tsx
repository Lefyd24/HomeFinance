import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { formatCurrency } from '../lib/format'
import * as debtsApi from './debtsApi'
import * as accountsApi from '../accounts/accountsApi'
import { DebtsPage } from './DebtsPage'
import type { Debt } from './debtsApi'

const sampleDebt: Debt = {
  id: 1,
  user_id: 1,
  name: 'Visa card',
  creditor: 'Bank',
  type: 'credit_card',
  custom_type: null,
  original_balance: 2000,
  current_balance: 1200,
  interest_rate: 0.19,
  minimum_payment: 50,
  opened_date: null,
  maturity_date: null,
  notes: null,
  recurrence_interval: 1,
  recurrence_unit: 'months',
  recurrence_day_of_month: 15,
  next_payment_date: '2026-08-15',
  linked_account_id: null,
  linked_category_id: null,
  notify_enabled: false,
  notify_days_before: null,
  priority: 2,
  is_active: true,
  is_paid_off: false,
  paid_off_date: null,
  created_at: '',
  updated_at: '',
  months_to_payoff: 36,
  total_interest: 400,
  payoff_date: '2029-07-27',
  total_amount_due: 1600,
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <DebtsPage />
    </QueryClientProvider>,
  )
}

describe('DebtsPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists debts in master-detail with interest calculator metrics', async () => {
    vi.spyOn(debtsApi, 'listDebts').mockResolvedValue([sampleDebt])
    vi.spyOn(debtsApi, 'getDebtSummary').mockResolvedValue({
      total_debts: 1,
      active_debts: 1,
      paid_off_debts: 0,
      total_original_balance: 2000,
      total_current_balance: 1200,
      total_paid_off: 800,
      total_minimum_payments: 50,
      average_interest_rate: 0.19,
      overall_progress_percentage: 40,
      total_projected_interest: 400,
      total_amount_due: 1600,
    })
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([])

    renderPage()

    expect(await screen.findByText('Interest & payoff')).toBeInTheDocument()
    expect(screen.getAllByText('Bank').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Visa card')).toBeInTheDocument()
    expect(screen.getByText('19.00%')).toBeInTheDocument()
    expect(screen.getByText('36')).toBeInTheDocument()
    expect(
      screen.getByText(`of ${formatCurrency(2000)} original`),
    ).toBeInTheDocument()
  })

  it('opens edit dialog with full debt properties', async () => {
    const user = userEvent.setup()
    vi.spyOn(debtsApi, 'listDebts').mockResolvedValue([sampleDebt])
    vi.spyOn(debtsApi, 'getDebtSummary').mockResolvedValue({
      total_debts: 1,
      active_debts: 1,
      paid_off_debts: 0,
      total_original_balance: 2000,
      total_current_balance: 1200,
      total_paid_off: 800,
      total_minimum_payments: 50,
      average_interest_rate: 0.19,
      overall_progress_percentage: 40,
      total_projected_interest: 400,
      total_amount_due: 1600,
    })
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([])

    renderPage()
    await screen.findByText('Interest & payoff')

    await user.click(screen.getByRole('button', { name: 'Edit properties' }))

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Edit debt')).toBeInTheDocument()
    expect(within(dialog).getByLabelText('Interest rate (APR %)')).toHaveValue(19)
    expect(within(dialog).getByLabelText('Minimum payment')).toHaveValue(50)
    expect(within(dialog).getByLabelText('Day of month')).toHaveValue(15)
  })

  it('loads payment history sheet with linked transaction id', async () => {
    const user = userEvent.setup()
    vi.spyOn(debtsApi, 'listDebts').mockResolvedValue([sampleDebt])
    vi.spyOn(debtsApi, 'getDebtSummary').mockResolvedValue({
      total_debts: 1,
      active_debts: 1,
      paid_off_debts: 0,
      total_original_balance: 2000,
      total_current_balance: 1200,
      total_paid_off: 800,
      total_minimum_payments: 50,
      average_interest_rate: 0.19,
      overall_progress_percentage: 40,
      total_projected_interest: 400,
      total_amount_due: 1600,
    })
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([])
    vi.spyOn(debtsApi, 'listDebtPayments').mockResolvedValue([
      {
        id: 10,
        debt_id: 1,
        user_id: 1,
        amount: 50,
        payment_date: '2026-07-01',
        principal_amount: 40,
        interest_amount: 10,
        notes: 'Monthly payment',
        account_id: 2,
        transaction_id: 99,
        created_at: '',
      },
    ])

    renderPage()
    await screen.findByText('Interest & payoff')

    await user.click(screen.getByRole('button', { name: /View payments & linked txns/i }))

    expect(await screen.findByText('Payments & transactions')).toBeInTheDocument()
    expect(await screen.findByText('Monthly payment')).toBeInTheDocument()
    expect(screen.getByText(/Txn #99/)).toBeInTheDocument()
  })
})
