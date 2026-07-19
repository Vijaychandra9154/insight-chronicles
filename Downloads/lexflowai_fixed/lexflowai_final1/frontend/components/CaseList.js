import useSWR from 'swr'
import axios from 'axios'
import CaseCard from './CaseCard'
import { forumLabel } from '../lib/forums'

const fetcher = (url) => axios.get(url).then((r) => r.data)

function StatsBar({ cases }) {
  const byForum = {}
  cases.forEach((c) => {
    byForum[c.forum] = (byForum[c.forum] || 0) + 1
  })
  const topForums = Object.entries(byForum).sort((a, b) => b[1] - a[1])
  const awaitingResponse = cases.filter((c) => c.is_overdue).length

  return (
    <div className="stats-bar">
      <div className="stat-tile">
        <div className="stat-value">{cases.length}</div>
        <div className="stat-label">Total Cases</div>
      </div>
      <div className={`stat-tile${awaitingResponse > 0 ? ' is-alert' : ''}`}>
        <div className="stat-value">{awaitingResponse}</div>
        <div className="stat-label">Awaiting Response</div>
      </div>
      {topForums.slice(0, 2).map(([forum, count]) => (
        <div className="stat-tile" key={forum}>
          <div className="stat-value">{count}</div>
          <div className="stat-label">{forumLabel(forum)}</div>
        </div>
      ))}
    </div>
  )
}

export default function CaseList({ showStats = false }) {
  const { data, error, isLoading } = useSWR('/api/cases', fetcher)

  if (isLoading) {
    return (
      <p className="state-message">
        <span className="spinner" /> Loading cases...
      </p>
    )
  }
  if (error) {
    return <p className="state-message error">Could not load cases. Is the backend running?</p>
  }
  if (!data || data.length === 0) {
    return (
      <div className="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
        </svg>
        <p className="empty-state-title">No cases yet</p>
        <p>Start by creating your first case.</p>
      </div>
    )
  }

  return (
    <>
      {showStats && <StatsBar cases={data} />}
      <div className="case-grid">
        {data.map((caseItem) => (
          <CaseCard key={caseItem.id} caseItem={caseItem} />
        ))}
      </div>
    </>
  )
}
