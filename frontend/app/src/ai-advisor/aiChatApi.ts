import { apiFetch, getApiBaseUrl } from '../lib/apiClient'

export interface ChatStatus {
  configured: boolean
  investment_tools_enabled: boolean
  /** Optional in the type so older status mocks still compile; the server always sends it. */
  default_model: string
}

/** One model in the OpenRouter catalogue. Prices are USD per 1M tokens. */
export interface ModelInfo {
  id: string
  name: string
  context_length: number
  prompt_per_m: number | null
  completion_per_m: number | null
  cache_read_per_m: number | null
  supports_tools: boolean
  known: boolean
  history_budget: number
}

export interface ModelCatalog {
  models: ModelInfo[]
  fetched_at: string | null
}

/** What one answer cost, as reported on the final `done` event. */
export interface TurnUsage {
  prompt_tokens: number
  completion_tokens: number
  cached_tokens: number
  cost_usd: number
  cost_estimated: boolean
  peak_context_tokens: number
  duration_ms: number
  steps: number
  tool_calls: number
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** A tool the advisor reached for while answering, and how far it got. */
export interface ToolCall {
  name: string
  state: 'running' | 'done'
  /**
   * The arguments it was called with. Kept so the trail can say what was looked
   * up — "Researching AAPL" rather than a bare tool name.
   */
  args?: Record<string, unknown>
}

/** One field the advisor changed on the investor profile, and why. */
export interface ProfileChange {
  field: string
  old_value: unknown
  new_value: unknown
}

export interface ProfileUpdate {
  changes: ProfileChange[]
  reason?: string
}

/**
 * What the backend can say mid-answer. It streams tool activity as well as
 * tokens, which is the difference between a spinner and watching the advisor
 * actually look things up.
 */
export type ChatEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_call_start'; tool: string; args?: Record<string, unknown> }
  | { type: 'tool_call_result'; tool: string }
  | {
      type: 'done'
      content?: string
      model?: string
      context_window?: number
      usage?: TurnUsage
    }
  // Streamed reasoning deltas from models that think out loud.
  | { type: 'reasoning'; text: string }
  | { type: 'error'; message?: string }
  // The advisor wrote something durable to the investor profile. Surfaced as a
  // card with an undo, never applied silently.
  | { type: 'profile_update'; changes: ProfileChange[]; reason?: string }
  // Server-generated, appended after the answer so it cannot be omitted.
  | { type: 'disclaimer'; text: string }

export class AdvisorStreamError extends Error {
  readonly code: 'unreachable' | 'empty_response'
  readonly status?: number
  /** The server's own words (FastAPI `detail`), when it sent any. */
  readonly detail?: string

  constructor(code: 'unreachable' | 'empty_response', status?: number, detail?: string) {
    super(code)
    this.name = 'AdvisorStreamError'
    this.code = code
    this.status = status
    this.detail = detail
  }
}

export function getChatStatus(): Promise<ChatStatus> {
  return apiFetch<ChatStatus>('/ai/status')
}

export function getModels(): Promise<ModelCatalog> {
  return apiFetch<ModelCatalog>('/ai/models')
}

/** Force the server to re-download the catalogue. */
export function refreshModels(): Promise<ModelCatalog> {
  return apiFetch<ModelCatalog>('/ai/models/refresh', { method: 'POST' })
}

async function readDetail(response: Response): Promise<string | undefined> {
  try {
    const body = (await response.json()) as { detail?: unknown }
    return typeof body?.detail === 'string' && body.detail.trim() ? body.detail : undefined
  } catch {
    return undefined
  }
}

/**
 * POST /ai/chat and hand back every server-sent event as it arrives.
 *
 * The caller decides what to do with tokens versus tool activity, so the
 * transport stays free of any opinion about how a conversation looks. Pass a
 * signal to let someone stop a long answer part-way.
 */
export async function streamChat(
  messages: ChatMessage[],
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
  /** OpenRouter model id; null/absent lets the server use its default. */
  model?: string | null,
): Promise<void> {
  const token = window.localStorage.getItem('token')
  const response = await fetch(`${getApiBaseUrl()}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages, model: model ?? null }),
    signal,
  })

  if (!response.ok) {
    // 422 (model rejected) and 429 (budget / rate limit) explain themselves.
    const detail =
      response.status === 422 || response.status === 429 ? await readDetail(response) : undefined
    throw new AdvisorStreamError('unreachable', response.status, detail)
  }
  if (!response.body) throw new AdvisorStreamError('empty_response')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split('\n\n')
      buffer = chunks.pop() ?? ''

      for (const chunk of chunks) {
        const line = chunk.split('\n').find((candidate) => candidate.startsWith('data: '))
        if (!line) continue
        try {
          onEvent(JSON.parse(line.slice(6)) as ChatEvent)
        } catch {
          // A partial or malformed frame is not worth ending the stream over.
        }
      }
    }
  } finally {
    reader.cancel().catch(() => undefined)
  }
}
