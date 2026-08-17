import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import * as aiChatApi from './aiChatApi'
import type { ChatEvent } from './aiChatApi'
import { AiAdvisorPage } from './AiAdvisorPage'

function renderPage(initialEntry = '/ai-advisor') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueryClientProvider client={queryClient}>
        <AiAdvisorPage />
      </QueryClientProvider>
    </MemoryRouter>,
  )
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

describe('AiAdvisorPage', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.spyOn(aiChatApi, 'getChatStatus').mockResolvedValue({ configured: true, investment_tools_enabled: true })
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

  it('asks a question handed over in the URL', async () => {
    const streamSpy = mockStream([{ type: 'token', content: 'Here is the breakdown.' }, { type: 'done' }])

    renderPage('/ai-advisor?q=Where%20did%20my%20money%20go%3F')

    await waitFor(() => expect(streamSpy).toHaveBeenCalled())
    expect(streamSpy.mock.calls[0][0]).toEqual([
      { role: 'user', content: 'Where did my money go?' },
    ])
  })

  it('explains itself when the feature is not configured', async () => {
    vi.spyOn(aiChatApi, 'getChatStatus').mockResolvedValue({ configured: false, investment_tools_enabled: true })

    renderPage()

    expect(await screen.findByText(/DEEPSEEK_API_KEY/)).toBeInTheDocument()
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
})
