import Link from 'next/link'
import CaseList from '../components/CaseList'

export default function Dashboard() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Dashboard</h1>
          <p className="page-subtitle">All your cases at a glance.</p>
        </div>
        <Link href="/case/new" className="btn">+ New Case</Link>
      </div>
      <CaseList />
    </div>
  )
}
