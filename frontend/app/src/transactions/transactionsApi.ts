import { apiFetch } from '../lib/apiClient'

export type TransactionType = 'income' | 'expense' | 'transfer'

export interface Transaction {
  id: number
  user_id: number
  account_id: number
  destination_account_id: number | null
  category_id: number | null
  amount: number
  type: TransactionType
  description: string
  date: string
  notes: string | null
  is_imported: boolean
  /** Not yet booked by the bank — may change or vanish on the next sync. */
  is_pending: boolean
  /** Came from a bank sync: amount, date, type and account are locked. */
  is_bank_synced: boolean
  import_batch_id: string | null
  source_file: string | null
  debt_payment_id?: number | null
  debt_id?: number | null
  debt_name?: string | null
  recurring_payment_id?: number | null
  recurring_expense_id?: number | null
  recurring_expense_name?: string | null
  created_at: string
  updated_at: string
  account_name?: string | null
  destination_account_name?: string | null
  category_name?: string | null
  category_color?: string | null
  paired_transaction_id?: number | null
  /** 'outgoing' | 'incoming' — set only on a retagged/paired transfer leg. */
  transfer_direction?: 'outgoing' | 'incoming' | null
  /** The row's type before it was retagged as a transfer, so it can be unmarked. */
  original_type?: TransactionType | null
  /** Trackers this transaction has been filed under. Manual assignment only. */
  tracker_ids?: number[]
  tracker_names?: string[]
}

export interface TransactionList {
  items: Transaction[]
  total: number
  page: number
  per_page: number
}

export interface TransactionFilters {
  page?: number
  per_page?: number
  start_date?: string
  end_date?: string
  account_id?: number
  category_id?: number
  type?: TransactionType
  search?: string
}

export interface TransactionInput {
  account_id: number
  destination_account_id?: number | null
  category_id?: number | null
  amount: number
  type: TransactionType
  description: string
  date: string
  notes?: string | null
}

function buildQueryString(filters: TransactionFilters): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value))
    }
  }
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function listTransactions(filters: TransactionFilters = {}): Promise<TransactionList> {
  return apiFetch<TransactionList>(`/transactions/${buildQueryString(filters)}`)
}

export function getTransaction(id: number): Promise<Transaction> {
  return apiFetch<Transaction>(`/transactions/${id}`)
}

export function createTransaction(input: TransactionInput): Promise<Transaction> {
  return apiFetch<Transaction>('/transactions/', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export function updateTransaction(id: number, input: Partial<TransactionInput>): Promise<Transaction> {
  return apiFetch<Transaction>(`/transactions/${id}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteTransaction(
  id: number,
  options: { affectLinked?: boolean } = {},
): Promise<void> {
  const qs = options.affectLinked ? '?affect_linked=true' : '?affect_linked=false'
  return apiFetch<void>(`/transactions/${id}${qs}`, { method: 'DELETE' })
}

/**
 * Replace the set of trackers a transaction belongs to.
 *
 * Sent as the complete set, not a diff — the edit modal's multi-select already
 * knows the final answer, and one request keeps it atomic.
 */
export function setTransactionTrackers(
  id: number,
  trackerIds: number[],
): Promise<Transaction> {
  return apiFetch<Transaction>(`/transactions/${id}/trackers`, {
    method: 'PUT',
    body: JSON.stringify({ tracker_ids: trackerIds }),
  })
}

export function isLinkedPayment(transaction: Transaction): boolean {
  return Boolean(transaction.debt_payment_id || transaction.recurring_payment_id)
}

export interface TransactionSplitPart {
  amount: number
  category_id?: number | null
  notes?: string | null
  description?: string | null
}

/**
 * Break one transaction into parts that still sum to the original amount.
 *
 * The backend keeps the original row (it anchors bank deduplication) and
 * reduces it to the first part, so the returned array is [original, ...extras].
 */
export function splitTransaction(
  id: number,
  parts: TransactionSplitPart[],
): Promise<Transaction[]> {
  return apiFetch<Transaction[]>(`/transactions/${id}/split`, {
    method: 'POST',
    body: JSON.stringify({ parts }),
  })
}

/**
 * Match two existing transactions (e.g. the expense and income legs synced
 * independently on two linked accounts) as the two legs of one transfer.
 * Neither account's balance is touched — both are already correct.
 */
export function pairTransfer(id: number, pairedTransactionId: number): Promise<Transaction> {
  return apiFetch<Transaction>(`/transactions/${id}/pair-transfer`, {
    method: 'POST',
    body: JSON.stringify({ paired_transaction_id: pairedTransactionId }),
  })
}

/**
 * Retag a single synced transaction as a transfer to a destination account
 * that has no row of its own yet (e.g. a linked account's expense to a
 * manual account). Only the destination's balance is adjusted.
 */
export function retagTransfer(id: number, destinationAccountId: number): Promise<Transaction> {
  return apiFetch<Transaction>(`/transactions/${id}/retag-transfer`, {
    method: 'POST',
    body: JSON.stringify({ destination_account_id: destinationAccountId }),
  })
}

/** Undo pairTransfer / retagTransfer: restores the original type and reverses any balance change. */
export function unmarkTransfer(id: number): Promise<Transaction> {
  return apiFetch<Transaction>(`/transactions/${id}/unmark-transfer`, {
    method: 'POST',
  })
}
