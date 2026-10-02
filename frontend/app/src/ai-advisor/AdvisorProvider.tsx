import { useCallback, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { getChatStatus } from './aiChatApi'
import { AdvisorContext } from './advisorContext'
import { useAiChat } from './useAiChat'

/**
 * Owns the advisor for the whole app shell.
 *
 * The conversation lives here rather than in the popup, so closing the popup
 * hides the transcript without touching it — and any page can open the advisor
 * (with a question, if it has one) without knowing how the chat works.
 */
export function AdvisorProvider({ children }: { children: ReactNode }) {
  const chat = useAiChat()
  const [isOpen, setIsOpen] = useState(false)

  const { data: status, isLoading: statusLoading } = useQuery({
    queryKey: ['ai', 'status'],
    queryFn: getChatStatus,
  })
  const available = status?.configured !== false

  const { send } = chat
  const open = useCallback(
    (prompt?: string) => {
      setIsOpen(true)
      if (prompt && available) void send(prompt)
    },
    [available, send],
  )
  const close = useCallback(() => setIsOpen(false), [])

  return (
    <AdvisorContext.Provider
      value={{ chat, status, statusLoading, available, isOpen, open, close }}
    >
      {children}
    </AdvisorContext.Provider>
  )
}
