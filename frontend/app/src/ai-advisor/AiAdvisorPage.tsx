import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { getChatStatus } from './aiChatApi'
import { ChatWidget } from './ChatWidget'
import { useAiChat } from './useAiChat'

export function AiAdvisorPage() {
  const { t } = useTranslation('advisor')
  const [searchParams, setSearchParams] = useSearchParams()
  const { turns, isStreaming, send, stop, clear, retry } = useAiChat()

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['ai', 'status'],
    queryFn: getChatStatus,
  })

  /**
   * Another page can hand over a question — Reports links here with the period
   * it was showing. Read it once and drop it from the URL, so a refresh does
   * not ask the same thing again.
   */
  const [initialPrompt] = useState(() => searchParams.get('q') ?? undefined)
  useEffect(() => {
    if (!searchParams.has('q')) return
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current)
        next.delete('q')
        return next
      },
      { replace: true },
    )
  }, [searchParams, setSearchParams])

  const unavailable = status?.configured === false

  return (
    // This page owns the full height main hands it (no header eating into
    // it) — the transcript scrolls inside; the composer never moves.
    <div className="flex h-full min-h-0 flex-col">
      <ChatWidget
        turns={turns}
        isStreaming={isStreaming}
        onSend={send}
        onStop={stop}
        onRetry={retry}
        onClear={turns.length > 0 ? clear : undefined}
        disabled={statusLoading || unavailable}
        disabledReason={t('aiAdvisor.unavailableReason')}
        initialPrompt={initialPrompt}
      />
    </div>
  )
}
