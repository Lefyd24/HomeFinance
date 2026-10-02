import { createContext, useContext } from 'react'
import type { ChatStatus } from './aiChatApi'
import type { useAiChat } from './useAiChat'

export interface AdvisorContextValue {
  chat: ReturnType<typeof useAiChat>
  /** Undefined until the server has said whether the advisor is switched on. */
  status: ChatStatus | undefined
  statusLoading: boolean
  /** False only when the server has explicitly turned the advisor off. */
  available: boolean
  isOpen: boolean
  /** Open the popup, optionally asking a question as it opens. */
  open: (prompt?: string) => void
  close: () => void
}

export const AdvisorContext = createContext<AdvisorContextValue | null>(null)

export function useAdvisor(): AdvisorContextValue {
  const value = useContext(AdvisorContext)
  if (!value) throw new Error('useAdvisor must be used inside <AdvisorProvider>')
  return value
}
