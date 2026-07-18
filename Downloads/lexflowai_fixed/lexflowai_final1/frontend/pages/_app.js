import '../styles/globals.css'
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import Layout from '../components/Layout'
import { AuthProvider, useAuth } from '../lib/AuthContext'

const PUBLIC_PATHS = ['/login', '/signup']

function AuthGate({ children }) {
  const router = useRouter()
  const { user, loading } = useAuth()
  const isPublicPath = PUBLIC_PATHS.includes(router.pathname)

  useEffect(() => {
    if (loading || isPublicPath) return
    if (!user) {
      router.replace('/login')
    }
  }, [loading, user, isPublicPath, router])

  // Login/signup never wait on the auth check — they must always render
  // immediately regardless of whether /api/me has resolved yet.
  if (isPublicPath) {
    return children
  }

  if (loading) {
    return <div className="auth-loading"><span className="spinner" /> Loading...</div>
  }

  if (!user) {
    return <div className="auth-loading"><span className="spinner" /> Redirecting to sign in...</div>
  }

  return <Layout>{children}</Layout>
}

export default function App({ Component, pageProps }) {
  return (
    <AuthProvider>
      <AuthGate>
        <Component {...pageProps} />
      </AuthGate>
    </AuthProvider>
  )
}
