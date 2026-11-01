import { apiFetch, getAccessToken, getApiBaseUrl } from '../lib/apiClient'

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

export interface DocumentFolder {
  name: string
  count: number
}

export interface DocumentFoldersResponse {
  folders: DocumentFolder[]
  total: number
}

export interface DocumentFilters {
  folder?: string
  search?: string
}

export interface UploadDocumentInput {
  title: string
  description?: string
  folder?: string
}

export interface UpdateDocumentInput {
  title?: string
  description?: string
  folder?: string
}

function buildQuery(filters: DocumentFilters = {}): string {
  const params = new URLSearchParams()
  if (filters.folder) params.set('folder', filters.folder)
  if (filters.search) params.set('search', filters.search)
  const qs = params.toString()
  return qs ? `?${qs}` : ''
}

export function listDocuments(filters: DocumentFilters = {}): Promise<DocumentItem[]> {
  return apiFetch<DocumentItem[]>(`/documents${buildQuery(filters)}`)
}

export function listFolders(): Promise<DocumentFoldersResponse> {
  return apiFetch<DocumentFoldersResponse>('/documents/folders')
}

export function createFolder(name: string): Promise<{ name: string }> {
  return apiFetch<{ name: string }>('/documents/folders', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export function deleteFolder(name: string): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>(`/documents/folders/${encodeURIComponent(name)}`, {
    method: 'DELETE',
  })
}

export async function uploadDocument(
  file: File,
  input: UploadDocumentInput = { title: '' },
): Promise<DocumentItem> {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('title', input.title || file.name)
  formData.append('description', input.description ?? '')
  formData.append('folder', input.folder ?? '')
  const token = getAccessToken()
  const response = await fetch(`${getApiBaseUrl()}/documents/upload`, {
    method: 'POST',
    body: formData,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error(`Upload failed: ${response.status}`)
  return response.json() as Promise<DocumentItem>
}

export function updateDocument(docId: string, input: UpdateDocumentInput): Promise<DocumentItem> {
  return apiFetch<DocumentItem>(`/documents/${docId}`, {
    method: 'PUT',
    body: JSON.stringify(input),
  })
}

export function deleteDocument(docId: string): Promise<{ detail: string }> {
  return apiFetch<{ detail: string }>(`/documents/${docId}`, { method: 'DELETE' })
}

/** Fetches a file with the Authorization header (never a token in the URL); caller revokes the blob URL. */
export async function fetchDocumentBlobUrl(
  docId: string,
  kind: 'preview' | 'download',
): Promise<string> {
  const token = getAccessToken()
  const response = await fetch(`${getApiBaseUrl()}/documents/${docId}/${kind}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  })
  if (!response.ok) throw new Error(`Failed to load document: ${response.status}`)
  return URL.createObjectURL(await response.blob())
}

export async function downloadDocument(docId: string, filename: string): Promise<void> {
  const url = await fetchDocumentBlobUrl(docId, 'download')
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
