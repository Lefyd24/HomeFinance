import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as importApi from './importApi'
import { ImportWizardPage } from './ImportWizardPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <ImportWizardPage />
    </QueryClientProvider>,
  )
}

describe('ImportWizardPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('uploads a file and shows the preview', async () => {
    vi.spyOn(importApi, 'uploadImportFile').mockResolvedValue({
      batch_id: 1,
      filename: 'transactions.csv',
      total_rows: 1,
      message: 'ok',
    })
    vi.spyOn(importApi, 'getImportPreview').mockResolvedValue({
      transactions: [{ date: '2026-07-01', description: 'Coffee shop', amount: -4.5 }],
      duplicates: [],
      total: 1,
    })

    renderPage()

    const file = new File(
      ['date,description,amount\n2026-07-01,Coffee shop,-4.50'],
      'transactions.csv',
      { type: 'text/csv' },
    )
    const input = screen.getByLabelText(/choose file/i)
    await userEvent.upload(input, file)

    expect(await screen.findByText('Coffee shop')).toBeInTheDocument()
  })
})
