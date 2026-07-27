import { apiFetch, getApiBaseUrl } from '../lib/apiClient'

export interface DocumentItem {
  id: string
  title: string
  description: string
  filename: string
  stored_name: string
  folder: string
  size: number
  mime_type: string
  uploaded_at: string
}

export function listDocuments(): Promise<DocumentItem[]> {
  return apiFetch<DocumentItem[]>('/documents')
}

export async function uploadDocument(file: File, title?: string): Promise<DocumentItem> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('title', title || file.name)
  formData.append('description', '')
  formData.append('folder', '')
  const token = window.localStorage.getItem('token')
  const response = await fetch(`${getApiBaseUrl()}/documents/upload`, {
    method: 'POST',
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`)
  return response.json() as Promise<DocumentItem>
}

export function getDownloadUrl(docId: string): string {
  const token = window.localStorage.getItem('token')
  const base = `${getApiBaseUrl()}/documents/${docId}/download`
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}
