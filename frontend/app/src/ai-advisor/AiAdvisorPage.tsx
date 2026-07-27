import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { PenLine } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getChatStatus } from './aiChatApi'
import { ChatWidget } from './ChatWidget'
import { useAiChat } from './useAiChat'

export function AiAdvisorPage() {
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
    // The composer stays on screen while the transcript scrolls behind it, so
    // the page owns the viewport height rather than growing past it.
    <div className="flex h-[calc(100dvh-8rem)] flex-col lg:h-[calc(100dvh-3.5rem)]">
      <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 sm:px-6">
        <div className="min-w-0">
          <h1 className="font-heading text-lg font-bold tracking-tight text-foreground">
            AI Advisor
          </h1>
          <p className="truncate text-xs text-muted-foreground">
            {unavailable
              ? 'Unavailable until an API key is configured'
              : 'Answers built from your own transactions, live'}
          </p>
        </div>

        {turns.length > 0 && (
          <Button variant="ghost" size="sm" onClick={clear}>
            <PenLine data-icon="inline-start" />
            New chat
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1">
        <ChatWidget
          turns={turns}
          isStreaming={isStreaming}
          onSend={send}
          onStop={stop}
          onRetry={retry}
          disabled={statusLoading || unavailable}
          disabledReason="AI chat is not configured on this server. Set DEEPSEEK_API_KEY on the backend to turn it on."
          initialPrompt={initialPrompt}
        />
      </div>
    </div>
  )
}
