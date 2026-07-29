/**
 * Conversation state for the advisor.
 *
 * Holds the transcript, drives one streaming turn at a time, and keeps the
 * tool activity attached to the answer it belongs to. The transcript survives
 * navigating to another page and back — losing a long analysis because you
 * clicked through to Transactions to check something would be its own bug.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { AdvisorStreamError, streamChat, type ChatMessage, type ToolCall } from './aiChatApi'

const STORAGE_KEY = 'ai-advisor:transcript'

export interface Turn {
  id: string
  role: 'user' | 'assistant'
  content: string
  /** Tools the advisor used for this answer, in the order it reached for them. */
  tools: ToolCall[]
  /** Set when the turn failed; the partial answer above it is still shown. */
  error?: string
  streaming?: boolean
}

function newId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function formatAdvisorError(error: unknown, t: TFunction<'advisor'>): string {
  if (error instanceof AdvisorStreamError) {
    if (error.code === 'unreachable') {
      return t('aiAdvisor.chat.unreachableError', { status: error.status ?? '?' })
    }
    return t('aiAdvisor.chat.emptyResponseError')
  }
  if (error instanceof Error) return error.message
  return t('aiAdvisor.chat.streamError')
}

function loadTranscript(): Turn[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    // Anything still marked as streaming was interrupted by the reload.
    return (parsed as Turn[]).map((turn) => ({ ...turn, streaming: false }))
  } catch {
    return []
  }
}

export function useAiChat() {
  const { t } = useTranslation('advisor')
  const [turns, setTurns] = useState<Turn[]>(loadTranscript)
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  /**
   * The transcript as of right now. `send` builds the model's history from
   * this rather than from the `turns` it closed over, so retrying — which
   * trims the transcript and immediately re-sends — cannot replay the turns it
   * just dropped.
   */
  const turnsRef = useRef(turns)
  turnsRef.current = turns

  useEffect(() => {
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns))
    } catch {
      // A full or blocked session store should never break the conversation.
    }
  }, [turns])

  // Abandon an in-flight answer if the page goes away mid-stream.
  useEffect(() => () => abortRef.current?.abort(), [])

  const send = useCallback(
    async (text: string) => {
      const content = text.trim()
      if (!content || abortRef.current) return

      const userTurn: Turn = { id: newId(), role: 'user', content, tools: [] }
      const answerId = newId()

      // The model needs the history, but only the roles and text — tool
      // bookkeeping is ours, not part of the conversation it sees.
      const history: ChatMessage[] = [...turnsRef.current, userTurn].map((turn) => ({
        role: turn.role,
        content: turn.content,
      }))

      setTurns((current) => [
        ...current,
        userTurn,
        { id: answerId, role: 'assistant', content: '', tools: [], streaming: true },
      ])
      setIsStreaming(true)

      const controller = new AbortController()
      abortRef.current = controller

      const patchAnswer = (patch: (turn: Turn) => Turn) =>
        setTurns((current) => current.map((turn) => (turn.id === answerId ? patch(turn) : turn)))

      try {
        await streamChat(
          history,
          (event) => {
            switch (event.type) {
              case 'token':
                patchAnswer((turn) => ({ ...turn, content: turn.content + event.content }))
                break
              case 'tool_call_start':
                patchAnswer((turn) => ({
                  ...turn,
                  tools: [...turn.tools, { name: event.tool, state: 'running' }],
                }))
                break
              case 'tool_call_result':
                patchAnswer((turn) => ({
                  ...turn,
                  tools: turn.tools.map((tool) =>
                    tool.name === event.tool && tool.state === 'running'
                      ? { ...tool, state: 'done' }
                      : tool,
                  ),
                }))
                break
              case 'done':
                patchAnswer((turn) => ({
                  ...turn,
                  content: event.content || turn.content,
                  tools: turn.tools.map((tool) => ({ ...tool, state: 'done' })),
                  streaming: false,
                }))
                break
              case 'error':
                patchAnswer((turn) => ({
                  ...turn,
                  error: event.message || t('aiAdvisor.chat.genericError'),
                  streaming: false,
                }))
                break
            }
          },
          controller.signal,
        )
      } catch (error) {
        const stopped = controller.signal.aborted
        patchAnswer((turn) => ({
          ...turn,
          streaming: false,
          error: stopped
            ? undefined
            : formatAdvisorError(error, t),
        }))
      } finally {
        abortRef.current = null
        setIsStreaming(false)
        patchAnswer((turn) => ({
          ...turn,
          streaming: false,
          tools: turn.tools.map((tool) => ({ ...tool, state: 'done' })),
        }))
      }
    },
    [t],
  )

  const stop = useCallback(() => abortRef.current?.abort(), [])

  const clear = useCallback(() => {
    abortRef.current?.abort()
    setTurns([])
    try {
      window.sessionStorage.removeItem(STORAGE_KEY)
    } catch {
      // Nothing to do — the in-memory transcript is already empty.
    }
  }, [])

  /** Re-ask the last question, dropping the answer that came back. */
  const retry = useCallback(() => {
    const current = turnsRef.current
    const lastUser = [...current].reverse().find((turn) => turn.role === 'user')
    if (!lastUser || abortRef.current) return

    const trimmed = current.slice(0, current.findIndex((turn) => turn.id === lastUser.id))
    turnsRef.current = trimmed
    setTurns(trimmed)
    void send(lastUser.content)
  }, [send])

  return { turns, isStreaming, send, stop, clear, retry }
}
