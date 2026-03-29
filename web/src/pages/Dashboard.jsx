import { Routes, Route, NavLink, useNavigate, useEffect, useState } from 'react-router-dom'
import { useAuthStore, client } from '../store/auth'
import Outreach from './Outreach'
import Carriers from './Carriers'
import Profile from './Profile'
import Rules from './Rules'
import CallLog from './CallLog'

const NAV = [
  { to: '/', label: 'Outreach', icon: OutreachIcon, exact: true },
  { to: '/carriers', label: 'Carriers', icon: CarriersIcon },
  { to: '/rules', label: 'Rules', icon: RulesIcon },
  { to: '/calls', label: 'Calls', icon: CallsIcon },
  { to: '/profile', label: 'Profile', icon: ProfileIcon },
]

const STEP_SECTIONS = {
  0:'Contact',1:'Contact',2:'Contact',3:'Contact',4:'Contact',
  5:'Licenses',6:'Licenses',7:'Experience',8:'Endorsements',
  9:'Background',10:'Background',11:'Background',
  12:'Preferences',13:'Preferences',14:'Preferences',15:'Preferences',
  16:'Freight',17:'Freight',18:'Availability',19:'Terms',
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepIndicator({ active }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginTop: 12 }}>
      {['Profile', 'Rules', 'Ready!'].map((s, i) => {
        const done = i < active
        const current = i === active
        return (
          <div key={s} style={{ display: 'flex', alignItems: 'center', flex: i < 2 ? 1 : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{
                width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center',
                justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0,
                background: done ? '#38a169' : current ? '#534AB7' : '#e2e8f0',
                color: done || current ? 'white' : '#a0aec0'
              }}>{done ? '✓' : i + 1}</div>
              <span style={{ fontSize: 12, fontWeight: current || done ? 600 : 400, color: current ? '#534AB7' : done ? '#38a169' : '#a0aec0' }}>{s}</span>
            </div>
            {i < 2 && <div style={{ flex: 1, height: 2, background: done ? '#38a169' : '#e2e8f0', margin: '0 8px' }} />}
          </div>
        )
      })}
    </div>
  )
}

// ── Onboarding Gate ───────────────────────────────────────────────────────────
function OnboardingGate({ children }) {
  const [status, setStatus] = useState(null) // null=loading | 'profile' | 'rules' | 'done'

  const check = async () => {
    try {
      const [pr, rr] = await Promise.all([
        client.get('/api/questionnaire/profile'),
        client.get('/api/rules/'),
      ])
      if (!pr.data?.setup_complete) {
        setStatus('profile')
      } else if (!rr.data?.rules_active) {
        setStatus('rules')
      } else {
        setStatus('done')
      }
    } catch {
      setStatus('done')
    }
  }

  useEffect(() => { check() }, [])

  if (status === null) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#a0aec0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
        <div>Setting up your account...</div>
      </div>
    </div>
  )

  if (status === 'profile') return <ProfileGate onComplete={() => setStatus('rules')} />
  if (status === 'rules')   return <RulesGate   onComplete={() => setStatus('done')} />
  return children
}

// ── Profile Setup Gate ────────────────────────────────────────────────────────
function ProfileGate({ onComplete }) {
  const { user } = useAuthStore()
  const [questions, setQuestions] = useState([])
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [loadingQ, setLoadingQ] = useState(true)

  useEffect(() => {
    client.get('/api/questionnaire/questions')
      .then(r => setQuestions(r.data.questions || []))
      .finally(() => setLoadingQ(false))
  }, [])

  if (loadingQ) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#a0aec0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      Loading setup...
    </div>
  )

  const q = questions[step]
  const pct = questions.length ? Math.round((step / questions.length) * 100) : 0
  const answer = q ? (answers[q.id] || '') : ''
  const selected = answer ? answer.split('||') : []
  const isLast = step === questions.length - 1

  const setAnswer = (val) => setAnswers(prev => ({ ...prev, [q.id]: val }))

  const toggleOpt = (opt, single) => {
    if (single) { setAnswer(opt); setTimeout(() => advance(opt), 260); return }
    const arr = selected.includes(opt) ? selected.filter(x => x !== opt) : [...selected, opt]
    setAnswer(arr.join('||'))
  }

  const advance = async (forcedVal) => {
    const val = forcedVal !== undefined ? forcedVal : answer
    if (q?.required && !val) { alert('This field is required'); return }
    if (!isLast) { setStep(s => s + 1); return }
    setSubmitting(true)
    try {
      const ans = questions.map(qu => ({
        field: qu.field, value: answers[qu.id] || '', is_list: qu.type === 'multi_select'
      }))
      await client.post('/api/questionnaire/submit', { answers: ans })
      onComplete()
    } catch (e) {
      alert('Save failed: ' + (e?.response?.data?.detail || e.message))
      setSubmitting(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', background: '#f7fafc' }}>

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1a202c' }}>👋 Welcome, {user?.first_name || 'Driver'}!</div>
            <div style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>Let's set up your driver profile — step {step + 1} of {questions.length}</div>
          </div>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#534AB7' }}>{pct}%</div>
        </div>
        <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: '#534AB7', borderRadius: 3, transition: 'width 0.35s' }} />
        </div>
        <StepIndicator active={0} />
      </div>

      {/* Question */}
      {q && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '28px 20px 20px' }}>
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: '#534AB7', marginBottom: 10 }}>
            {STEP_SECTIONS[step] || ''}
          </div>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#1a202c', lineHeight: 1.35, marginBottom: q.type === 'multi_select' ? 6 : 20 }}>
            {q.question}{q.required && <span style={{ color: '#e53e3e' }}> *</span>}
          </div>
          {q.type === 'multi_select' && <div style={{ fontSize: 12, color: '#a0aec0', marginBottom: 20 }}>Select all that apply</div>}

          {(!q.type || q.type === 'text') && (
            <input value={answer} onChange={e => setAnswer(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') advance() }}
              placeholder={q.placeholder || ''} autoFocus
              style={{ width: '100%', padding: '14px 16px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 16, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
              onFocus={e => e.target.style.borderColor = '#534AB7'}
              onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
          )}

          {(q.type === 'single_select' || q.type === 'multi_select') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {q.options.map(opt => {
                const on = selected.includes(opt)
                const single = q.type === 'single_select'
                return (
                  <button key={opt} onClick={() => toggleOpt(opt, single)} style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px',
                    border: `2px solid ${on ? '#534AB7' : '#e2e8f0'}`,
                    borderRadius: 10, background: on ? '#EEEDFE' : 'white',
                    cursor: 'pointer', fontFamily: 'inherit', fontSize: 14,
                    color: on ? '#3C3489' : '#2d3748', fontWeight: on ? 600 : 400, textAlign: 'left'
                  }}>
                    <div style={{
                      width: 22, height: 22, borderRadius: single ? '50%' : 5, flexShrink: 0,
                      border: `2px solid ${on ? '#534AB7' : '#cbd5e0'}`,
                      background: on ? '#534AB7' : 'white',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 13, color: 'white', fontWeight: 700
                    }}>
                      {on && (single ? <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'white' }} /> : '✓')}
                    </div>
                    {opt}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Nav */}
      <div style={{ background: 'white', borderTop: '1px solid #e2e8f0', padding: '14px 20px 24px', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
          <button onClick={() => { if (step > 0) setStep(s => s - 1) }}
            style={{ padding: '12px 20px', border: '1px solid #e2e8f0', background: 'white', borderRadius: 10, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit', visibility: step === 0 ? 'hidden' : 'visible' }}>
            ← Back
          </button>
          {(q?.type === 'multi_select' || !q?.type || q?.type === 'text') && (
            <button onClick={() => advance()} disabled={submitting} style={{
              flex: 1, padding: '14px', background: isLast ? '#38a169' : '#534AB7', color: 'white',
              border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: 'pointer',
              opacity: submitting ? 0.6 : 1, fontFamily: 'inherit',
              boxShadow: '0 4px 14px rgba(83,74,183,0.3)'
            }}>{submitting ? 'Saving...' : isLast ? 'Complete Profile ✓' : 'Continue →'}</button>
          )}
        </div>
        <div style={{ textAlign: 'center', fontSize: 11, color: '#a0aec0' }}>You can update your profile anytime from the Profile tab</div>
      </div>
    </div>
  )
}

// ── Rules Setup Gate ──────────────────────────────────────────────────────────
function RulesGate({ onComplete }) {
  const { user } = useAuthStore()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', background: '#f7fafc' }}>

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 20px', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#1a202c', marginBottom: 4 }}>
          🎉 Profile complete, {user?.first_name}!
        </div>
        <div style={{ fontSize: 12, color: '#718096', marginBottom: 2 }}>
          One more step — set your agent rules so it knows what to look for.
        </div>
        <StepIndicator active={1} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 16px' }}>

        <div style={{ background: '#EEEDFE', border: '1px solid #AFA9EC', borderRadius: 12, padding: 16, marginBottom: 20 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#26215C', marginBottom: 6 }}>⚡ What are Proxie Rules?</div>
          <div style={{ fontSize: 13, color: '#3C3489', lineHeight: 1.7 }}>
            Your agent uses these rules to score carriers, filter out bad fits, and know exactly what to pitch on your behalf. Set your minimums and the agent handles the rest — 24/7.
          </div>
        </div>

        {[
          { icon: '💵', title: 'Minimum pay requirements', desc: 'Set your minimum CPM and weekly gross so the agent only pursues carriers that pay enough.' },
          { icon: '🏠', title: 'Home time requirements', desc: 'Tell the agent how often you need to be home — daily, weekly, bi-weekly, or OTR.' },
          { icon: '🗺️', title: 'Territory & geography', desc: 'Set a radius from your home zip, specific regions, or statewide only.' },
          { icon: '📦', title: 'Load & freight preferences', desc: 'No-touch, drop-and-hook, hazmat — the agent scores carriers higher that match.' },
          { icon: '🚫', title: 'Auto-reject conditions', desc: 'Forced dispatch, lease-purchase, no ELD — the agent automatically skips these.' },
          { icon: '🤖', title: 'Activate your agent', desc: 'Hit Activate Agent when ready. Your agent starts working immediately.' },
        ].map(item => (
          <div key={item.title} style={{ display: 'flex', gap: 14, padding: '13px 0', borderBottom: '1px solid #f0f0f0' }}>
            <span style={{ fontSize: 24, flexShrink: 0 }}>{item.icon}</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#2d3748', marginBottom: 3 }}>{item.title}</div>
              <div style={{ fontSize: 12, color: '#718096', lineHeight: 1.5 }}>{item.desc}</div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ padding: '14px 16px 32px', background: 'white', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
        <button onClick={onComplete} style={{
          width: '100%', padding: '15px', background: '#534AB7', color: 'white', border: 'none',
          borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: '0 4px 14px rgba(83,74,183,0.35)', marginBottom: 10
        }}>
          Set Up My Rules →
        </button>
        <button onClick={onComplete} style={{
          width: '100%', padding: '12px', background: 'white', color: '#a0aec0',
          border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit'
        }}>
          Skip for now — I'll do this later
        </button>
      </div>
    </div>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-proxie-deep text-white flex-shrink-0">
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
          <div className="w-9 h-9 rounded-xl bg-proxie-purple flex items-center justify-center flex-shrink-0">
            <LogoMark size={20} />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">
              Proxie<span className="text-proxie-lavender">Agent</span>
            </div>
            <div className="text-xs text-white/30 leading-tight">by CIA</div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon, exact }) => (
            <NavLink key={to} to={to} end={exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-proxie-purple text-white' : 'text-white/60 hover:text-white hover:bg-white/10'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="text-xs text-white/40 mb-1">{user?.email}</div>
          <button onClick={handleLogout} className="text-xs text-white/50 hover:text-white transition-colors">Sign out</button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-proxie-purple text-white flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-proxie-deep flex items-center justify-center">
              <LogoMark size={16} />
            </div>
            <span className="font-semibold text-sm">Proxie<span className="text-proxie-lavender">Agent</span></span>
          </div>
          <div className="text-xs text-white/60">{user?.first_name}</div>
        </header>

        {/* Page content — wrapped in onboarding gate */}
        <main className="flex-1 overflow-hidden">
          <OnboardingGate>
            <div className="h-full overflow-y-auto pb-20 md:pb-0">
              <Routes>
                <Route path="/" element={<Outreach />} />
                <Route path="/carriers" element={<Carriers />} />
                <Route path="/rules" element={<Rules />} />
                <Route path="/calls" element={<CallLog />} />
                <Route path="/profile" element={<Profile />} />
              </Routes>
            </div>
          </OnboardingGate>
        </main>

        {/* Mobile bottom tabs */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-50">
          {NAV.map(({ to, label, icon: Icon, exact }) => (
            <NavLink key={to} to={to} end={exact}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2 text-xs transition-colors ${
                  isActive ? 'text-proxie-purple' : 'text-gray-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} active={isActive} />
                  <span className="mt-0.5 text-[10px]">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────────────────────
function LogoMark({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="44" r="20" fill="#AFA9EC" />
      <path d="M28 92 C28 68 92 68 92 92" stroke="#AFA9EC" strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="88" cy="82" r="16" fill="#7F77DD" />
      <path d="M82 82 L87 87 L96 76" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}
function OutreachIcon({ size, active }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round"><rect x="3" y="3" width="18" height="14" rx="2" /><path d="M3 9h18M9 21l3-4 3 4" /></svg>
}
function CarriersIcon({ size, active }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round"><rect x="1" y="13" width="15" height="8" rx="1" /><path d="M16 17h5l2-4v-4h-7v8z" /><circle cx="5.5" cy="21.5" r="1.5" /><circle cx="18.5" cy="21.5" r="1.5" /></svg>
}
function RulesIcon({ size, active }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round"><path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" /><path d="M12 8v4l3 3" /></svg>
}
function CallsIcon({ size, active }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8 19.79 19.79 0 01.01 1.18 2 2 0 012 .01h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>
}
function ProfileIcon({ size, active }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
}