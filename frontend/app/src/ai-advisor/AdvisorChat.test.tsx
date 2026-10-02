import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import * as aiChatApi from './aiChatApi'
import type { ChatEvent } from './aiChatApi'
import { AdvisorChat } from './AdvisorChat'
import { useAdvisor } from './advisorContext'
import { AdvisorProvider } from './AdvisorProvider'

function renderPage(children: ReactNode = <AdvisorChat />) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
      <QueryClientProvider client={queryClient}>
        <AdvisorProvider>{children}</AdvisorProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  )
}

/** Stands in for any page that hands the advisor a question. */
function AskButton() {
  const { open } = useAdvisor()
  return <button onClick={() => open('Where did my money go?')}>ask</button>
}

/** The composer stays disabled until the status check comes back. */
async function composer() {
  const input = await screen.findByLabelText(/ask about your finances/i)
  await waitFor(() => expect(input).not.toBeDisabled())
  return input
}

/** Replays a fixed event sequence as if it had streamed off the wire. */
function mockStream(events: ChatEvent[]) {
  return vi
    .spyOn(aiChatApi, 'streamChat')
    .mockImplementation(async (_messages, onEvent) => {
      for (const event of events) onEvent(event)
    })
}

const DEFAULT_MODEL = 'deepseek/deepseek-chat-v3.1'

function mockModels() {
  return vi.spyOn(aiChatApi, 'getModels').mockResolvedValue({ models: [], fetched_at: null })
}

describe('AdvisorChat', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.localStorage.removeItem('ai-advisor:model')
    mockModels()
    vi.spyOn(aiChatApi, 'getSkills').mockResolvedValue({ skills: [] })
    vi.spyOn(aiChatApi, 'getChatStatus').mockResolvedValue({ configured: true, investment_tools_enabled: true, default_model: DEFAULT_MODEL })
  })
  afterEach(() => vi.restoreAllMocks())

  it('offers grouped openers before the first question', async () => {
    renderPage()

    expect(await screen.findByText('Ask your money anything.')).toBeInTheDocument()
    expect(screen.getByText('Find the leak')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Am I on track with my budgets?' }),
    ).toBeInTheDocument()
  })

  it('streams an answer and shows what the advisor looked up', async () => {
    mockStream([
      { type: 'tool_call_start', tool: 'get_budgets_status_tool' },
      { type: 'tool_call_result', tool: 'get_budgets_status_tool' },
      { type: 'token', content: 'You are **under** on all three.' },
      { type: 'done' },
    ])

    renderPage()

    const input = await composer()
    await userEvent.type(input, 'Am I on track?{Enter}')

    expect(await screen.findByText('Am I on track?')).toBeInTheDocument()
    expect(await screen.findByText('Reviewing your budgets')).toBeInTheDocument()
    // Markdown is rendered, not printed as asterisks.
    expect(await screen.findByText('under')).toBeInTheDocument()
  })

  it('surfaces a mid-stream failure without losing the question', async () => {
    mockStream([
      { type: 'token', content: 'Let me check' },
      { type: 'error', message: 'The advisor ran out of time.' },
    ])

    renderPage()

    const input = await composer()
    await userEvent.type(input, 'How much did I spend?{Enter}')

    expect(await screen.findByText('The advisor ran out of time.')).toBeInTheDocument()
    expect(screen.getByText('How much did I spend?')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /ask again/i })).toBeInTheDocument()
  })

  it('asks a question handed over by another page', async () => {
    const streamSpy = mockStream([{ type: 'token', content: 'Here is the breakdown.' }, { type: 'done' }])

    renderPage(<AskButton />)
    await userEvent.click(await screen.findByRole('button', { name: 'ask' }))

    await waitFor(() => expect(streamSpy).toHaveBeenCalled())
    expect(streamSpy.mock.calls[0][0]).toEqual([
      { role: 'user', content: 'Where did my money go?' },
    ])
    // The server's default model is sent until the user picks another.
    expect(streamSpy.mock.calls[0][3]).toBe(DEFAULT_MODEL)
  })

  it('explains itself when the feature is not configured', async () => {
    vi.spyOn(aiChatApi, 'getChatStatus').mockResolvedValue({ configured: false, investment_tools_enabled: true, default_model: DEFAULT_MODEL })

    renderPage()

    expect(await screen.findByText(/OPENROUTER_API_KEY/)).toBeInTheDocument()
    expect(screen.getByLabelText(/ask about your finances/i)).toBeDisabled()
  })

  it('keeps the transcript across a remount', async () => {
    mockStream([{ type: 'token', content: 'Two thousand euro.' }, { type: 'done' }])

    const { unmount } = renderPage()
    const input = await composer()
    await userEvent.type(input, 'What did I spend?{Enter}')
    await screen.findByText('Two thousand euro.')

    unmount()
    renderPage()

    expect(await screen.findByText('Two thousand euro.')).toBeInTheDocument()
  })

  it('sends the model picked in the picker and shows what the answer cost', async () => {
    vi.spyOn(aiChatApi, 'getModels').mockResolvedValue({
      fetched_at: null,
      models: [
        {
          id: 'google/gemini-2.5-flash',
          name: 'Gemini 2.5 Flash',
          context_length: 1_000_000,
          prompt_per_m: 0.3,
          completion_per_m: 2.5,
          cache_read_per_m: null,
          supports_tools: true,
          known: true,
          history_budget: 800_000,
        },
      ],
    })
    const streamSpy = mockStream([
      { type: 'token', content: 'Fine.' },
      {
        type: 'done',
        model: 'google/gemini-2.5-flash',
        context_window: 1_000_000,
        usage: {
          prompt_tokens: 1200,
          completion_tokens: 300,
          cached_tokens: 0,
          cost_usd: 0.0011,
          cost_estimated: true,
          peak_context_tokens: 1200,
          duration_ms: 2500,
          steps: 1,
          tool_calls: 0,
        },
      },
    ])

    renderPage()
    const input = await composer()
    await userEvent.click(screen.getByRole('button', { name: 'Model' }))
    await userEvent.click(await screen.findByText('Gemini 2.5 Flash'))
    await userEvent.type(input, 'hello{Enter}')

    await screen.findByText('Fine.')
    expect(streamSpy.mock.calls[0][3]).toBe('google/gemini-2.5-flash')
    expect(window.localStorage.getItem('ai-advisor:model')).toBe('google/gemini-2.5-flash')
    const footer = await screen.findByTestId('turn-footer')
    expect(footer).toHaveTextContent('gemini-2.5-flash')
    expect(footer).toHaveTextContent('≈ $0.0011')
  })

  it('shows the server explanation when a model is rejected', async () => {
    vi.spyOn(aiChatApi, 'streamChat').mockRejectedValue(
      new aiChatApi.AdvisorStreamError('unreachable', 422, 'Model not available.'),
    )

    renderPage()
    await userEvent.type(await composer(), 'hello{Enter}')

    expect(await screen.findByText('Model not available.')).toBeInTheDocument()
  })
})
