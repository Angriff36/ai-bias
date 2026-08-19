import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useAuth } from './AuthContext'

/**
 * Login page. Focus lands on the heading after a redirect; the expiry notice
 * is announced via an ARIA live region. Tab order: email → password → submit.
 */
export function LoginPage({ notice }: { notice: string | null }) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = 'Sign in — AI Bias Lab'
    headingRef.current?.focus()
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim()) {
      setError('Enter your email address to sign in.')
      return
    }
    try {
      signIn(email, password)
    } catch {
      setError('Something went wrong while signing in.')
    }
  }

  return (
    <div className="app login">
      <h1 ref={headingRef} tabIndex={-1}>Sign in</h1>
      <div aria-live="polite" role="status">
        {notice && <div className="banner progress">{notice}</div>}
      </div>
      {error && (
        <div className="banner error" role="alert">
          <span>{error}</span>
          <button className="secondary" onClick={() => setError(null)}>Try again</button>
        </div>
      )}
      <form className="panel login-form" onSubmit={submit} noValidate>
        <label>
          Email
          <input
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button type="submit" className="primary">Sign in</button>
      </form>
    </div>
  )
}
