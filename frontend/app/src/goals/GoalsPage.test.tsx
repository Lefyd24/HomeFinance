import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { formatCurrency } from '../lib/format'
import * as goalsApi from './goalsApi'
import { GoalsPage } from './GoalsPage'
import type { Goal } from './goalsApi'

const emergencyFund: Goal = {
  id: 1,
  user_id: 1,
  name: 'Emergency fund',
  description: 'Three months of expenses',
  target_amount: 5000,
  current_amount: 2000,
  currency: 'EUR',
  category: 'emergency_fund',
  icon: '💰',
  color: '#3B82F6',
  target_date: '2026-12-31',
  status: 'active',
  is_primary: true,
  linked_budget_id: null,
  linked_account_id: null,
  progress_percentage: 40,
  remaining_amount: 3000,
  monthly_contribution_needed: 500,
  created_at: '2026-01-01T00:00:00Z',
}

const vacation: Goal = {
  id: 2,
  user_id: 1,
  name: 'Summer vacation',
  description: null,
  target_amount: 1500,
  current_amount: 300,
  currency: 'EUR',
  category: 'vacation',
  icon: '✈️',
  color: '#10B981',
  target_date: null,
  status: 'active',
  is_primary: false,
  linked_budget_id: null,
  linked_account_id: null,
  progress_percentage: 20,
  remaining_amount: 1200,
  created_at: '2026-02-01T00:00:00Z',
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <GoalsPage />
    </QueryClientProvider>,
  )
}

describe('GoalsPage', () => {
  afterEach(() => vi.restoreAllMocks())

  it('lists goals with progress and action controls', async () => {
    vi.spyOn(goalsApi, 'listGoals').mockResolvedValue([emergencyFund, vacation])

    renderPage()

    expect(await screen.findAllByText('Emergency fund')).not.toHaveLength(0)
    expect(screen.getByText('Summer vacation')).toBeInTheDocument()
    expect(screen.getByText(/savings journey/i)).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /contribute/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /details/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: /actions/i }).length).toBeGreaterThan(0)
  })

  it('opens create dialog with full goal fields', async () => {
    vi.spyOn(goalsApi, 'listGoals').mockResolvedValue([])

    renderPage()

    await userEvent.click(await screen.findByRole('button', { name: /create first goal/i }))
    expect(screen.getByRole('heading', { name: /create goal/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/goal name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/target amount/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/target date/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument()
    expect(screen.getByText(/set as primary goal/i)).toBeInTheDocument()
  })

  it('creates a goal with category and currency', async () => {
    vi.spyOn(goalsApi, 'listGoals').mockResolvedValue([])
    const createSpy = vi.spyOn(goalsApi, 'createGoal').mockResolvedValue(emergencyFund)

    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /create first goal/i }))
    await userEvent.type(screen.getByLabelText(/goal name/i), 'Emergency fund')
    const amount = screen.getByLabelText(/target amount/i)
    await userEvent.clear(amount)
    await userEvent.type(amount, '5000')
    await userEvent.click(screen.getByRole('button', { name: /save goal/i }))

    await waitFor(() =>
      expect(createSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Emergency fund',
          target_amount: 5000,
          currency: 'EUR',
        }),
      ),
    )
  })

  it('opens contribute sheet from primary goal', async () => {
    vi.spyOn(goalsApi, 'listGoals').mockResolvedValue([emergencyFund])
    vi.spyOn(goalsApi, 'addGoalTransaction').mockResolvedValue({
      id: 10,
      goal_id: 1,
      user_id: 1,
      amount: 100,
      type: 'contribution',
      description: 'Bonus',
      date: '2026-07-27',
      created_at: '',
    })

    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /^contribute$/i }))

    expect(await screen.findByRole('heading', { name: /add contribution/i })).toBeInTheDocument()
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText(/amount/i))
    await userEvent.type(screen.getByLabelText(/amount/i), '100')
    await userEvent.type(screen.getByLabelText(/description/i), 'Bonus')
    await userEvent.click(screen.getByRole('button', { name: /add contribution/i }))

    await waitFor(() =>
      expect(goalsApi.addGoalTransaction).toHaveBeenCalledWith(
        1,
        expect.objectContaining({
          amount: 100,
          type: 'contribution',
          description: 'Bonus',
        }),
      ),
    )
  })

  it('opens edit dialog from actions menu', async () => {
    vi.spyOn(goalsApi, 'listGoals').mockResolvedValue([emergencyFund])
    const updateSpy = vi.spyOn(goalsApi, 'updateGoal').mockResolvedValue({
      ...emergencyFund,
      name: 'Rainy day fund',
    })

    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /emergency fund actions/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /^edit$/i }))

    expect(await screen.findByRole('heading', { name: /edit goal/i })).toBeInTheDocument()
    const nameInput = screen.getByLabelText(/goal name/i)
    expect(nameInput).toHaveValue('Emergency fund')

    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Rainy day fund')
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ name: 'Rainy day fund' }),
      ),
    )
  })

  it('opens details sheet with transactions', async () => {
    vi.spyOn(goalsApi, 'listGoals').mockResolvedValue([emergencyFund])
    vi.spyOn(goalsApi, 'listGoalTransactions').mockResolvedValue([
      {
        id: 1,
        goal_id: 1,
        user_id: 1,
        amount: 200,
        type: 'contribution',
        description: 'Payday',
        date: '2026-07-01',
        created_at: '',
      },
    ])
    vi.spyOn(goalsApi, 'getGoalProgress').mockResolvedValue({
      goal_id: 1,
      goal_name: 'Emergency fund',
      current_amount: 2000,
      target_amount: 5000,
      progress_percentage: 40,
      remaining_amount: 3000,
      days_remaining: 150,
      monthly_contribution_needed: 500,
      estimated_completion_date: null,
      on_track: true,
      average_monthly_contribution: 400,
    })

    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /^details$/i }))

    const sheet = await screen.findByRole('dialog')
    expect(within(sheet).getByText('Emergency fund')).toBeInTheDocument()
    expect(await within(sheet).findByText('Payday')).toBeInTheDocument()
    expect(within(sheet).getByText(/contribution/i)).toBeInTheDocument()
    expect(
      within(sheet).getByText(formatCurrency(2000, 'EUR'), { exact: false }),
    ).toBeTruthy()
  })

  it('deletes a goal from the actions menu', async () => {
    vi.spyOn(goalsApi, 'listGoals').mockResolvedValue([emergencyFund])
    const deleteSpy = vi.spyOn(goalsApi, 'deleteGoal').mockResolvedValue({
      message: 'Goal deleted successfully',
    })
    vi.spyOn(window, 'confirm').mockReturnValue(true)

    renderPage()
    await userEvent.click(await screen.findByRole('button', { name: /emergency fund actions/i }))
    await userEvent.click(screen.getByRole('menuitem', { name: /^delete$/i }))

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledWith(1))
  })
})
