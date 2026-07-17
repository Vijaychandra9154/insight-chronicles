import Link from 'next/link'
import { useRouter } from 'next/router'

const NAV_ITEMS = [
  { href: '/', label: 'Dashboard' },
  { href: '/cases', label: 'Cases' },
  { href: '/case/new', label: 'New Case' },
]

export default function Layout({ children }) {
  const router = useRouter()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="sidebar-logo">LexFlow AI</div>
        <div className="sidebar-tagline">Legal Drafting Assistant</div>
        <nav className="sidebar-nav">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`sidebar-link${router.pathname === item.href ? ' active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>
      <main className="main-content">{children}</main>
    </div>
  )
}
