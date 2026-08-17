import { apiFetch, getApiBaseUrl } from '../lib/apiClient'

export interface ChatStatus {
  configured: boolean
  investment_tools_enabled: boolean
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
  | { type: 'done'; content?: string }
  | { type: 'error'; message?: string }
  // The advisor wrote something durable to the investor profile. Surfaced as a
  // card with an undo, never applied silently.
  | { type: 'profile_update'; changes: ProfileChange[]; reason?: string }
  // Server-generated, appended after the answer so it cannot be omitted.
  | { type: 'disclaimer'; text: string }

export class AdvisorStreamError extends Error {
  readonly code: 'unreachable' | 'empty_response'
  readonly status?: number

  constructor(code: 'unreachable' | 'empty_response', status?: number) {
    super(code)
    this.name = 'AdvisorStreamError'
    this.code = code
    this.status = status
  }
}

export function getChatStatus(): Promise<ChatStatus> {
  return apiFetch<ChatStatus>('/ai/status')
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
): Promise<void> {
  const token = window.localStorage.getItem('token')
  const response = await fetch(`${getApiBaseUrl()}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages }),
    signal,
  })

  if (!response.ok) throw new AdvisorStreamError('unreachable', response.status)
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
