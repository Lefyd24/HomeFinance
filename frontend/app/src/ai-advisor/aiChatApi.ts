import { apiFetch, getApiBaseUrl } from '../lib/apiClient'

export interface ChatStatus {
  configured: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/** A tool the advisor reached for while answering, and how far it got. */
export interface ToolCall {
  name: string
  state: 'running' | 'done'
}

/**
 * What the backend can say mid-answer. It streams tool activity as well as
 * tokens, which is the difference between a spinner and watching the advisor
 * actually look things up.
 */
export type ChatEvent =
  | { type: 'token'; content: string }
  | { type: 'tool_call_start'; tool: string }
  | { type: 'tool_call_result'; tool: string }
  | { type: 'done'; content?: string }
  | { type: 'error'; message?: string }

/** Plain-language name for each backend tool, shown while it runs. */
export const TOOL_LABELS: Record<string, string> = {
  get_transactions_tool: 'Reading your transactions',
  get_totals_tool: 'Adding up totals',
  get_account_balances_tool: 'Checking account balances',
  get_budgets_status_tool: 'Reviewing your budgets',
  get_recurring_expenses_tool: 'Checking recurring expenses',
  get_debts_tool: 'Reviewing your debts',
  send_analysis_email_tool: 'Sending the email',
}

export function toolLabel(name: string): string {
  return TOOL_LABELS[name] ?? `Using ${name.replace(/_tool$/, '').replace(/_/g, ' ')}`
}

/** Opening prompts, grouped so the empty state suggests a direction, not a list. */
export const SUGGESTION_GROUPS = [
  {
    title: 'Find the leak',
    prompts: [
      'What are my top 3 expense categories this month?',
      'Which subscriptions am I paying for that I barely use?',
    ],
  },
  {
    title: 'Check the plan',
    prompts: [
      'Am I on track with my budgets?',
      'Which recurring expenses hit in the next 7 days?',
    ],
  },
  {
    title: 'Get out of debt',
    prompts: [
      'How much total debt do I have, and what should I pay off first?',
      'If I put an extra 200 a month at my debts, when am I clear?',
    ],
  },
] as const

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

  if (!response.ok) throw new Error(`The advisor could not be reached (${response.status}).`)
  if (!response.body) throw new Error('The advisor returned an empty response.')

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
