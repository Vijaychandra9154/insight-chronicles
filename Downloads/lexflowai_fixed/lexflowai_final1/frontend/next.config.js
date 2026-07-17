const backend = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'

module.exports = {
  reactStrictMode: true,
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${backend}/api/:path*`
      }
    ]
  }
}
