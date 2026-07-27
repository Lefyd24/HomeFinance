import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import * as authApi from './authApi'
import type { User } from './authApi'

interface AuthContextValue {
  user: User | null
  isAuthenticated: boolean
  login: (email: string, password: string) => Promise<void>
  register: (input: authApi.RegisterInput) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

function decodeTokenExpiry(token: string): number | null {
  try {
    const payload = token.split('.')[1]
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')))
    return typeof decoded.exp === 'number' ? decoded.exp : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const stored = window.localStorage.getItem('user')
    return stored ? (JSON.parse(stored) as User) : null
  })
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const scheduleRefreshRef = useRef<() => void>(() => {})

  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimer.current)
    const token = window.localStorage.getItem('token')
    if (!token) return
    const exp = decodeTokenExpiry(token)
    if (!exp) return
    const secondsRemaining = Math.max(0, exp - Math.floor(Date.now() / 1000))
    const refreshInMs = Math.max(0, secondsRemaining - 5 * 60) * 1000
    refreshTimer.current = setTimeout(() => {
      void (async () => {
        const refreshToken = window.localStorage.getItem('refresh_token')
        if (!refreshToken) return
        try {
          const tokenResponse = await authApi.refresh(refreshToken)
          window.localStorage.setItem('token', tokenResponse.access_token)
          window.localStorage.setItem('refresh_token', tokenResponse.refresh_token)
          scheduleRefreshRef.current()
        } catch {
          // Next API call surfaces the 401 if the refresh token is also dead.
        }
      })()
    }, refreshInMs)
  }, [])

  useEffect(() => {
    scheduleRefreshRef.current = scheduleRefresh
  }, [scheduleRefresh])

  useEffect(() => {
    if (window.localStorage.getItem('token')) scheduleRefresh()
    return () => clearTimeout(refreshTimer.current)
  }, [scheduleRefresh])

  const login = useCallback(async (email: string, password: string) => {
    const tokenResponse = await authApi.login(email, password)
    window.localStorage.setItem('token', tokenResponse.access_token)
    window.localStorage.setItem('refresh_token', tokenResponse.refresh_token)
    const me = await authApi.getMe()
    window.localStorage.setItem('user', JSON.stringify(me))
    setUser(me)
    scheduleRefresh()
  }, [scheduleRefresh])

  const registerUser = useCallback(async (input: authApi.RegisterInput) => {
    await authApi.register(input)
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      window.localStorage.removeItem('token')
      window.localStorage.removeItem('refresh_token')
      window.localStorage.removeItem('user')
      clearTimeout(refreshTimer.current)
      setUser(null)
    }
  }, [])

  return (
    <AuthContext.Provider
      value={{ user, isAuthenticated: !!user, login, register: registerUser, logout }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
