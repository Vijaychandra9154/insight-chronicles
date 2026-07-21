import { useState } from 'react'
import Link from 'next/link'
import useSWR from 'swr'
import axios from 'axios'
import { useAuth } from '../lib/AuthContext'
import { loadRazorpayScript } from '../lib/razorpay'

const fetcher = (url) => axios.get(url).then((r) => r.data)

function formatDate(value) {
  if (!value) return 'Unknown date'
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function Billing() {
  const { refreshUser } = useAuth()
  const { data: status, mutate } = useSWR('/api/billing/status', fetcher)
  const [upgrading, setUpgrading] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState(null)

  async function handleUpgrade() {
    setError(null)
    setUpgrading(true)
    try {
      const scriptReady = await loadRazorpayScript()
      if (!scriptReady || !window.Razorpay) {
        setError('Could not load the payment widget. Please try again.')
        setUpgrading(false)
        return
      }

      const checkoutRes = await axios.post('/api/billing/checkout')
      const { subscription_id, key_id } = checkoutRes.data

      const rzp = new window.Razorpay({
        key: key_id,
        subscription_id,
        name: 'LexFlow AI',
        description: 'Individual plan — billed monthly, cancel any time',
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
        modal: {
          ondismiss: () => setUpgrading(false),
        },
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

  async function handleCancel() {
    setError(null)
    setCancelling(true)
    try {
      await axios.post('/api/billing/cancel')
      await mutate()
    } catch (err) {
      setError(err.response?.data?.detail || 'Could not cancel subscription. Please try again.')
    } finally {
      setCancelling(false)
    }
  }

  if (!status) {
    return (
      <p className="state-message">
        <span className="spinner" /> Loading billing status...
      </p>
    )
  }

  const isPaid = status.is_paid_active

  return (
    <div>
      <div className="case-header">
        <h1>Billing</h1>
        <p className="case-header-meta">Manage your LexFlow AI plan.</p>
      </div>

      <div className="section">
        <h2 className="section-title">Current Plan</h2>
        <div className="stats-bar">
          <div className="stat-tile">
            <div className="stat-value">{isPaid ? 'Individual' : 'Free'}</div>
            <div className="stat-label">Plan</div>
          </div>
          <div className="stat-tile">
            <div className="stat-value">
              {status.drafts_used_this_month}
              {status.drafts_limit != null ? ` / ${status.drafts_limit}` : ''}
            </div>
            <div className="stat-label">AI documents this month</div>
          </div>
          {isPaid && (
            <div className="stat-tile">
              <div className="stat-value">{formatDate(status.plan_expires_at)}</div>
              <div className="stat-label">
                {status.cancel_at_cycle_end ? 'Access ends' : 'Renews automatically'}
              </div>
            </div>
          )}
        </div>
      </div>

      {isPaid && !status.cancel_at_cycle_end && (
        <div className="section">
          <h2 className="section-title">Manage Subscription</h2>
          <div className="form-card">
            <p>
              Your Individual plan renews automatically each month. You can cancel any time —
              you'll keep access until the current billing period ends.
            </p>
            {error && <p className="form-error">{error}</p>}
            <button type="button" className="btn btn-secondary" onClick={handleCancel} disabled={cancelling}>
              {cancelling && <span className="spinner" />}
              {cancelling ? 'Cancelling...' : 'Cancel subscription'}
            </button>
          </div>
        </div>
      )}

      {!isPaid && (
        <div className="section">
          <h2 className="section-title">Upgrade to Individual</h2>
          <div className="form-card">
            <p>
              Unlimited AI drafts and escalations across every institution, case tracking, and
              Hindi/Telugu translation.
            </p>
            <p className="plan-price">₹199 / month</p>
            {error && <p className="form-error">{error}</p>}
            <button type="button" className="btn" onClick={handleUpgrade} disabled={upgrading}>
              {upgrading && <span className="spinner" />}
              {upgrading ? 'Processing...' : 'Upgrade — ₹199/month'}
            </button>
          </div>
        </div>
      )}

      {!status.firm && (
        <div className="section">
          <h2 className="section-title">Running a firm?</h2>
          <div className="form-card">
            <p>
              Put your whole team on one plan — shared cases, one invite code, one bill.
            </p>
            <Link href="/firm" className="btn btn-secondary">Set up a Team plan</Link>
          </div>
        </div>
      )}
    </div>
  )
}
