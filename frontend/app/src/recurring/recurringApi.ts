import { apiFetch } from '../lib/apiClient'

export interface RecurringExpense {
  id: number
  user_id: number
  name: string
  amount: number
  category_id: number | null
  account_id: number | null
  recurrence_interval: number
  recurrence_unit: 'days' | 'weeks' | 'months'
  start_date: string
  next_due_date: string
  notes: string | null
  is_active: boolean
  notify_enabled: boolean
  notify_days_before: number | null
  days_until_due?: number | null
  is_overdue?: boolean
  created_at: string
  updated_at: string
}

export interface RecurringExpenseInput {
  name: string
  amount: number
  category_id?: number | null
  account_id?: number | null
  recurrence_interval: number
  recurrence_unit: 'days' | 'weeks' | 'months'
  start_date: string
  next_due_date: string
  notes?: string | null
  is_active?: boolean
  notify_enabled?: boolean
  notify_days_before?: number | null
}

export type RecurringExpenseUpdate = Partial<RecurringExpenseInput>

export interface RecurringPaymentInput {
  amount: number
  payment_date: string
  transaction_id?: number | null
  notes?: string | null
}

export interface RecurringPayment {
  id: number
  recurring_expense_id: number
  user_id: number
  amount: number
  payment_date: string
  transaction_id: number | null
  notes: string | null
  created_at: string
}

export interface LinkedTransactionRow {
  payment_id: number
  payment_date: string
  amount: number
  transaction_id: number | null
  description: string
  transaction_date: string
  category_id: number | null
  category_name: string | null
  category_color: string | null
  account_id: number | null
  account_name: string | null
  notes: string | null
}

export interface LinkedTransactionsResponse {
  recurring_expense: {
    id: number
    name: string
    amount: number
    recurrence_interval: number
    recurrence_unit: string
    next_due_date: string
    category_id: number | null
    account_id: number | null
  }
  transactions: LinkedTransactionRow[]
  summary: {
    total_paid: number
    payment_count: number
    last_payment_date: string | null
  }
}

export interface UpcomingRecurringPayment {
  id: number
  name: string
  category_name?: string | null
  amount: number
  due_date: string
  days_until_due: number
  is_overdue: boolean
}

export function listRecurringExpenses(activeOnly = false): Promise<RecurringExpense[]> {
  const qs = activeOnly ? '?active_only=true' : ''
  return apiFetch<RecurringExpense[]>(`/recurring-expenses/${qs}`)
}

export function listUpcomingRecurringPayments(days = 15): Promise<UpcomingRecurringPayment[]> {
  return apiFetch<UpcomingRecurringPayment[]>(`/recurring-expenses/upcoming?days=${days}`)
}

export function createRecurringExpense(input: RecurringExpenseInput): Promise<RecurringExpense> {
  return apiFetch<RecurringExpense>('/recurring-expenses/', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateRecurringExpense(
  id: number,
  input: RecurringExpenseUpdate,
): Promise<RecurringExpense> {
  return apiFetch<RecurringExpense>(`/recurring-expenses/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteRecurringExpense(id: number): Promise<void> {
  return apiFetch<void>(`/recurring-expenses/${id}`, { method: 'DELETE' })
}

export function setRecurringExpenseActive(id: number, active: boolean): Promise<RecurringExpense> {
  return updateRecurringExpense(id, { is_active: active })
}

export function recordRecurringPayment(
  id: number,
  input: RecurringPaymentInput,
): Promise<RecurringPayment> {
  return apiFetch<RecurringPayment>(`/recurring-expenses/${id}/payments`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export type RecurringPaymentUpdate = Partial<
  Pick<RecurringPaymentInput, 'amount' | 'payment_date' | 'notes'>
>

export function updateRecurringPayment(
  expenseId: number,
  paymentId: number,
  input: RecurringPaymentUpdate,
): Promise<RecurringPayment> {
  return apiFetch<RecurringPayment>(`/recurring-expenses/${expenseId}/payments/${paymentId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteRecurringPayment(
  expenseId: number,
  paymentId: number,
): Promise<{ message: string }> {
  return apiFetch<{ message: string }>(
    `/recurring-expenses/${expenseId}/payments/${paymentId}`,
    { method: 'DELETE' },
  )
}

export function getLinkedTransactions(
  id: number,
  skip = 0,
  limit = 50,
): Promise<LinkedTransactionsResponse> {
  return apiFetch<LinkedTransactionsResponse>(
    `/recurring-expenses/${id}/transactions?skip=${skip}&limit=${limit}`,
  )
}
