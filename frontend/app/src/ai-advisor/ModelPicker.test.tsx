import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ModelInfo } from './aiChatApi'
import { ModelPicker, filterModels } from './ModelPicker'

const model = (id: string, name: string, prompt: number | null, context: number): ModelInfo => ({
  id,
  name,
  context_length: context,
  prompt_per_m: prompt,
  completion_per_m: prompt === null ? null : prompt * 4,
  cache_read_per_m: null,
  supports_tools: true,
  known: true,
  history_budget: context,
})

const MODELS = [
  model('google/gemini-2.5-flash', 'Gemini 2.5 Flash', 0.3, 1_000_000),
  model('anthropic/claude-haiku-4.5', 'Claude Haiku 4.5', 1, 200_000),
  model('meta/llama-free', 'Llama Free', 0, 128_000),
  model('x/mystery', 'Mystery', null, 32_000),
]

const mocks = vi.hoisted(() => ({ refresh: vi.fn() }))

vi.mock('./useAiModels', () => ({
  useAiModels: () => ({
    data: { models: MODELS, fetched_at: new Date(Date.now() - 3 * 3_600_000).toISOString() },
    isPending: false,
    isError: false,
  }),
  useRefreshAiModels: () => ({ mutate: mocks.refresh, isPending: false }),
}))

describe('filterModels', () => {
  it('matches id or name, case-insensitively', () => {
    expect(filterModels(MODELS, 'CLAUDE', 'name').map((m) => m.id)).toEqual([
      'anthropic/claude-haiku-4.5',
    ])
    expect(filterModels(MODELS, 'meta/', 'name').map((m) => m.id)).toEqual(['meta/llama-free'])
  })

  it('sorts by price with unknown prices last, and by context largest first', () => {
    expect(filterModels(MODELS, '', 'price').map((m) => m.name)).toEqual([
      'Llama Free',
      'Gemini 2.5 Flash',
      'Claude Haiku 4.5',
      'Mystery',
    ])
    expect(filterModels(MODELS, '', 'context')[0]?.name).toBe('Gemini 2.5 Flash')
  })
})

describe('ModelPicker', () => {
  it('searches the catalogue and selects a model', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ModelPicker model="google/gemini-2.5-flash" onChange={onChange} />)

    await user.click(screen.getByRole('button', { name: 'Model' }))
    await user.type(screen.getByPlaceholderText('Search models…'), 'haiku')
    expect(screen.queryByText('Llama Free')).not.toBeInTheDocument()
    await user.click(screen.getByText('Claude Haiku 4.5'))

    expect(onChange).toHaveBeenCalledWith('anthropic/claude-haiku-4.5')
  })

  it('shows a free model as free and can refresh the catalogue', async () => {
    const user = userEvent.setup()
    render(<ModelPicker model="google/gemini-2.5-flash" onChange={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: 'Model' }))
    expect(screen.getByText(/^free/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Refresh model list' }))
    expect(mocks.refresh).toHaveBeenCalled()
  })

  it('cannot be opened while disabled', () => {
    render(<ModelPicker model="google/gemini-2.5-flash" disabled onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Model' })).toBeDisabled()
  })
})
