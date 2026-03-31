import { client } from '../store/auth'
import { useEffect, useState, useCallback } from 'react'

const STATUS_COLORS = {
  pending:    { bg: '#71809622', color: '#718096', border: '#71809644', label: 'Pending' },
  approved:   { bg: '#3182ce22', color: '#3182ce', border: '#3182ce44', label: 'Approved' },
  contacted:  { bg: '#805ad522', color: '#805ad5', border: '#805ad544', label: 'Contacted' },
  callback:   { bg: '#dd6b2022', color: '#dd6b20', border: '#dd6b2044', label: 'Callback' },
  interested: { bg: '#38a16922', color: '#38a169', border: '#38a16944', label: 'Interested' },
  scheduled:  { bg: '#534AB722', color: '#534AB7', border: '#534AB744', label: 'Scheduled' },
  rejected:   { bg: '#e53e3e22', color: '#e53e3e', border: '#e53e3e44', label: 'Rejected' },
  hired:      { bg: '#00897b22', color: '#00897b', border: '#00897b44', label: 'Offer' },
  passed:     { bg: '#a0aec022', color: '#a0aec0', border: '#a0aec044', label: 'Passed' },
}

const STATUS_TABS = ['all', 'pending', 'approved', 'contacted', 'callback', 'interested', 'scheduled', 'rejected', 'hired']

const SAFETY_STATUS = {
  OK:      { bg: '#f0fff4', color: '#276749', border: '#9ae6b4', icon: '✅', label: 'Safety Rating OK' },
  WARNING: { bg: '#fffbeb', color: '#92400e', border: '#fcd34d', icon: '⚠️', label: 'Conditional — Review Carefully' },
  UNSAFE:  { bg: '#fff5f5', color: '#c53030', border: '#fed7d7', icon: '🚫', label: 'UNSAFE — Do Not Contact' },
  UNKNOWN: { bg: '#f7fafc', color: '#718096', border: '#e2e8f0', icon: '🛡', label: 'Not Officially Rated' },
}

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
      <div style={{ width: 44, height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color, minWidth: 22 }}>{score}</span>
    </div>
  )
}

// ── Meeting time helpers ──────────────────────────────────────────────────────
// Read the correct local time from meeting_notes text first (avoids UTC timezone shift).
// Notes written by Claude contain e.g. "Meeting scheduled: Wednesday, April 1 at 11:00 AM"
// which is always the correct local time — unlike scheduled_at which is stored as UTC.

function extractMeetingDisplay(scheduledAt, meetingNotes) {
  if (meetingNotes) {
    const match = meetingNotes.match(/Meeting scheduled:\s*(.+?)(?:\n|$)/i)
    if (match) return match[1].trim()
  }
  if (scheduledAt) {
    try {
      const d = new Date(scheduledAt)
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
        ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    } catch { return 'Meeting scheduled' }
  }
  return null
}

function buildCalendarLink(scheduledAt, meetingNotes) {
  if (!scheduledAt) return null
  try {
    const start = new Date(scheduledAt)
    const end   = new Date(start.getTime() + 60 * 60 * 1000)
    const fmt   = (d) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
    const params = new URLSearchParams({
      action:  'TEMPLATE',
      text:    'Recruiter Call — ProxieAgent',
      dates:   `${fmt(start)}/${fmt(end)}`,
      details: meetingNotes || 'Meeting scheduled by Proxie Agent',
    })
    return `https://calendar.google.com/calendar/render?${params}`
  } catch { return null }
}

// ── Meeting Badge ─────────────────────────────────────────────────────────────
function MeetingBadge({ scheduledAt, meetingNotes }) {
  if (!scheduledAt && !meetingNotes) return null

  const displayTime  = extractMeetingDisplay(scheduledAt, meetingNotes)
  const calendarLink = buildCalendarLink(scheduledAt, meetingNotes)
  const notesBody    = meetingNotes
    ? meetingNotes.replace(/^Meeting scheduled:.*(\n|$)/i, '').trim()
    : ''

  return (
    <div style={{ background: '#EEEDFE', border: '1px solid #AFA9EC', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#534AB7', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>
            📅 Meeting Scheduled
          </div>
          {displayTime && (
            <div style={{ fontSize: 14, fontWeight: 700, color: '#26215C' }}>{displayTime}</div>
          )}
          {notesBody && (
            <div style={{ fontSize: 11, color: '#534AB7', marginTop: 3, lineHeight: 1.5 }}>{notesBody}</div>
          )}
        </div>
        {calendarLink && (
          <a href={calendarLink} target="_blank" rel="noreferrer" style={{
            padding: '6px 10px', background: '#534AB7', color: 'white',
            borderRadius: 7, fontSize: 11, fontWeight: 600, textDecoration: 'none',
            whiteSpace: 'nowrap', flexShrink: 0
          }}>+ Calendar</a>
        )}
      </div>
    </div>
  )
}

// ── Schedule Modal ────────────────────────────────────────────────────────────
function ScheduleModal({ rec, onClose, onSaved }) {
  const [datetime, setDatetime] = useState(
    rec.scheduled_at ? new Date(rec.scheduled_at).toISOString().slice(0, 16) : ''
  )
  const [notes, setNotes] = useState(rec.meeting_notes || '')
  const [saving, setSaving] = useState(false)

  const save = async () => {
    setSaving(true)
    try {
      await client.post(`/api/voice/schedule/${rec.id}`, {
        scheduled_at: datetime ? new Date(datetime).toISOString() : null,
        meeting_notes: notes,
      })
      onSaved()
      onClose()
    } catch (e) {
      alert('Failed to save: ' + (e?.response?.data?.detail || e.message))
    } finally { setSaving(false) }
  }

  const clear = async () => {
    if (!confirm('Clear this scheduled meeting?')) return
    setSaving(true)
    try {
      await client.delete(`/api/voice/schedule/${rec.id}`)
      onSaved()
      onClose()
    } catch (e) {
      alert('Failed: ' + (e?.response?.data?.detail || e.message))
    } finally { setSaving(false) }
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 500, padding: '20px 20px 40px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>📅 Schedule Meeting</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#a0aec0' }}>✕</button>
        </div>
        <div style={{ fontSize: 12, color: '#718096', marginBottom: 16 }}>
          Set the date and time agreed on with the recruiter at <strong>{rec.carrier_name}</strong>.
        </div>
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#718096', marginBottom: 6 }}>Date & Time</label>
        <input
          type="datetime-local"
          value={datetime}
          onChange={e => setDatetime(e.target.value)}
          style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 14, outline: 'none', marginBottom: 14, fontFamily: 'inherit', boxSizing: 'border-box' }}
        />
        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#718096', marginBottom: 6 }}>Notes (optional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="e.g. Confirm with Sarah at ext 204, call their main line first"
          rows={3}
          style={{ width: '100%', padding: '12px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, outline: 'none', marginBottom: 20, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 10 }}>
          {rec.scheduled_at && (
            <button onClick={clear} disabled={saving} style={{
              padding: '13px 14px', background: 'white', color: '#e53e3e',
              border: '1px solid #fed7d7', borderRadius: 12, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit'
            }}>Clear</button>
          )}
          <button onClick={onClose} style={{ flex: 1, padding: '13px', border: '1px solid #e2e8f0', background: 'white', borderRadius: 12, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={save} disabled={saving} style={{
            flex: 2, padding: '13px', background: '#534AB7', color: 'white', border: 'none',
            borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1, fontFamily: 'inherit',
            boxShadow: '0 4px 14px rgba(83,74,183,0.3)'
          }}>{saving ? 'Saving...' : '📅 Save Meeting'}</button>
        </div>
      </div>
    </div>
  )
}

// ── FMCSA Bottom Sheet ────────────────────────────────────────────────────────
function FmcsaSheet({ data, carrierName, onClose }) {
  const ss = SAFETY_STATUS[data?.safety_status] || SAFETY_STATUS.UNKNOWN

  const stat = (label, value, flag) => value != null && (
    <div style={{ background: flag ? '#fff5f5' : '#f7fafc', border: `1px solid ${flag ? '#fed7d7' : '#e2e8f0'}`, borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 10, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: flag ? '#c53030' : '#2d3748' }}>{value}</div>
    </div>
  )

  const row = (label, value) => value != null && value !== '' && (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f7f7f7', fontSize: 13 }}>
      <span style={{ color: '#718096' }}>{label}</span>
      <span style={{ fontWeight: 500, color: '#2d3748', textAlign: 'right', marginLeft: 12 }}>{value}</span>
    </div>
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 17, color: '#1a202c' }}>{data?.legal_name || carrierName}</div>
              {data?.dot_number && <div style={{ fontSize: 12, color: '#718096', marginTop: 2 }}>DOT# {data.dot_number}{data.mc_number ? ` · MC# ${data.mc_number}` : ''}</div>}
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#a0aec0', lineHeight: 1, padding: 0 }}>✕</button>
          </div>
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: ss.bg, border: `1px solid ${ss.border}`, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 22 }}>{ss.icon}</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 13, color: ss.color }}>{ss.label}</div>
              <div style={{ fontSize: 11, color: ss.color, opacity: 0.8, marginTop: 1 }}>
                Rating: {data?.safety_rating || 'Not Rated'}
                {data?.allowed_to_operate === false ? ' · ⛔ NOT authorized to operate' : ''}
                {data?.out_of_service ? ' · 🚫 OUT OF SERVICE' : ''}
              </div>
            </div>
          </div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
            {stat('Drivers', data?.total_drivers ?? data?.fleet_drivers)}
            {stat('Power Units', data?.power_units)}
            {stat('Fatal Crashes', data?.crashes_fatal, data?.crashes_fatal > 0)}
            {stat('Injury Crashes', data?.crashes_injury, data?.crashes_injury > 5)}
          </div>
          {(data?.driver_oos_rate != null || data?.vehicle_oos_rate != null) && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: '#718096', marginBottom: 8 }}>Out-of-Service Rates</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                {stat('Driver OOS', data?.driver_oos_rate != null ? `${Number(data.driver_oos_rate).toFixed(1)}%` : null, data?.driver_oos_rate > 10)}
                {stat('Vehicle OOS', data?.vehicle_oos_rate != null ? `${Number(data.vehicle_oos_rate).toFixed(1)}%` : null, data?.vehicle_oos_rate > 30)}
                {stat('Hazmat OOS', data?.hazmat_oos_rate != null ? `${Number(data.hazmat_oos_rate).toFixed(1)}%` : null)}
              </div>
              <div style={{ fontSize: 10, color: '#a0aec0', marginTop: 6 }}>National avg: Driver 5.5% · Vehicle 20.8%</div>
            </div>
          )}
          {(data?.common_authority || data?.contract_authority) && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: '#718096', marginBottom: 8 }}>Operating Authority</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[
                  { label: 'Common',   value: data?.common_authority },
                  { label: 'Contract', value: data?.contract_authority },
                  { label: 'Broker',   value: data?.broker_authority },
                ].filter(a => a.value).map(a => (
                  <span key={a.label} style={{
                    padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    background: a.value === 'ACTIVE' ? '#f0fff4' : '#fff5f5',
                    color: a.value === 'ACTIVE' ? '#276749' : '#c53030',
                    border: `1px solid ${a.value === 'ACTIVE' ? '#9ae6b4' : '#fed7d7'}`
                  }}>{a.label}: {a.value}</span>
                ))}
              </div>
            </div>
          )}
          {(data?.cargo_carried?.length > 0 || data?.operation_classes?.length > 0) && (
            <div style={{ marginBottom: 16 }}>
              {data?.operation_classes?.length > 0 && (<>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: '#718096', marginBottom: 6 }}>Operation Type</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 12 }}>
                  {data.operation_classes.map(o => <span key={o} style={{ padding: '3px 9px', background: '#EEEDFE', color: '#3C3489', border: '1px solid #AFA9EC', borderRadius: 12, fontSize: 11 }}>{o}</span>)}
                </div>
              </>)}
              {data?.cargo_carried?.length > 0 && (<>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: '#718096', marginBottom: 6 }}>Cargo Carried</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {data.cargo_carried.map(c => <span key={c} style={{ padding: '3px 9px', background: '#f7fafc', color: '#4a5568', border: '1px solid #e2e8f0', borderRadius: 12, fontSize: 11 }}>{c}</span>)}
                </div>
              </>)}
            </div>
          )}
          {data?.warnings?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: '#e53e3e', marginBottom: 8 }}>⚠ Flags & Warnings</div>
              {data.warnings.map((w, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, padding: '8px 10px', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 6, marginBottom: 6, fontSize: 12, color: '#744210', lineHeight: 1.5 }}>
                  <span style={{ flexShrink: 0 }}>⚠️</span><span>{w}</span>
                </div>
              ))}
            </div>
          )}
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: '#718096', marginBottom: 8 }}>Details</div>
          {row('Address', data?.address)}
          {row('Phone', data?.phone)}
          {row('Email', data?.email)}
          {row('Crash total (24mo)', data?.crash_total != null ? `${data.crash_total} crashes` : null)}
          {row('Complaint count', data?.complaint_count > 0 ? data.complaint_count : null)}
          {data?.dot_number && (
            <a href="https://safer.fmcsa.dot.gov/CompanySnapshot.aspx" target="_blank" rel="noreferrer"
              style={{ display: 'block', marginTop: 14, textAlign: 'center', fontSize: 12, color: '#3182ce', textDecoration: 'none' }}>
              View full record on FMCSA SAFER ↗
            </a>
          )}
        </div>
        <div style={{ padding: '12px 20px 28px', borderTop: '1px solid #e2e8f0', flexShrink: 0 }}>
          <button onClick={onClose} style={{ width: '100%', padding: '13px', border: '1px solid #e2e8f0', background: 'white', borderRadius: 12, fontSize: 14, fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>Close</button>
        </div>
      </div>
    </div>
  )
}

// ── Action Buttons ────────────────────────────────────────────────────────────
function ActionButtons({ rec, onUpdate, onCall, onFmcsa, onViewFmcsa, onDelete, onSchedule }) {
  const pill = (label, onClick, bg, color, border = 'transparent') => (
    <button onClick={onClick} style={{
      padding: '9px 10px', borderRadius: 8, fontSize: 13, cursor: 'pointer',
      border: `1px solid ${border}`, background: bg, color,
      fontFamily: 'inherit', fontWeight: 500, whiteSpace: 'nowrap', flex: 1, minHeight: 40
    }}>{label}</button>
  )

  const dialBtn = (label = '📞 Call Directly') => (
    rec.recruiter_phone
      ? <a href={`tel:${rec.recruiter_phone}`} style={{
          flex: 1, padding: '9px 10px', minHeight: 40,
          background: '#2d3748', color: 'white', border: 'none',
          borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer',
          textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5
        }}>{label}</a>
      : <button disabled style={{
          flex: 1, padding: '9px 10px', minHeight: 40, background: '#e2e8f0',
          color: '#a0aec0', border: 'none', borderRadius: 8, fontSize: 13, cursor: 'not-allowed'
        }}>No phone on file</button>
  )

  const hasFmcsa = !!rec.fmcsa_data

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>

      {rec.status === 'pending' && (
        <div style={{ display: 'flex', gap: 8 }}>
          {pill('✓ Approve', () => onUpdate(rec.id, 'approved'), '#3182ce', 'white')}
          {pill('Skip', () => onUpdate(rec.id, 'passed'), 'white', '#718096', '#e2e8f0')}
        </div>
      )}

      {rec.status === 'approved' && (
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => onCall(rec)} style={{
            flex: 1, padding: '9px 10px', minHeight: 40,
            background: rec.recruiter_phone ? '#38a169' : '#e2e8f0',
            color: rec.recruiter_phone ? 'white' : '#a0aec0',
            border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}>🤖 Dispatch Agent</button>
          {pill('✓ Contacted', () => onUpdate(rec.id, 'contacted'), 'white', '#718096', '#e2e8f0')}
        </div>
      )}

      {rec.status === 'contacted' && (<>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px' }}>How did it go?</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {pill('👍 Interested', () => onUpdate(rec.id, 'interested'), '#f0fff4', '#276749', '#9ae6b4')}
          {pill('🕐 Callback', () => onUpdate(rec.id, 'callback'), '#fffbeb', '#92400e', '#fcd34d')}
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {dialBtn('📞 Call Recruiter')}
          {pill('✕ Not a Fit', () => onUpdate(rec.id, 'rejected'), 'white', '#e53e3e', '#fed7d7')}
        </div>
      </>)}

      {rec.status === 'callback' && (<>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#92400e', textTransform: 'uppercase', letterSpacing: '.4px' }}>⏰ Follow up needed</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {dialBtn('📞 Call Back')}
          {pill('👍 Interested', () => onUpdate(rec.id, 'interested'), 'white', '#276749', '#9ae6b4')}
        </div>
        {pill('✕ Not a Fit', () => onUpdate(rec.id, 'rejected'), 'white', '#e53e3e', '#fed7d7')}
      </>)}

      {rec.status === 'interested' && (<>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#276749', textTransform: 'uppercase', letterSpacing: '.4px' }}>🔥 Hot lead — close it!</div>
        <button onClick={() => onUpdate(rec.id, 'hired')} style={{
          width: '100%', padding: '11px', minHeight: 44,
          background: '#38a169', color: 'white', border: 'none',
          borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer'
        }}>🎉 Got an Offer!</button>
        <div style={{ display: 'flex', gap: 8 }}>
          {dialBtn('📞 Negotiate')}
          <button onClick={onSchedule} style={{
            flex: 1, padding: '9px 10px', minHeight: 40,
            background: '#EEEDFE', color: '#534AB7',
            border: '1px solid #AFA9EC', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}>📅 Schedule</button>
        </div>
      </>)}

      {rec.status === 'scheduled' && (<>
        <MeetingBadge scheduledAt={rec.scheduled_at} meetingNotes={rec.meeting_notes} />
        <div style={{ fontSize: 11, fontWeight: 600, color: '#534AB7', textTransform: 'uppercase', letterSpacing: '.4px' }}>📅 Meeting confirmed</div>
        <button onClick={() => onUpdate(rec.id, 'hired')} style={{
          width: '100%', padding: '11px', minHeight: 44,
          background: '#38a169', color: 'white', border: 'none',
          borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer'
        }}>🎉 Got an Offer!</button>
        <div style={{ display: 'flex', gap: 8 }}>
          {dialBtn('📞 Call Recruiter')}
          <button onClick={onSchedule} style={{
            flex: 1, padding: '9px 10px', minHeight: 40,
            background: '#EEEDFE', color: '#534AB7',
            border: '1px solid #AFA9EC', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer'
          }}>✏️ Edit</button>
        </div>
        {pill('✕ Not a Fit', () => onUpdate(rec.id, 'rejected'), 'white', '#e53e3e', '#fed7d7')}
      </>)}

      {rec.status === 'hired' && (
        <div style={{ padding: '10px', background: '#e6fffa', color: '#00897b', border: '1px solid #81e6d9', borderRadius: 8, fontSize: 13, fontWeight: 700, textAlign: 'center' }}>
          🎉 Offer Received
        </div>
      )}

      {rec.status === 'rejected' && (<>
        <div style={{ padding: '8px', background: '#fff5f5', color: '#c53030', border: '1px solid #fed7d7', borderRadius: 8, fontSize: 12, textAlign: 'center' }}>Not a fit</div>
        {pill('↺ Reconsider', () => onUpdate(rec.id, 'approved'), 'white', '#718096', '#e2e8f0')}
      </>)}

      {rec.status === 'passed' && pill('↺ Reconsider', () => onUpdate(rec.id, 'pending'), 'white', '#718096', '#e2e8f0')}

      <div style={{ display: 'flex', gap: 8, paddingTop: 4, borderTop: '1px solid #f0f0f0', marginTop: 2 }}>
        {hasFmcsa
          ? <button onClick={onViewFmcsa} style={{ flex: 1, padding: '8px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: '#f0fff4', color: '#276749', border: '1px solid #9ae6b4', fontWeight: 600 }}>🛡 View FMCSA ✓</button>
          : <button onClick={() => onFmcsa(rec.id, rec.carrier_name)} style={{ flex: 1, padding: '8px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: '#faf5ff', color: '#805ad5', border: '1px solid #d6bcfa' }}>🛡 Check FMCSA</button>
        }
        <button onClick={() => onDelete(rec.id, rec.carrier_name)} style={{ flex: 1, padding: '8px', background: 'white', color: '#e53e3e', border: '1px solid #fed7d7', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>🗑 Remove</button>
      </div>
    </div>
  )
}

// ── Call Modal ────────────────────────────────────────────────────────────────
function CallModal({ rec, onClose, onDispatched }) {
  const [phone, setPhone] = useState(rec?.recruiter_phone || '')
  const [name, setName]   = useState(rec?.recruiter_name || '')
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
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 500, padding: '20px 20px 40px' }}>
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

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Outreach() {
  const [records, setRecords]           = useState([])
  const [loading, setLoading]           = useState(true)
  const [activeTab, setActiveTab]       = useState('all')
  const [search, setSearch]             = useState('')
  const [callRec, setCallRec]           = useState(null)
  const [scheduleRec, setScheduleRec]   = useState(null)
  const [toast, setToast]               = useState('')
  const [toastType, setToastType]       = useState('')
  const [expanded, setExpanded]         = useState(null)
  const [fmcsaSheet, setFmcsaSheet]     = useState(null)
  const [fmcsaLoading, setFmcsaLoading] = useState(null)

  const showToast = (msg, type = '') => {
    setToast(msg); setToastType(type)
    setTimeout(() => setToast(''), 2500)
  }

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
      showToast('Status updated')
      load()
    } catch (e) { showToast('Update failed', 'error') }
  }

  const deleteRecord = async (id, name) => {
    if (!confirm(`Remove "${name}"?`)) return
    try {
      await client.delete(`/api/carriers/outreach-record/${id}`)
      setRecords(prev => prev.filter(r => r.id !== id))
      showToast('Removed')
    } catch (e) { showToast('Delete failed', 'error') }
  }

  const fmcsaCheck = async (id, name) => {
    setFmcsaLoading(id)
    showToast(`Looking up FMCSA for ${name}...`)
    try {
      const r = await client.post(`/api/fmcsa/enrich/${id}`)
      const d = r.data
      let fmcsaData = d
      if (d?.fmcsa_data) {
        fmcsaData = typeof d.fmcsa_data === 'string' ? JSON.parse(d.fmcsa_data) : d.fmcsa_data
      }
      if (d?.found === false || d?.mismatch) {
        showToast(d.message || 'No FMCSA record found', 'error')
        setFmcsaLoading(null)
        return
      }
      await load()
      setFmcsaSheet({ data: fmcsaData, carrierName: name })
      setToast('')
    } catch (e) {
      showToast('FMCSA lookup failed', 'error')
    } finally {
      setFmcsaLoading(null)
    }
  }

  const viewFmcsa = (rec) => {
    let data = rec.fmcsa_data
    if (typeof data === 'string') {
      try { data = JSON.parse(data) } catch { data = {} }
    }
    setFmcsaSheet({ data, carrierName: rec.carrier_name })
  }

  const handleExpand = (id) => {
    const next = expanded === id ? null : id
    setExpanded(next)
    if (next) {
      setTimeout(() => {
        document.getElementById(`card-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }

  const counts  = records.reduce((acc, r) => { acc[r.status] = (acc[r.status] || 0) + 1; return acc }, {})
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

  const tabLabels = {
    all: 'All', pending: 'Pending', approved: 'Approved', contacted: 'Contacted',
    callback: 'Callback', interested: 'Interested', scheduled: 'Scheduled',
    rejected: 'Rejected', hired: 'Offers'
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', background: '#f7fafc' }}>

      {/* Stats */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '10px 14px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <div style={{ display: 'flex', flex: 1 }}>
          {[
            { label: 'Total',     value: records.length,                                   color: '#2d3748' },
            { label: 'Pending',   value: counts.pending || 0,                              color: '#dd6b20' },
            { label: 'Active',    value: (counts.contacted || 0) + (counts.callback || 0), color: '#805ad5' },
            { label: 'Scheduled', value: counts.scheduled || 0,                            color: '#534AB7' },
            { label: 'Offers',    value: counts.hired || 0,                                color: '#00897b' },
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
            color: activeTab === tab ? '#534AB7' : '#718096',
            borderBottom: activeTab === tab ? '2px solid #534AB7' : '2px solid transparent',
            fontWeight: activeTab === tab ? 600 : 400,
          }}>
            {tabLabels[tab]}
            {tab !== 'all' && counts[tab]
              ? <span style={{ marginLeft: 4, fontSize: 10, background: activeTab === tab ? '#EEEDFE' : '#edf2f7', color: activeTab === tab ? '#534AB7' : '#718096', padding: '1px 5px', borderRadius: 8 }}>{counts[tab]}</span>
              : ''}
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ padding: '8px 12px', background: '#f7fafc', flexShrink: 0 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search carriers..."
          style={{ width: '100%', padding: '9px 14px', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 13, outline: 'none', background: 'white', boxSizing: 'border-box', fontFamily: 'inherit' }} />
      </div>

      {/* Cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 12px 100px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            [1, 2, 3].map(i => <div key={i} style={{ background: 'white', borderRadius: 10, height: 90, border: '1px solid #e2e8f0' }} />)
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 20px', color: '#a0aec0' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 6, color: '#4a5568' }}>
                {activeTab === 'all' ? 'No outreach yet' : `No ${tabLabels[activeTab].toLowerCase()} records`}
              </div>
              <div style={{ fontSize: 12 }}>{activeTab === 'all' ? 'Go to Carriers to add jobs.' : 'Try a different tab.'}</div>
            </div>
          ) : filtered.map(rec => {
            const isExp      = expanded === rec.id
            const isChecking = fmcsaLoading === rec.id
            return (
              <div key={rec.id} id={`card-${rec.id}`} style={{
                background: 'white', borderRadius: 12,
                border: `1px solid ${rec.status === 'scheduled' ? '#AFA9EC' : isExp ? '#AFA9EC' : '#e2e8f0'}`,
              }}>
                {/* Meeting banner — collapsed */}
                {rec.status === 'scheduled' && (rec.scheduled_at || rec.meeting_notes) && !isExp && (
                  <div style={{ background: '#EEEDFE', borderRadius: '12px 12px 0 0', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6, borderBottom: '1px solid #AFA9EC' }}>
                    <span style={{ fontSize: 12 }}>📅</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#534AB7' }}>
                      {extractMeetingDisplay(rec.scheduled_at, rec.meeting_notes) || 'Meeting scheduled'}
                    </span>
                  </div>
                )}

                {/* Summary row */}
                <div onClick={() => handleExpand(rec.id)}
                  style={{ padding: '13px 14px', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: '#1a202c' }}>{rec.carrier_name}</span>
                      <StatusBadge status={rec.status} />
                      {rec.fmcsa_data && <span style={{ fontSize: 10, color: '#276749', background: '#f0fff4', border: '1px solid #9ae6b4', padding: '1px 6px', borderRadius: 8 }}>🛡 FMCSA ✓</span>}
                    </div>
                    {rec.job_title && <div style={{ fontSize: 12, color: '#718096', marginBottom: 5 }}>{rec.job_title}</div>}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {cleanLoc(rec.location) && <span style={{ fontSize: 11, color: '#4a5568' }}>📍 {cleanLoc(rec.location)}</span>}
                      {rec.weekly_pay_estimate && <span style={{ fontSize: 11, fontWeight: 700, color: '#2d3748' }}>${Number(rec.weekly_pay_estimate).toLocaleString()}/wk</span>}
                      {rec.cpm && !rec.weekly_pay_estimate && <span style={{ fontSize: 11, color: '#718096' }}>{rec.cpm}¢/mi</span>}
                      {rec.home_time && <span style={{ fontSize: 11, color: '#718096' }}>🏠 {rec.home_time}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                    <ScoreBar score={rec.match_score || 0} />
                    <span style={{ fontSize: 10, color: isExp ? '#534AB7' : '#cbd5e0' }}>
                      {isExp ? '▲ less' : '▼ actions'}
                    </span>
                  </div>
                </div>

                {/* Expanded panel */}
                {isExp && (
                  <div style={{ borderTop: '1px solid #f0f0f0', padding: '14px 14px 18px', background: '#fafbfc', borderRadius: '0 0 12px 12px' }}>
                    {rec.recruiter_phone ? (
                      <div style={{ fontSize: 12, color: '#3182ce', fontFamily: 'monospace', marginBottom: 10 }}>
                        📞 {rec.recruiter_phone}
                        {rec.recruiter_name && <span style={{ color: '#718096', fontFamily: 'inherit' }}> · {rec.recruiter_name}</span>}
                      </div>
                    ) : (
                      <div style={{ fontSize: 11, color: '#e53e3e', marginBottom: 10 }}>⚠ No phone on file</div>
                    )}
                    {rec.job_url && (
                      <a href={rec.job_url} target="_blank" rel="noreferrer"
                        style={{ fontSize: 11, color: '#3182ce', display: 'block', marginBottom: 12, textDecoration: 'none' }}>
                        View job posting ↗
                      </a>
                    )}
                    {isChecking ? (
                      <div style={{ padding: '12px', textAlign: 'center', fontSize: 13, color: '#718096' }}>⏳ Looking up FMCSA data...</div>
                    ) : (
                      <ActionButtons
                        rec={rec}
                        onUpdate={(id, status) => { updateStatus(id, status); setExpanded(null) }}
                        onCall={r => { setCallRec(r); setExpanded(null) }}
                        onFmcsa={fmcsaCheck}
                        onViewFmcsa={() => viewFmcsa(rec)}
                        onDelete={(id, name) => { deleteRecord(id, name); setExpanded(null) }}
                        onSchedule={() => { setScheduleRec(rec); setExpanded(null) }}
                      />
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer */}
      <div style={{ background: 'white', borderTop: '1px solid #e2e8f0', padding: '6px 16px', fontSize: 11, color: '#a0aec0', flexShrink: 0 }}>
        {filtered.length} record{filtered.length !== 1 ? 's' : ''}
      </div>

      {/* Modals */}
      {callRec && <CallModal rec={callRec} onClose={() => setCallRec(null)} onDispatched={() => { load(); showToast('Call dispatched!') }} />}
      {scheduleRec && <ScheduleModal rec={scheduleRec} onClose={() => setScheduleRec(null)} onSaved={() => { load(); showToast('📅 Meeting saved!') }} />}
      {fmcsaSheet && <FmcsaSheet data={fmcsaSheet.data} carrierName={fmcsaSheet.carrierName} onClose={() => setFmcsaSheet(null)} />}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 20px',
          background: toastType === 'error' ? '#fed7d7' : '#2d3748',
          color: toastType === 'error' ? '#c53030' : 'white',
          borderRadius: 20, fontSize: 13, fontWeight: 500, zIndex: 1000, whiteSpace: 'nowrap',
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)'
        }}>{toast}</div>
      )}
    </div>
  )
}