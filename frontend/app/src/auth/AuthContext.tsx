import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import * as authApi from './authApi'
import type { User } from './authApi'
import { setUnauthorizedHandler } from '../lib/apiClient'
import i18n from '../i18n/config'

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

/** Wipe every trace of the session. Safe to call when there is nothing to wipe. */
function clearStoredSession() {
  window.localStorage.removeItem('token')
  window.localStorage.removeItem('refresh_token')
  window.localStorage.removeItem('user')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    // The token, not the cached user, is what the server actually honours.
    // Reading `user` on its own let a tokenless browser boot straight into the
    // app and then fail every request with no way back to the login page.
    if (!window.localStorage.getItem('token')) return null
    const stored = window.localStorage.getItem('user')
    if (!stored) return null
    try {
      return JSON.parse(stored) as User
    } catch {
      return null
    }
  })
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const scheduleRefreshRef = useRef<() => void>(() => {})
  const userRef = useRef(user)

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
    userRef.current = user
  }, [user])

  useEffect(() => {
    if (window.localStorage.getItem('token')) scheduleRefresh()
    return () => clearTimeout(refreshTimer.current)
  }, [scheduleRefresh])

  /**
   * The one place that reacts to "the server says this session is over".
   * Registered on the API client so it fires no matter which query hit the 401
   * — clearing the user re-renders RequireAuth, which sends us to /login.
   */
  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearStoredSession()
      clearTimeout(refreshTimer.current)
      // Only worth announcing to someone who thought they were still logged in;
      // read through the ref so this stays a plain effect, not a state updater
      // with a side effect in it.
      if (userRef.current) toast.error(i18n.t('auth:shared.sessionExpired'))
      setUser(null)
    })
    return () => setUnauthorizedHandler(null)
  }, [])

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
      clearStoredSession()
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
