import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import * as aiChatApi from './aiChatApi'
import type { ChatMessage } from './aiChatApi'

export function ChatWidget() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSend() {
    const content = input.trim()
    if (!content || sending) return
    const nextMessages: ChatMessage[] = [...messages, { role: 'user', content }]
    setMessages(nextMessages)
    setInput('')
    setSending(true)
    setError(null)
    try {
      const reply = await aiChatApi.sendChatMessage(nextMessages)
      setMessages((prev) => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 overflow-y-auto flex flex-col gap-2 p-4">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground text-center mt-8">
            Ask about your spending, budgets, or savings.
          </p>
        )}
        {messages.map((message, i) => (
          <div
            key={`${message.role}-${i}`}
            className={cn(
              'max-w-[85%] p-3 rounded-xl text-sm whitespace-pre-wrap',
              message.role === 'user'
                ? 'self-end bg-primary text-primary-foreground'
                : 'self-start bg-muted text-foreground',
            )}
          >
            {message.content}
          </div>
        ))}
        {sending && (
          <div className="self-start text-xs text-muted-foreground px-1">Thinking…</div>
        )}
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>
      <div className="flex gap-2 p-4 border-t border-border bg-background">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') void handleSend()
          }}
          placeholder="Ask about your finances…"
          disabled={sending}
        />
        <Button
          size="icon"
          onClick={() => void handleSend()}
          disabled={sending || !input.trim()}
          aria-label="Send"
        >
          <Send size={18} />
        </Button>
      </div>
    </div>
  )
}
