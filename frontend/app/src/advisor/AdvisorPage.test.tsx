import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { formatCurrency } from '../lib/format'
import * as advisorApi from './advisorApi'
import { AdvisorPage } from './AdvisorPage'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <AdvisorPage />
    </QueryClientProvider>,
  )
}

describe('AdvisorPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('shows the net worth breakdown once requested', async () => {
    vi.spyOn(advisorApi, 'getNetWorth').mockResolvedValue({
      net_worth: 12000,
      total_assets: 15000,
      total_liabilities: 3000,
      assets_breakdown: {},
      liabilities_breakdown: {},
      debt_to_asset_ratio: 20,
      calculated_at: '2024-01-01',
    })

    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: /net worth/i }))
    await user.click(screen.getByRole('button', { name: /current net worth/i }))

    expect(await screen.findByText(formatCurrency(12000))).toBeInTheDocument()
  })

  it('shows the emergency fund recommendation once requested', async () => {
    vi.spyOn(advisorApi, 'getEmergencyFundRecommendation').mockResolvedValue({
      current_liquid_assets: 2000,
      monthly_expenses: 1000,
      recommendations: { minimum: 3000, recommended: 6000, maximum: 9000 },
      current_coverage: { months_covered: 2, percentage_of_recommended: 33 },
      status: 'fair',
      message: 'Build your emergency fund',
      gap_to_recommended: 4000,
      savings_plans: [],
    })

    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: /emergency/i }))
    await user.click(screen.getByRole('button', { name: /analyze my spending/i }))

    expect(await screen.findByText('Build your emergency fund')).toBeInTheDocument()
  })
})
