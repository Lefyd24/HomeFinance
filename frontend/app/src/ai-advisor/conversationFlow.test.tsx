import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

import * as aiChatApi from './aiChatApi'
import type { ChatEvent } from './aiChatApi'
import { AdvisorChat } from './AdvisorChat'
import { AdvisorProvider } from './AdvisorProvider'
import { conversationFilename, conversationToMarkdown } from './exportConversation'
import type { Turn } from './useAiChat'

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

/** Where each snippet appears in the rendered text, for order assertions. */
function positionsOf(container: HTMLElement, snippets: string[]): number[] {
  const text = container.textContent ?? ''
  return snippets.map((snippet) => text.indexOf(snippet))
}

describe('answers render in the order they happened', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.spyOn(aiChatApi, 'getChatStatus').mockResolvedValue({
      configured: true,
      investment_tools_enabled: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('places a lookup between the paragraphs it sits between', async () => {
    mockStream([
      { type: 'token', content: 'Let me check your holdings. ' },
      { type: 'tool_call_start', tool: 'get_portfolio_allocation_tool' },
      { type: 'tool_call_result', tool: 'get_portfolio_allocation_tool' },
      { type: 'token', content: 'You are heavily concentrated. ' },
      { type: 'tool_call_start', tool: 'get_company_research_tool', args: { symbol: 'AAPL' } },
      { type: 'tool_call_result', tool: 'get_company_research_tool' },
      { type: 'token', content: 'Apple would not help that.' },
      { type: 'done' },
    ])

    const { container } = renderPage()
    await userEvent.type(await composer(), 'should I buy apple?{enter}')

    await screen.findByText(/Apple would not help that/)

    const [first, allocation, second, research, third] = positionsOf(container, [
      'Let me check your holdings',
      'how your portfolio is spread',
      'You are heavily concentrated',
      'Researching',
      'Apple would not help that',
    ])

    expect(first).toBeGreaterThanOrEqual(0)
    expect(allocation).toBeGreaterThan(first)
    expect(second).toBeGreaterThan(allocation)
    expect(research).toBeGreaterThan(second)
    expect(third).toBeGreaterThan(research)
  })

  it('groups lookups the model batched together', async () => {
    mockStream([
      { type: 'token', content: 'Checking. ' },
      { type: 'tool_call_start', tool: 'get_portfolio_overview_tool' },
      { type: 'tool_call_start', tool: 'get_positions_tool' },
      { type: 'tool_call_result', tool: 'get_portfolio_overview_tool' },
      { type: 'tool_call_result', tool: 'get_positions_tool' },
      { type: 'token', content: 'Here it is.' },
      { type: 'done' },
    ])

    const { container } = renderPage()
    await userEvent.type(await composer(), 'my portfolio?{enter}')
    await screen.findByText(/Here it is/)

    // Both sit between the two paragraphs, not hoisted above them.
    const [before, overview, positions, after] = positionsOf(container, [
      'Checking.',
      'Reading your portfolio',
      'Listing your holdings',
      'Here it is.',
    ])
    expect(overview).toBeGreaterThan(before)
    expect(positions).toBeGreaterThan(overview)
    expect(after).toBeGreaterThan(positions)
  })

  it('settles the later of two calls to the same tool', async () => {
    mockStream([
      { type: 'tool_call_start', tool: 'get_company_research_tool', args: { symbol: 'AAPL' } },
      { type: 'tool_call_result', tool: 'get_company_research_tool' },
      { type: 'tool_call_start', tool: 'get_company_research_tool', args: { symbol: 'MSFT' } },
      { type: 'tool_call_result', tool: 'get_company_research_tool' },
      { type: 'token', content: 'Both look similar.' },
      { type: 'done' },
    ])

    const { container } = renderPage()
    await userEvent.type(await composer(), 'compare them{enter}')
    await screen.findByText(/Both look similar/)

    // Two distinct rows, each with its own subject — not one row settled twice.
    expect(container.textContent).toContain('AAPL')
    expect(container.textContent).toContain('MSFT')
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(0)
  })

  it('keeps prose written before a tool call when the turn ends', async () => {
    // `done` carries only the final round's text; earlier prose must survive it.
    mockStream([
      { type: 'token', content: 'First I looked. ' },
      { type: 'tool_call_start', tool: 'get_debts_tool' },
      { type: 'tool_call_result', tool: 'get_debts_tool' },
      { type: 'done', content: 'Then I concluded.' },
    ])

    const { container } = renderPage()
    await userEvent.type(await composer(), 'my debts?{enter}')
    await screen.findByText(/First I looked/)

    expect(container.textContent).toContain('First I looked')
  })
})

describe('the composer', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.spyOn(aiChatApi, 'getChatStatus').mockResolvedValue({
      configured: true,
      investment_tools_enabled: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('starts one line tall and returns there after sending', async () => {
    mockStream([{ type: 'done', content: 'Sure.' }])
    renderPage()

    const input = (await composer()) as HTMLTextAreaElement
    const startingHeight = input.style.height
    expect(startingHeight).toBe('36px')

    await userEvent.type(input, 'a question that could wrap onto another line{enter}')

    // Cleared, and measured again from empty rather than left expanded over
    // an empty box.
    await waitFor(() => expect(input.value).toBe(''))
    expect(input.style.height).toBe(startingHeight)
  })

  it('does not send an empty or whitespace-only message', async () => {
    const stream = mockStream([{ type: 'done', content: 'Sure.' }])
    renderPage()

    await userEvent.type(await composer(), '   {enter}')
    expect(stream).not.toHaveBeenCalled()
  })
})

describe('exporting from the page', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    vi.spyOn(aiChatApi, 'getChatStatus').mockResolvedValue({
      configured: true,
      investment_tools_enabled: true,
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('offers no export until there is something to export', async () => {
    renderPage()
    await composer()
    expect(screen.queryByRole('button', { name: /export/i })).not.toBeInTheDocument()
  })

  it('downloads the conversation as a markdown file', async () => {
    mockStream([
      { type: 'tool_call_start', tool: 'get_debts_tool' },
      { type: 'tool_call_result', tool: 'get_debts_tool' },
      { type: 'done', content: 'You owe rather a lot.' },
    ])

    // jsdom implements neither of these.
    const createObjectURL = vi.fn((_blob: Blob) => 'blob:fake')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL })
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined)

    renderPage()
    await userEvent.type(await composer(), 'how much do I owe?{enter}')
    await screen.findByText(/You owe rather a lot/)

    await userEvent.click(screen.getByRole('button', { name: /export/i }))

    expect(click).toHaveBeenCalled()
    const blob = createObjectURL.mock.calls[0][0]
    expect(blob.type).toContain('text/markdown')
    await expect(blob.text()).resolves.toContain('You owe rather a lot.')

    vi.unstubAllGlobals()
  })
})

describe('conversationToMarkdown', () => {
  const t = ((key: string, options?: Record<string, unknown>) => {
    const table: Record<string, string> = {
      'aiAdvisor.export.title': 'AI Advisor conversation',
      'aiAdvisor.export.you': 'You',
      'aiAdvisor.export.advisor': 'Advisor',
      'aiAdvisor.profileUpdate.title': 'The advisor updated your profile',
      'aiAdvisor.toolTrail.labels.getPortfolioAllocation': 'Checking how your portfolio is spread',
      'aiAdvisor.profileUpdate.fields.horizon_years': 'Horizon (years)',
    }
    if (key === 'aiAdvisor.export.exportedAt') return `Exported ${String(options?.when)}`
    return table[key] ?? key
    // The real TFunction has a much larger surface than the export uses.
  }) as unknown as Parameters<typeof conversationToMarkdown>[1]

  const turns: Turn[] = [
    { id: '1', role: 'user', content: 'Am I too concentrated?', segments: [] },
    {
      id: '2',
      role: 'assistant',
      content: 'Let me look. Yes, badly.',
      segments: [
        { kind: 'text', id: 'a', content: 'Let me look.' },
        {
          kind: 'tool',
          id: 'b',
          name: 'get_portfolio_allocation_tool',
          state: 'done',
          args: { top_n: 5 },
        },
        { kind: 'text', id: 'c', content: 'Yes, badly.' },
        {
          kind: 'profile',
          id: 'd',
          update: {
            changes: [{ field: 'horizon_years', old_value: 10, new_value: 3 }],
            reason: 'You said three years.',
          },
        },
      ],
      disclaimer: 'Not regulated financial advice.',
    },
  ]

  it('keeps the lookups in place rather than flattening to prose', () => {
    const markdown = conversationToMarkdown(turns, t, new Date('2026-08-17T14:32:00'))

    const look = markdown.indexOf('Let me look.')
    const tool = markdown.indexOf('Checking how your portfolio is spread')
    const verdict = markdown.indexOf('Yes, badly.')

    expect(look).toBeGreaterThanOrEqual(0)
    expect(tool).toBeGreaterThan(look)
    expect(verdict).toBeGreaterThan(tool)
  })

  it('records the question, the answer and the disclaimer', () => {
    const markdown = conversationToMarkdown(turns, t, new Date('2026-08-17T14:32:00'))

    expect(markdown).toContain('# AI Advisor conversation')
    expect(markdown).toContain('## You')
    expect(markdown).toContain('Am I too concentrated?')
    expect(markdown).toContain('## Advisor')
    expect(markdown).toContain('_Not regulated financial advice._')
  })

  it('records a profile change with its reasoning', () => {
    const markdown = conversationToMarkdown(turns, t, new Date())
    expect(markdown).toContain('Horizon (years): 10 → 3')
    expect(markdown).toContain('You said three years.')
  })

  it('never leaves a run of blank lines', () => {
    const markdown = conversationToMarkdown(turns, t, new Date())
    expect(markdown).not.toMatch(/\n{3,}/)
    expect(markdown.endsWith('\n')).toBe(true)
  })
})

describe('conversationFilename', () => {
  it('sorts chronologically in a file listing', () => {
    expect(conversationFilename(new Date('2026-08-17T14:32:00'))).toBe(
      'ai-advisor-2026-08-17-1432.md',
    )
  })

  it('pads single-digit parts', () => {
    expect(conversationFilename(new Date('2026-01-05T09:07:00'))).toBe(
      'ai-advisor-2026-01-05-0907.md',
    )
  })
})
