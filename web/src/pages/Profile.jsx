import { useEffect, useState, useCallback, useRef } from 'react'
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
            background: on ? '#EEEDFE' : 'white', color: on ? '#3C3489' : '#4a5568',
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

function Card({ title, icon, children }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 10, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #f0f0f0', fontSize: 12, fontWeight: 700, color: '#4a5568', background: '#fafbfc', display: 'flex', alignItems: 'center', gap: 6 }}>
        {icon && <span>{icon}</span>}{title}
      </div>
      <div style={{ padding: '12px 16px' }}>{children}</div>
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

function InfoRow({ label, value, mono }) {
  if (!value) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f7f7f7' }}>
      <span style={{ fontSize: 12, color: '#718096', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: '#2d3748', textAlign: 'right', marginLeft: 12, fontFamily: mono ? 'monospace' : 'inherit' }}>{value}</span>
    </div>
  )
}

function ChipRow({ label, items }) {
  if (!items?.length) return null
  return (
    <div style={{ padding: '8px 0', borderBottom: '1px solid #f7f7f7' }}>
      <div style={{ fontSize: 12, color: '#718096', marginBottom: 6 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
        {items.map(item => (
          <span key={item} style={{ padding: '3px 9px', background: '#EEEDFE', border: '1px solid #AFA9EC', borderRadius: 10, fontSize: 11, color: '#3C3489', fontWeight: 500 }}>{item}</span>
        ))}
      </div>
    </div>
  )
}

// ── Account Settings Modal ────────────────────────────────────────────────────
function AccountSettingsModal({ user }) {
  const { setUser } = useAuthStore()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({
    first_name: user?.first_name || '', last_name: user?.last_name || '',
    phone: user?.phone || '', current_password: '', new_password: '', confirm_password: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState('')

  useEffect(() => {
    setForm(f => ({ ...f, first_name: user?.first_name || '', last_name: user?.last_name || '', phone: user?.phone || '' }))
  }, [user])

  const upd = (k, v) => setForm(p => ({ ...p, [k]: v }))

  const handleSave = async () => {
    setError(''); setSuccess(''); setSaving(true)
    try {
      await client.put('/api/auth/update-profile', {
        first_name: form.first_name.trim(), last_name: form.last_name.trim(), phone: form.phone.trim(),
      })
      setUser({ ...user, first_name: form.first_name.trim(), last_name: form.last_name.trim(), phone: form.phone.trim() })
      if (form.new_password || form.current_password) {
        if (!form.current_password) { setError('Enter your current password.'); setSaving(false); return }
        if (form.new_password !== form.confirm_password) { setError('New passwords do not match.'); setSaving(false); return }
        if (form.new_password.length < 8) { setError('New password must be at least 8 characters.'); setSaving(false); return }
        await client.put('/api/auth/change-password', { old_password: form.current_password, new_password: form.new_password })
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
        onFocus={e => e.target.style.borderColor = '#534AB7'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
    </div>
  )

  return (
    <>
      <button onClick={() => setOpen(true)} style={{
        width: '100%', padding: '10px', background: '#EEEDFE', color: '#534AB7',
        border: '1px solid #AFA9EC', borderRadius: 8, fontSize: 13, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8
      }}>✏️ <span>Edit Name, Phone & Password</span></button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Edit Account</h3>
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
                <div style={{ fontSize: 10, color: '#a0aec0', marginTop: 3 }}>Contact support to change your email</div>
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
  const [open, setOpen]             = useState(false)
  const [voice, setVoice]           = useState(localStorage.getItem('da_voice') || 'nat')
  const [testPhone, setTestPhone]   = useState('')
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting]       = useState(false)
  const [lookupStatus, setLookupStatus] = useState('')
  const [lookupResults, setLookupResults] = useState(null)
  const [looking, setLooking]       = useState(false)

  const saveVoice = (v) => { setVoice(v); localStorage.setItem('da_voice', v) }

  const sendTestCall = async () => {
    if (!testPhone) { setTestResult({ ok: false, msg: 'Enter your phone number first' }); return }
    setTesting(true); setTestResult(null)
    try {
      await client.post('/api/voice/test-call', { test_phone: testPhone })
      setTestResult({ ok: true, msg: `✓ Test call dispatched to ${testPhone}` })
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
        width: '100%', padding: '10px', background: '#f7fafc', color: '#4a5568',
        border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, marginTop: 8
      }}>🎙️ <span>Voice Agent Settings</span></button>

      {open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>🎙️ Voice Agent Settings</h3>
              <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#a0aec0', lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: 10, padding: '12px 14px', fontSize: 13, color: '#2c5282', lineHeight: 1.6, marginBottom: 20 }}>
                The voice agent calls as a <strong>talent representative</strong> on your behalf. Every call is recorded and automatically analyzed.
              </div>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Agent Voice</label>
                <select value={voice} onChange={e => saveVoice(e.target.value)} style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', background: 'white', fontFamily: 'inherit', color: '#2d3748' }}>
                  {VOICES.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
                </select>
                <div style={{ fontSize: 11, color: '#a0aec0', marginTop: 5 }}>Changes apply on your next dispatched call.</div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 20 }}>
                {[
                  { icon: '⏱', title: 'Call Length', desc: '2 min max' },
                  { icon: '📍', title: 'Voicemail', desc: 'Left if no answer' },
                  { icon: '🎙', title: 'Recording', desc: 'Every call recorded' },
                  { icon: '📊', title: 'Auto-Analysis', desc: 'Summary after each call' },
                ].map(t => (
                  <div key={t.title} style={{ background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{t.icon} {t.title}</div>
                    <div style={{ fontSize: 11, color: '#718096' }}>{t.desc}</div>
                  </div>
                ))}
              </div>
              <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8, color: '#2d3748' }}>🔍 Carrier Recruiting Numbers</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
                  <button onClick={() => runLookup(false)} disabled={looking} style={{ padding: '8px 14px', background: '#3182ce', color: 'white', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer', opacity: looking ? 0.6 : 1 }}>Find recruiting numbers</button>
                  <button onClick={() => runLookup(true)} disabled={looking} style={{ padding: '8px 12px', background: 'white', color: '#718096', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, cursor: 'pointer', opacity: looking ? 0.6 : 1 }}>↺ Refresh</button>
                  {lookupStatus && <span style={{ fontSize: 12, color: '#718096' }}>{lookupStatus}</span>}
                </div>
                {lookupResults && (
                  <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', maxHeight: 220, overflowY: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead><tr style={{ background: '#f7fafc', borderBottom: '1px solid #e2e8f0' }}>
                        {['Carrier', 'Phone', 'Confidence', 'Note'].map(h => <th key={h} style={{ padding: '7px 10px', textAlign: 'left', fontWeight: 600 }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {Object.entries(lookupResults).map(([name, data]) => {
                          const c = CONF_COLORS[data.confidence] || CONF_COLORS.unknown
                          return (
                            <tr key={name} style={{ borderBottom: '1px solid #f0f0f0' }}>
                              <td style={{ padding: '7px 10px', fontWeight: 500 }}>{name}</td>
                              <td style={{ padding: '7px 10px', fontFamily: 'monospace', color: data.phone ? '#3182ce' : '#a0aec0' }}>{data.phone || '—'}</td>
                              <td style={{ padding: '7px 10px' }}><span style={{ padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>{data.confidence}</span></td>
                              <td style={{ padding: '7px 10px', color: '#718096', fontSize: 11 }}>{data.note || ''}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6, color: '#2d3748' }}>🧪 Test Call</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input value={testPhone} onChange={e => setTestPhone(e.target.value)} placeholder="+15551234567"
                    style={{ flex: 1, padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 14, outline: 'none', fontFamily: 'inherit' }}
                    onFocus={e => e.target.style.borderColor = '#534AB7'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
                  <button onClick={sendTestCall} disabled={testing} style={{ padding: '10px 16px', background: '#3182ce', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap', opacity: testing ? 0.6 : 1 }}>
                    {testing ? 'Calling...' : '📞 Test'}
                  </button>
                </div>
                {testResult && (
                  <div style={{ marginTop: 10, padding: '8px 12px', borderRadius: 7, fontSize: 12, background: testResult.ok ? '#f0fff4' : '#fff5f5', color: testResult.ok ? '#22543d' : '#742a2a', border: `1px solid ${testResult.ok ? '#9ae6b4' : '#fc8181'}` }}>
                    {testResult.msg}
                  </div>
                )}
              </div>
            </div>
            <div style={{ padding: '12px 20px 32px', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
              <button onClick={() => setOpen(false)} style={{ width: '100%', padding: '13px', border: '1px solid #e2e8f0', background: 'white', borderRadius: 10, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Done</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Photo Capture Modal ───────────────────────────────────────────────────────
function PhotoCaptureModal({ user, onPhotoSaved }) {
  const [open, setOpen]       = useState(false)
  const [mode, setMode]       = useState('menu')
  const [photo, setPhoto]     = useState(null)
  const [aiPhoto, setAiPhoto] = useState(null)
  const [aiDesc, setAiDesc]   = useState('')
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [stream, setStream]   = useState(null)
  const videoRef  = useRef(null)
  const canvasRef = useRef(null)

  const stopCamera = () => { if (stream) { stream.getTracks().forEach(t => t.stop()); setStream(null) } }

  const startCamera = async () => {
    setError(''); setMode('camera')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } })
      setStream(s)
      setTimeout(() => { if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play() } }, 150)
    } catch (e) { setError('Camera access denied.'); setMode('menu') }
  }

  const capturePhoto = () => {
    const video = videoRef.current; const canvas = canvasRef.current
    if (!video || !canvas) return
    canvas.width = video.videoWidth; canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    setPhoto(canvas.toDataURL('image/jpeg', 0.85)); stopCamera(); setMode('preview')
  }

  const retake    = () => { setPhoto(null); setAiPhoto(null); setError(''); startCamera() }
  const handleClose = () => { stopCamera(); setMode('menu'); setPhoto(null); setAiPhoto(null); setAiDesc(''); setError(''); setOpen(false) }
  const hasPhotos = user?.profile_photo || user?.ai_photo

  const savePhoto = async () => {
    setSaving(true); setError('')
    try { await client.post('/api/auth/upload-photo', { photo }); onPhotoSaved(photo, user?.ai_photo || null); handleClose() }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to save photo.') }
    finally { setSaving(false) }
  }

  const generateAI = async () => {
    setMode('generating'); setError('')
    try { const r = await client.post('/api/auth/generate-ai-photo', { photo }); setAiPhoto(r.data.ai_photo); setAiDesc(r.data.description); setMode('result') }
    catch (e) { setError(e?.response?.data?.detail || 'AI generation failed.'); setMode('preview') }
  }

  const saveAiPhoto = async () => {
    setSaving(true); setError('')
    try { await client.post('/api/auth/upload-photo', { photo }); onPhotoSaved(photo, aiPhoto); handleClose() }
    catch (e) { setError(e?.response?.data?.detail || 'Failed to save.') }
    finally { setSaving(false) }
  }

  const deletePhotos = async () => {
    if (!confirm('Remove your profile photo and AI portrait?')) return
    try { await client.delete('/api/auth/delete-photo', { data: { which: 'both' } }); onPhotoSaved(null, null); handleClose() }
    catch (e) { setError('Failed to remove photos.') }
  }

  return (
    <>
      <button onClick={() => setOpen(true)} style={{
        width: '100%', padding: '10px', background: '#f7fafc', color: '#4a5568',
        border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontWeight: 600,
        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 8, marginTop: 8
      }}>📷 <span>{hasPhotos ? 'Update Profile Photo' : 'Add Profile Photo'}</span></button>

      {open && (
        <div onClick={handleClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 600, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 520, maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>
                {mode === 'menu' && '📷 Profile Photo'}{mode === 'camera' && '📷 Take Your Photo'}
                {mode === 'preview' && '✅ Use This Photo?'}{mode === 'generating' && '🎨 Generating...'}
                {mode === 'result' && '🎨 Your Comic Book Portrait'}
              </h3>
              <button onClick={handleClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#a0aec0' }}>✕</button>
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
              {mode === 'menu' && (
                <div>
                  {hasPhotos && (
                    <div style={{ display: 'flex', gap: 12, marginBottom: 20, justifyContent: 'center' }}>
                      {user?.profile_photo && <div style={{ textAlign: 'center' }}><div style={{ fontSize: 10, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Your Photo</div><img src={user.profile_photo} alt="Profile" style={{ width: 90, height: 90, borderRadius: '50%', objectFit: 'cover', border: '3px solid #534AB7' }} /></div>}
                      {user?.ai_photo && <div style={{ textAlign: 'center' }}><div style={{ fontSize: 10, fontWeight: 600, color: '#534AB7', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Comic Portrait</div><img src={user.ai_photo} alt="Comic Portrait" style={{ width: 90, height: 90, borderRadius: '50%', objectFit: 'cover', border: '3px solid #7F77DD' }} /></div>}
                    </div>
                  )}
                  <div style={{ background: '#EEEDFE', border: '1px solid #AFA9EC', borderRadius: 10, padding: '12px 14px', marginBottom: 20, fontSize: 13, color: '#3C3489', lineHeight: 1.7 }}>
                    Take a selfie or generate a <strong>comic book cartoon</strong> version of yourself as a truck driver using Proxie AI.
                  </div>
                  <button onClick={startCamera} style={{ width: '100%', padding: '14px', background: '#534AB7', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 10, boxShadow: '0 4px 14px rgba(83,74,183,0.3)' }}>📷 Open Camera</button>
                  {hasPhotos && <button onClick={deletePhotos} style={{ width: '100%', padding: '11px', background: 'white', color: '#e53e3e', border: '1px solid #fed7d7', borderRadius: 10, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>🗑 Remove Photos</button>}
                </div>
              )}
              {mode === 'camera' && (
                <div style={{ textAlign: 'center' }}>
                  <div style={{ background: '#000', borderRadius: 12, overflow: 'hidden', marginBottom: 16, position: 'relative', aspectRatio: '4/3' }}>
                    <video ref={videoRef} autoPlay playsInline muted style={{ width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)' }} />
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                      <div style={{ width: 150, height: 195, borderRadius: '50%', border: '3px dashed rgba(255,255,255,0.7)', boxShadow: '0 0 0 9999px rgba(0,0,0,0.4)' }} />
                    </div>
                    <div style={{ position: 'absolute', bottom: 10, width: '100%', textAlign: 'center', fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>Center your face in the oval</div>
                  </div>
                  <button onClick={capturePhoto} style={{ width: 74, height: 74, borderRadius: '50%', background: 'white', border: '5px solid #534AB7', cursor: 'pointer', fontSize: 28, boxShadow: '0 0 0 3px #534AB7, 0 4px 16px rgba(0,0,0,0.3)' }}>📸</button>
                  <canvas ref={canvasRef} style={{ display: 'none' }} />
                  <div style={{ marginTop: 12 }}><button onClick={() => { stopCamera(); setMode('menu') }} style={{ background: 'none', border: 'none', color: '#718096', fontSize: 13, cursor: 'pointer' }}>← Cancel</button></div>
                </div>
              )}
              {mode === 'preview' && photo && (
                <div style={{ textAlign: 'center' }}>
                  <img src={photo} alt="Preview" style={{ width: 200, height: 200, borderRadius: '50%', objectFit: 'cover', border: '4px solid #534AB7', display: 'block', margin: '0 auto 24px' }} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button onClick={savePhoto} disabled={saving} style={{ padding: '13px', background: '#38a169', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving...' : '✅ Use This Photo'}</button>
                    <button onClick={generateAI} style={{ padding: '13px', background: '#534AB7', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(83,74,183,0.3)' }}>🎨 Generate Comic Book Portrait</button>
                    <div style={{ fontSize: 11, color: '#a0aec0' }}>Powered by Proxie AI</div>
                    <button onClick={retake} style={{ padding: '11px', background: 'white', color: '#718096', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>↺ Retake Photo</button>
                  </div>
                </div>
              )}
              {mode === 'generating' && (
                <div style={{ textAlign: 'center', padding: '40px 20px' }}>
                  <div style={{ fontSize: 52, marginBottom: 16 }}>🎨</div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#2d3748', marginBottom: 10 }}>Creating your comic portrait...</div>
                  <div style={{ fontSize: 13, color: '#718096', lineHeight: 1.8, marginBottom: 24 }}>Proxie AI is creating your comic book truck driver character. About 20–30 seconds.</div>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: 8 }}>
                    {[0,1,2].map(i => <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: '#534AB7', animation: `proxiePulse 1.4s ${i*0.2}s ease-in-out infinite` }} />)}
                  </div>
                  <style>{`@keyframes proxiePulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}`}</style>
                </div>
              )}
              {mode === 'result' && aiPhoto && (
                <div>
                  <div style={{ display: 'flex', gap: 16, marginBottom: 20, alignItems: 'center' }}>
                    <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: 10, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>Your Photo</div><img src={photo} alt="Original" style={{ width: '100%', maxWidth: 130, height: 130, borderRadius: 10, objectFit: 'cover', border: '2px solid #e2e8f0', display: 'block', margin: '0 auto' }} /></div>
                    <div style={{ fontSize: 24, color: '#a0aec0', flexShrink: 0 }}>→</div>
                    <div style={{ flex: 1, textAlign: 'center' }}><div style={{ fontSize: 10, fontWeight: 600, color: '#534AB7', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>Comic Portrait</div><img src={aiPhoto} alt="Comic Portrait" style={{ width: '100%', maxWidth: 130, height: 130, borderRadius: 10, objectFit: 'cover', border: '3px solid #534AB7', display: 'block', margin: '0 auto' }} /></div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <button onClick={saveAiPhoto} disabled={saving} style={{ padding: '13px', background: '#534AB7', color: 'white', border: 'none', borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1, boxShadow: '0 4px 14px rgba(83,74,183,0.3)' }}>{saving ? 'Saving...' : '✅ Use Comic Portrait'}</button>
                    <button onClick={savePhoto} disabled={saving} style={{ padding: '11px', background: 'white', color: '#276749', border: '1px solid #9ae6b4', borderRadius: 10, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', opacity: saving ? 0.6 : 1 }}>Use original photo instead</button>
                    <button onClick={() => { setAiPhoto(null); setAiDesc(''); generateAI() }} style={{ padding: '11px', background: 'white', color: '#718096', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>↺ Regenerate portrait</button>
                    <button onClick={retake} style={{ padding: '9px', background: 'white', color: '#a0aec0', border: 'none', borderRadius: 10, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Take a new photo</button>
                  </div>
                </div>
              )}
              {error && <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#c53030', marginTop: 12 }}>⚠ {error}</div>}
            </div>
          </div>
        </div>
      )}
    </>
  )
}

// ── Phone Setup Flow ──────────────────────────────────────────────────────────
function PhoneSetupFlow({ user, onComplete, onFallback }) {
  const [phase, setPhase]     = useState('phone')
  const [phone, setPhone]     = useState(user?.phone || '')
  const [callId, setCallId]   = useState(null)
  const [result, setResult]   = useState(null)
  const [editProfile, setEditProfile] = useState({})
  const [editRules, setEditRules]     = useState({})
  const [error, setError]     = useState('')
  const [pollCount, setPollCount] = useState(0)
  const pollRef = useRef(null)

  const startCall = async () => {
    if (!phone || phone.length < 10) { setError('Enter a valid phone number'); return }
    setError(''); setPhase('calling')
    try {
      const r = await client.post('/api/voice/onboarding-call', { phone, voice: 'maya' })
      setCallId(r.data.call_id); setPhase('waiting')
    } catch (e) {
      setError(e?.response?.data?.detail || 'Failed to start call. Check that voice agent is configured.')
      setPhase('phone')
    }
  }

  useEffect(() => {
    if (phase !== 'waiting' || !callId) return
    setPollCount(0)
    pollRef.current = setInterval(async () => {
      setPollCount(c => c + 1)
      try {
        const r = await client.get(`/api/voice/onboarding-result/${callId}`)
        if (r.data.status === 'complete') {
          clearInterval(pollRef.current)
          setResult(r.data); setEditProfile(r.data.profile || {}); setEditRules(r.data.rules || {}); setPhase('review')
        } else if (r.data.status === 'failed') {
          clearInterval(pollRef.current)
          setError('The call could not be completed. You can try again or use the form instead.'); setPhase('phone')
        }
      } catch (e) { console.error('[poll]', e) }
    }, 4000)
    return () => clearInterval(pollRef.current)
  }, [phase, callId])

  const saveData = async () => {
    setPhase('saving')
    try {
      await client.post('/api/voice/onboarding-save', { call_id: callId, profile: editProfile, rules: editRules })
      setPhase('done'); setTimeout(() => onComplete(), 1200)
    } catch (e) { setError('Save failed: ' + (e?.response?.data?.detail || e.message)); setPhase('review') }
  }

  if (phase === 'phone') return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', background: '#f7fafc' }}>
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 20px', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 16, color: '#1a202c', marginBottom: 4 }}>📞 Update by Phone Call</div>
        <div style={{ fontSize: 12, color: '#718096' }}>We'll call you and collect your updated profile in a conversation</div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px 20px' }}>
        <div style={{ background: '#EEEDFE', border: '1px solid #AFA9EC', borderRadius: 12, padding: 16, marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#26215C', marginBottom: 8 }}>Here's how it works</div>
          {[
            { icon: '📞', text: 'We call your cell — usually within 30 seconds' },
            { icon: '💬', text: 'A friendly agent chats with you for ~5 minutes and asks about your experience, preferences, and pay requirements' },
            { icon: '✅', text: 'You review what was captured and confirm — your profile updates immediately' },
          ].map(i => (
            <div key={i.text} style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'flex-start' }}>
              <span style={{ fontSize: 18, flexShrink: 0 }}>{i.icon}</span>
              <span style={{ fontSize: 13, color: '#3C3489', lineHeight: 1.5 }}>{i.text}</span>
            </div>
          ))}
        </div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>Your cell phone number</label>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+15551234567" type="tel"
          style={{ width: '100%', padding: '14px 16px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 16, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', marginBottom: 8 }}
          onFocus={e => e.target.style.borderColor = '#534AB7'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
        <div style={{ fontSize: 11, color: '#a0aec0', marginBottom: 24 }}>Include country code, e.g. +1 for US numbers</div>
        {error && <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#c53030', marginBottom: 16 }}>⚠ {error}</div>}
        <button onClick={startCall} style={{ width: '100%', padding: '15px', background: '#534AB7', color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(83,74,183,0.35)', marginBottom: 12 }}>📞 Call Me Now</button>
        <button onClick={onFallback} style={{ width: '100%', padding: '12px', background: 'white', color: '#718096', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Fill out the form instead →</button>
      </div>
    </div>
  )

  if (phase === 'calling') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 20, animation: 'ring 1s ease-in-out infinite' }}>📞</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#1a202c', marginBottom: 8 }}>Calling {phone}...</div>
      <div style={{ fontSize: 14, color: '#718096' }}>Connecting your onboarding call. Pick up when it rings!</div>
      <style>{`@keyframes ring{0%,100%{transform:rotate(-10deg)}50%{transform:rotate(10deg)}}`}</style>
    </div>
  )

  if (phase === 'waiting') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 56, marginBottom: 20 }}>🎙️</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#1a202c', marginBottom: 8 }}>On the call with you now</div>
      <div style={{ fontSize: 14, color: '#718096', lineHeight: 1.7, marginBottom: 28 }}>
        The onboarding agent is collecting your information.<br />This page will update automatically when the call ends.
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginBottom: 32 }}>
        {[0,1,2].map(i => <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: '#534AB7', animation: `proxiePulse 1.4s ${i*0.2}s ease-in-out infinite` }} />)}
      </div>
      <div style={{ fontSize: 11, color: '#a0aec0', marginBottom: 20 }}>Checking for results... ({pollCount} checks)</div>
      <button onClick={onFallback} style={{ padding: '10px 20px', background: 'white', color: '#718096', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>Use the form instead</button>
      <style>{`@keyframes proxiePulse{0%,100%{opacity:.3;transform:scale(.8)}50%{opacity:1;transform:scale(1.2)}}`}</style>
    </div>
  )

  if (phase === 'review' && result) {
    const missing  = result.missing || []
    const captured = Object.entries(editProfile).filter(([,v]) => v && (Array.isArray(v) ? v.length > 0 : true)).length +
                     Object.entries(editRules).filter(([,v]) => v !== null && v !== undefined && v !== '' && v !== false).length

    const Field = ({ label, value }) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f7f7f7' }}>
        <span style={{ fontSize: 12, color: '#718096' }}>{label}</span>
        {value
          ? <span style={{ fontSize: 13, fontWeight: 500, color: '#2d3748', textAlign: 'right', marginLeft: 12 }}>{Array.isArray(value) ? value.join(', ') : String(value)}</span>
          : <span style={{ fontSize: 12, color: '#e53e3e', fontStyle: 'italic' }}>Not captured</span>
        }
      </div>
    )

    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 20px', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: '#1a202c', marginBottom: 4 }}>✅ Review Your Update</div>
          <div style={{ fontSize: 12, color: '#718096' }}>
            Captured <strong>{captured} fields</strong>{missing.length > 0 && <span style={{ color: '#dd6b20' }}> · {missing.length} missing</span>}
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 16px' }}>
          {result.summary && <div style={{ background: '#EEEDFE', border: '1px solid #AFA9EC', borderRadius: 10, padding: '10px 14px', marginBottom: 16, fontSize: 13, color: '#3C3489', lineHeight: 1.6 }}>{result.summary}</div>}
          {missing.length > 0 && (
            <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#92400e', marginBottom: 6 }}>⚠ Not captured — fill in after:</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {missing.map(f => <span key={f} style={{ padding: '2px 8px', background: '#fef3c7', color: '#92400e', border: '1px solid #fcd34d', borderRadius: 10, fontSize: 11 }}>{f.replace(/_/g, ' ')}</span>)}
              </div>
            </div>
          )}
          <Card title="Driver Profile" icon="👤">
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
          </Card>
          <Card title="Agent Rules" icon="⚡">
            <Field label="Minimum CPM"          value={editRules.min_cpm ? `${editRules.min_cpm}¢/mile` : null} />
            <Field label="Min Weekly Gross"     value={editRules.min_weekly_gross ? `$${Number(editRules.min_weekly_gross).toLocaleString()}/wk` : null} />
            <Field label="Home Time"            value={editRules.home_time_requirement} />
            <Field label="No-Touch Freight"     value={editRules.no_touch_freight_required ? 'Required' : null} />
            <Field label="Health Insurance"     value={editRules.requires_health_insurance ? 'Required' : null} />
            <Field label="401k"                 value={editRules.requires_401k ? 'Required' : null} />
            <Field label="Skip Forced Dispatch" value={editRules.reject_if_forced_dispatch ? 'Yes' : null} />
            <Field label="Skip Lease-Purchase"  value={editRules.reject_if_lease_purchase_only ? 'Yes' : null} />
          </Card>
          {error && <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#c53030', marginBottom: 12 }}>⚠ {error}</div>}
        </div>
        <div style={{ padding: '12px 16px 32px', background: 'white', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
          <button onClick={saveData} style={{ width: '100%', padding: '15px', background: '#534AB7', color: 'white', border: 'none', borderRadius: 12, fontSize: 15, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 4px 14px rgba(83,74,183,0.35)', marginBottom: 10 }}>✅ Confirm & Save →</button>
          {missing.length > 0 && <button onClick={onFallback} style={{ width: '100%', padding: '11px', background: 'white', color: '#534AB7', border: '1px solid #AFA9EC', borderRadius: 12, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit', marginBottom: 8 }}>Fill in missing fields with the form →</button>}
          <button onClick={() => setPhase('phone')} style={{ width: '100%', padding: '10px', background: 'white', color: '#a0aec0', border: 'none', borderRadius: 12, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>↺ Try the call again</button>
        </div>
      </div>
    )
  }

  if (phase === 'saving' || phase === 'done') return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 64, marginBottom: 20 }}>{phase === 'done' ? '🚀' : '⏳'}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#1a202c', marginBottom: 8 }}>{phase === 'done' ? 'Profile updated!' : 'Saving...'}</div>
      <div style={{ fontSize: 14, color: '#718096' }}>{phase === 'done' ? 'Your agent is using your updated profile.' : 'Just a moment...'}</div>
    </div>
  )

  return null
}

// ── Wizard Choice ─────────────────────────────────────────────────────────────
function WizardChoice({ questions, user, onComplete, onBack }) {
  const [mode, setMode] = useState('choice')

  if (mode === 'phone') return (
    <PhoneSetupFlow user={user} onComplete={onComplete} onFallback={() => setMode('form')} />
  )

  if (mode === 'form') return (
    <Wizard questions={questions} onComplete={onComplete} onBack={() => setMode('choice')} />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', background: '#f7fafc' }}>
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '14px 20px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', fontSize: 13, color: '#718096', cursor: 'pointer', padding: 0 }}>← Back</button>
          <div style={{ fontWeight: 700, fontSize: 15, color: '#1a202c' }}>Update Your Profile</div>
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 20px' }}>
        <div style={{ fontSize: 14, color: '#4a5568', fontWeight: 600, marginBottom: 20, textAlign: 'center' }}>
          How would you like to update your profile?
        </div>

        <button onClick={() => setMode('phone')} style={{
          width: '100%', padding: '20px 18px', background: 'white', border: '2px solid #534AB7',
          borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          marginBottom: 12, display: 'flex', gap: 16, alignItems: 'flex-start',
          boxShadow: '0 4px 16px rgba(83,74,183,0.12)'
        }}>
          <span style={{ fontSize: 36, flexShrink: 0 }}>📞</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#534AB7', marginBottom: 4 }}>Update by phone call</div>
            <div style={{ fontSize: 13, color: '#718096', lineHeight: 1.6 }}>
              Our agent calls you and walks through your preferences in a natural conversation. Easiest option.
            </div>
            <div style={{ display: 'inline-block', marginTop: 8, padding: '3px 10px', background: '#EEEDFE', color: '#534AB7', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>⭐ Recommended</div>
          </div>
        </button>

        <button onClick={() => setMode('form')} style={{
          width: '100%', padding: '20px 18px', background: 'white', border: '2px solid #e2e8f0',
          borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
          display: 'flex', gap: 16, alignItems: 'flex-start'
        }}>
          <span style={{ fontSize: 36, flexShrink: 0 }}>📋</span>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#2d3748', marginBottom: 4 }}>Fill out the form</div>
            <div style={{ fontSize: 13, color: '#718096', lineHeight: 1.6 }}>
              Step through all the questions and update any fields you want to change.
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}

// ── Profile View ──────────────────────────────────────────────────────────────
function ProfileView({ profile, user, photos, onPhotoSaved, onEdit, onWizard, onReset, onSignOut }) {
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

  const userWithPhotos = { ...user, profile_photo: photos.profile, ai_photo: photos.ai }
  const displayPhoto   = photos.ai || photos.profile

  return (
    <div style={{ padding: '12px 12px 100px', background: '#f7fafc' }}>

      {/* Hero card */}
      <div style={{ background: 'linear-gradient(135deg, #534AB7, #26215C)', borderRadius: 16, padding: '20px 18px', marginBottom: 12, color: 'white' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', border: '3px solid rgba(255,255,255,0.35)' }}>
            {displayPhoto
              ? <img src={displayPhoto} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div style={{ width: '100%', height: '100%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 700 }}>
                  {(user?.first_name?.[0] || '') + (user?.last_name?.[0] || '')}
                </div>
            }
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 18, lineHeight: 1.2 }}>{user?.first_name} {user?.last_name}</div>
            {profile?.cdl_experience && <div style={{ fontSize: 12, opacity: 0.75, marginTop: 3 }}>CDL Driver · {profile.cdl_experience} experience</div>}
            {profile?.licenses_held?.length > 0 && (
              <div style={{ display: 'flex', gap: 5, marginTop: 6, flexWrap: 'wrap' }}>
                {profile.licenses_held.map(l => <span key={l} style={{ padding: '2px 8px', background: 'rgba(255,255,255,0.2)', borderRadius: 10, fontSize: 10, fontWeight: 600 }}>{l}</span>)}
                {profile.endorsements?.filter(e => e !== 'None').map(e => <span key={e} style={{ padding: '2px 8px', background: 'rgba(175,169,236,0.4)', borderRadius: 10, fontSize: 10, fontWeight: 600 }}>{e.split(' ')[0]}</span>)}
              </div>
            )}
          </div>
          <button onClick={onEdit} style={{ padding: '7px 14px', background: 'rgba(255,255,255,0.15)', color: 'white', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Edit</button>
        </div>
      </div>

      {/* Contact & Account */}
      <Card title="Contact & Account" icon="👤">
        <InfoRow label="Full name"         value={`${user?.first_name || ''} ${user?.last_name || ''}`.trim()} />
        <InfoRow label="Email"             value={user?.email} mono />
        <InfoRow label="Phone"             value={user?.phone || 'Not set'} mono />
        <InfoRow label="Home zip code"     value={profile.zip_code} />
        <InfoRow label="Best contact time" value={profile.best_contact_time} />
      </Card>

      {/* CDL Qualifications */}
      <Card title="CDL Qualifications" icon="🪪">
        <InfoRow label="CDL experience"      value={profile.cdl_experience} />
        <InfoRow label="Military driving"    value={profile.military_service} />
        <ChipRow label="Licenses held"       items={profile.licenses_held} />
        <ChipRow label="Currently obtaining" items={profile.licenses_obtaining?.filter(l => l !== 'None')} />
        <ChipRow label="Endorsements"        items={profile.endorsements?.filter(e => e !== 'None')} />
      </Card>

      {/* Safety Record */}
      <Card title="Safety Record" icon="🛡️">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {[
            { label: 'Moving violations', value: profile.moving_violations, bad: profile.moving_violations === 'Yes' },
            { label: 'Prev. accidents',   value: profile.preventable_accidents, bad: profile.preventable_accidents === 'Yes' },
          ].map(s => (
            <div key={s.label} style={{ padding: '10px 12px', borderRadius: 8, background: s.bad ? '#fff5f5' : '#f0fff4', border: `1px solid ${s.bad ? '#fed7d7' : '#9ae6b4'}` }}>
              <div style={{ fontSize: 10, color: s.bad ? '#c53030' : '#276749', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4, fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: s.bad ? '#c53030' : '#276749' }}>{s.value || '—'}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 10, color: '#a0aec0', marginTop: 8 }}>Last 3 years</div>
      </Card>

      {/* Job Preferences */}
      <Card title="Job Preferences" icon="🚛">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
          {[
            { label: 'Driver type',       value: profile.driver_type },
            { label: 'Solo or team',      value: profile.solo_or_team },
            { label: 'Owner op interest', value: profile.owner_operator_interest },
            { label: 'Team for more pay', value: profile.team_interest },
          ].filter(i => i.value).map(item => (
            <div key={item.label} style={{ padding: '8px 10px', background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <div style={{ fontSize: 10, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>{item.label}</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#2d3748' }}>{item.value}</div>
            </div>
          ))}
        </div>
        <ChipRow label="Freight experience" items={profile.freight_current} />
        <ChipRow label="Freight I want"     items={profile.freight_interested} />
      </Card>

      {/* Career Goals */}
      {profile.career_goals && (
        <Card title="Career Goals" icon="🎯">
          <div style={{ fontSize: 13, color: '#2d3748', lineHeight: 1.75 }}>{profile.career_goals}</div>
        </Card>
      )}

      {/* Account Settings */}
      <Card title="Account Settings" icon="⚙️">
        <AccountSettingsModal user={user} />
        <VoiceSettingsModal />
        <PhotoCaptureModal user={userWithPhotos} onPhotoSaved={onPhotoSaved} />
      </Card>

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
    zip_code: profile?.zip_code || '', best_contact_time: profile?.best_contact_time || '',
    cdl_experience: profile?.cdl_experience || '', military_service: profile?.military_service || '',
    moving_violations: profile?.moving_violations || '', preventable_accidents: profile?.preventable_accidents || '',
    driver_type: profile?.driver_type || '', solo_or_team: profile?.solo_or_team || '',
    team_interest: profile?.team_interest || '', owner_operator_interest: profile?.owner_operator_interest || '',
    career_goals: profile?.career_goals || '', licenses_held: profile?.licenses_held || [],
    licenses_obtaining: profile?.licenses_obtaining || [], endorsements: profile?.endorsements || [],
    freight_current: profile?.freight_current || [], freight_interested: profile?.freight_interested || [],
    agreed_to_terms: 'Yes, I agree to the Terms of Service & Privacy Policy.',
  })
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty]   = useState(false)
  const upd = (k, v) => { setForm(p => ({ ...p, [k]: v })); setDirty(true) }

  const handleSave = async () => {
    setSaving(true)
    const answers = Object.entries(form).map(([field, value]) => ({
      field, value: LIST_FIELDS.has(field) ? (Array.isArray(value) ? value.join('||') : '') : String(value || ''),
      is_list: LIST_FIELDS.has(field)
    }))
    try { await client.post('/api/questionnaire/submit', { answers }); onSave() }
    catch (e) { alert('Save failed: ' + (e?.response?.data?.detail || e.message)) }
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
        <Card title="Contact Information" icon="👤">
          <FormField label="Home Zip Code"><TextInput value={form.zip_code} onChange={v => upd('zip_code', v)} placeholder="e.g. 37122" /></FormField>
          <FormField label="Best Contact Time"><SelectInput value={form.best_contact_time} onChange={v => upd('best_contact_time', v)} options={OPTS.contactTime} /></FormField>
        </Card>
        <Card title="CDL Qualifications" icon="🪪">
          <FormField label="CDL Licenses Held"><ChipGroup options={OPTS.licenses} value={form.licenses_held} onChange={v => upd('licenses_held', v)} /></FormField>
          <FormField label="Currently Obtaining"><ChipGroup options={[...OPTS.licenses, 'None']} value={form.licenses_obtaining} onChange={v => upd('licenses_obtaining', v)} /></FormField>
          <FormField label="Years of CDL Experience"><SelectInput value={form.cdl_experience} onChange={v => upd('cdl_experience', v)} options={OPTS.experience} /></FormField>
          <FormField label="Military Driving Experience"><SelectInput value={form.military_service} onChange={v => upd('military_service', v)} options={OPTS.yesno} /></FormField>
          <FormField label="Endorsements"><ChipGroup options={OPTS.endorsements} value={form.endorsements} onChange={v => upd('endorsements', v)} /></FormField>
        </Card>
        <Card title="Safety Record" icon="🛡️">
          <FormField label="Moving Violations (last 3 years)"><SelectInput value={form.moving_violations} onChange={v => upd('moving_violations', v)} options={OPTS.yesno} /></FormField>
          <FormField label="Preventable Accidents (last 3 years)"><SelectInput value={form.preventable_accidents} onChange={v => upd('preventable_accidents', v)} options={OPTS.yesno} /></FormField>
        </Card>
        <Card title="Job Preferences" icon="🚛">
          <FormField label="Driver Type Seeking"><SelectInput value={form.driver_type} onChange={v => upd('driver_type', v)} options={OPTS.driverType} /></FormField>
          <FormField label="Solo or Team"><SelectInput value={form.solo_or_team} onChange={v => upd('solo_or_team', v)} options={OPTS.soloTeam} /></FormField>
          <FormField label="Open to Team for Higher Pay"><SelectInput value={form.team_interest} onChange={v => upd('team_interest', v)} options={OPTS.yesno} /></FormField>
          <FormField label="Owner Operator Interest"><SelectInput value={form.owner_operator_interest} onChange={v => upd('owner_operator_interest', v)} options={OPTS.yesnomay} /></FormField>
          <FormField label="Freight Experience" hint="What you've hauled"><ChipGroup options={OPTS.freight} value={form.freight_current} onChange={v => upd('freight_current', v)} /></FormField>
          <FormField label="Freight Interest" hint="What you want to haul"><ChipGroup options={OPTS.freightWant} value={form.freight_interested} onChange={v => upd('freight_interested', v)} /></FormField>
        </Card>
        <Card title="Career Goals" icon="🎯">
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
  const [step, setStep]       = useState(0)
  const [answers, setAnswers] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const q        = questions[step]
  const pct      = Math.round((step / questions.length) * 100)
  const section  = STEP_SECTIONS[step] || ''
  const answer   = answers[q?.id] || ''
  const selected = answer ? answer.split('||') : []
  const isLast   = step === questions.length - 1
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
    try { await client.post('/api/questionnaire/submit', { answers: ans }); onComplete() }
    catch (e) { alert('Save failed: ' + (e?.response?.data?.detail || e.message)); setSubmitting(false) }
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
            onKeyDown={e => { if (e.key === 'Enter') advance() }} placeholder={q.placeholder || ''} autoFocus
            style={{ width: '100%', padding: '14px 16px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 16, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }}
            onFocus={e => e.target.style.borderColor = '#534AB7'} onBlur={e => e.target.style.borderColor = '#e2e8f0'} />
        )}
        {(q.type === 'single_select' || q.type === 'multi_select') && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {q.options.map(opt => {
              const on = selected.includes(opt); const single = q.type === 'single_select'
              return (
                <button key={opt} onClick={() => toggleOpt(opt, single)} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px',
                  border: `2px solid ${on ? '#534AB7' : '#e2e8f0'}`, borderRadius: 10,
                  background: on ? '#EEEDFE' : 'white', cursor: 'pointer', fontFamily: 'inherit',
                  fontSize: 14, color: on ? '#3C3489' : '#2d3748', fontWeight: on ? 600 : 400, textAlign: 'left'
                }}>
                  <div style={{ width: 22, height: 22, borderRadius: single ? '50%' : 5, flexShrink: 0, border: `2px solid ${on ? '#534AB7' : '#cbd5e0'}`, background: on ? '#534AB7' : 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, color: 'white', fontWeight: 700 }}>
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
  const [profile, setProfile]     = useState(null)
  const [questions, setQuestions] = useState([])
  const [view, setView]           = useState('profile')
  const [loading, setLoading]     = useState(true)
  const [toast, setToast]         = useState('')
  const [photos, setPhotos]       = useState({ profile: null, ai: null })

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const loadAll = useCallback(async () => {
    try {
      const [pr, qr, me] = await Promise.all([
        client.get('/api/questionnaire/profile'),
        client.get('/api/questionnaire/questions'),
        client.get('/api/auth/me'),
      ])
      setProfile(pr.data)
      setQuestions(qr.data.questions || [])
      setPhotos({ profile: me.data.profile_photo || null, ai: me.data.ai_photo || null })
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { loadAll() }, [loadAll])

  const handlePhotoSaved = (profilePhoto, aiPhoto) => {
    setPhotos({ profile: profilePhoto, ai: aiPhoto })
    showToast(aiPhoto ? '🎨 Comic portrait saved!' : '📷 Photo saved!')
  }

  const handleReset = async () => {
    if (!confirm('Reset your profile and outreach log? This cannot be undone.')) return
    try { await client.post('/api/questionnaire/reset'); showToast('Profile reset'); await loadAll(); setView('profile') }
    catch (e) { showToast('Reset failed') }
  }

  const handleSignOut = () => { logout(); navigate('/login') }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#a0aec0', fontFamily: 'Inter, system-ui, sans-serif' }}>
      <div style={{ textAlign: 'center' }}><div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div><div>Loading profile...</div></div>
    </div>
  )

  if (view === 'wizard') return (
    <WizardChoice
      questions={questions}
      user={user}
      onComplete={() => { loadAll(); setView('profile'); showToast('Profile saved! 🎉') }}
      onBack={() => setView('profile')}
    />
  )

  if (view === 'edit') return (
    <ProfileEdit profile={profile} onSave={() => { loadAll(); setView('profile'); showToast('Profile saved!') }} onCancel={() => setView('profile')} />
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', background: '#f7fafc' }}>
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <ProfileView profile={profile} user={user} photos={photos} onPhotoSaved={handlePhotoSaved}
          onEdit={() => setView('edit')} onWizard={() => setView('wizard')} onReset={handleReset} onSignOut={handleSignOut} />
      </div>
      {toast && (
        <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)', padding: '10px 20px', background: '#2d3748', color: 'white', borderRadius: 20, fontSize: 13, fontWeight: 500, zIndex: 1000, whiteSpace: 'nowrap', boxShadow: '0 4px 16px rgba(0,0,0,0.2)' }}>{toast}</div>
      )}
    </div>
  )
}