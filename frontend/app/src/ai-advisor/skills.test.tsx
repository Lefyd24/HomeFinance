import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import * as aiChatApi from './aiChatApi'
import type { ChatEvent, Skill } from './aiChatApi'
import { AdvisorChat } from './AdvisorChat'
import { AdvisorProvider } from './AdvisorProvider'
import { migrateTurn, parseSlashCommand, type Turn } from './useAiChat'

const SKILLS: Skill[] = [
  {
    name: 'equity-research',
    title: 'Equity research',
    description: 'Deep-dive a company.',
    command: 'research',
    suggested_model: 'anthropic/claude-sonnet-4.5',
  },
  {
    name: 'spending-review',
    title: 'Spending review',
    description: 'Find trends and anomalies.',
    command: 'spending',
    suggested_model: null,
  },
  {
    name: 'no-command',
    title: 'Hidden helper',
    description: 'Only loadable by the model.',
    command: null,
    suggested_model: null,
  },
]

const DEFAULT_MODEL = 'deepseek/deepseek-chat-v3.1'

function renderChat() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <MemoryRouter>
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
  return input as HTMLTextAreaElement
}

function mockStream(...turns: ChatEvent[][]) {
  const queue = [...turns]
  return vi.spyOn(aiChatApi, 'streamChat').mockImplementation(async (_m, onEvent) => {
    for (const event of queue.shift() ?? [{ type: 'done' }]) onEvent(event)
  })
}

describe('parseSlashCommand', () => {
  it('maps a leading /command, case-insensitively, to its skill', () => {
    expect(parseSlashCommand('/research ASML', SKILLS)?.name).toBe('equity-research')
    expect(parseSlashCommand('/RESEARCH', SKILLS)?.name).toBe('equity-research')
    expect(parseSlashCommand('  /spending last month', SKILLS)?.name).toBe('spending-review')
  })

  it('ignores unknown commands, mid-message slashes and partial words', () => {
    expect(parseSlashCommand('/nope hi', SKILLS)).toBeNull()
    expect(parseSlashCommand('what about /research', SKILLS)).toBeNull()
    expect(parseSlashCommand('/researchers', SKILLS)).toBeNull()
    expect(parseSlashCommand('hello', SKILLS)).toBeNull()
  })
})

describe('migrateTurn', () => {
  it('brings an old assistant turn without active_skills forward', () => {
    const old = {
      id: '1',
      role: 'assistant',
      content: 'Hi',
      segments: [{ kind: 'text', id: 's', content: 'Hi' }],
      streaming: true,
    } as Turn
    const migrated = migrateTurn(old)
    expect(migrated.activeSkills).toEqual([])
    expect(migrated.streaming).toBe(false)
  })

  it('keeps stored active skills and leaves user turns alone', () => {
    const turn = { id: '1', role: 'assistant', content: '', segments: [], activeSkills: ['a'] } as Turn
    expect(migrateTurn(turn).activeSkills).toEqual(['a'])
    const user = { id: '2', role: 'user', content: 'x', segments: [] } as Turn
    expect(migrateTurn(user).activeSkills).toBeUndefined()
  })
})

describe('advisor skills', () => {
  beforeEach(() => {
    window.sessionStorage.clear()
    window.localStorage.removeItem('ai-advisor:model')
    vi.spyOn(aiChatApi, 'getModels').mockResolvedValue({ models: [], fetched_at: null })
    vi.spyOn(aiChatApi, 'getSkills').mockResolvedValue({ skills: SKILLS })
    vi.spyOn(aiChatApi, 'getChatStatus').mockResolvedValue({
      configured: true,
      investment_tools_enabled: true,
      default_model: DEFAULT_MODEL,
    })
  })
  afterEach(() => vi.restoreAllMocks())

  it('adds the slash-command skill to the request and sends the text unchanged', async () => {
    const stream = mockStream([{ type: 'done', active_skills: ['equity-research'] }])
    renderChat()
    await waitFor(() => expect(aiChatApi.getSkills).toHaveBeenCalled())
    await screen.findByLabelText(/ask about your finances/i)
    // Let the skills query settle so the command can be resolved.
    await new Promise((resolve) => setTimeout(resolve, 0))

    await userEvent.type(await composer(), '/research ASML{Enter}')

    await waitFor(() => expect(stream).toHaveBeenCalled())
    expect(stream.mock.calls[0][0]).toEqual([{ role: 'user', content: '/research ASML' }])
    expect(stream.mock.calls[0][4]).toEqual(['equity-research'])
  })

  it('echoes the turn’s active skills on the next send, until a chip is dismissed', async () => {
    const stream = mockStream(
      [{ type: 'token', content: 'One.' }, { type: 'done', active_skills: ['equity-research'] }],
      [{ type: 'token', content: 'Two.' }, { type: 'done', active_skills: [] }],
      [{ type: 'done' }],
    )
    renderChat()
    const input = await composer()

    await userEvent.type(input, 'first{Enter}')
    await screen.findByText('One.')
    // The chip is labelled with the skill's title once the catalogue is known.
    const chip = await screen.findByText('Equity research')
    expect(chip).toBeInTheDocument()

    await userEvent.type(input, 'second{Enter}')
    await waitFor(() => expect(stream).toHaveBeenCalledTimes(2))
    expect(stream.mock.calls[1][4]).toEqual(['equity-research'])
  })

  it('drops a dismissed skill from the next request', async () => {
    const stream = mockStream(
      [{ type: 'done', active_skills: ['equity-research'] }],
      [{ type: 'done' }],
    )
    renderChat()
    const input = await composer()

    await userEvent.type(input, 'first{Enter}')
    await userEvent.click(await screen.findByRole('button', { name: /stop using equity research/i }))
    expect(screen.queryByText('Equity research')).not.toBeInTheDocument()

    await userEvent.type(input, 'second{Enter}')
    await waitFor(() => expect(stream).toHaveBeenCalledTimes(2))
    expect(stream.mock.calls[1][4]).toEqual([])
  })

  it('resets active skills when a new chat starts', async () => {
    const stream = mockStream(
      [{ type: 'done', active_skills: ['equity-research'] }],
      [{ type: 'done' }],
    )
    renderChat()
    const input = await composer()

    await userEvent.type(input, 'first{Enter}')
    await screen.findByText('Equity research')
    await userEvent.click(screen.getByRole('button', { name: /new chat/i }))
    expect(screen.queryByText('Equity research')).not.toBeInTheDocument()

    await userEvent.type(input, 'again{Enter}')
    await waitFor(() => expect(stream).toHaveBeenCalledTimes(2))
    expect(stream.mock.calls[1][4]).toEqual([])
  })

  it('shows a trail entry when a skill is loaded', async () => {
    mockStream([
      { type: 'tool_call_start', tool: 'load_skill_tool', args: { name: 'equity-research' } },
      { type: 'skill_loaded', name: 'equity-research', title: 'Equity research', suggested_model: null },
      { type: 'tool_call_result', tool: 'load_skill_tool' },
      { type: 'token', content: 'Done.' },
      { type: 'done', active_skills: ['equity-research'] },
    ])
    renderChat()
    await userEvent.type(await composer(), 'analyse ASML{Enter}')

    expect(await screen.findByText('Using skill: Equity research')).toBeInTheDocument()
    // The raw load_skill call is bookkeeping and does not linger in the trail.
    expect(screen.queryByText(/loading a skill/i)).not.toBeInTheDocument()
  })

  it('offers, but never applies, the skill’s suggested model', async () => {
    const stream = mockStream(
      [
        {
          type: 'skill_loaded',
          name: 'equity-research',
          title: 'Equity research',
          suggested_model: 'anthropic/claude-sonnet-4.5',
        },
        { type: 'done', active_skills: ['equity-research'] },
      ],
      [{ type: 'done' }],
    )
    renderChat()
    const input = await composer()
    await userEvent.type(input, 'analyse{Enter}')

    const button = await screen.findByRole('button', { name: /switch to claude-sonnet-4\.5/i })
    expect(stream.mock.calls[0][3]).toBe(DEFAULT_MODEL)

    await userEvent.click(button)
    expect(screen.queryByRole('button', { name: /switch to claude-sonnet-4\.5/i })).not.toBeInTheDocument()

    await userEvent.type(input, 'next{Enter}')
    await waitFor(() => expect(stream).toHaveBeenCalledTimes(2))
    expect(stream.mock.calls[1][3]).toBe('anthropic/claude-sonnet-4.5')
  })

  it('opens a skill menu on "/" that the keyboard can drive', async () => {
    renderChat()
    const input = await composer()
    await screen.findByLabelText(/ask about your finances/i)

    await userEvent.type(input, '/')
    const options = await screen.findAllByRole('option')
    // Skills without a command are not slash-addressable.
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveAttribute('aria-selected', 'true')

    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')

    await userEvent.keyboard('{Enter}')
    expect(input.value).toBe('/spending ')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('filters the menu as you type, picks with a click and closes on Escape', async () => {
    renderChat()
    const input = await composer()

    await userEvent.type(input, '/res')
    const options = await screen.findAllByRole('option')
    expect(options).toHaveLength(1)
    await userEvent.click(options[0])
    expect(input.value).toBe('/research ')

    await userEvent.clear(input)
    await userEvent.type(input, '/')
    expect(await screen.findByRole('listbox')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
