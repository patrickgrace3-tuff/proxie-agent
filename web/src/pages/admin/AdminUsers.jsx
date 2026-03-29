import { useEffect, useState, useCallback } from 'react'
import { client } from '../../store/auth'

function StatusBadge({ active }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600,
      background: active ? '#c6f6d522' : '#fed7d722',
      color: active ? '#276749' : '#c53030',
      border: `1px solid ${active ? '#9ae6b4' : '#feb2b2'}`
    }}>{active ? 'Active' : 'Inactive'}</span>
  )
}

function ProfileBadge({ complete }) {
  return (
    <span style={{
      padding: '3px 10px', borderRadius: 10, fontSize: 11, fontWeight: 600,
      background: complete ? '#ebf8ff' : '#f7fafc',
      color: complete ? '#2b6cb0' : '#a0aec0',
      border: `1px solid ${complete ? '#bee3f8' : '#e2e8f0'}`
    }}>{complete ? 'Complete' : 'Pending'}</span>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ padding: '14px 20px', background: 'white', borderRight: '1px solid #e2e8f0', minWidth: 110 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || '#2d3748', lineHeight: 1.2 }}>{value ?? '—'}</div>
      <div style={{ fontSize: 10, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginTop: 3 }}>{label}</div>
    </div>
  )
}

export default function AdminUsers() {
  const [users, setUsers] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [expanded, setExpanded] = useState(null)
  const [expandData, setExpandData] = useState({})
  const [toast, setToast] = useState('')

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [ur, sr] = await Promise.all([
        client.get('/api/admin/users?limit=500'),
        client.get('/api/admin/stats'),
      ])
      setUsers(ur.data.users || [])
      setStats(sr.data || {})
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const filtered = users.filter(u => {
    const q = search.toLowerCase()
    const matchSearch = !q || (u.email || '').toLowerCase().includes(q) ||
      (u.first_name || '').toLowerCase().includes(q) ||
      (u.last_name || '').toLowerCase().includes(q) ||
      (u.phone || '').includes(q)
    const matchStatus = !statusFilter ||
      (statusFilter === 'active' && u.is_active) ||
      (statusFilter === 'inactive' && !u.is_active)
    return matchSearch && matchStatus
  })

  const toggleExpand = async (id) => {
    if (expanded === id) { setExpanded(null); return }
    setExpanded(id)
    if (expandData[id]) return
    try {
      const r = await client.get(`/api/admin/users/${id}`)
      setExpandData(prev => ({ ...prev, [id]: r.data }))
    } catch (e) { console.error(e) }
  }

  const activate = async (id) => {
    await client.post(`/api/admin/users/${id}/activate`)
    showToast('Account activated')
    load()
  }

  const deactivate = async (id) => {
    if (!confirm('Deactivate this account?')) return
    await client.post(`/api/admin/users/${id}/deactivate`)
    showToast('Account deactivated')
    load()
  }

  const resetProfile = async (id, name) => {
    if (!confirm(`Reset ${name}'s profile and outreach log? Cannot be undone.`)) return
    await client.post(`/api/admin/users/${id}/reset-profile`)
    showToast('Profile reset')
    load()
  }

  const fmtDate = (s) => s ? new Date(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'

  const STATUS_COLORS = {
    pending: '#718096', approved: '#3182ce', contacted: '#805ad5',
    interested: '#38a169', rejected: '#e53e3e', hired: '#00897b',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Stats bar */}
      <div style={{ display: 'flex', background: 'white', borderBottom: '1px solid #e2e8f0', flexShrink: 0, overflowX: 'auto' }}>
        <StatCard label="Total Drivers" value={stats.total_drivers} />
        <StatCard label="Active" value={stats.active_drivers} color="#38a169" />
        <StatCard label="Profiles Complete" value={stats.profiles_complete} color="#3182ce" />
        <StatCard label="Total Outreach" value={stats.total_outreach} color="#805ad5" />
        <StatCard label="Voice Calls" value={stats.total_calls} color="#dd6b20" />
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '0 16px', gap: 10, background: 'white' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, email or phone..."
            style={{ padding: '7px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, outline: 'none', width: 240, fontFamily: 'inherit' }} />
          <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 13, fontFamily: 'inherit', outline: 'none', background: 'white' }}>
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
          <button onClick={load} style={{ padding: '7px 14px', background: '#3182ce', color: 'white', border: 'none', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
            ↺ Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr style={{ background: '#1a1a2e' }}>
              <th style={{ width: 32, padding: '10px 8px' }}></th>
              {['Driver', 'Contact', 'Status', 'Profile', 'Outreach', 'Calls', 'Joined', 'Last Login', 'Actions'].map(h => (
                <th key={h} style={{ padding: '10px 14px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 48, color: '#a0aec0' }}>Loading drivers...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} style={{ textAlign: 'center', padding: 48, color: '#a0aec0' }}>No drivers found.</td></tr>
            ) : filtered.map(u => {
              const isExp = expanded === u.id
              const initials = ((u.first_name?.[0] || '') + (u.last_name?.[0] || '')).toUpperCase() || u.email[0].toUpperCase()
              const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || '(No name)'
              const detail = expandData[u.id]

              return [
                // Main row
                <tr key={`row-${u.id}`}
                  onClick={() => toggleExpand(u.id)}
                  style={{ borderBottom: '1px solid #f0f0f0', cursor: 'pointer', background: isExp ? '#f0f4ff' : 'white', transition: 'background 0.1s' }}
                  onMouseOver={e => { if (!isExp) e.currentTarget.style.background = '#f7fafc' }}
                  onMouseOut={e => { if (!isExp) e.currentTarget.style.background = 'white' }}
                >
                  <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                    <span style={{ fontSize: 10, color: '#a0aec0', transition: 'transform 0.2s', display: 'inline-block', transform: isExp ? 'rotate(90deg)' : 'none' }}>▶</span>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
                        background: u.is_active ? '#534AB7' : '#a0aec0',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 11, fontWeight: 700, color: 'white'
                      }}>{initials}</div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{fullName}</div>
                        <div style={{ fontSize: 11, color: '#a0aec0' }}>{u.role === 'admin' ? '🛡 Admin' : 'Driver'}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <div style={{ fontSize: 13 }}>{u.email}</div>
                    <div style={{ fontSize: 11, color: '#a0aec0' }}>{u.phone || '—'}</div>
                  </td>
                  <td style={{ padding: '10px 14px' }}><StatusBadge active={u.is_active} /></td>
                  <td style={{ padding: '10px 14px' }}><ProfileBadge complete={u.setup_complete} /></td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: (u.outreach_count || 0) > 0 ? '#805ad5' : '#a0aec0' }}>{u.outreach_count || 0}</span>
                  </td>
                  <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: (u.call_count || 0) > 0 ? '#dd6b20' : '#a0aec0' }}>{u.call_count || 0}</span>
                  </td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: '#718096', whiteSpace: 'nowrap' }}>{fmtDate(u.created_at)}</td>
                  <td style={{ padding: '10px 14px', fontSize: 12, color: u.last_login ? '#718096' : '#e53e3e', whiteSpace: 'nowrap' }}>{fmtDate(u.last_login)}</td>
                  <td style={{ padding: '10px 14px' }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {u.is_active
                        ? <button onClick={() => deactivate(u.id)} style={{ padding: '5px 10px', background: 'white', color: '#e53e3e', border: '1px solid #fed7d7', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>Deactivate</button>
                        : <button onClick={() => activate(u.id)} style={{ padding: '5px 10px', background: 'white', color: '#38a169', border: '1px solid #9ae6b4', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>Activate</button>
                      }
                      <button onClick={() => resetProfile(u.id, u.first_name || u.email)} style={{ padding: '5px 10px', background: 'white', color: '#e53e3e', border: '1px solid #fed7d7', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>Reset</button>
                    </div>
                  </td>
                </tr>,

                // Expanded detail row
                isExp && (
                  <tr key={`exp-${u.id}`} style={{ background: '#f7fafc', borderBottom: '1px solid #e2e8f0' }}>
                    <td colSpan={10} style={{ padding: 0 }}>
                      <div style={{ padding: '16px 40px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

                        {/* Profile summary */}
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: '#718096', marginBottom: 10 }}>Driver Profile</div>
                          {!detail ? (
                            <div style={{ color: '#a0aec0', fontSize: 12 }}>Loading...</div>
                          ) : (
                            <div>
                              {[
                                ['CDL Experience', detail.user?.cdl_experience],
                                ['Driver Type', detail.user?.driver_type],
                                ['Proxie Rules', detail.user?.rules_active ? '✅ Active' : '⚪ Inactive'],
                                ['Min CPM', detail.user?.min_cpm ? detail.user.min_cpm + '¢' : '—'],
                                ['Home Time', detail.user?.home_time_requirement],
                                ['Max Outreach/Day', detail.user?.max_outreach_per_day],
                              ].map(([label, value]) => value ? (
                                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
                                  <span style={{ color: '#718096' }}>{label}</span>
                                  <span style={{ fontWeight: 500 }}>{value}</span>
                                </div>
                              ) : null)}
                            </div>
                          )}
                        </div>

                        {/* Outreach activity */}
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: '#718096', marginBottom: 10 }}>
                            Outreach Activity ({detail?.outreach?.length || 0})
                          </div>
                          {!detail ? (
                            <div style={{ color: '#a0aec0', fontSize: 12 }}>Loading...</div>
                          ) : !detail.outreach?.length ? (
                            <div style={{ color: '#a0aec0', fontSize: 12 }}>No outreach activity yet.</div>
                          ) : (
                            <div>
                              {detail.outreach.slice(0, 8).map((o, i) => {
                                const sc = STATUS_COLORS[o.status] || '#718096'
                                return (
                                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
                                    <span style={{ fontWeight: 500 }}>{o.carrier_name || 'Unknown'}</span>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <span style={{ fontSize: 11, color: '#a0aec0' }}>{o.match_score}/100</span>
                                      <span style={{ padding: '2px 8px', borderRadius: 8, fontSize: 10, fontWeight: 600, background: sc + '22', color: sc, border: `1px solid ${sc}44` }}>{o.status}</span>
                                    </div>
                                  </div>
                                )
                              })}
                              {detail.outreach.length > 8 && (
                                <div style={{ fontSize: 11, color: '#a0aec0', paddingTop: 4 }}>+ {detail.outreach.length - 8} more records</div>
                              )}
                            </div>
                          )}

                          {/* Voice calls */}
                          {detail?.calls?.length > 0 && (
                            <div style={{ marginTop: 14 }}>
                              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.4px', color: '#718096', marginBottom: 8 }}>
                                Voice Calls ({detail.calls.length})
                              </div>
                              {detail.calls.slice(0, 3).map((c, i) => (
                                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid #f0f0f0' }}>
                                  <span>{c.carrier || c.carrier_name || 'Unknown'}</span>
                                  <span style={{ color: '#a0aec0' }}>{c.outcome || c.status || '—'} · {c.duration_seconds ? Math.round(c.duration_seconds / 60) + 'm' : '—'}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                      </div>
                    </td>
                  </tr>
                )
              ]
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{ background: 'white', borderTop: '1px solid #e2e8f0', padding: '8px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, color: '#718096', flexShrink: 0 }}>
        <span>{filtered.length} driver{filtered.length !== 1 ? 's' : ''} total</span>
        <span style={{ color: '#a0aec0' }}>Click any row to expand driver activity</span>
      </div>

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, right: 24, padding: '10px 20px',
          background: '#c6f6d5', color: '#22543d', border: '1px solid #9ae6b4',
          borderRadius: 8, fontSize: 13, fontWeight: 500, zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
        }}>{toast}</div>
      )}
    </div>
  )
}