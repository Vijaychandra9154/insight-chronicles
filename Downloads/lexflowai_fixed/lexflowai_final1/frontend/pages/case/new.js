import { useState } from 'react'
import { useRouter } from 'next/router'
import axios from 'axios'
import { FORUMS } from '../../lib/forums'

export default function NewCase() {
  const router = useRouter()
  const [title, setTitle] = useState('')
  const [caseNumber, setCaseNumber] = useState('')
  const [forum, setForum] = useState(FORUMS[0].value)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (submitting) return
    setError(null)
    setSubmitting(true)
    try {
      await axios.post('/api/cases', {
        title,
        case_number: caseNumber || null,
        forum,
      })
      router.push('/')
    } catch (err) {
      setError('Could not create case. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>New Case</h1>
          <p className="page-subtitle">Start a new matter.</p>
        </div>
      </div>

      <form className="form-card" onSubmit={handleSubmit}>
        {error && <p className="form-error">{error}</p>}

        <div className="form-group">
          <label htmlFor="title">Title</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>

        <div className="form-group">
          <label htmlFor="caseNumber">Case Number</label>
          <input
            id="caseNumber"
            type="text"
            value={caseNumber}
            onChange={(e) => setCaseNumber(e.target.value)}
            placeholder="Optional"
          />
        </div>

        <div className="form-group">
          <label htmlFor="forum">Forum</label>
          <select id="forum" value={forum} onChange={(e) => setForum(e.target.value)} required>
            {FORUMS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        <div className="form-actions">
          <button type="submit" className="btn" disabled={submitting}>
            {submitting ? 'Creating...' : 'Create Case'}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => router.push('/')}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}
