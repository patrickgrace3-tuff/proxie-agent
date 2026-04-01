import { useState, useEffect, useRef } from 'react'
import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
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
        const done    = i < active
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
  const [status, setStatus] = useState(null)

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

// ── Phone Setup Flow ──────────────────────────────────────────────────────────
function PhoneSetupFlow({ onComplete, onFallback }) {
  const { user } = useAuthStore()
  const [phase, setPhase]         = useState('phone')   // phone | calling | waiting | review | saving | done
  const [phone, setPhone]         = useState(user?.phone || '')
  const [callId, setCallId]       = useState(null)
  const [result, setResult]       = useState(null)       // extracted profile+rules
  const [editProfile, setEditProfile] = useState({})
  const [editRules, setEditRules]     = useState({})
  const [error, setError]         = useState('')
  const [pollCount, setPollCount] = useState(0)
  const pollRef = useRef(null)

  // Start the onboarding call
  const startCall = async () => {
    if (!phone || phone.length < 10) { setError('Enter a valid phone number'); return }
    setError('')
    setPhase('calling')
    try {
      const r = await client.post('/api/voice/onboarding-call', { phone, voice: 'maya' })
      setCallId(r.data.call_id)
      setPhase('waiting')
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to start call. Check that Bland AI is configured.')
      setPhase('phone')
    }
  }

  // Poll for call completion
  useEffect(() => {
    if (phase !== 'waiting' || !callId) return
    setPollCount(0)

    pollRef.current = setInterval(async () => {
      setPollCount(c => c + 1)
      try {
        const r = await client.get(`/api/voice/onboarding-result/${callId}`)
        const s = r.data.status

        if (s === 'complete') {
          clearInterval(pollRef.current)
          const profile = r.data.profile || {}
          const rules   = r.data.rules   || {}
          setResult(r.data)
          setEditProfile(profile)
          setEditRules(rules)
          setPhase('review')
        } else if (s === 'failed') {
          clearInterval(pollRef.current)
          setError('The call could not be completed. You can try again or use the form instead.')
          setPhase('phone')
        }
        // in_progress / processing → keep polling
      } catch (e) {
        console.error('[Onboarding poll]', e)
      }
    }, 4000)  // poll every 4 seconds

    return () => clearInterval(pollRef.current)
  }, [phase, callId])

  // Save confirmed data
  const saveData = async () => {
    setPhase('saving')
    try {
      await client.post('/api/voice/onboarding-save', {
        call_id: callId,
        profile: editProfile,
        rules:   editRules,
      })
      setPhase('done')
      setTimeout(() => onComplete(), 1200)
    } catch (e) {
      setError('Save failed: ' + (e?.response?.data?.detail || e.message))
      setPhase('review')
    }
  }

  // ── PHONE entry screen ───────────────────────────────────────────────────
  if (phase === 'phone') return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', background: '#f7fafc' }}>
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 20px', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#1a202c', marginBottom: 4 }}>📞 Phone Setup</div>
        <div style={{ fontSize: 12, color: '#718096' }}>We'll call you and ask a few questions to set everything up</div>
        <StepIndicator active={0} />
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
        <div style={{ background: '#EEEDFE', border: '1px solid #AFA9EC', borderRadius: 12, padding: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#26215C', marginBottom: 8 }}>Here's how it works</div>
          {[
            { icon: '📞', text: 'We call your cell — usually within 30 seconds' },
            { icon: '💬', text: 'A friendly agent chats with you for ~5 minutes and asks about your experience, preferences, and pay requirements' },
            { icon: '✅', text: 'You review what was captured and confirm — then your agent starts working immediately' },
          ].map(i => (
            <div key={i.text} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{i.icon}</span>
              <span style={{ fontSize: 13, color: '#3C3489', lineHeight: 1.5 }}>{i.text}</span>
            </div>
          ))}
        </div>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>Your cell phone number</label>
        <input
          value={phone}
          onChange={e => setPhone(e.target.value)}
          placeholder="+15551234567"
          type="tel"
          style={{ width: '100%', padding: '14px 16px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 16, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 8 }}
          onFocus={e => e.target.style.borderColor = '#534AB7'}
          onBlur={e => e.target.style.borderColor = '#e2e8f0'}
        />
        <div style={{ fontSize: 11, color: '#a0aec0', marginBottom: 24 }}>Include country code, e.g. +1 for US numbers</div>

        {error && (
          <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#c53030', marginBottom: 16 }}>⚠ {error}</div>
        )}

        <button onClick={startCall} style={{
          width: '100%', padding: '15px', background: '#534AB7', color: 'white', border: 'none',
          borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: '0 4px 14px rgba(83,74,183,0.35)', marginBottom: 12
        }}>📞 Call Me Now</button>

        <button onClick={onFallback} style={{
          width: '100%', padding: '12px', background: 'white', color: '#718096',
          border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit'
        }}>Fill out the form instead →</button>
      </div>
    </div>
  )

  // ── CALLING screen ───────────────────────────────────────────────────────
  if (phase === 'calling') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 20, animation: 'ring 1s ease-in-out infinite' }}>📞</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#1a202c', marginBottom: 8 }}>Calling {phone}...</div>
      <div style={{ fontSize: 14, color: '#718096' }}>Connecting your onboarding call. Pick up when it rings!</div>
      <style>{`@keyframes ring { 0%,100%{transform:rotate(-10deg)} 50%{transform:rotate(10deg)} }`}</style>
    </div>
  )

  // ── WAITING / POLLING screen ─────────────────────────────────────────────
  if (phase === 'waiting') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 20 }}>🎙️</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#1a202c', marginBottom: 8 }}>On the call with you now</div>
      <div style={{ fontSize: 14, color: '#718096', lineHeight: 1.7, marginBottom: 28 }}>
        The onboarding agent is collecting your information.<br />
        This page will update automatically when the call ends.
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 32 }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: '#534AB7', animation: `proxiePulse 1.4s ${i * 0.2}s ease-in-out infinite` }} />
        ))}
      </div>
      <div style={{ fontSize: 11, color: '#a0aec0', marginBottom: 20 }}>Checking for results every few seconds... ({pollCount} checks)</div>
      <button onClick={onFallback} style={{
        padding: '10px 20px', background: 'white', color: '#718096',
        border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit'
      }}>Use the form instead</button>
      <style>{`@keyframes proxiePulse { 0%,100%{opacity:.3;transform:scale(.8)} 50%{opacity:1;transform:scale(1.2)} }`}</style>
    </div>
  )

  // ── REVIEW screen ────────────────────────────────────────────────────────
  if (phase === 'review' && result) {
    const missing  = result.missing || []
    const captured = Object.entries(editProfile).filter(([, v]) => v && (Array.isArray(v) ? v.length > 0 : true)).length +
                     Object.entries(editRules).filter(([, v]) => v !== null && v !== undefined && v !== '' && v !== false).length

    const Field = ({ label, value, onEdit, hint }) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '9px 0', borderBottom: '1px solid #f7f7f7' }}>
        <div>
          <div style={{ fontSize: 12, color: '#718096' }}>{label}</div>
          {hint && <div style={{ fontSize: 10, color: '#a0aec0' }}>{hint}</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 12 }}>
          {value
            ? <span style={{ fontSize: 13, fontWeight: 500, color: '#2d3748', textAlign: 'right' }}>{Array.isArray(value) ? value.join(', ') : String(value)}</span>
            : <span style={{ fontSize: 12, color: '#e53e3e', fontStyle: 'italic' }}>Not captured</span>
          }
        </div>
      </div>
    )

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 20px', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1a202c', marginBottom: 4 }}>✅ Review Your Setup</div>
          <div style={{ fontSize: 12, color: '#718096' }}>
            We captured <strong>{captured} fields</strong> from your call
            {missing.length > 0 && <span style={{ color: '#dd6b20' }}> · {missing.length} missing</span>}
          </div>
          <StepIndicator active={0} />
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 16px' }}>
          {result.summary && (
            <div style={{ background: '#EEEDFE', border: '1px solid #AFA9EC', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#3C3489', lineHeight: 1.6 }}>
              {result.summary}
            </div>
          )}

          {missing.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>⚠ These weren't captured — you can fill them in after:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {missing.map(f => (
                  <span key={f} style={{ padding: '2px 8px', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 10, fontSize: 11 }}>{f.replace(/_/g, ' ')}</span>
                ))}
              </div>
            </div>
          )}

          {/* Profile section */}
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', fontSize: 12, fontWeight: 700, color: '#4a5568', background: '#fafbfc' }}>👤 Driver Profile</div>
            <div style={{ padding: '4px 14px 10px' }}>
              <Field label="Home Zip"          value={editProfile.zip_code} />
              <Field label="CDL Experience"    value={editProfile.cdl_experience} />
              <Field label="Licenses Held"     value={editProfile.licenses_held} />
              <Field label="Endorsements"      value={editProfile.endorsements?.length ? editProfile.endorsements : null} />
              <Field label="Military Service"  value={editProfile.military_service} />
              <Field label="Moving Violations" value={editProfile.moving_violations} />
              <Field label="Accidents"         value={editProfile.preventable_accidents} />
              <Field label="Driver Type"       value={editProfile.driver_type} />
              <Field label="Solo or Team"      value={editProfile.solo_or_team} />
              <Field label="Freight Hauled"    value={editProfile.freight_current} />
              <Field label="Freight Wanted"    value={editProfile.freight_interested} />
              <Field label="Best Contact Time" value={editProfile.best_contact_time} />
              {editProfile.career_goals && <Field label="Career Goals" value={editProfile.career_goals} />}
            </div>
          </div>

          {/* Rules section */}
          <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid #f0f0f0', fontSize: 12, fontWeight: 700, color: '#4a5568', background: '#fafbfc' }}>⚡ Agent Rules</div>
            <div style={{ padding: '4px 14px 10px' }}>
              <Field label="Minimum CPM"         value={editRules.min_cpm ? `${editRules.min_cpm}¢/mile` : null} />
              <Field label="Min Weekly Gross"    value={editRules.min_weekly_gross ? `$${Number(editRules.min_weekly_gross).toLocaleString()}/wk` : null} />
              <Field label="Home Time"           value={editRules.home_time_requirement} />
              <Field label="No-Touch Freight"    value={editRules.no_touch_freight_required ? 'Required' : null} />
              <Field label="Health Insurance"    value={editRules.requires_health_insurance ? 'Required' : null} />
              <Field label="401k"                value={editRules.requires_401k ? 'Required' : null} />
              <Field label="Skip Forced Dispatch" value={editRules.reject_if_forced_dispatch ? 'Yes' : null} />
              <Field label="Skip Lease-Purchase" value={editRules.reject_if_lease_purchase_only ? 'Yes' : null} />
            </div>
          </div>

          {error && (
            <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#c53030', marginBottom: 12 }}>⚠ {error}</div>
          )}
        </div>

        <div style={{ padding: '12px 16px 32px', background: 'white', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
          <button onClick={saveData} style={{
            width: '100%', padding: '15px', background: '#534AB7', color: 'white', border: 'none',
            borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 4px 14px rgba(83,74,183,0.35)', marginBottom: 10
          }}>✅ Confirm & Save →</button>
          {missing.length > 0 && (
            <button onClick={onFallback} style={{
              width: '100%', padding: '11px', background: 'white', color: '#534AB7',
              border: '1px solid #AFA9EC', borderRadius: 12, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8
            }}>Fill in missing fields with the form →</button>
          )}
          <button onClick={() => setPhase('phone')} style={{
            width: '100%', padding: '10px', background: 'white', color: '#a0aec0',
            border: 'none', borderRadius: 12, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit'
          }}>↺ Try the call again</button>
        </div>
      </div>
    )
  }

  // ── SAVING / DONE screen ─────────────────────────────────────────────────
  if (phase === 'saving' || phase === 'done') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 20 }}>{phase === 'done' ? '🚀' : '⏳'}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#1a202c', marginBottom: 8 }}>
        {phase === 'done' ? "You're all set!" : 'Saving your setup...'}
      </div>
      <div style={{ fontSize: 14, color: '#718096', lineHeight: 1.7 }}>
        {phase === 'done' ? 'Your agent is ready to start finding you great driving jobs.' : 'Just a moment...'}
      </div>
    </div>
  )

  return null
}

// ── Profile Setup Gate ────────────────────────────────────────────────────────
function ProfileGate({ onComplete }) {
  const { user } = useAuthStore()
  const [mode, setMode]         = useState('choice')  // choice | phone | form
  const [questions, setQuestions] = useState([])
  const [step, setStep]         = useState(0)
  const [answers, setAnswers]   = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [loadingQ, setLoadingQ] = useState(false)

  const loadQuestions = async () => {
    setLoadingQ(true)
    try {
      const r = await client.get('/api/questionnaire/questions')
      setQuestions(r.data.questions || [])
    } finally { setLoadingQ(false) }
  }

  useEffect(() => {
    if (mode === 'form') loadQuestions()
  }, [mode])

  // ── CHOICE screen ────────────────────────────────────────────────────────
  if (mode === 'choice') return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', background: '#f7fafc' }}>
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 20px', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#1a202c', marginBottom: 4 }}>
          👋 Welcome, {user?.first_name || 'Driver'}!
        </div>
        <div style={{ fontSize: 12, color: '#718096', marginBottom: 2 }}>
          Let's get your profile set up so your agent can start working for you.
        </div>
        <StepIndicator active={0} />
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 20px' }}>
        <div style={{ fontSize: 14, color: '#4a5568', fontWeight: 600, marginBottom: 20, textAlign: 'center' }}>
          How would you like to set up your profile?
        </div>

        {/* Phone option */}
        <button onClick={() => setMode('phone')} style={{
          width: '100%', padding: '20px 18px', background: 'white', border: '2px solid #534AB7',
          borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          marginBottom: 12, display: 'flex', gap: 16, alignItems: 'flex-start',
          boxShadow: '0 4px 16px rgba(83,74,183,0.12)'
        }}>
          <span style={{ fontSize: 36, flexShrink: 0 }}>📞</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#534AB7', marginBottom: 4 }}>Set up by phone call</div>
            <div style={{ fontSize: 13, color: '#718096', lineHeight: 1.6 }}>
              Our friendly agent calls you and asks everything in a natural conversation. Takes about 5 minutes — easiest option.
            </div>
            <div style={{ display: 'inline-block', marginTop: 8, padding: '3px 10px', background: '#EEEDFE', color: '#534AB7', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>⭐ Recommended</div>
          </div>
        </button>

        {/* Form option */}
        <button onClick={() => setMode('form')} style={{
          width: '100%', padding: '20px 18px', background: 'white', border: '2px solid #e2e8f0',
          borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          display: 'flex', gap: 16, alignItems: 'flex-start'
        }}>
          <span style={{ fontSize: 36, flexShrink: 0 }}>📋</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#2d3748', marginBottom: 4 }}>Fill out the form</div>
            <div style={{ fontSize: 13, color: '#718096', lineHeight: 1.6 }}>
              Go through a step-by-step questionnaire at your own pace. About 20 questions.
            </div>
          </div>
        </button>
      </div>
    </div>
  )

  // ── PHONE option ─────────────────────────────────────────────────────────
  if (mode === 'phone') return (
    <PhoneSetupFlow
      onComplete={onComplete}
      onFallback={() => setMode('form')}
    />
  )

  // ── FORM option ──────────────────────────────────────────────────────────
  if (loadingQ) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#a0aec0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      Loading setup...
    </div>
  )

  const q       = questions[step]
  const pct     = questions.length ? Math.round((step / questions.length) * 100) : 0
  const answer  = q ? (answers[q.id] || '') : ''
  const selected = answer ? answer.split('||') : []
  const isLast  = step === questions.length - 1

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
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#1a202c' }}>👋 Welcome, {user?.first_name || 'Driver'}!</div>
            <div style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>Let's set up your driver profile — step {step + 1} of {questions.length}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setMode('choice')} style={{ fontSize: 11, color: '#a0aec0', background: 'none', border: 'none', cursor: 'pointer' }}>← Back</button>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#534AB7' }}>{pct}%</div>
          </div>
        </div>
        <div style={{ height: 6, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: '#534AB7', borderRadius: 3, transition: 'width 0.35s' }} />
        </div>
        <StepIndicator active={0} />
      </div>

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
                const on     = selected.includes(opt)
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
  const navigate = useNavigate()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', background: '#f7fafc' }}>
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 20px', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#1a202c', marginBottom: 4 }}>
          🎉 Profile complete, {user?.first_name}!
        </div>
        <div style={{ fontSize: 12, color: '#718096', marginBottom: 2 }}>
          One more step — set your agent rules so it knows what to look for.
        </div>
        <StepIndicator active={1} />
      </div>

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

      <div style={{ padding: '14px 16px 32px', background: 'white', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
        <button onClick={() => { onComplete(); setTimeout(() => navigate('/rules'), 50) }} style={{
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

        <main className="flex-1 overflow-hidden">
          <OnboardingGate>
            <div className="h-full overflow-y-auto pb-20 md:pb-0">
              <Routes>
                <Route path="/"         element={<Outreach />} />
                <Route path="/carriers" element={<Carriers />} />
                <Route path="/rules"    element={<Rules />} />
                <Route path="/calls"    element={<CallLog />} />
                <Route path="/profile"  element={<Profile />} />
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