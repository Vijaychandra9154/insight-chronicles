import { useState } from 'react'
import Link from 'next/link'
import axios from 'axios'

const OUTDATED_PATTERN = /(\[OUTDATED:[^\]]*\])/g

function renderAnnotated(text) {
  return text.split(OUTDATED_PATTERN).map((part, i) =>
    OUTDATED_PATTERN.test(part) ? (
      <mark key={i} className="outdated-highlight">{part}</mark>
    ) : (
      <span key={i}>{part}</span>
    )
  )
}

export default function CitationChecker() {
  const [text, setText] = useState('')
  const [checking, setChecking] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (checking || !text.trim()) return
    setError(null)
    setChecking(true)
    setResult(null)
    try {
      const res = await axios.post('/api/citation-check', { text })
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not check this text. Please try again.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card wide">
        <div className="auth-logo">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
            <path d="M12 3v18M7 6l-4 8a4 4 0 0 0 8 0l-4-8ZM17 6l-4 8a4 4 0 0 0 8 0l-4-8ZM4 21h16" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          LexFlow AI
        </div>
        <h1>Citation Checker</h1>
        <p className="citation-checker-intro">
          Paste a notice, complaint, or draft. We&apos;ll flag any citation to the old IPC, CrPC,
          or Indian Evidence Act that should now reference the BNS, BNSS, or BSA — free, no
          sign-up required.
        </p>
        <form onSubmit={handleSubmit}>
          {error && <p className="form-error">{error}</p>}
          <div className="form-group">
            <label htmlFor="citation-text">Text to check</label>
            <textarea
              id="citation-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Paste text here (up to 8,000 characters)..."
              rows={10}
              maxLength={8000}
              required
            />
          </div>
          <button type="submit" className="btn" disabled={checking}>
            {checking && <span className="spinner" />}
            {checking ? 'Checking...' : 'Check Citations'}
          </button>
        </form>

        {result && (
          <div className="citation-result">
            <p className={result.flagged_count > 0 ? 'state-message error' : 'state-message'}>
              {result.flagged_count > 0
                ? `${result.flagged_count} outdated citation${result.flagged_count === 1 ? '' : 's'} found.`
                : 'No outdated citations found — this text looks BNS/BNSS/BSA current.'}
            </p>
            <div className="draft-view">{renderAnnotated(result.annotated_text)}</div>
          </div>
        )}

        <p className="auth-switch">
          Have a case to draft? <Link href="/signup">Sign up free</Link> or{' '}
          <Link href="/login">sign in</Link>.
        </p>
      </div>
    </div>
  )
}
