import Link from 'next/link'
import { forumLabel } from '../lib/forums'

function formatDate(value) {
  if (!value) return 'Unknown date'
  return new Date(value).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function CaseCard({ caseItem }) {
  return (
    <Link href={`/case/${caseItem.id}`} className="case-card">
      <span className="forum-badge">{forumLabel(caseItem.forum)}</span>
      <div className="case-card-title">{caseItem.title}</div>
      <div className="case-card-meta">
        Case No: {caseItem.case_number || 'Not assigned'}
      </div>
      <div className="case-card-meta">Created: {formatDate(caseItem.created_at)}</div>
    </Link>
  )
}
