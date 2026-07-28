import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as documentsApi from './documentsApi'
import { DocumentsPage } from './DocumentsPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <DocumentsPage />
    </QueryClientProvider>,
  )
}

describe('DocumentsPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists documents', async () => {
    vi.spyOn(documentsApi, 'listDocuments').mockResolvedValue([
      {
        id: 'doc-1',
        title: 'Lease agreement',
        description: '',
        filename: 'Lease agreement.pdf',
        stored_name: 'doc-1.pdf',
        folder: '',
        size: 102400,
        mime_type: 'application/pdf',
        uploaded_at: '2026-01-01T00:00:00Z',
      },
    ])

    renderPage()

    expect(await screen.findByText('Lease agreement')).toBeInTheDocument()
  })
})
