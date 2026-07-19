import { useState } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { useAuth } from '../lib/AuthContext'

export default function Login() {
  const router = useRouter()
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
      router.push('/')
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid email or password.')
      setSubmitting(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 3v18M7 6l-4 8a4 4 0 0 0 8 0l-4-8ZM17 6l-4 8a4 4 0 0 0 8 0l-4-8ZM4 21h16" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          LexFlow AI
        </div>
        <h1>Sign in</h1>
        <form onSubmit={handleSubmit}>
          {error && <p className="form-error">{error}</p>}
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn" disabled={submitting}>
            {submitting && <span className="spinner" />}
            {submitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <p className="auth-switch">
          Don&apos;t have an account? <Link href="/signup">Sign up</Link>
        </p>
        <p className="auth-switch">
          <Link href="/citation-checker">Check a document for outdated citations</Link> — free, no sign-up.
        </p>
      </div>
    </div>
  )
}
