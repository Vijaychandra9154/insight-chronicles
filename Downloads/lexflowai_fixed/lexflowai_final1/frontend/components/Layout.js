import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '../lib/AuthContext'

const ICONS = {
  dashboard: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  ),
  cases: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7a2 2 0 0 1 2-2h3l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z" />
    </svg>
  ),
  new: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" strokeLinecap="round" />
    </svg>
  ),
  billing: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" strokeLinecap="round" />
    </svg>
  ),
}

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard', icon: ICONS.dashboard },
  { href: '/cases', label: 'Cases', icon: ICONS.cases },
  { href: '/case/new', label: 'New Case', icon: ICONS.new },
  { href: '/billing', label: 'Billing', icon: ICONS.billing },
]

function initials(nameOrEmail) {
  if (!nameOrEmail) return '?'
  const parts = nameOrEmail.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return nameOrEmail.slice(0, 2).toUpperCase()
}

export default function Layout({ children }) {
  const router = useRouter()
  const { user, logout } = useAuth()

  async function handleLogout() {
    await logout()
    router.push('/login')
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <span className="sidebar-logo-mark">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M12 3v18M7 6l-4 8a4 4 0 0 0 8 0l-4-8ZM17 6l-4 8a4 4 0 0 0 8 0l-4-8ZM4 21h16" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          LexFlow AI
        </div>
        <div className="sidebar-tagline">Legal Drafting Assistant</div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link${router.pathname === item.href ? ' active' : ''}`}
            >
              {item.icon}
              {item.label}
            </Link>
          ))}
        </nav>
        {user && (
          <div className="sidebar-user">
            <span className="sidebar-avatar">{initials(user.full_name || user.email)}</span>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{user.full_name || user.email}</div>
              <span className={`sidebar-plan-badge${user.plan === 'individual' ? ' is-paid' : ''}`}>
                {user.plan === 'individual' ? 'Individual' : 'Free'}
              </span>
              <button type="button" className="sidebar-logout" onClick={handleLogout}>
                Log out
              </button>
            </div>
          </div>
        )}
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}
