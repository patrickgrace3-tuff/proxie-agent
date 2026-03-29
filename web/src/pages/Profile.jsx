import { useEffect, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore, client } from '../store/auth'

const STEP_SECTIONS = {
  0:'Contact',1:'Contact',2:'Contact',3:'Contact',4:'Contact',
  5:'Licenses',6:'Licenses',7:'Experience',8:'Endorsements',
  9:'Background',10:'Background',11:'Background',
  12:'Preferences',13:'Preferences',14:'Preferences',15:'Preferences',
  16:'Freight',17:'Freight',18:'Availability',19:'Terms',
}

const OPTS = {
  licenses:     ['Class A', 'Class B', 'Class C'],
  endorsements: ['Hazmat (H)', 'Tanker (N)', 'Doubles/Triples (T)', 'Passenger (P)', 'School Bus (S)', 'None'],
  freight:      ['Dry Van', 'Refrigerated (Reefer)', 'Flatbed', 'Tanker', 'Hazmat', 'Intermodal', 'Auto Hauler', 'LTL', 'None yet'],
  freightWant:  ['Dry Van', 'Refrigerated (Reefer)', 'Flatbed', 'Tanker', 'Hazmat', 'Intermodal', 'Auto Hauler', 'No preference'],
  experience:   ['Less than 1 year', '1-2 years', '3-5 years', '6-10 years', '10+ years'],
  yesno:        ['Yes', 'No'],
  yesnomay:     ['Yes', 'No', 'Maybe'],
  driverType:   ['Company Driver', 'Owner Operator', 'Lease Purchase', 'Any'],
  soloTeam:     ['Solo only', 'Team only', 'Either'],
  contactTime:  ['Morning (6am-12pm)', 'Afternoon (12pm-5pm)', 'Evening (5pm-9pm)', 'Anytime'],
}

const LIST_FIELDS = new Set(['licenses_held','licenses_obtaining','endorsements','freight_current','freight_interested'])

// ── Shared UI ─────────────────────────────────────────────────────────────────
function ChipGroup({ options, value = [], onChange }) {
  const toggle = (opt) => {
    const arr = value.includes(opt) ? value.filter(x => x !== opt) : [...value, opt]
    onChange(arr)
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
      {options.map(opt => {
        const on = value.includes(opt)
        return (
          <button key={opt} onClick={() => toggle(opt)} style={{
            padding: '6px 12px', borderRadius: 20, fontSize: 12, cursor: 'pointer',
            border: `1px solid ${on ? '#534AB7' : '#e2e8f0'}`,
            background: on ? '#EEEDFE' : 'white',
            color: on ? '#3C3489' : '#4a5568',
            fontWeight: on ? 600 : 400, fontFamily: 'inherit', transition: 'all 0.1s'
          }}>{opt}</button>
        )
      })}
    </div>
  )
}

function FieldLabel({ children, hint }) {
  return (
    <div style={{ marginBottom: 5 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px' }}>{children}</div>
      {hint && <div style={{ fontSize: 10, color: '#a0aec0', marginTop: 1 }}>{hint}</div>}
    </div>
  )
}

function SelectInput({ value, onChange, options }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)} style={{
      width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
      fontSize: 13, outline: 'none', background: 'white', fontFamily: 'inherit', color: '#2d3748'
    }}>
      <option value="">— Select —</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function TextInput({ value, onChange, placeholder }) {
  return (
    <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
  )
}

function Card({ title, children }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 12, overflow: 'hidden' }}>
      <div style={{ padding: '11px 16px', borderBottom: '1px solid #f0f0f0', fontSize: 12, fontWeight: 700, color: '#4a5568', background: '#fafbfc' }}>{title}</div>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </div>
  )
}

function FormField({ label, hint, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <FieldLabel hint={hint}>{label}</FieldLabel>
      {children}
    </div>
  )
}

// ── Account Settings Modal ────────────────────────────────────────────────────
function AccountSettingsModal({ user }) {
  const { setUser } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    first_name: user?.first_name || '',
    last_name: user?.last_name || '',
    phone: user?.phone || '',
    current_password: '',
    new_password: '',
    confirm_password: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    setForm(f => ({
      ...f,
      first_name: user?.first_name || '',
      last_name: user?.last_name || '',
      phone: user?.phone || '',
    }))
  }, [user])

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    setError(''); setSuccess('')
    setSaving(true)
    try {
      await client.put('/api/auth/update-profile', {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        phone: form.phone.trim(),
      })
      setUser({ ...user, first_name: form.first_name.trim(), last_name: form.last_name.trim(), phone: form.phone.trim() })

      if (form.new_password || form.current_password) {
        if (!form.current_password) { setError('Enter your current password.'); setSaving(false); return }
        if (form.new_password !== form.confirm_password) { setError('New passwords do not match.'); setSaving(false); return }
        if (form.new_password.length < 8) { setError('New password must be at least 8 characters.'); setSaving(false); return }
        await client.put('/api/auth/change-password', {
          old_password: form.current_password,
          new_password: form.new_password,
        })
        setForm(p => ({ ...p, current_password: '', new_password: '', confirm_password: '' }))
      }

      setSuccess('Account updated!')
      setTimeout(() => { setSuccess(''); setOpen(false) }, 1500)
    } catch (e) {
      setError(e?.response?.data?.detail || 'Update failed. Please try again.')
    } finally { setSaving(false) }
  }

  const field = (label, key, type = 'text', placeholder = '') => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 }}>{label}</label>
      <input type={type} value={form[key]} onChange={e => upd(key, e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
        onFocus={e => e.target.style.borderColor = '#534AB7'}
        onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
    </div>
  )

  return (
    <>
      <button onClick={() => setOpen(true)} style={{
        width: '100%', padding: '11px', background: '#EEEDFE', color: '#534AB7',
        border: '1px solid #AFA9EC', borderRadius: 8, fontSize: 13, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit'
      }}>✏️ Update Name, Phone & Password</button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Account Settings</h3>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#a0aec0', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px 20px 8px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                {field('First Name', 'first_name', 'text', 'First name')}
                {field('Last Name', 'last_name', 'text', 'Last name')}
              </div>
              <div style={{ marginBottom: 14 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 }}>Email</label>
                <div style={{ padding: '10px 12px', background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, color: '#718096' }}>{user?.email}</div>
                <div style={{ fontSize: 10, color: '#a0aec0', marginTop: 3 }}>Email cannot be changed — contact support if needed</div>
              </div>
              {field('Phone Number', 'phone', 'tel', '(555) 555-5555')}
              <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 16, marginTop: 4 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#4a5568', marginBottom: 14 }}>
                  Change Password <span style={{ fontSize: 11, fontWeight: 400, color: '#a0aec0' }}>— leave blank to keep current</span>
                </div>
                {field('Current Password', 'current_password', 'password', '••••••••')}
                {field('New Password', 'new_password', 'password', 'Min 8 characters')}
                {field('Confirm New Password', 'confirm_password', 'password', '••••••••')}
              </div>
              {error && <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#c53030', marginBottom: 12 }}>⚠ {error}</div>}
              {success && <div style={{ background: '#f0fff4', border: '1px solid #9ae6b4', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#276749', marginBottom: 12 }}>✓ {success}</div>}
            </div>
            <div style={{ padding: '12px 20px 32px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 10, flexShrink: 0 }}>
              <button onClick={() => { setOpen(false); setError(''); setSuccess('') }} style={{ flex: 1, padding: '13px', border: '1px solid #e2e8f0', background: 'white', borderRadius: 10, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
              <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: '13px', background: '#534AB7', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'inherit' }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Voice Settings Modal ──────────────────────────────────────────────────────
function VoiceSettingsModal() {
  const [open, setOpen] = useState(false)
  const [voice, setVoice] = useState(localStorage.getItem('da_voice') || 'nat')
  const [testPhone, setTestPhone] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting] = useState(false)
  const [lookupStatus, setLookupStatus] = useState('')
  const [lookupResults, setLookupResults] = useState(null)
  const [looking, setLooking] = useState(false)

  const saveVoice = (v) => {
    setVoice(v)
    localStorage.setItem('da_voice', v)
  }

  const sendTestCall = async () => {
    if (!testPhone) { setTestResult({ ok: false, msg: 'Enter your phone number first' }); return }
    setTesting(true); setTestResult(null)
    try {
      await client.post('/api/voice/test-call', { test_phone: testPhone })
      setTestResult({ ok: true, msg: `✓ Test call dispatched! You should receive a call to ${testPhone} within 30 seconds.` })
    } catch (e) {
      setTestResult({ ok: false, msg: e?.response?.data?.detail || 'Failed to dispatch test call.' })
    } finally { setTesting(false) }
  }

  const runLookup = async (forceRefresh = false) => {
    setLooking(true); setLookupStatus('Looking up numbers...')
    try {
      const r = await client.post(`/api/voice/lookup-numbers?force_refresh=${forceRefresh}`)
      setLookupStatus(`${r.data.usable} of ${r.data.total} carriers have verified numbers`)
      setLookupResults(r.data.carriers)
    } catch (e) { setLookupStatus('Lookup failed') }
    finally { setLooking(false) }
  }

  const VOICES = [
    { value: 'nat',    label: 'Nat — Professional Male (US)' },
    { value: 'mason',  label: 'Mason — Confident Male (US)' },
    { value: 'josh',   label: 'Josh — Friendly Male (US)' },
    { value: 'maya',   label: 'Maya — Professional Female (US)' },
    { value: 'sophie', label: 'Sophie — Warm Female (US)' },
    { value: 'june',   label: 'June — Clear Female (US)' },
  ]

  const CONF_COLORS = {
    high:    { bg: '#f0fff4', color: '#22543d', border: '#9ae6b4' },
    medium:  { bg: '#fffbeb', color: '#7b341e', border: '#fbd38d' },
    low:     { bg: '#fff5f5', color: '#742a2a', border: '#fc8181' },
    unknown: { bg: '#f7fafc', color: '#4a5568', border: '#e2e8f0' },
  }

  return (
    <>
      <button onClick={() => setOpen(true)} style={{
        width: '100%', padding: '11px', background: '#EEEDFE', color: '#534AB7',
        border: '1px solid #AFA9EC', borderRadius: 8, fontSize: 13, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit', marginTop: 8
      }}>🎙️ Voice Agent Settings</button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>🎙️ Voice Agent Settings</h3>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#a0aec0', lineHeight: 1 }}>✕</button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

              {/* How it works */}
              <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#2c5282', lineHeight: 1.6, marginBottom: 20 }}>
                The voice agent calls as a <strong>talent representative</strong> on your behalf. It introduces itself, pitches your qualifications, asks about pay and home time, and schedules a callback or leaves a voicemail if there's no answer. Every call is recorded and automatically analyzed.
              </div>

              {/* Voice selector */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Agent Voice</label>
                <select value={voice} onChange={e => saveVoice(e.target.value)} style={{
                  width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8,
                  fontSize: 14, outline: 'none', background: 'white', fontFamily: 'inherit', color: '#2d3748'
                }}>
                  {VOICES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
                <div style={{ fontSize: 11, color: '#a0aec0', marginTop: 5 }}>Changes apply on your next dispatched call.</div>
              </div>

              {/* Info tiles */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                {[
                  { icon: '⏱', title: 'Call Length', desc: '2 minutes max — keeps calls focused and respectful of recruiter time' },
                  { icon: '📍', title: 'Voicemail', desc: 'Leaves a professional message if no answer' },
                  { icon: '🎙', title: 'Recording', desc: 'Every call is recorded for your review' },
                  { icon: '📊', title: 'Auto-Analysis', desc: 'Summary generated automatically after each call' },
                ].map(t => (
                  <div key={t.title} style={{ background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{t.icon} {t.title}</div>
                    <div style={{ fontSize: 11, color: '#718096' }}>{t.desc}</div>
                  </div>
                ))}
              </div>

              {/* Carrier number lookup */}
              <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#2d3748' }}>🔍 Carrier Recruiting Numbers</div>
                <div style={{ fontSize: 12, color: '#718096', marginBottom: 12, lineHeight: 1.6 }}>
                  Automatically look up driver recruiting phone numbers for carriers in your outreach list. Only high-confidence numbers are returned — uncertain ones are flagged for manual verification.
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                  <button onClick={() => runLookup(false)} disabled={looking} style={{
                    padding: '8px 14px', background: '#3182ce', color: 'white', border: 'none',
                    borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: looking ? 0.6 : 1
                  }}>Find recruiting numbers</button>
                  <button onClick={() => runLookup(true)} disabled={looking} style={{
                    padding: '8px 12px', background: 'white', color: '#718096',
                    border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, cursor: 'pointer', opacity: looking ? 0.6 : 1
                  }}>↺ Refresh</button>
                  {lookupStatus && <span style={{ fontSize: 12, color: '#718096' }}>{lookupStatus}</span>}
                </div>
                {lookupResults && (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr style={{ background: '#f7fafc', borderBottom: '1px solid #e2e8f0' }}>
                          {['Carrier', 'Phone', 'Confidence', 'Note'].map(h => (
                            <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600 }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(lookupResults).map(([name, data]) => {
                          const c = CONF_COLORS[data.confidence] || CONF_COLORS.unknown
                          return (
                            <tr key={name} style={{ borderBottom: '1px solid #f0f0f0' }}>
                              <td style={{ padding: '7px 10px', fontWeight: 500 }}>{name}</td>
                              <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: data.phone ? '#3182ce' : '#a0aec0' }}>{data.phone || '—'}</td>
                              <td style={{ padding: '7px 10px' }}>
                                <span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
                                  {data.confidence}
                                </span>
                              </td>
                              <td style={{ padding: '7px 10px', color: '#718096', fontSize: 11 }}>{data.note || ''}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Test call */}
              <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#2d3748' }}>🧪 Test Call</div>
                <div style={{ fontSize: 12, color: '#718096', marginBottom: 12 }}>
                  Call your own phone number to preview how the agent sounds before it contacts real recruiters.
                </div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 5 }}>Your phone number</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="+15551234567"
                    style={{ flex: 1, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
                    onFocus={e => e.target.style.borderColor = '#534AB7'}
                    onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                  <button onClick={sendTestCall} disabled={testing} style={{
                    padding: '10px 16px', background: '#3182ce', color: 'white', border: 'none',
                    borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                    whiteSpace: 'nowrap', opacity: testing ? 0.6 : 1
                  }}>{testing ? 'Calling...' : '📞 Send test call'}</button>
                </div>
                {testResult && (
                  <div style={{
                    marginTop: 10, padding: '8px 12px', borderRadius: 7, fontSize: 12,
                    background: testResult.ok ? '#f0fff4' : '#fff5f5',
                    color: testResult.ok ? '#22543d' : '#742a2a',
                    border: `1px solid ${testResult.ok ? '#9ae6b4' : '#fc8181'}`
                  }}>{testResult.msg}</div>
                )}
              </div>
            </div>

            <div style={{ padding: '12px 20px 32px', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
              <button onClick={() => setOpen(false)} style={{
                width: '100%', padding: '13px', border: '1px solid #e2e8f0', background: 'white',
                borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit'
              }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Profile View ──────────────────────────────────────────────────────────────
function ProfileView({ profile, user, onEdit, onWizard, onReset, onSignOut }) {
  const isEmpty = !profile || (!profile.setup_complete && !profile.zip_code && !profile.cdl_experience)

  if (isEmpty) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 24px', color: '#a0aec0' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: '#EEEDFE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, margin: '0 auto 20px' }}>◉</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#2d3748', marginBottom: 8 }}>No profile yet</div>
        <div style={{ fontSize: 13, marginBottom: 28, lineHeight: 1.6 }}>Complete the driver profile setup so your agent can pitch you correctly to recruiters.</div>
        <button onClick={onWizard} style={{ padding: '13px 32px', background: '#534AB7', color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', width: '100%', maxWidth: 300 }}>Set Up Profile →</button>
      </div>
    )
  }

  const chip = (label) => (
    <span key={label} style={{ padding: '4px 10px', background: '#EEEDFE', border: '1px solid #AFA9EC', borderRadius: 12, fontSize: 11, color: '#3C3489' }}>{label}</span>
  )

  const row = (label, value) => value ? (
    <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '9px 0', borderBottom: '1px solid #f7f7f7' }}>
      <span style={{ fontSize: 12, color: '#718096', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: '#2d3748', textAlign: 'right', marginLeft: 16 }}>{value}</span>
    </div>
  ) : null

  return (
    <div style={{ padding: '12px 12px 100px', background: '#f7fafc' }}>

      {/* User card */}
      <div style={{ background: 'linear-gradient(135deg, #534AB7, #26215C)', borderRadius: 14, padding: '18px 16px', marginBottom: 12, color: 'white' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, flexShrink: 0 }}>
            {(user?.first_name?.[0] || '') + (user?.last_name?.[0] || '')}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 17 }}>{user?.first_name} {user?.last_name}</div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 2 }}>{user?.email}</div>
            {profile?.cdl_experience && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{profile.cdl_experience} CDL experience</div>}
          </div>
          <button onClick={onEdit} style={{ padding: '7px 16px', background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Edit</button>
        </div>
      </div>

      <Card title="👤 Contact">
        {row('Home zip', profile.zip_code)}
        {row('Best contact time', profile.best_contact_time)}
      </Card>

      <Card title="📋 Licenses & Experience">
        {row('CDL experience', profile.cdl_experience)}
        {row('Military service', profile.military_service)}
        {profile.licenses_held?.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#a0aec0', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.4px' }}>Licenses held</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{profile.licenses_held.map(chip)}</div>
          </div>
        )}
        {profile.endorsements?.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: '#a0aec0', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.4px' }}>Endorsements</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{profile.endorsements.map(chip)}</div>
          </div>
        )}
      </Card>

      <Card title="🚛 Driver Preferences">
        {row('Driver type', profile.driver_type)}
        {row('Solo or team', profile.solo_or_team)}
        {row('Owner operator interest', profile.owner_operator_interest)}
        {profile.freight_current?.length > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 11, color: '#a0aec0', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.4px' }}>Freight hauled</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{profile.freight_current.map(chip)}</div>
          </div>
        )}
        {profile.freight_interested?.length > 0 && (
          <div>
            <div style={{ fontSize: 11, color: '#a0aec0', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.4px' }}>Freight interested in</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>{profile.freight_interested.map(chip)}</div>
          </div>
        )}
      </Card>

      <Card title="📊 Safety Record">
        {row('Moving violations (3yr)', profile.moving_violations)}
        {row('Preventable accidents (3yr)', profile.preventable_accidents)}
      </Card>

      {profile.career_goals && (
        <Card title="🎯 Career Goals">
          <div style={{ fontSize: 13, color: '#2d3748', lineHeight: 1.7 }}>{profile.career_goals}</div>
        </Card>
      )}

      {/* Account Settings */}
      <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 12, overflow: 'hidden' }}>
        <div style={{ padding: '11px 16px', borderBottom: '1px solid #f0f0f0', fontSize: 12, fontWeight: 700, color: '#4a5568', background: '#fafbfc' }}>⚙️ Account Settings</div>
        <div style={{ padding: 14 }}>
          <AccountSettingsModal user={user} />
          <VoiceSettingsModal />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
        <button onClick={onWizard} style={{ width: '100%', padding: '12px', background: 'white', color: '#534AB7', border: '1px solid #AFA9EC', borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          ↺ Re-run Setup Wizard
        </button>
        <button onClick={onReset} style={{ width: '100%', padding: '12px', background: 'white', color: '#e53e3e', border: '1px solid #fed7d7', borderRadius: 10, fontSize: 13, cursor: 'pointer' }}>
          ⚠ Reset Profile & Outreach Log
        </button>
        <button onClick={onSignOut} style={{ width: '100%', padding: '13px', background: '#f7fafc', color: '#4a5568', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>
          Sign Out
        </button>
      </div>
    </div>
  )
}

// ── Edit Form ─────────────────────────────────────────────────────────────────
function ProfileEdit({ profile, onSave, onCancel }) {
  const [form, setForm] = useState({
    zip_code: profile?.zip_code || '',
    best_contact_time: profile?.best_contact_time || '',
    cdl_experience: profile?.cdl_experience || '',
    military_service: profile?.military_service || '',
    moving_violations: profile?.moving_violations || '',
    preventable_accidents: profile?.preventable_accidents || '',
    driver_type: profile?.driver_type || '',
    solo_or_team: profile?.solo_or_team || '',
    team_interest: profile?.team_interest || '',
    owner_operator_interest: profile?.owner_operator_interest || '',
    career_goals: profile?.career_goals || '',
    licenses_held: profile?.licenses_held || [],
    licenses_obtaining: profile?.licenses_obtaining || [],
    endorsements: profile?.endorsements || [],
    freight_current: profile?.freight_current || [],
    freight_interested: profile?.freight_interested || [],
    agreed_to_terms: 'Yes, I agree to the Terms of Service & Privacy Policy.',
  })
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)

  const upd = (k, v) => { setForm(p => ({ ...p, [k]: v })); setDirty(true) }

  const handleSave = async () => {
    setSaving(true)
    const answers = Object.entries(form).map(([field, value]) => ({
      field,
      value: LIST_FIELDS.has(field) ? (Array.isArray(value) ? value.join('||') : '') : String(value || ''),
      is_list: LIST_FIELDS.has(field)
    }))
    try {
      await client.post('/api/questionnaire/submit', { answers })
      onSave()
    } catch (e) { alert('Save failed: ' + (e?.response?.data?.detail || e.message)) }
    finally { setSaving(false) }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button onClick={onCancel} style={{ background: 'none', border: 'none', fontSize: 13, color: '#718096', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}>← Cancel</button>
        <div style={{ fontWeight: 700, fontSize: 15, flex: 1 }}>Edit Profile</div>
        {dirty && <span style={{ fontSize: 11, color: '#dd6b20' }}>● Unsaved</span>}
        <button onClick={handleSave} disabled={saving} style={{ padding: '8px 18px', background: '#534AB7', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 32px', background: '#f7fafc' }}>
        <Card title="👤 Contact Information">
          <FormField label="Home Zip Code"><TextInput value={form.zip_code} onChange={v => upd('zip_code', v)} placeholder="e.g. 37122" /></FormField>
          <FormField label="Best Contact Time"><SelectInput value={form.best_contact_time} onChange={v => upd('best_contact_time', v)} options={OPTS.contactTime} /></FormField>
        </Card>
        <Card title="📋 Licenses & Experience">
          <FormField label="CDL Licenses Held"><ChipGroup options={OPTS.licenses} value={form.licenses_held} onChange={v => upd('licenses_held', v)} /></FormField>
          <FormField label="Currently Obtaining"><ChipGroup options={[...OPTS.licenses, 'None']} value={form.licenses_obtaining} onChange={v => upd('licenses_obtaining', v)} /></FormField>
          <FormField label="Years of CDL Experience"><SelectInput value={form.cdl_experience} onChange={v => upd('cdl_experience', v)} options={OPTS.experience} /></FormField>
          <FormField label="Military Driving Experience"><SelectInput value={form.military_service} onChange={v => upd('military_service', v)} options={OPTS.yesno} /></FormField>
          <FormField label="Endorsements"><ChipGroup options={OPTS.endorsements} value={form.endorsements} onChange={v => upd('endorsements', v)} /></FormField>
        </Card>
        <Card title="🚛 Driver Preferences">
          <FormField label="Driver Type Seeking"><SelectInput value={form.driver_type} onChange={v => upd('driver_type', v)} options={OPTS.driverType} /></FormField>
          <FormField label="Solo or Team"><SelectInput value={form.solo_or_team} onChange={v => upd('solo_or_team', v)} options={OPTS.soloTeam} /></FormField>
          <FormField label="Open to Team for Higher Pay"><SelectInput value={form.team_interest} onChange={v => upd('team_interest', v)} options={OPTS.yesno} /></FormField>
          <FormField label="Owner Operator Interest"><SelectInput value={form.owner_operator_interest} onChange={v => upd('owner_operator_interest', v)} options={OPTS.yesnomay} /></FormField>
          <FormField label="Freight Experience" hint="What you've hauled"><ChipGroup options={OPTS.freight} value={form.freight_current} onChange={v => upd('freight_current', v)} /></FormField>
          <FormField label="Freight Interest" hint="What you want to haul"><ChipGroup options={OPTS.freightWant} value={form.freight_interested} onChange={v => upd('freight_interested', v)} /></FormField>
        </Card>
        <Card title="📊 Safety Record">
          <FormField label="Moving Violations (last 3 years)"><SelectInput value={form.moving_violations} onChange={v => upd('moving_violations', v)} options={OPTS.yesno} /></FormField>
          <FormField label="Preventable Accidents (last 3 years)"><SelectInput value={form.preventable_accidents} onChange={v => upd('preventable_accidents', v)} options={OPTS.yesno} /></FormField>
        </Card>
        <Card title="🎯 Career Goals">
          <FormField label="Tell recruiters what you're looking for" hint="Optional — used in call scripts">
            <textarea value={form.career_goals} onChange={e => upd('career_goals', e.target.value)}
              placeholder="e.g. Looking for home weekly with at least 55 CPM, drop-and-hook preferred..."
              rows={4} style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }} />
          </FormField>
        </Card>
        <button onClick={handleSave} disabled={saving} style={{ width: '100%', padding: '14px', background: '#534AB7', color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1, boxShadow: '0 4px 14px rgba(83,74,183,0.35)', fontFamily: 'inherit' }}>
          {saving ? 'Saving...' : 'Save Profile'}
        </button>
      </div>
    </div>
  )
}

// ── Wizard ────────────────────────────────────────────────────────────────────
function Wizard({ questions, onComplete, onBack }) {
  const [step, setStep] = useState(0)
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const q = questions[step]
  const pct = Math.round((step / questions.length) * 100)
  const section = STEP_SECTIONS[step] || ''
  const answer = answers[q?.id] || ''
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
    const ans = questions.map(qu => ({ field: qu.field, value: answers[qu.id] || '', is_list: qu.type === 'multi_select' }))
    try {
      await client.post('/api/questionnaire/submit', { answers: ans })
      onComplete()
    } catch (e) {
      alert('Save failed: ' + (e?.response?.data?.detail || e.message))
      setSubmitting(false)
    }
  }

  if (!q) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '12px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <button onClick={step === 0 ? onBack : () => setStep(s => s - 1)} style={{ background: 'none', border: 'none', fontSize: 13, color: '#718096', cursor: 'pointer', padding: 0 }}>← Back</button>
          <div style={{ fontWeight: 600, fontSize: 13, flex: 1, color: '#4a5568' }}>Driver Profile Setup</div>
          <div style={{ fontSize: 12, color: '#a0aec0' }}>{step + 1} / {questions.length}</div>
        </div>
        <div style={{ height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: '#534AB7', borderRadius: 3, transition: 'width 0.35s' }} />
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 20px 20px' }}>
        <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.8px', color: '#534AB7', marginBottom: 10 }}>{section}</div>
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
      <div style={{ background: 'white', borderTop: '1px solid #e2e8f0', padding: '14px 20px 20px', flexShrink: 0 }}>
        {(q.type === 'multi_select' || !q.type || q.type === 'text') && (
          <button onClick={() => advance()} disabled={submitting} style={{
            width: '100%', padding: '14px', background: isLast ? '#38a169' : '#534AB7', color: 'white',
            border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer',
            opacity: submitting ? 0.6 : 1, fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(83,74,183,0.3)'
          }}>{submitting ? 'Saving...' : isLast ? 'Submit Profile ✓' : 'Continue →'}</button>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Profile() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()
  const [profile, setProfile] = useState(null)
  const [questions, setQuestions] = useState([])
  const [view, setView] = useState('profile')
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState('')

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const loadAll = useCallback(async () => {
    try {
      const [pr, qr] = await Promise.all([
        client.get('/api/questionnaire/profile'),
        client.get('/api/questionnaire/questions')
      ])
      setProfile(pr.data)
      setQuestions(qr.data.questions || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const handleReset = async () => {
    if (!confirm('Reset your profile and outreach log? This cannot be undone.')) return
    try {
      await client.post('/api/questionnaire/reset')
      showToast('Profile reset')
      await loadAll()
      setView('profile')
    } catch (e) { showToast('Reset failed') }
  }

  const handleSignOut = () => { logout(); navigate('/login') }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#a0aec0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
        <div>Loading profile...</div>
      </div>
    </div>
  )

  if (view === 'wizard') return (
    <Wizard questions={questions} onComplete={() => { loadAll(); setView('profile'); showToast('Profile saved! 🎉') }} onBack={() => setView('profile')} />
  )

  if (view === 'edit') return (
    <ProfileEdit profile={profile} onSave={() => { loadAll(); setView('profile'); showToast('Profile saved!') }} onCancel={() => setView('profile')} />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', background: '#f7fafc' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <ProfileView profile={profile} user={user} onEdit={() => setView('edit')} onWizard={() => setView('wizard')} onReset={handleReset} onSignOut={handleSignOut} />
      </div>
      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 20px', background: '#2d3748', color: 'white',
          borderRadius: 20, fontSize: 13, fontWeight: 500, zIndex: 1000, whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
        }}>{toast}</div>
      )}
    </div>
  )
}