import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import {
  ServerError,
  getCurrentUser,
  signIn as serverSignIn,
  signOut as serverSignOut,
  type SessionUser,
} from '../server/functions'

const TOKEN_KEY = 'ai-bias-session'
const RETURN_TO_KEY = 'ai-bias-return-to'

type AuthState =
  | { phase: 'checking' }
  | { phase: 'signedOut'; notice: string | null }
  | { phase: 'signedIn'; user: SessionUser }

interface AuthContextValue {
  state: AuthState
  signIn: (email: string, password: string) => void
  signOut: () => void
  /** Runs a server function; a 401 redirects to login with the session-expired notice. */
  call: <T>(fn: (token: string | null) => T) => T
  consumeReturnTo: () => string | null
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ phase: 'checking' })

  const expire = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    // Preserve the current URL so the user returns here after signing in.
    sessionStorage.setItem(RETURN_TO_KEY, window.location.hash || '#/experiments')
    setState({ phase: 'signedOut', notice: 'Your session expired. Sign in to continue.' })
  }, [])

  useEffect(() => {
    const token = getToken()
    if (!token) {
      // Keep an existing expiry notice (effects run twice under StrictMode).
      setState((s) => (s.phase === 'signedOut' ? s : { phase: 'signedOut', notice: null }))
      return
    }
    try {
      const user = getCurrentUser(token)
      setState({ phase: 'signedIn', user })
    } catch (e) {
      if (e instanceof ServerError && e.status === 401) expire()
      else setState({ phase: 'signedOut', notice: null })
    }
  }, [expire])

  const signIn = useCallback((email: string, password: string) => {
    const { token, user } = serverSignIn(email, password)
    localStorage.setItem(TOKEN_KEY, token)
    setState({ phase: 'signedIn', user })
  }, [])

  const signOut = useCallback(() => {
    serverSignOut(getToken())
    localStorage.removeItem(TOKEN_KEY)
    sessionStorage.removeItem(RETURN_TO_KEY)
    setState({ phase: 'signedOut', notice: null })
  }, [])

  const call = useCallback(
    <T,>(fn: (token: string | null) => T): T => {
      try {
        return fn(getToken())
      } catch (e) {
        if (e instanceof ServerError && (e.status === 401 || (e.status as number) === 403)) {
          expire()
        }
        throw e
      }
    },
    [expire],
  )

  const consumeReturnTo = useCallback(() => {
    const v = sessionStorage.getItem(RETURN_TO_KEY)
    sessionStorage.removeItem(RETURN_TO_KEY)
    return v
  }, [])

  return (
    <AuthContext.Provider value={{ state, signIn, signOut, call, consumeReturnTo }}>
      {children}
    </AuthContext.Provider>
  )
}
