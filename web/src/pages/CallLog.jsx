import { useEffect, useState, useCallback } from 'react'
import { client } from '../store/auth'

const OUTCOME_COLORS = {
  interested:          { bg: '#f0fff4', color: '#276749', border: '#9ae6b4', label: 'Interested' },
  callback_scheduled:  { bg: '#fffbeb', color: '#92400e', border: '#fcd34d', label: 'Callback' },
  not_interested:      { bg: '#fff5f5', color: '#c53030', border: '#fed7d7', label: 'Not Interested' },
  voicemail:           { bg: '#f7fafc', color: '#718096', border: '#e2e8f0', label: 'Voicemail' },
  no_answer:           { bg: '#f7fafc', color: '#718096', border: '#e2e8f0', label: 'No Answer' },
  completed:           { bg: '#ebf8ff', color: '#2b6cb0', border: '#bee3f8', label: 'Completed' },
}

function OutcomeBadge({ outcome }) {
  if (!outcome) return <span style={{ fontSize: 11, color: '#a0aec0' }}>pending</span>
  const s = OUTCOME_COLORS[outcome] || { bg: '#f7fafc', color: '#718096', border: '#e2e8f0', label: outcome }
  return (
    <span style={{
      padding: '3px 9px', borderRadius: 10, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: 'nowrap'
    }}>{s.label || outcome.replace(/_/g, ' ')}</span>
  )
}

function fmtDuration(secs) {
  if (!secs) return '—'
  return `${Math.floor(secs / 60)}m ${secs % 60}s`
}

function fmtDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

// ── Analysis Modal ────────────────────────────────────────────────────────────
function AnalysisModal({ call, onClose }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('summary') // summary | transcript | recording

  useEffect(() => {
    const load = async () => {
      try {
        const r = await client.post(`/api/voice/call-log/${call.call_id}/analyze`)
        setData(r.data)
      } catch (e) { setData({ error: 'Could not load analysis.' }) }
      finally { setLoading(false) }
    }
    load()
  }, [call.call_id])

  const NEXT_ACTIONS = {
    interested: '📞 Call back to discuss offer details and negotiate pay.',
    callback_scheduled: '📅 Follow up at the scheduled time. Prepare questions about CPM, home time, and benefits.',
    not_interested: '❌ Mark as closed. Consider reaching out again in 90 days.',
    voicemail: '⏳ Wait 24-48 hours then follow up with another call.',
    no_answer: '⏳ Try again at a different time of day.',
    completed: '📋 Review the summary and decide on next steps.',
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: '#1a202c' }}>📞 {call.carrier_name || call.carrier || '—'}</div>
              <div style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>
                {fmtDate(call.dispatched_at)} · {fmtDuration(call.duration_seconds)}
                {call.recruiter_name && ` · ${call.recruiter_name}`}
              </div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#a0aec0', lineHeight: 1 }}>✕</button>
          </div>
          <div style={{ marginTop: 8 }}>
            <OutcomeBadge outcome={call.outcome} />
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
          {[['summary', '📊 Summary'], ['transcript', '📄 Transcript'], ['recording', '🎙 Recording']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              flex: 1, padding: '10px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 12, fontFamily: 'inherit', fontWeight: tab === id ? 600 : 400,
              color: tab === id ? '#534AB7' : '#718096',
              borderBottom: tab === id ? '2px solid #534AB7' : '2px solid transparent'
            }}>{label}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#a0aec0' }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⏳</div>
              <div style={{ fontSize: 13 }}>Fetching from Proxie AI...</div>
            </div>
          ) : data?.error ? (
            <div style={{ color: '#c53030', fontSize: 13, padding: 16, background: '#fff5f5', borderRadius: 8 }}>{data.error}</div>
          ) : tab === 'summary' ? (
            <div>
              {/* Pending state */}
              {!data?.summary && !data?.transcript && (
                <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 14, marginBottom: 16, fontSize: 13, color: '#78350f' }}>
                  ⏳ <strong>Call is still processing.</strong> Wait 1-2 minutes after the call ends and try again.
                </div>
              )}

              {/* Summary */}
              {data?.summary && (
                <div style={{ background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: '#718096', marginBottom: 8 }}>AI Summary</div>
                  <div style={{ fontSize: 13, color: '#2d3748', lineHeight: 1.7 }}>{data.summary}</div>
                </div>
              )}

              {/* Details grid */}
              {(data?.offer_cpm || data?.offer_weekly || data?.recruiter_name) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 14 }}>
                  {data.recruiter_name && (
                    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 10, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>Recruiter</div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{data.recruiter_name}</div>
                    </div>
                  )}
                  {data.offer_cpm && (
                    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 10, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>Offer CPM</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#38a169' }}>{data.offer_cpm}¢/mi</div>
                    </div>
                  )}
                  {data.offer_weekly && (
                    <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 10, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>Weekly Pay</div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: '#38a169' }}>${Number(data.offer_weekly).toLocaleString()}/wk</div>
                    </div>
                  )}
                  {data.follow_up_date && (
                    <div style={{ background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 10, color: '#92400e', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>Follow Up</div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#92400e' }}>{data.follow_up_date}</div>
                    </div>
                  )}
                </div>
              )}

              {/* Next action */}
              <div style={{ background: '#EEEDFE', border: '1px solid #AFA9EC', borderRadius: 8, padding: 14, marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: '#534AB7', marginBottom: 6 }}>Recommended Next Action</div>
                <div style={{ fontSize: 13, color: '#3C3489', lineHeight: 1.6 }}>
                  {NEXT_ACTIONS[call.outcome] || 'Follow up as appropriate based on the call outcome.'}
                </div>
              </div>

              {/* Notes */}
              {data?.outcome_notes && (
                <div style={{ background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: '#718096', marginBottom: 6 }}>Additional Notes</div>
                  <div style={{ fontSize: 13, color: '#2d3748', lineHeight: 1.6 }}>{data.outcome_notes}</div>
                </div>
              )}
            </div>
          ) : tab === 'transcript' ? (
            <div>
              {data?.transcript ? (
                <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12, color: '#2d3748', lineHeight: 1.8, background: '#1a202c', padding: 16, borderRadius: 8, color: '#e2e8f0', overflowX: 'auto' }}>
                  {data.transcript}
                </pre>
              ) : (
                <div style={{ textAlign: 'center', padding: 40, color: '#a0aec0' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>📄</div>
                  <div style={{ fontSize: 13 }}>
                    {!data?.summary ? 'Call is still processing — transcript not available yet.' : 'No transcript available for this call.'}
                  </div>
                </div>
              )}
            </div>
          ) : tab === 'recording' ? (
            <div>
              {data?.recording_url ? (
                <div>
                  <div style={{ fontSize: 12, color: '#718096', marginBottom: 12 }}>Call recording · {fmtDuration(call.duration_seconds)}</div>
                  <audio controls src={data.recording_url} style={{ width: '100%', borderRadius: 8 }} />
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: 40, color: '#a0aec0' }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>🎙</div>
                  <div style={{ fontSize: 13 }}>
                    {!data?.summary ? 'Call is still processing — recording not available yet.' : 'No recording available for this call.'}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 6 }}>Recordings typically appear 2-5 minutes after the call ends.</div>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px 24px', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
          <button onClick={onClose} style={{ width: '100%', padding: '13px', border: '1px solid #e2e8f0', background: 'white', borderRadius: 12, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function CallLog() {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(null)
  const [toast, setToast] = useState('')

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const r = await client.get('/api/voice/call-log')
      setCalls(r.data.calls || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  // Summary counts
  const counts = calls.reduce((acc, c) => {
    acc[c.outcome] = (acc[c.outcome] || 0) + 1
    return acc
  }, {})
  const totalMins = Math.round(calls.reduce((s, c) => s + (c.duration_seconds || 0), 0) / 60)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', background: '#f7fafc' }}>

      {/* Header */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '12px 16px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: calls.length > 0 ? 12 : 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1a202c' }}>Call Log</div>
            <div style={{ fontSize: 11, color: '#718096' }}>{calls.length} call{calls.length !== 1 ? 's' : ''}{totalMins > 0 ? ` · ${totalMins} min total` : ''}</div>
          </div>
          <button onClick={load} style={{ padding: '7px 14px', border: '1px solid #e2e8f0', background: 'white', borderRadius: 8, fontSize: 12, cursor: 'pointer', color: '#718096' }}>↺ Refresh</button>
        </div>

        {/* Stats strip */}
        {calls.length > 0 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto' }}>
            {[
              { label: 'Total', value: calls.length, color: '#2d3748' },
              { label: 'Interested', value: counts.interested || 0, color: '#38a169' },
              { label: 'Callback', value: counts.callback_scheduled || 0, color: '#dd6b20' },
              { label: 'No Answer', value: (counts.no_answer || 0) + (counts.voicemail || 0), color: '#718096' },
            ].map(s => (
              <div key={s.label} style={{ flexShrink: 0, padding: '5px 12px', background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 20, display: 'flex', gap: 5, alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: s.color }}>{s.value}</span>
                <span style={{ fontSize: 11, color: '#718096' }}>{s.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {loading ? (
          [1, 2, 3].map(i => <div key={i} style={{ background: 'white', borderRadius: 10, height: 80, border: '1px solid #e2e8f0' }} />)
        ) : calls.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px', color: '#a0aec0' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontWeight: 600, fontSize: 14, color: '#4a5568', marginBottom: 6 }}>No calls yet</div>
            <div style={{ fontSize: 13 }}>Dispatch a voice call from Carrier Outreach to see logs here.</div>
          </div>
        ) : calls.map((call, i) => (
          <div key={call.call_id || i} style={{ background: 'white', borderRadius: 12, border: '1px solid #e2e8f0', padding: '13px 14px', cursor: 'pointer' }}
            onClick={() => call.call_id && setSelected(call)}
            onMouseOver={e => e.currentTarget.style.borderColor = '#AFA9EC'}
            onMouseOut={e => e.currentTarget.style.borderColor = '#e2e8f0'}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              {/* Icon */}
              <div style={{ width: 38, height: 38, borderRadius: '50%', background: '#EEEDFE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
                📞
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                  <span style={{ fontWeight: 600, fontSize: 14, color: '#1a202c' }}>{call.carrier_name || call.carrier || '—'}</span>
                  <OutcomeBadge outcome={call.outcome} />
                </div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: '#718096' }}>
                  <span>{fmtDate(call.dispatched_at)}</span>
                  {call.duration_seconds > 0 && <span>⏱ {fmtDuration(call.duration_seconds)}</span>}
                  {call.recruiter_name && <span>👤 {call.recruiter_name}</span>}
                </div>
                {call.summary && (
                  <div style={{ fontSize: 12, color: '#4a5568', marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {call.summary}
                  </div>
                )}
              </div>
              {/* Chevron */}
              {call.call_id && (
                <div style={{ fontSize: 12, color: '#cbd5e0', flexShrink: 0, marginTop: 4 }}>›</div>
              )}
            </div>

            {/* Action buttons */}
            {call.call_id && (
              <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingTop: 10, borderTop: '1px solid #f0f0f0' }}
                onClick={e => e.stopPropagation()}>
                <button onClick={() => setSelected(call)} style={{
                  flex: 1, padding: '7px', background: '#EEEDFE', color: '#534AB7',
                  border: '1px solid #AFA9EC', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer'
                }}>📊 Analyze</button>
                <button onClick={() => setSelected({ ...call, _tab: 'transcript' })} style={{
                  flex: 1, padding: '7px', background: 'white', color: '#718096',
                  border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, cursor: 'pointer'
                }}>📄 Transcript</button>
                <button onClick={() => setSelected({ ...call, _tab: 'recording' })} style={{
                  flex: 1, padding: '7px', background: 'white', color: '#718096',
                  border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, cursor: 'pointer'
                }}>🎙 Recording</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Analysis modal */}
      {selected && <AnalysisModal call={selected} onClose={() => setSelected(null)} />}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 20px', background: '#2d3748', color: 'white',
          borderRadius: 20, fontSize: 13, fontWeight: 500, zIndex: 1000, whiteSpace: 'nowrap'
        }}>{toast}</div>
      )}
    </div>
  )
}