import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import * as api from './investorProfileApi'
import type { InvestorProfile } from './investorProfileApi'
import { InvestorProfilePage } from './InvestorProfilePage'

const EMPTY_PROFILE: InvestorProfile = {
  is_set: false,
  is_stale: true,
  updated_by: null,
  updated_at: null,
  risk_tolerance: null,
  primary_objective: null,
  horizon_years: null,
  liquidity_needs_months: null,
  target_allocation: null,
  max_single_position_pct: null,
  excluded_sectors: null,
  excluded_symbols: null,
  income_stability: null,
  experience_level: null,
  base_currency: null,
  tax_residency: null,
  notes: null,
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <InvestorProfilePage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

describe('InvestorProfilePage', () => {
  beforeEach(() => {
    vi.spyOn(api, 'getInvestorProfileOptions').mockResolvedValue({
      risk_tolerances: ['conservative', 'moderate', 'balanced', 'growth', 'aggressive'],
      primary_objectives: ['preservation', 'income', 'balanced', 'growth'],
      income_stabilities: ['stable', 'variable', 'uncertain'],
      experience_levels: ['beginner', 'intermediate', 'experienced'],
      allocation_classes: ['equity', 'bond', 'cash', 'crypto', 'other'],
      editable_fields: ['risk_tolerance'],
    })
    vi.spyOn(api, 'getInvestorProfileRevisions').mockResolvedValue([])
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('says nothing is set yet, and why that matters', async () => {
    vi.spyOn(api, 'getInvestorProfile').mockResolvedValue(EMPTY_PROFILE)
    renderPage()
    expect(await screen.findByText(/Nothing set yet/i)).toBeInTheDocument()
    expect(screen.getByText(/will ask before giving allocation advice/i)).toBeInTheDocument()
  })

  it('loads existing values into the form', async () => {
    vi.spyOn(api, 'getInvestorProfile').mockResolvedValue({
      ...EMPTY_PROFILE,
      is_set: true,
      updated_at: '2026-08-01T10:00:00',
      horizon_years: 12,
      max_single_position_pct: 20,
      excluded_symbols: ['TSLA', 'NVDA'],
      target_allocation: { equity: 70, bond: 20, cash: 10 },
    })

    renderPage()

    expect(await screen.findByLabelText(/Investment horizon/i)).toHaveValue('12')
    expect(screen.getByLabelText(/Maximum single position/i)).toHaveValue('20')
    expect(screen.getByLabelText(/Excluded symbols/i)).toHaveValue('TSLA, NVDA')
    expect(screen.getByLabelText('Equity')).toHaveValue('70')
    expect(screen.getByLabelText('Bonds')).toHaveValue('20')
  })

  it('warns when the target allocation does not add up', async () => {
    vi.spyOn(api, 'getInvestorProfile').mockResolvedValue({
      ...EMPTY_PROFILE,
      is_set: true,
      updated_at: '2026-08-01T10:00:00',
      target_allocation: { equity: 50, cash: 10 },
    })

    renderPage()

    // Caught here rather than only by the server, which would reject the save.
    expect(await screen.findByText(/Total: 60%/)).toBeInTheDocument()
  })

  it('saves lists and allocations in the shape the API expects', async () => {
    vi.spyOn(api, 'getInvestorProfile').mockResolvedValue(EMPTY_PROFILE)
    const update = vi.spyOn(api, 'updateInvestorProfile').mockResolvedValue(EMPTY_PROFILE)

    renderPage()

    await userEvent.type(await screen.findByLabelText(/Investment horizon/i), '15')
    await userEvent.type(screen.getByLabelText(/Excluded symbols/i), 'tsla, nvda')
    await userEvent.type(screen.getByLabelText('Equity'), '100')
    await userEvent.click(screen.getByRole('button', { name: /Save profile/i }))

    await waitFor(() => expect(update).toHaveBeenCalled())
    const payload = update.mock.calls[0][0]
    expect(payload.horizon_years).toBe(15)
    expect(payload.excluded_symbols).toEqual(['tsla', 'nvda'])
    expect(payload.target_allocation).toEqual({ equity: 100 })
    // An empty field clears rather than sending a meaningless empty string.
    expect(payload.notes).toBeNull()
  })

  it('sends no allocation at all when none was entered', async () => {
    vi.spyOn(api, 'getInvestorProfile').mockResolvedValue(EMPTY_PROFILE)
    const update = vi.spyOn(api, 'updateInvestorProfile').mockResolvedValue(EMPTY_PROFILE)

    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /Save profile/i }))

    await waitFor(() => expect(update).toHaveBeenCalled())
    // {} would fail the server's "sums to 100" rule for no reason.
    expect(update.mock.calls[0][0].target_allocation).toBeNull()
  })

  it('shows agent-made changes in the history, with an undo', async () => {
    vi.spyOn(api, 'getInvestorProfile').mockResolvedValue({
      ...EMPTY_PROFILE,
      is_set: true,
      updated_at: '2026-08-01T10:00:00',
      updated_by: 'agent',
    })
    vi.spyOn(api, 'getInvestorProfileRevisions').mockResolvedValue([
      {
        id: 3,
        field: 'risk_tolerance',
        old_value: 'growth',
        new_value: 'balanced',
        source: 'agent',
        reason: 'User said big swings keep them up at night.',
        undone_at: null,
        created_at: '2026-08-01T10:00:00',
      },
    ])
    const undo = vi
      .spyOn(api, 'undoInvestorProfileRevision')
      .mockResolvedValue(EMPTY_PROFILE)

    renderPage()

    expect(await screen.findByText(/Change history/i)).toBeInTheDocument()
    expect(screen.getByText(/growth → balanced/)).toBeInTheDocument()
    expect(screen.getByText(/up at night/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /Undo/i }))
    await waitFor(() => expect(undo).toHaveBeenCalledWith(3))
  })
})
