import { apiFetch } from '../lib/apiClient'

export type DebtType =
  | 'credit_card'
  | 'student_loan'
  | 'mortgage'
  | 'car_loan'
  | 'personal_loan'
  | 'utilities'
  | 'subscription'
  | 'medical'
  | 'tax'
  | 'informal'
  | 'legal'
  | 'other'
  | 'custom'

export type RecurrenceUnit = 'days' | 'weeks' | 'months'

export interface Debt {
  id: number
  user_id: number
  name: string
  creditor: string | null
  type: DebtType
  custom_type: string | null
  original_balance: number
  current_balance: number
  interest_rate: number | null
  minimum_payment: number | null
  opened_date: string | null
  maturity_date: string | null
  notes: string | null
  recurrence_interval: number | null
  recurrence_unit: RecurrenceUnit | null
  recurrence_day_of_month: number | null
  next_payment_date: string | null
  linked_account_id: number | null
  linked_category_id: number | null
  notify_enabled: boolean
  notify_days_before: number | null
  priority: number
  is_active: boolean
  is_paid_off: boolean
  paid_off_date: string | null
  created_at: string
  updated_at: string
  /** Computed by backend from APR + minimum payment */
  months_to_payoff?: number | null
  total_interest?: number | null
  payoff_date?: string | null
  total_amount_due?: number | null
}

export interface DebtInput {
  name: string
  type: DebtType
  original_balance: number
  current_balance: number
  creditor?: string | null
  custom_type?: string | null
  interest_rate?: number | null
  minimum_payment?: number | null
  opened_date?: string | null
  maturity_date?: string | null
  notes?: string | null
  recurrence_interval?: number | null
  recurrence_unit?: RecurrenceUnit | null
  recurrence_day_of_month?: number | null
  next_payment_date?: string | null
  linked_account_id?: number | null
  linked_category_id?: number | null
  notify_enabled?: boolean
  notify_days_before?: number | null
  priority?: number
  is_paid_off?: boolean
  paid_off_date?: string | null
  is_active?: boolean
}

export type DebtUpdateInput = Partial<DebtInput>

export interface DebtPayment {
  id: number
  debt_id: number
  user_id: number
  amount: number
  payment_date: string
  principal_amount: number | null
  interest_amount: number | null
  notes: string | null
  account_id: number | null
  transaction_id: number | null
  created_at: string
}

export interface DebtPaymentInput {
  amount: number
  payment_date: string
  principal_amount?: number | null
  interest_amount?: number | null
  notes?: string | null
  account_id?: number | null
  transaction_id?: number | null
  create_transaction?: boolean
}

export interface DebtSummary {
  total_debts: number
  active_debts: number
  paid_off_debts: number
  total_original_balance: number
  total_current_balance: number
  total_paid_off: number
  total_minimum_payments: number
  average_interest_rate: number
  overall_progress_percentage: number
  total_projected_interest: number
  total_amount_due: number
}

export interface PayoffScheduleItem {
  month: number
  debt_id: number
  debt_name: string
  payment: number
  remaining_balance: number
}

export interface PayoffStrategy {
  strategy: string
  total_months: number
  total_interest_paid: number
  total_payments: number
  payoff_schedule: PayoffScheduleItem[]
}

export interface PayoffComparison {
  snowball: PayoffStrategy
  avalanche: PayoffStrategy
  recommended_strategy: string
  savings_difference: number
  months_difference: number
}

export interface ExtraPaymentScenario {
  extra_payment: number
  new_payoff_months: number
  interest_saved: number
  months_saved: number
}

export interface UpcomingDebtPayment {
  debt_id: number
  debt_name: string
  creditor: string | null
  amount: number
  due_date: string
  days_until_due: number
  is_overdue: boolean
  debt_type?: string
  is_one_time?: boolean
}

export function listDebts(activeOnly = false): Promise<Debt[]> {
  const qs = activeOnly ? '?active_only=true' : '?active_only=false'
  return apiFetch<Debt[]>(`/debts/${qs}`)
}

export function getDebt(id: number): Promise<Debt> {
  return apiFetch<Debt>(`/debts/${id}`)
}

export function getDebtSummary(): Promise<DebtSummary> {
  return apiFetch<DebtSummary>('/debts/summary')
}

export function listUpcomingDebtPayments(days = 30): Promise<UpcomingDebtPayment[]> {
  return apiFetch<UpcomingDebtPayment[]>(`/debts/upcoming-payments?days=${days}`)
}

export function createDebt(input: DebtInput): Promise<Debt> {
  return apiFetch<Debt>('/debts/', { method: 'POST', body: JSON.stringify(input) })
}

export function updateDebt(id: number, input: DebtUpdateInput): Promise<Debt> {
  return apiFetch<Debt>(`/debts/${id}`, { method: 'PUT', body: JSON.stringify(input) })
}

export function deleteDebt(id: number): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/debts/${id}`, { method: 'DELETE' })
}

export function listDebtPayments(debtId: number, limit = 50): Promise<DebtPayment[]> {
  return apiFetch<DebtPayment[]>(`/debts/${debtId}/payments?limit=${limit}`)
}

export function addDebtPayment(debtId: number, input: DebtPaymentInput): Promise<DebtPayment> {
  return apiFetch<DebtPayment>(`/debts/${debtId}/payments`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export type DebtPaymentUpdateInput = Partial<
  Pick<DebtPaymentInput, 'amount' | 'payment_date' | 'principal_amount' | 'interest_amount' | 'notes'>
>

export function updateDebtPayment(
  debtId: number,
  paymentId: number,
  input: DebtPaymentUpdateInput,
): Promise<DebtPayment> {
  return apiFetch<DebtPayment>(`/debts/${debtId}/payments/${paymentId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteDebtPayment(
  debtId: number,
  paymentId: number,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(`/debts/${debtId}/payments/${paymentId}`, {
    method: 'DELETE',
  })
}

export function comparePayoffStrategies(extraPayment = 0): Promise<PayoffComparison> {
  return apiFetch<PayoffComparison>(
    `/debts/strategies/compare?extra_payment=${extraPayment}`,
  )
}

export function getExtraPaymentScenarios(): Promise<ExtraPaymentScenario[]> {
  return apiFetch<ExtraPaymentScenario[]>('/debts/strategies/scenarios')
}
