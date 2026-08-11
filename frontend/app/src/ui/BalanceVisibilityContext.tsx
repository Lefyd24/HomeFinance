import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

const STORAGE_KEY = 'balance-visibility-hidden'

function readStored(): boolean {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(STORAGE_KEY) === '1'
}

interface BalanceVisibilityValue {
  hidden: boolean
  toggle: () => void
}

const BalanceVisibilityContext = createContext<BalanceVisibilityValue | null>(null)

/**
 * Global, persisted "hide my balances" switch — the shoulder-surfing guard
 * every finance dashboard offers. Lives above the router so the navbar
 * toggle and any page reading it (currently the dashboard and investments
 * workspace) always agree, and survives a refresh via localStorage.
 */
export function BalanceVisibilityProvider({ children }: { children: ReactNode }) {
  const [hidden, setHidden] = useState(readStored)

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, hidden ? '1' : '0')
  }, [hidden])

  const value = useMemo(
    () => ({ hidden, toggle: () => setHidden((prev) => !prev) }),
    [hidden],
  )

  return (
    <BalanceVisibilityContext.Provider value={value}>
      {children}
    </BalanceVisibilityContext.Provider>
  )
}

export function useBalanceVisibility(): BalanceVisibilityValue {
  const ctx = useContext(BalanceVisibilityContext)
  if (!ctx) {
    throw new Error('useBalanceVisibility must be used within a BalanceVisibilityProvider')
  }
  return ctx
}
