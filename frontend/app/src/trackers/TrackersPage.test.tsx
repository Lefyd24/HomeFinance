import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { formatDate } from '../lib/format'
import * as accountsApi from '../accounts/accountsApi'
import * as categoriesApi from '../categories/categoriesApi'
import * as trackersApi from './trackersApi'
import { TrackersPage } from './TrackersPage'
import type { Tracker } from './trackersApi'

const italy: Tracker = {
  id: 1,
  user_id: 1,
  name: 'Trip to Italy',
  description: 'Two weeks in Rome and Florence',
  target_amount: 2000,
  currency: 'EUR',
  icon: 'travel',
  color: '#6366F1',
  is_active: true,
  created_at: '2026-05-01T00:00:00Z',
  updated_at: null,
  transaction_count: 3,
  total_amount: 750,
  first_transaction_date: '2026-05-02',
  last_transaction_date: '2026-06-14',
  progress_percentage: 37.5,
  remaining_amount: 1250,
}

const kitchen: Tracker = {
  ...italy,
  id: 2,
  name: 'Kitchen renovation',
  description: null,
  // The common case: no target at all.
  target_amount: null,
  progress_percentage: null,
  remaining_amount: null,
  icon: 'tools',
  is_active: false,
  transaction_count: 0,
  total_amount: 0,
  first_transaction_date: null,
  last_transaction_date: null,
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <TrackersPage />
    </QueryClientProvider>,
  )
}

describe('TrackersPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists active trackers with their running total', async () => {
    vi.spyOn(trackersApi, 'listTrackers').mockResolvedValue([italy, kitchen])

    renderPage()

    expect(await screen.findByText('Trip to Italy')).toBeInTheDocument()
    // The inactive one is filtered out of the default "Active" tab.
    expect(screen.queryByText('Kitchen renovation')).not.toBeInTheDocument()
    expect(screen.getByText(/3 transactions/i)).toBeInTheDocument()
    expect(screen.getByText('38%')).toBeInTheDocument()
  })

  it('shows inactive trackers under the inactive tab', async () => {
    vi.spyOn(trackersApi, 'listTrackers').mockResolvedValue([italy, kitchen])

    renderPage()
    await screen.findByText('Trip to Italy')
    await userEvent.click(screen.getByRole('tab', { name: /inactive/i }))

    expect(await screen.findByText('Kitchen renovation')).toBeInTheDocument()
    expect(screen.queryByText('Trip to Italy')).not.toBeInTheDocument()
  })

  it('creates a tracker without a target amount', async () => {
    vi.spyOn(trackersApi, 'listTrackers').mockResolvedValue([])
    const createSpy = vi.spyOn(trackersApi, 'createTracker').mockResolvedValue(italy)

    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /create your first tracker/i }))
    await userEvent.type(screen.getByLabelText(/^name/i), 'Trip to Italy')
    await userEvent.click(screen.getByRole('button', { name: /create tracker/i }))

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Trip to Italy',
          target_amount: null,
          is_active: true,
        }),
      ),
    )
  })

  it('picks a HugeIcons icon rather than an emoji', async () => {
    vi.spyOn(trackersApi, 'listTrackers').mockResolvedValue([])
    const createSpy = vi.spyOn(trackersApi, 'createTracker').mockResolvedValue(italy)

    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /create your first tracker/i }))
    await userEvent.type(screen.getByLabelText(/^name/i), 'Kitchen renovation')

    await userEvent.click(screen.getByRole('button', { name: /click to change icon/i }))
    await userEvent.click(await screen.findByRole('button', { name: /^tools$/i }))
    await userEvent.click(screen.getByRole('button', { name: /create tracker/i }))

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({ icon: 'tools' })),
    )
  })

  it('deactivates a tracker from the actions menu', async () => {
    vi.spyOn(trackersApi, 'listTrackers').mockResolvedValue([italy])
    const updateSpy = vi
      .spyOn(trackersApi, 'updateTracker')
      .mockResolvedValue({ ...italy, is_active: false })

    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /actions for trip to italy/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /deactivate/i }))

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(1, { is_active: false }),
    )
  })

  it('opens the details sheet with the tracker dates and transactions', async () => {
    vi.spyOn(trackersApi, 'listTrackers').mockResolvedValue([italy])
    vi.spyOn(trackersApi, 'listTrackerTransactions').mockResolvedValue({
      count: 1,
      total_amount: 750,
      items: [
        {
          id: 5,
          transaction_id: 42,
          amount: 750,
          type: 'expense',
          description: 'Flights to Rome',
          date: '2026-06-14',
          notes: null,
          account_name: 'Checking',
          category_name: 'Travel',
          category_color: '#10B981',
          added_at: '2026-06-14T10:00:00Z',
        },
      ],
    })

    renderPage()
    await userEvent.click(await screen.findByText('Trip to Italy'))

    const sheet = await screen.findByRole('dialog')
    expect(await within(sheet).findByText('Flights to Rome')).toBeInTheDocument()
    expect(within(sheet).getByText('Created')).toBeInTheDocument()
    expect(within(sheet).getByText('Last entry')).toBeInTheDocument()
    expect(
      within(sheet).getByText(`Created ${formatDate(italy.created_at)}`),
    ).toBeInTheDocument()
    expect(within(sheet).getByText(formatDate(italy.last_transaction_date!))).toBeInTheDocument()
  })

  it('gives the sheet a width that beats SheetContent own max-w, and a green status badge', async () => {
    vi.spyOn(trackersApi, 'listTrackers').mockResolvedValue([italy])
    vi.spyOn(trackersApi, 'listTrackerTransactions').mockResolvedValue({
      count: 0,
      total_amount: 0,
      items: [],
    })

    renderPage()
    await userEvent.click(await screen.findByText('Trip to Italy'))

    const sheet = await screen.findByRole('dialog')
    // SheetContent pins the panel with `data-[side=right]:sm:max-w-sm`; an
    // unprefixed override loses the specificity tie and is silently dropped.
    expect(sheet.className).toContain('data-[side=right]:sm:max-w-xl')
    expect(sheet.className).not.toContain('data-[side=right]:sm:max-w-sm')

    const badge = within(sheet).getByText('Active')
    expect(badge).toHaveAttribute('data-variant', 'success')
    expect(badge.className).toContain('text-success')
  })

  it('marks an inactive tracker with the destructive badge', async () => {
    vi.spyOn(trackersApi, 'listTrackers').mockResolvedValue([kitchen])
    vi.spyOn(trackersApi, 'listTrackerTransactions').mockResolvedValue({
      count: 0,
      total_amount: 0,
      items: [],
    })

    renderPage()
    await userEvent.click(await screen.findByRole('tab', { name: /inactive/i }))
    await userEvent.click(await screen.findByText('Kitchen renovation'))

    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByText('Inactive')).toHaveAttribute('data-variant', 'destructive')
  })

  it('records a real transaction from the tracker page', async () => {
    vi.spyOn(trackersApi, 'listTrackers').mockResolvedValue([italy])
    vi.spyOn(accountsApi, 'listAccounts').mockResolvedValue([
      {
        id: 7,
        user_id: 1,
        name: 'Checking',
        type: 'checking',
        balance: 1000,
        currency: 'EUR',
        is_active: true,
        is_linked: false,
        created_at: '',
        updated_at: '',
      } as never,
    ])
    vi.spyOn(categoriesApi, 'listCategories').mockResolvedValue([])
    const addSpy = vi.spyOn(trackersApi, 'addTrackerTransaction').mockResolvedValue(italy)

    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /^add$/i }))

    const amount = await screen.findByLabelText(/amount/i)
    await userEvent.clear(amount)
    await userEvent.type(amount, '120')
    const description = screen.getByLabelText(/description/i)
    await userEvent.clear(description)
    await userEvent.type(description, 'Hotel in Rome')
    // Account select first, category select second.
    await userEvent.click(screen.getAllByRole('combobox')[0])
    await userEvent.click(await screen.findByRole('option', { name: 'Checking' }))
    await userEvent.click(screen.getByRole('button', { name: /^add transaction$/i }))

    await waitFor(() =>
      expect(addSpy).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          account_id: 7,
          amount: 120,
          type: 'expense',
          description: 'Hotel in Rome',
        }),
      ),
    )
  })
})
