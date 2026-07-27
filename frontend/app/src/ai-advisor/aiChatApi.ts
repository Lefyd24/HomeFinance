import { apiFetch, getApiBaseUrl } from '../lib/apiClient'

export interface ChatStatus {
  configured: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export function getChatStatus(): Promise<ChatStatus> {
  return apiFetch<ChatStatus>('/ai/status')
}

/** Streams SSE from POST /ai/chat and returns the assembled assistant reply. */
export async function sendChatMessage(messages: ChatMessage[]): Promise<string> {
  const token = window.localStorage.getItem('token')
  const response = await fetch(`${getApiBaseUrl()}/ai/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ messages }),
  })
  if (!response.ok) throw new Error(`Chat failed: ${response.status}`)
  if (!response.body) throw new Error('Chat response had no body')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let assistant = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''
    for (const chunk of chunks) {
      const line = chunk.split('\n').find((l) => l.startsWith('data: '))
      if (!line) continue
      let event: { type?: string; content?: string; message?: string }
      try {
        event = JSON.parse(line.slice(6)) as typeof event
      } catch {
        continue
      }
      if (event.type === 'token' && typeof event.content === 'string') {
        assistant += event.content
      } else if (event.type === 'done' && typeof event.content === 'string' && !assistant) {
        assistant = event.content
      } else if (event.type === 'error') {
        throw new Error(event.message || 'AI chat error')
      }
    }
  }

  return assistant.trim() || 'No response received.'
}
