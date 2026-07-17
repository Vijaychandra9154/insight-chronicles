import useSWR from 'swr'
import axios from 'axios'
import CaseCard from './CaseCard'

const fetcher = (url) => axios.get(url).then((r) => r.data)

export default function CaseList() {
  const { data, error, isLoading } = useSWR('/api/cases', fetcher)

  if (isLoading) return <p className="state-message">Loading cases...</p>
  if (error) return <p className="state-message error">Could not load cases. Is the backend running?</p>
  if (!data || data.length === 0) {
    return (
      <div className="empty-state">
        <p>No cases yet.</p>
        <p>Start by creating your first case.</p>
      </div>
    )
  }

  return (
    <div className="case-grid">
      {data.map((caseItem) => (
        <CaseCard key={caseItem.id} caseItem={caseItem} />
      ))}
    </div>
  )
}
