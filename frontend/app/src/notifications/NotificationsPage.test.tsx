import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import * as notificationsApi from './notificationsApi'
import { NotificationsPage } from './NotificationsPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <NotificationsPage />
    </QueryClientProvider>,
  )
}

describe('NotificationsPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the notification log', async () => {
    vi.spyOn(notificationsApi, 'getNotificationLog').mockResolvedValue([
      {
        id: 1,
        user_id: 1,
        dedupe_key: 'x',
        type: 'budget',
        title: 'Budget "Groceries" is 90% spent',
        body: null,
        channels_sent: null,
        created_at: '2026-07-20T10:00:00Z',
      },
    ])

    renderPage()

    expect(await screen.findByText('Budget "Groceries" is 90% spent')).toBeInTheDocument()
  })
})
