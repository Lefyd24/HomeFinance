import { apiFetch } from '../lib/apiClient'

export type SkipReason = 'missing_date' | 'invalid_date' | 'invalid_amount' | 'zero_amount'

/** Order of day, month and year in the file's dates; chosen by the user before upload. */
export type DateFormat = 'dmy' | 'mdy' | 'ymd'
export const DATE_FORMATS: readonly DateFormat[] = ['dmy', 'mdy', 'ymd']

/** Header names typed by the user; a blank or missing entry means "detect automatically". */
export interface ImportColumns {
  date?: string
  description?: string
  amount?: string
  debit?: string
  credit?: string
}

export interface SkippedRow {
  line: number
  reason: SkipReason
  value: string
}

export interface UploadResult {
  batch_id: number
  filename: string
  total_rows: number
  skipped: SkippedRow[]
  message: string
}

export interface ImportPreviewRow {
  id: number
  line: number | null
  date: string
  description: string
  amount: number
  type: 'income' | 'expense'
  category_id: number | null
  is_duplicate: boolean
}

export interface ImportPreview {
  transactions: ImportPreviewRow[]
  duplicates: ImportPreviewRow[]
  total: number
}

export interface ConfirmImportInput {
  batch_id: number
  account_id: number
  invert_signs: boolean
  rows: { row_id: number; category_id: number | null }[]
}

export interface ConfirmImportResult {
  message: string
  imported_count: number
}

export function uploadImportFile(
  file: File,
  dateFormat: DateFormat,
  columns?: ImportColumns,
): Promise<UploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('date_format', dateFormat)
  for (const [key, value] of Object.entries(columns ?? {})) {
    if (value?.trim()) formData.append(`${key}_column`, value.trim())
  }
  return apiFetch<UploadResult>('/import/upload', { method: 'POST', body: formData })
}

export function getImportPreview(
  batchId: number,
  options: { accountId?: number; invertSigns?: boolean } = {},
): Promise<ImportPreview> {
  const params = new URLSearchParams()
  if (options.accountId != null) params.set('account_id', String(options.accountId))
  if (options.invertSigns) params.set('invert_signs', 'true')
  const query = params.toString()
  return apiFetch<ImportPreview>(`/import/preview/${batchId}${query ? `?${query}` : ''}`)
}

export function confirmImport(input: ConfirmImportInput): Promise<ConfirmImportResult> {
  return apiFetch<ConfirmImportResult>('/import/confirm', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
