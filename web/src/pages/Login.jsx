import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore, client } from '../store/auth'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login } = useAuthStore()
  const navigate = useNavigate()

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await client.post('/api/auth/login', { email, password })
      login(res.data.token, res.data.user)
      navigate('/')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-proxie-purple flex items-center justify-center px-4">
      <div className="w-full max-w-sm">

        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-proxie-deep flex items-center justify-center mb-4">
            <svg width="36" height="36" viewBox="0 0 120 120" fill="none">
              <circle cx="60" cy="44" r="20" fill="#AFA9EC"/>
              <path d="M28 92 C28 68 92 68 92 92" stroke="#AFA9EC" strokeWidth="7" strokeLinecap="round" fill="none"/>
              <circle cx="88" cy="82" r="16" fill="#7F77DD"/>
              <path d="M82 82 L87 87 L96 76" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
          <h1 className="text-3xl font-semibold text-white tracking-tight">
            Proxie<span className="text-proxie-lavender">Agent</span>
          </h1>
          <p className="text-white/40 text-xs mt-1 tracking-wide uppercase">by Conversion Interactive</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white rounded-2xl p-6 shadow-xl">
          <h2 className="text-base font-semibold text-gray-900 mb-5">Sign in to your account</h2>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
              {error}
            </div>
          )}

          <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-gray-50 mb-4 focus:outline-none focus:ring-2 focus:ring-proxie-purple"
            required
          />

          <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 bg-gray-50 mb-5 focus:outline-none focus:ring-2 focus:ring-proxie-purple"
            required
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-proxie-purple text-white rounded-lg py-3 text-sm font-semibold disabled:opacity-60 hover:bg-proxie-deep transition-colors"
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-white/30 text-xs mt-6">ProxieAgent.ai</p>
      </div>
    </div>
  )
}