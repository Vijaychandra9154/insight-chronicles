import { useState } from 'react'
import useSWR from 'swr'
import axios from 'axios'
import { useAuth } from '../lib/AuthContext'
import { loadRazorpayScript } from '../lib/razorpay'

const fetcher = (url) =>
  axios.get(url).then((r) => r.data).catch((err) => {
    if (err.response?.status === 404) return null
    throw err
  })

function formatDate(value) {
  if (!value) return 'Unknown date'
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function Firm() {
  const { refreshUser } = useAuth()
  const { data: firm, mutate, isLoading } = useSWR('/api/firms/me', fetcher)
  const [inviteCode, setInviteCode] = useState('')
  const [joining, setJoining] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [copied, setCopied] = useState(false)

  async function handleCreateTeamPlan() {
    setError(null)
    setUpgrading(true)
    try {
      const scriptReady = await loadRazorpayScript()
      if (!scriptReady || !window.Razorpay) {
        setError('Could not load the payment widget. Please try again.')
        setUpgrading(false)
        return
      }
      const checkoutRes = await axios.post('/api/billing/checkout', { plan: 'team' })
      const { subscription_id, key_id } = checkoutRes.data
      const rzp = new window.Razorpay({
        key: key_id,
        subscription_id,
        name: 'LexFlow AI',
        description: 'Team plan — billed monthly, cancel any time',
        handler: async (response) => {
          try {
            await axios.post('/api/billing/verify', {
              razorpay_subscription_id: response.razorpay_subscription_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            })
            await mutate()
            await refreshUser()
          } catch (err) {
            setError('Payment succeeded but verification failed. Please contact support.')
          } finally {
            setUpgrading(false)
          }
        },
        modal: { ondismiss: () => setUpgrading(false) },
      })
      rzp.on('payment.failed', () => {
        setError('Payment failed. Please try again.')
        setUpgrading(false)
      })
      rzp.open()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not start checkout. Please try again.')
      setUpgrading(false)
    }
  }

  async function handleJoin(e) {
    e.preventDefault()
    setError(null)
    setJoining(true)
    try {
      await axios.post('/api/firms/join', { invite_code: inviteCode.trim() })
      await mutate()
      await refreshUser()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not join firm. Check the invite code.')
    } finally {
      setJoining(false)
    }
  }

  async function handleRegenerateCode() {
    setError(null)
    setBusy(true)
    try {
      await axios.post('/api/firms/invite/regenerate')
      await mutate()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not regenerate invite code.')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemoveMember(userId) {
    setError(null)
    setBusy(true)
    try {
      await axios.delete(`/api/firms/members/${userId}`)
      await mutate()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not remove member.')
    } finally {
      setBusy(false)
    }
  }

  async function handleLeave() {
    setError(null)
    setBusy(true)
    try {
      await axios.post('/api/firms/leave')
      await mutate()
      await refreshUser()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not leave firm.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCopyCode() {
    if (!firm?.invite_code) return
    await navigator.clipboard.writeText(firm.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (isLoading) {
    return (
      <p className="state-message">
        <span className="spinner" /> Loading firm details...
      </p>
    )
  }

  if (!firm) {
    return (
      <div>
        <div className="case-header">
          <h1>Your Firm</h1>
          <p className="case-header-meta">Put your whole team on one plan with shared cases.</p>
        </div>

        {error && <p className="form-error">{error}</p>}

        <div className="section">
          <h2 className="section-title">Start a Team plan</h2>
          <div className="form-card">
            <p>
              Create a firm, invite colleagues with a code, and share cases across the team —
              everyone gets unlimited AI drafting.
            </p>
            <p className="plan-price">₹999 / month, flat — unlimited seats</p>
            <button type="button" className="btn" onClick={handleCreateTeamPlan} disabled={upgrading}>
              {upgrading && <span className="spinner" />}
              {upgrading ? 'Processing...' : 'Start Team plan — ₹999/month'}
            </button>
          </div>
        </div>

        <div className="section">
          <h2 className="section-title">Have an invite code?</h2>
          <form className="form-card" onSubmit={handleJoin}>
            <div className="form-group">
              <label htmlFor="inviteCode">Invite code</label>
              <input
                id="inviteCode"
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value)}
                placeholder="e.g. aB3x9Q"
                required
              />
            </div>
            <div className="form-actions">
              <button type="submit" className="btn" disabled={joining || !inviteCode.trim()}>
                {joining && <span className="spinner" />}
                {joining ? 'Joining...' : 'Join firm'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )
  }

  const isOwner = firm.my_role === 'owner'

  return (
    <div>
      <div className="case-header">
        <h1>{firm.name}</h1>
        <p className="case-header-meta">
          {isOwner ? 'You own this firm.' : 'You are a member of this firm.'}
        </p>
      </div>

      {error && <p className="form-error">{error}</p>}

      <div className="section">
        <h2 className="section-title">Plan</h2>
        <div className="stats-bar">
          <div className="stat-tile">
            <div className="stat-value">{firm.is_paid_active ? 'Team' : 'Inactive'}</div>
            <div className="stat-label">Plan status</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{formatDate(firm.plan_expires_at)}</div>
            <div className="stat-label">Renews / expires</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">{firm.members.length}</div>
            <div className="stat-label">Members</div>
          </div>
        </div>
      </div>

      {isOwner && (
        <div className="section">
          <h2 className="section-title">Invite Members</h2>
          <div className="form-card">
            <p>Share this code with colleagues — they can join from the Firm page.</p>
            <p className="plan-price" style={{ fontFamily: 'monospace' }}>{firm.invite_code}</p>
            <div className="form-actions">
              <button type="button" className="btn btn-secondary" onClick={handleCopyCode}>
                {copied ? 'Copied!' : 'Copy code'}
              </button>
              <button type="button" className="btn btn-secondary" onClick={handleRegenerateCode} disabled={busy}>
                Regenerate code
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="section">
        <h2 className="section-title">Members</h2>
        <div className="form-card">
          {firm.members.map((m) => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '0.5rem 0',
                borderBottom: '1px solid var(--border, #e5e5e5)',
              }}
            >
              <div>
                <strong>{m.full_name || m.email}</strong> — {m.firm_role}
              </div>
              {isOwner && m.firm_role !== 'owner' && (
                <button type="button" className="btn btn-secondary" onClick={() => handleRemoveMember(m.id)} disabled={busy}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {!isOwner && (
        <div className="section">
          <div className="form-card">
            <button type="button" className="btn btn-secondary" onClick={handleLeave} disabled={busy}>
              Leave firm
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
