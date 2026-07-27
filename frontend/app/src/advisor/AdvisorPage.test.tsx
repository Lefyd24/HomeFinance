import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
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

  it('shows net worth and the emergency fund recommendation', async () => {
    vi.spyOn(advisorApi, 'getNetWorth').mockResolvedValue({
      net_worth: 12000,
      total_assets: 15000,
      total_liabilities: 3000,
      assets_breakdown: {},
      liabilities_breakdown: {},
      debt_to_asset_ratio: 0.2,
      calculated_at: '',
    })
    vi.spyOn(advisorApi, 'getEmergencyFundRecommendation').mockResolvedValue({
      current_liquid_assets: 2000,
      monthly_expenses: 1000,
      recommendations: { minimum: 3000, recommended: 6000, maximum: 9000 },
      current_coverage: { months_covered: 2, percentage_of_recommended: 33 },
      status: 'below',
      message: 'Build your emergency fund',
      gap_to_recommended: 4000,
    })

    renderPage()

    expect(await screen.findByText(formatCurrency(12000))).toBeInTheDocument()
    expect(
      screen.getByText(
        `${formatCurrency(2000)} saved of a recommended ${formatCurrency(6000)}`,
      ),
    ).toBeInTheDocument()
  })
})
