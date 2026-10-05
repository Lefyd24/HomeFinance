import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ApiError } from '../lib/apiClient'
import * as accountsApi from '../accounts/accountsApi'
import * as categoriesApi from '../categories/categoriesApi'
import type { Account } from '../accounts/accountsApi'
import type { Category } from '../categories/categoriesApi'
import * as importApi from './importApi'
import { ImportWizardPage } from './ImportWizardPage'

const account = {
  id: 7, user_id: 1, name: 'Everyday', type: 'checking', currency: 'EUR', balance: 0,
  description: null, icon: null, is_active: true, is_linked: false,
} as unknown as Account
const linkedAccount = { ...account, id: 8, name: 'Synced bank', is_linked: true } as Account
const coffee = { id: 3, user_id: 1, name: 'Coffee', type: 'expense', color: '#000', icon: null, parent_id: null, is_system: false } as unknown as Category

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ImportWizardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function csvFile() {
  return new File(['date,description,amount\n2026-07-01,Coffee shop,-4.50'], 'bank.csv', { type: 'text/csv' })
}

async function chooseFileWithFormat(format: RegExp = /day first/i) {
  await userEvent.click(screen.getByRole('radio', { name: format }))
  await userEvent.upload(screen.getByLabelText(/choose file/i), csvFile())
}

function mockUpload() {
  vi.spyOn(importApi, 'uploadImportFile').mockResolvedValue({
    batch_id: 1, filename: 'bank.csv', total_rows: 2, message: 'ok',
    skipped: [{ line: 4, reason: 'invalid_date', value: 'Total' }],
  })
}

describe('ImportWizardPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('explains the expected file format before anything is uploaded', () => {
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([account])
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([])
    renderPage()
    expect(screen.getByRole('heading', { name: /what file can i import/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /download template/i })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: /how are dates written/i })).toBeInTheDocument()
  })

  it('requires a date format before a file can be chosen', async () => {
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([account])
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([])
    mockUpload()
    vi.spyOn(importApi, 'getImportPreview').mockResolvedValue({ transactions: [], duplicates: [], total: 0 })
    const upload = vi.mocked(importApi.uploadImportFile)
    renderPage()

    const input = screen.getByLabelText(/choose file/i)
    expect(input).toBeDisabled()
    expect(screen.getByText(/choose the date format first/i)).toBeInTheDocument()

    await chooseFileWithFormat(/month first/i)
    expect(upload).toHaveBeenCalledWith(expect.any(File), 'mdy')
    expect(await screen.findByText(/date format: month first/i)).toBeInTheDocument()
  })

  it("shows the server's reason when a file can't be read", async () => {
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([account])
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([])
    vi.spyOn(importApi, 'uploadImportFile').mockRejectedValue(
      new ApiError(400, 'Bad Request', 'Could not find the column headers.'),
    )
    renderPage()
    await chooseFileWithFormat()
    expect(await screen.findByText('Could not find the column headers.')).toBeInTheDocument()
  })

  it('unticks duplicates and confirms only the selected rows', async () => {
    // The linked account must not be offered, so the single eligible one is preselected.
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([account, linkedAccount])
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([coffee])
    mockUpload()
    const preview = vi.spyOn(importApi, 'getImportPreview').mockResolvedValue({
      transactions: [
        { id: 1, line: 2, date: '2026-07-01', description: 'Coffee shop', amount: -4.5, type: 'expense', category_id: 3, is_duplicate: false },
        { id: 2, line: 3, date: '2026-07-02', description: 'Already there', amount: -9, type: 'expense', category_id: null, is_duplicate: true },
      ],
      duplicates: [],
      total: 2,
    })
    const confirm = vi.spyOn(importApi, 'confirmImport').mockResolvedValue({ message: 'ok', imported_count: 1 })

    renderPage()
    await chooseFileWithFormat()

    expect(await screen.findByText('Coffee shop')).toBeInTheDocument()
    expect(preview).toHaveBeenLastCalledWith(1, { accountId: 7, invertSigns: false })
    expect(screen.getByText(/possible duplicate/i)).toBeInTheDocument()
    expect(screen.getByRole('checkbox', { name: /include already there/i })).not.toBeChecked()
    expect(screen.getByText(/1 line was skipped/i)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /import 1 transaction$/i }))

    expect(confirm).toHaveBeenCalledWith({
      batch_id: 1, account_id: 7, invert_signs: false,
      rows: [{ row_id: 1, category_id: 3 }],
    })
    const done = await screen.findByRole('heading', { name: /imported 1 transaction/i })
    expect(within(done.parentElement as HTMLElement).getByText(/everyday/i)).toBeInTheDocument()
  })

  it('refetches with inverted signs when the toggle is switched on', async () => {
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([account])
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([])
    mockUpload()
    const preview = vi.spyOn(importApi, 'getImportPreview').mockResolvedValue({
      transactions: [{ id: 1, line: 2, date: '2026-07-01', description: 'Card', amount: 25, type: 'income', category_id: null, is_duplicate: false }],
      duplicates: [], total: 1,
    })
    renderPage()
    await chooseFileWithFormat()
    await screen.findByText('Card')
    await userEvent.click(screen.getByRole('switch', { name: /flip signs/i }))
    expect(preview).toHaveBeenLastCalledWith(1, { accountId: 7, invertSigns: true })
  })

  it('sends the column names the user typed with the upload', async () => {
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([account])
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([])
    mockUpload()
    vi.spyOn(importApi, 'getImportPreview').mockResolvedValue({ transactions: [], duplicates: [], total: 0 })
    const upload = vi.mocked(importApi.uploadImportFile)
    renderPage()

    await userEvent.type(screen.getByLabelText(/^date column/i), 'Value date')
    await userEvent.type(screen.getByLabelText(/^description column/i), 'Reference')
    await chooseFileWithFormat()
    expect(upload).toHaveBeenCalledWith(expect.any(File), 'dmy', { date: 'Value date', description: 'Reference' })
  })
})
