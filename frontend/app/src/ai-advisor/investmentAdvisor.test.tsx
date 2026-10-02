import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import * as investorProfileApi from '../account-settings/investorProfileApi'
import * as aiChatApi from './aiChatApi'
import type { ChatEvent } from './aiChatApi'
import { AdvisorChat } from './AdvisorChat'
import { AdvisorProvider } from './AdvisorProvider'
import { toolSubject } from './aiAdvisorLabels'

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={['/ai-advisor']}>
      <QueryClientProvider client={queryClient}>
        <AdvisorProvider>
          <AdvisorChat />
        </AdvisorProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

async function composer() {
  const input = await screen.findByLabelText(/ask about your finances/i)
  await waitFor(() => expect(input).not.toBeDisabled())
  return input
}

function mockStream(events: ChatEvent[]) {
  return vi.spyOn(aiChatApi, 'streamChat').mockImplementation(async (_messages, onEvent) => {
    for (const event of events) onEvent(event)
  })
}

const DEFAULT_MODEL = 'deepseek/deepseek-chat-v3.1'

function mockModels() {
  return vi.spyOn(aiChatApi, 'getModels').mockResolvedValue({ models: [], fetched_at: null })
}

describe('the advisor with investment tools', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.localStorage.removeItem('ai-advisor:model')
    mockModels()
    vi.spyOn(aiChatApi, 'getSkills').mockResolvedValue({ skills: [] })
    vi.spyOn(aiChatApi, 'getChatStatus').mockResolvedValue({
      configured: true,
      investment_tools_enabled: true,
      default_model: DEFAULT_MODEL,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('offers portfolio openers when the investment tools are on', async () => {
    renderPage()
    expect(await screen.findByText('Check the portfolio')).toBeInTheDocument()
    expect(screen.getByText(/too concentrated/i)).toBeInTheDocument()
  })

  it('hides portfolio openers when the tools are off', async () => {
    vi.spyOn(aiChatApi, 'getChatStatus').mockResolvedValue({
      configured: true,
      investment_tools_enabled: false,
      default_model: DEFAULT_MODEL,
    })
    renderPage()

    expect(await screen.findByText('Find the leak')).toBeInTheDocument()
    expect(screen.queryByText('Check the portfolio')).not.toBeInTheDocument()
  })

  it('names the subject of a lookup in the tool trail', async () => {
    mockStream([
      { type: 'tool_call_start', tool: 'get_company_research_tool', args: { symbol: 'AAPL' } },
      { type: 'tool_call_result', tool: 'get_company_research_tool' },
      { type: 'done', content: 'Apple is a large-cap technology company.' },
    ])

    renderPage()
    await userEvent.type(await composer(), 'tell me about apple{enter}')

    // "Researching · AAPL" beats "Using get_company_research_tool".
    expect(await screen.findByText(/Researching/)).toBeInTheDocument()
    expect(screen.getByText(/AAPL/)).toBeInTheDocument()
  })

  it('labels every investment tool rather than falling back', async () => {
    mockStream([
      { type: 'tool_call_start', tool: 'get_portfolio_allocation_tool' },
      { type: 'tool_call_result', tool: 'get_portfolio_allocation_tool' },
      { type: 'tool_call_start', tool: 'get_investable_surplus_tool' },
      { type: 'tool_call_result', tool: 'get_investable_surplus_tool' },
      { type: 'done', content: 'Here is the picture.' },
    ])

    renderPage()
    await userEvent.type(await composer(), 'how am I doing?{enter}')

    expect(await screen.findByText(/how your portfolio is spread/i)).toBeInTheDocument()
    expect(screen.getByText(/what you can invest/i)).toBeInTheDocument()
    expect(screen.queryByText(/^Using /)).not.toBeInTheDocument()
  })

  it('shows the disclaimer under an answer', async () => {
    mockStream([
      { type: 'done', content: 'Add to the index fund.' },
      { type: 'disclaimer', text: 'This is automated guidance, not regulated financial advice.' },
    ])

    renderPage()
    await userEvent.type(await composer(), 'what should I buy?{enter}')

    expect(await screen.findByText(/not regulated financial advice/i)).toBeInTheDocument()
  })

  it('surfaces a profile change with its reason and an undo', async () => {
    vi.spyOn(investorProfileApi, 'getInvestorProfileRevisions').mockResolvedValue([
      {
        id: 7,
        field: 'horizon_years',
        old_value: 10,
        new_value: 3,
        source: 'agent',
        reason: 'User said they need the money for a house in three years.',
        undone_at: null,
        created_at: '2026-08-17T10:00:00',
      },
    ])
    const undoSpy = vi
      .spyOn(investorProfileApi, 'undoInvestorProfileRevision')
      .mockResolvedValue({} as investorProfileApi.InvestorProfile)

    mockStream([
      {
        type: 'profile_update',
        changes: [{ field: 'horizon_years', old_value: 10, new_value: 3 }],
        reason: 'User said they need the money for a house in three years.',
      },
      { type: 'done', content: 'Noted — that shortens your horizon considerably.' },
    ])

    renderPage()
    await userEvent.type(await composer(), 'I need this in 3 years{enter}')

    expect(await screen.findByText(/updated your profile/i)).toBeInTheDocument()
    expect(screen.getByText(/Horizon \(years\)/)).toBeInTheDocument()
    expect(screen.getByText(/house in three years/)).toBeInTheDocument()

    const undoButton = await screen.findByRole('button', { name: /undo/i })
    await userEvent.click(undoButton)
    await waitFor(() => expect(undoSpy).toHaveBeenCalledWith(7))
  })
})

describe('toolSubject', () => {
  it('picks a symbol', () => {
    expect(toolSubject({ symbol: 'AAPL' })).toBe('AAPL')
  })

  it('joins a symbol list', () => {
    expect(toolSubject({ symbols: ['AAPL', 'MSFT'] })).toBe('AAPL, MSFT')
  })

  it('falls back to a search query', () => {
    expect(toolSubject({ query: 'apple' })).toBe('apple')
  })

  it('ignores arguments nobody wants to read', () => {
    expect(toolSubject({ limit: 50, start_date: '2026-01-01' })).toBeNull()
    expect(toolSubject(undefined)).toBeNull()
    expect(toolSubject({ symbol: '  ' })).toBeNull()
  })
})
