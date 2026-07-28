import { getApiBaseUrl } from '../lib/apiClient'
import { apiFetch } from '../lib/apiClient'

export interface UploadResult {
  batch_id: number
  filename: string
  total_rows: number
  message: string
}

export interface ImportPreviewRow {
  id?: number | null
  date: string
  description: string
  amount: number
  suggested_category?: string | null
  is_duplicate?: boolean
}

export interface ImportPreview {
  transactions: ImportPreviewRow[]
  duplicates: ImportPreviewRow[]
  total: number
}

export async function uploadImportFile(file: File): Promise<UploadResult> {
  const formData = new FormData()
  formData.append('file', file)
  const token = window.localStorage.getItem('token')
  const response = await fetch(`${getApiBaseUrl()}/import/upload`, {
    method: 'POST',
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`)
  return response.json() as Promise<UploadResult>
}

export function getImportPreview(batchId: number): Promise<ImportPreview> {
  return apiFetch<ImportPreview>(`/import/preview/${batchId}`)
}
