import { useState } from 'react'
import { useNavigate, useLocation, Navigate } from 'react-router-dom'
import { useAuthStore, client } from '../store/auth'

function LogoMark({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <rect width="120" height="120" rx="28" fill="#26215C"/>
      <circle cx="60" cy="44" r="20" fill="#AFA9EC"/>
      <path d="M28 92 C28 68 92 68 92 92" stroke="#AFA9EC" strokeWidth="7" strokeLinecap="round" fill="none"/>
      <circle cx="88" cy="82" r="16" fill="#7F77DD"/>
      <path d="M82 82 L87 87 L96 76" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    </svg>
  )
}

const FEATURES = [
  { icon: '🎯', title: 'Set your rules', desc: 'Tell the agent your minimum CPM, home time, and preferred freight.' },
  { icon: '📞', title: 'AI calls recruiters', desc: 'Your voice agent calls and pitches carriers while you drive.' },
  { icon: '📊', title: 'Full dashboard', desc: 'Track every carrier, call, and offer in one place.' },
]

const STATS = [
  { num: '20+', label: 'Carriers' },
  { num: '5 min', label: 'Setup' },
  { num: '24/7', label: 'Active' },
  { num: 'Free', label: 'To start' },
]

export default function Login() {
  const { token, login } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from?.pathname || '/'

  // Already logged in — skip straight to app
  if (token) return <Navigate to={from} replace />

  const [view, setView] = useState('splash')
  const [form, setForm] = useState({ email: '', password: '', first_name: '', last_name: '', phone: '' })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const update = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleLogin = async (e) => {
    e?.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await client.post('/api/auth/login', { email: form.email, password: form.password })
      login(res.data.token, res.data.user)
      navigate(from, { replace: true })
    } catch (err) {
      setError(err?.response?.data?.detail || 'Login failed. Check your email and password.')
    } finally { setLoading(false) }
  }

  const handleRegister = async (e) => {
    e?.preventDefault()
    setLoading(true); setError('')
    try {
      const res = await client.post('/api/auth/register', {
        email: form.email, password: form.password,
        first_name: form.first_name, last_name: form.last_name, phone: form.phone,
      })
      login(res.data.token, res.data.user)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err?.response?.data?.detail || 'Registration failed.')
    } finally { setLoading(false) }
  }

  // ── Auth screens ──────────────────────────────────────────────────────────
  if (view === 'login' || view === 'register') {
    const isLogin = view === 'login'
    return (
      <div className="min-h-screen flex flex-col" style={{ background: '#534AB7' }}>

        {/* Top bar */}
        <div className="flex items-center justify-between px-5 pt-12 pb-6">
          <button onClick={() => { setView('splash'); setError('') }}
            className="text-white/60 text-sm flex items-center gap-1">
            ← Back
          </button>
          <div className="flex items-center gap-2">
            <LogoMark size={28} />
            <span className="text-white font-semibold text-base">
              Proxie<span style={{ color: '#AFA9EC' }}>Agent</span>
            </span>
          </div>
          <div className="w-12" />
        </div>

        {/* Card */}
        <div className="flex-1 bg-white rounded-t-3xl px-6 pt-8 pb-10">
          <h2 className="text-2xl font-bold text-gray-900 mb-1">
            {isLogin ? 'Welcome back' : 'Create account'}
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            {isLogin
              ? <>No account? <button onClick={() => { setView('register'); setError('') }} className="font-medium" style={{ color: '#534AB7' }}>Sign up free</button></>
              : <>Have an account? <button onClick={() => { setView('login'); setError('') }} className="font-medium" style={{ color: '#534AB7' }}>Sign in</button></>
            }
          </p>

          {error && (
            <div className="rounded-xl px-4 py-3 text-sm mb-5 bg-red-50 border border-red-200 text-red-600">
              {error}
            </div>
          )}

          <form onSubmit={isLogin ? handleLogin : handleRegister} className="flex flex-col gap-4">
            {!isLogin && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">First name</label>
                  <input value={form.first_name} onChange={e => update('first_name', e.target.value)}
                    placeholder="Patrick" required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:outline-none focus:ring-2" style={{ '--tw-ring-color': '#534AB7' }} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1.5">Last name</label>
                  <input value={form.last_name} onChange={e => update('last_name', e.target.value)}
                    placeholder="Grace" required
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:outline-none" />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">Email address</label>
              <input type="email" value={form.email} onChange={e => update('email', e.target.value)}
                placeholder="you@email.com" required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:outline-none" />
            </div>

            {!isLogin && (
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Phone number</label>
                <input type="tel" value={form.phone} onChange={e => update('phone', e.target.value)}
                  placeholder="(555) 555-5555"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:outline-none" />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">
                Password {!isLogin && <span className="font-normal text-gray-400">— min 8 characters</span>}
              </label>
              <input type="password" value={form.password} onChange={e => update('password', e.target.value)}
                placeholder="••••••••" required
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm bg-gray-50 focus:outline-none" />
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-4 rounded-2xl text-sm font-semibold text-white disabled:opacity-50 mt-2"
              style={{ background: '#534AB7' }}>
              {loading
                ? (isLogin ? 'Signing in...' : 'Creating account...')
                : (isLogin ? 'Sign In' : 'Create Account →')}
            </button>
          </form>

          {/* Trust points */}
          <div className="mt-8 pt-6 border-t border-gray-100">
            {(isLogin
              ? ['Your agent runs 24/7 even when logged out', 'All call logs saved to your account', 'Rules and preferences sync across devices']
              : ['Set CPM, home time, and freight preferences', 'Agent contacts matching carriers automatically', 'Voice agent calls recruiters on your behalf']
            ).map(point => (
              <div key={point} className="flex items-center gap-3 mb-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#EEEDFE' }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2 2 4-4" stroke="#534AB7" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <span className="text-xs text-gray-500">{point}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  // ── Splash ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#534AB7' }}>

      <div className="flex flex-col items-center text-center px-6 pt-16 pb-10">
        <div className="mb-6"><LogoMark size={72} /></div>
        <h1 className="text-4xl font-bold text-white leading-tight mb-4" style={{ letterSpacing: '-0.5px' }}>
          Proxie<span style={{ color: '#AFA9EC' }}>Agent</span>
        </h1>
        <p className="text-base text-white/70 leading-relaxed mb-2 max-w-xs">
          Your AI agent that shops carriers for you
        </p>
        <p className="text-sm text-white/50 leading-relaxed max-w-xs">
          Set your requirements once. Your agent finds the best CDL opportunities, contacts recruiters, and keeps you updated — on autopilot.
        </p>
      </div>

      <div className="grid grid-cols-4 mx-5 rounded-2xl overflow-hidden mb-8" style={{ background: '#26215C' }}>
        {STATS.map((s, i) => (
          <div key={s.num} className={`py-4 text-center ${i < 3 ? 'border-r border-white/10' : ''}`}>
            <div className="text-lg font-bold" style={{ color: '#AFA9EC' }}>{s.num}</div>
            <div className="text-xs mt-0.5" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      <div className="px-5 mb-8 flex flex-col gap-3">
        {FEATURES.map(f => (
          <div key={f.title} className="flex items-start gap-4 rounded-2xl px-4 py-4" style={{ background: 'rgba(255,255,255,0.08)' }}>
            <span className="text-2xl flex-shrink-0">{f.icon}</span>
            <div>
              <div className="text-sm font-semibold text-white mb-0.5">{f.title}</div>
              <div className="text-xs text-white/55 leading-relaxed">{f.desc}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="px-5 pb-10 flex flex-col gap-3">
        <button onClick={() => { setView('register'); setError('') }}
          className="w-full py-4 rounded-2xl text-sm font-semibold text-white"
          style={{ background: '#26215C' }}>
          Create free account →
        </button>
        <button onClick={() => { setView('login'); setError('') }}
          className="w-full py-4 rounded-2xl text-sm font-semibold"
          style={{ background: 'rgba(255,255,255,0.12)', color: 'white', border: '1px solid rgba(255,255,255,0.2)' }}>
          Sign in
        </button>
        <p className="text-center text-xs mt-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
          © 2025 Proxie Agent · by Conversion Interactive
        </p>
      </div>
    </div>
  )
}