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
    if (loading) return
    if (!user && !isPublicPath) {
      router.replace('/login')
    }
  }, [loading, user, isPublicPath, router])

  if (loading) {
    return <div className="auth-loading">Loading...</div>
  }

  if (!user && !isPublicPath) {
    return <div className="auth-loading">Redirecting to sign in...</div>
  }

  if (isPublicPath) {
    return children
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
