import Link from 'next/link'
import CaseList from '../components/CaseList'

export default function Cases() {
  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Cases</h1>
          <p className="page-subtitle">Every case on record.</p>
        </div>
        <Link href="/case/new" className="btn">+ New Case</Link>
      </div>
      <CaseList />
    </div>
  )
}
