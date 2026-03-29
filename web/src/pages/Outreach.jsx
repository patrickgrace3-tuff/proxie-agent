import { useEffect, useState, useCallback } from 'react'
import { client } from '../store/auth'

const STATUS_COLORS = {
  pending:    { bg: '#71809622', color: '#718096', border: '#71809644', label: 'Pending' },
  approved:   { bg: '#3182ce22', color: '#3182ce', border: '#3182ce44', label: 'Approved' },
  contacted:  { bg: '#805ad522', color: '#805ad5', border: '#805ad544', label: 'Contacted' },
  callback:   { bg: '#dd6b2022', color: '#dd6b20', border: '#dd6b2044', label: 'Callback' },
  interested: { bg: '#38a16922', color: '#38a169', border: '#38a16944', label: 'Interested' },
  rejected:   { bg: '#e53e3e22', color: '#e53e3e', border: '#e53e3e44', label: 'Rejected' },
  hired:      { bg: '#00897b22', color: '#00897b', border: '#00897b44', label: 'Offer' },
  passed:     { bg: '#a0aec022', color: '#a0aec0', border: '#a0aec044', label: 'Passed' },
}

const STATUS_TABS = ['all', 'pending', 'approved', 'contacted', 'callback', 'interested', 'rejected', 'hired']

function StatusBadge({ status }) {
  const s = STATUS_COLORS[status] || STATUS_COLORS.pending
  return (
    <span style={{
      padding: '2px 8px', borderRadius: 10, fontSize: 10, fontWeight: 600,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap'
    }}>{s.label}</span>
  )
}

function ScoreBar({ score }) {
  const color = score >= 80 ? '#38a169' : score >= 60 ? '#dd6b20' : '#e53e3e'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 48, height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color }}>{score}</span>
    </div>
  )
}

function ActionButtons({ rec, onUpdate, onCall, onFmcsa, onDelete }) {
  const pill = (label, onClick, bg, color, border = 'transparent') => (
    <button onClick={onClick} style={{
      padding: '6px 10px', borderRadius: 7, fontSize: 12, cursor: 'pointer',
      border: `1px solid ${border}`, background: bg, color,
      fontFamily: 'inherit', fontWeight: 500, whiteSpace: 'nowrap', flex: 1
    }}>{label}</button>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {rec.status === 'pending' && (
        <div style={{ display: 'flex', gap: 6 }}>
          {pill('✓ Approve', () => onUpdate(rec.id, 'approved'), '#3182ce', 'white')}
          {pill('Skip', () => onUpdate(rec.id, 'passed'), 'white', '#718096', '#e2e8f0')}
        </div>
      )}
      {rec.status === 'approved' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => onCall(rec)} style={{
            flex: 1, padding: '6px 10px',
            background: rec.recruiter_phone ? '#38a169' : '#e2e8f0',
            color: rec.recruiter_phone ? 'white' : '#a0aec0',
            border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer'
          }}>📞 Call Recruiter</button>
          {pill('✓ Contacted', () => onUpdate(rec.id, 'contacted'), 'white', '#718096', '#e2e8f0')}
        </div>
      )}
      {rec.status === 'contacted' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {pill('👍 Interested', () => onUpdate(rec.id, 'interested'), '#f0fff4', '#276749', '#9ae6b4')}
          {pill('🕐 Callback', () => onUpdate(rec.id, 'callback'), '#fffbeb', '#92400e', '#fcd34d')}
          {pill('✕ Pass', () => onUpdate(rec.id, 'rejected'), 'white', '#e53e3e', '#fed7d7')}
        </div>
      )}
      {rec.status === 'callback' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => onCall(rec)} style={{
            flex: 1, padding: '6px 10px', background: '#dd6b20', color: 'white',
            border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer'
          }}>📞 Call Back</button>
          {pill('👍', () => onUpdate(rec.id, 'interested'), 'white', '#276749', '#9ae6b4')}
          {pill('✕', () => onUpdate(rec.id, 'rejected'), 'white', '#e53e3e', '#fed7d7')}
        </div>
      )}
      {rec.status === 'interested' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => onUpdate(rec.id, 'hired')} style={{
            flex: 1, padding: '6px 10px', background: '#38a169', color: 'white',
            border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer'
          }}>🎉 Got Offer!</button>
          <button onClick={() => onCall(rec)} style={{
            padding: '6px 10px', background: 'white', color: '#276749',
            border: '1px solid #9ae6b4', borderRadius: 7, fontSize: 12, cursor: 'pointer'
          }}>📞</button>
        </div>
      )}
      {rec.status === 'hired' && (
        <div style={{ padding: '8px', background: '#e6fffa', color: '#00897b', border: '1px solid #81e6d9', borderRadius: 7, fontSize: 12, fontWeight: 700, textAlign: 'center' }}>
          🎉 Offer Received
        </div>
      )}
      {rec.status === 'rejected' && (
        <div style={{ display: 'flex', gap: 6 }}>
          <div style={{ flex: 1, padding: '6px', background: '#fff5f5', color: '#c53030', border: '1px solid #fed7d7', borderRadius: 7, fontSize: 12, textAlign: 'center' }}>Not a fit</div>
          {pill('↺ Reconsider', () => onUpdate(rec.id, 'approved'), 'white', '#718096', '#e2e8f0')}
        </div>
      )}
      {rec.status === 'passed' && pill('↺ Reconsider', () => onUpdate(rec.id, 'pending'), 'white', '#718096', '#e2e8f0')}

      <div style={{ display: 'flex', gap: 6, paddingTop: 4, borderTop: '1px solid #f0f0f0' }}>
        <button onClick={() => onFmcsa(rec.id, rec.carrier_name)} style={{
          padding: '4px 10px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
          background: rec.fmcsa_data ? '#f0fff4' : '#faf5ff',
          color: rec.fmcsa_data ? '#276749' : '#805ad5',
          border: `1px solid ${rec.fmcsa_data ? '#9ae6b4' : '#d6bcfa'}`
        }}>🛡 FMCSA{rec.fmcsa_data ? ' ✓' : ''}</button>
        <button onClick={() => onDelete(rec.id, rec.carrier_name)} style={{
          marginLeft: 'auto', padding: '4px 10px', background: 'white', color: '#e53e3e',
          border: '1px solid #fed7d7', borderRadius: 5, fontSize: 11, cursor: 'pointer'
        }}>🗑 Remove</button>
      </div>
    </div>
  )
}

function CallModal({ rec, onClose, onDispatched }) {
  const [phone, setPhone] = useState(rec?.recruiter_phone || '')
  const [name, setName] = useState(rec?.recruiter_name || '')
  const [loading, setLoading] = useState(false)

  const dispatch = async () => {
    if (!phone) { alert('Phone number required'); return }
    setLoading(true)
    try {
      await client.post('/api/voice/dispatch', {
        outreach_record_id: rec.id, recruiter_phone: phone, recruiter_name: name,
        voice: localStorage.getItem('da_voice') || 'nat', max_duration: 120,
      })
      onDispatched(); onClose()
    } catch (e) { alert('Dispatch failed: ' + (e?.response?.data?.detail || e.message)) }
    finally { setLoading(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 500, padding: '20px 20px 32px', boxShadow: '0 -8px 40px rgba(0,0,0,0.2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700 }}>📞 Call {rec.carrier_name}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#a0aec0' }}>✕</button>
        </div>
        <div style={{ background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#92400e', marginBottom: 16 }}>
          Voice agent will call on your behalf — up to 2 minutes.
        </div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#718096', marginBottom: 6 }}>Recruiter phone *</label>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+15551234567"
          style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 15, outline: 'none', marginBottom: 12, fontFamily: 'inherit', boxSizing: 'border-box' }} />
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#718096', marginBottom: 6 }}>Recruiter name (optional)</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sarah Johnson"
          style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 15, outline: 'none', marginBottom: 20, fontFamily: 'inherit', boxSizing: 'border-box' }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onClose} style={{ flex: 1, padding: '14px', border: '1px solid #e2e8f0', background: 'white', borderRadius: 12, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={dispatch} disabled={loading} style={{
            flex: 2, padding: '14px', background: '#3182ce', color: 'white', border: 'none',
            borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: loading ? 0.6 : 1, fontFamily: 'inherit'
          }}>{loading ? 'Dispatching...' : '📞 Dispatch Call'}</button>
        </div>
      </div>
    </div>
  )
}

export default function Outreach() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')
  const [search, setSearch] = useState('')
  const [callRec, setCallRec] = useState(null)
  const [toast, setToast] = useState('')
  const [expanded, setExpanded] = useState(null)

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await client.get('/api/carriers/outreach-log')
      setRecords(r.data.records || r.data || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const updateStatus = async (id, status) => {
    try {
      await client.post('/api/carriers/update-status', { record_id: id, status })
      showToast(`Status updated`)
      load()
    } catch (e) { showToast('Update failed') }
  }

  const deleteRecord = async (id, name) => {
    if (!confirm(`Remove "${name}"?`)) return
    try {
      await client.delete(`/api/carriers/outreach-record/${id}`)
      setRecords(prev => prev.filter(r => r.id !== id))
      showToast('Removed')
    } catch (e) { showToast('Delete failed') }
  }

  const fmcsaCheck = async (id, name) => {
    showToast(`Checking FMCSA for ${name}...`)
    try {
      await client.post(`/api/fmcsa/enrich/${id}`)
      showToast('FMCSA complete')
      load()
    } catch (e) { showToast('FMCSA failed') }
  }

  const counts = records.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc }, {})

  const filtered = records.filter(r => {
    if (activeTab !== 'all' && r.status !== activeTab) return false
    if (search) {
      const q = search.toLowerCase()
      return (r.carrier_name || '').toLowerCase().includes(q) ||
        (r.job_title || '').toLowerCase().includes(q) ||
        (r.location || '').toLowerCase().includes(q)
    }
    return true
  })

  const cleanLoc = (loc) => {
    if (!loc) return null
    const m = loc.match(/([A-Z][a-z]{2,}(?:\s[A-Z][a-z]+)*),\s*([A-Z]{2})\b/)
    return m ? `${m[1]}, ${m[2]}` : loc
  }

  const tabLabels = { all: 'All', pending: 'Pending', approved: 'Approved', contacted: 'Contacted', callback: 'Callback', interested: 'Interested', rejected: 'Rejected', hired: 'Offers' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', background: '#f7fafc' }}>

      {/* Stats */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '10px 14px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', flex: 1, gap: 0 }}>
          {[
            { label: 'Total', value: records.length, color: '#2d3748' },
            { label: 'Pending', value: counts.pending || 0, color: '#dd6b20' },
            { label: 'Active', value: (counts.contacted || 0) + (counts.callback || 0), color: '#805ad5' },
            { label: 'Hot', value: counts.interested || 0, color: '#38a169' },
            { label: 'Offers', value: counts.hired || 0, color: '#00897b' },
          ].map((s, i) => (
            <div key={s.label} style={{ flex: 1, textAlign: 'center', borderRight: i < 4 ? '1px solid #f0f0f0' : 'none' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color, lineHeight: 1.2 }}>{s.value}</div>
              <div style={{ fontSize: 9, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '.3px' }}>{s.label}</div>
            </div>
          ))}
        </div>
        <button onClick={load} style={{ marginLeft: 12, padding: '6px 10px', border: '1px solid #e2e8f0', background: 'white', borderRadius: 6, fontSize: 14, cursor: 'pointer', color: '#718096', flexShrink: 0 }}>↺</button>
      </div>

      {/* Tabs */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', display: 'flex', overflowX: 'auto', flexShrink: 0 }}>
        {STATUS_TABS.map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '9px 12px', border: 'none', background: 'none', fontSize: 12, cursor: 'pointer',
            fontFamily: 'inherit', flexShrink: 0, whiteSpace: 'nowrap',
            color: activeTab === tab ? '#3182ce' : '#718096',
            borderBottom: activeTab === tab ? '2px solid #3182ce' : '2px solid transparent',
            fontWeight: activeTab === tab ? 600 : 400,
          }}>
            {tabLabels[tab]}
            {tab !== 'all' && counts[tab] ? <span style={{ marginLeft: 4, fontSize: 10, background: activeTab === tab ? '#ebf8ff' : '#edf2f7', color: activeTab === tab ? '#3182ce' : '#718096', padding: '1px 5px', borderRadius: 8 }}>{counts[tab]}</span> : ''}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '8px 12px', background: '#f7fafc', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search carriers..."
          style={{ width: '100%', padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, outline: 'none', background: 'white', boxSizing: 'border-box', fontFamily: 'inherit' }} />
      </div>

      {/* Card list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 12px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          [1, 2, 3].map(i => <div key={i} style={{ background: 'white', borderRadius: 10, height: 90, border: '1px solid #e2e8f0' }} />)
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#a0aec0' }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, color: '#4a5568' }}>
              {activeTab === 'all' ? 'No outreach yet' : `No ${tabLabels[activeTab].toLowerCase()} records`}
            </div>
            <div style={{ fontSize: 12 }}>
              {activeTab === 'all' ? 'Go to Carriers to find and add jobs.' : 'Try a different tab.'}
            </div>
          </div>
        ) : filtered.map(rec => {
          const isExp = expanded === rec.id
          return (
            <div key={rec.id} style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              {/* Summary row */}
              <div onClick={() => setExpanded(isExp ? null : rec.id)}
                style={{ padding: '12px 14px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, fontSize: 14, color: '#1a202c' }}>{rec.carrier_name}</span>
                    <StatusBadge status={rec.status} />
                  </div>
                  {rec.job_title && <div style={{ fontSize: 12, color: '#718096', marginBottom: 4 }}>{rec.job_title}</div>}
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {cleanLoc(rec.location) && <span style={{ fontSize: 11, color: '#4a5568' }}>📍 {cleanLoc(rec.location)}</span>}
                    {rec.weekly_pay_estimate && <span style={{ fontSize: 11, fontWeight: 700, color: '#2d3748' }}>${Number(rec.weekly_pay_estimate).toLocaleString()}/wk</span>}
                    {rec.cpm && !rec.weekly_pay_estimate && <span style={{ fontSize: 11, color: '#718096' }}>{rec.cpm}¢/mi</span>}
                    {rec.home_time && <span style={{ fontSize: 11, color: '#718096' }}>🏠 {rec.home_time}</span>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, flexShrink: 0 }}>
                  <ScoreBar score={rec.match_score || 0} />
                  <span style={{ fontSize: 10, color: '#cbd5e0' }}>{isExp ? '▲ less' : '▼ actions'}</span>
                </div>
              </div>

              {/* Actions */}
              {isExp && (
                <div style={{ borderTop: '1px solid #f0f0f0', padding: '12px 14px', background: '#fafbfc' }}>
                  {rec.recruiter_phone && (
                    <div style={{ fontSize: 12, color: '#3182ce', fontFamily: 'monospace', marginBottom: 8 }}>
                      📞 {rec.recruiter_phone}
                      {rec.recruiter_name && <span style={{ color: '#718096', fontFamily: 'inherit' }}> · {rec.recruiter_name}</span>}
                    </div>
                  )}
                  {!rec.recruiter_phone && <div style={{ fontSize: 11, color: '#e53e3e', marginBottom: 8 }}>⚠ No phone on file — add one before calling</div>}
                  {rec.job_url && <a href={rec.job_url} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: '#3182ce', display: 'block', marginBottom: 10, textDecoration: 'none' }}>View job posting ↗</a>}
                  <ActionButtons
                    rec={rec}
                    onUpdate={(id, status) => { updateStatus(id, status); setExpanded(null) }}
                    onCall={r => { setCallRec(r); setExpanded(null) }}
                    onFmcsa={fmcsaCheck}
                    onDelete={(id, name) => { deleteRecord(id, name); setExpanded(null) }}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div style={{ background: 'white', borderTop: '1px solid #e2e8f0', padding: '6px 16px', fontSize: 11, color: '#a0aec0', flexShrink: 0 }}>
        {filtered.length} record{filtered.length !== 1 ? 's' : ''}
      </div>

      {callRec && <CallModal rec={callRec} onClose={() => setCallRec(null)} onDispatched={() => { load(); showToast('Call dispatched!') }} />}

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