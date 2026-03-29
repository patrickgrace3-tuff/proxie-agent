import { useEffect, useState, useRef } from 'react'
import { client } from '../store/auth'
import { useAuthStore } from '../store/auth'

function ScoreBar({ score }) {
  const color = score >= 80 ? '#38a169' : score >= 60 ? '#dd6b20' : '#e53e3e'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      <div style={{ width: 40, height: 5, background: '#e2e8f0', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${score}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color }}>{score}</span>
    </div>
  )
}

function stripHtml(html) {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<strong[^>]*>/gi, '').replace(/<\/strong>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&ldquo;/g, '"')
    .replace(/&rdquo;/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&#\d+;/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Parse raw_data JSON safely
function parseRaw(job) {
  try {
    if (job.raw_data && typeof job.raw_data === 'string') return JSON.parse(job.raw_data)
    if (job.raw_data && typeof job.raw_data === 'object') return job.raw_data
  } catch (e) {}
  return {}
}

// ── Feed Manager (admin only) ─────────────────────────────────────────────────
function FeedManager({ onClose, onRefresh }) {
  const [feeds, setFeeds] = useState([])
  const [name, setName] = useState('')
  const [type, setType] = useState('json')
  const [source, setSource] = useState('')
  const [carrier, setCarrier] = useState('')
  const [phone, setPhone] = useState('')
  const [inputMode, setInputMode] = useState('url')
  const [syncing, setSyncing] = useState(null)
  const [adding, setAdding] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const loadFeeds = async () => {
    try {
      const r = await client.get('/api/feeds/feeds')
      setFeeds(r.data.feeds || [])
    } catch (e) {}
  }

  useEffect(() => { loadFeeds() }, [])

  const addFeed = async () => {
    if (!name) { showToast('Enter a feed name'); return }
    if (!source) { showToast(inputMode === 'url' ? 'Enter a URL' : 'Paste content'); return }
    setAdding(true)
    try {
      await client.post('/api/feeds/feeds', {
        name, feed_type: type, source, is_url: inputMode === 'url',
        default_carrier: carrier, default_phone: phone
      })
      showToast('Feed added!')
      setName(''); setSource(''); setCarrier(''); setPhone('')
      await loadFeeds()
      onRefresh()
    } catch (e) { showToast('Failed: ' + (e?.response?.data?.detail || e.message)) }
    finally { setAdding(false) }
  }

  const syncFeed = async (id) => {
    setSyncing(id)
    try {
      const r = await client.post(`/api/feeds/feeds/${id}/sync`)
      showToast(`Synced — ${r.data.jobs_parsed} jobs`)
      await loadFeeds()
      onRefresh()
    } catch (e) { showToast('Sync failed') }
    finally { setSyncing(null) }
  }

  const deleteFeed = async (id, feedName) => {
    if (!confirm(`Delete feed "${feedName}" and all its jobs?`)) return
    await client.delete(`/api/feeds/feeds/${id}`)
    showToast('Feed deleted')
    await loadFeeds()
    onRefresh()
  }

  const inp = (value, onChange, placeholder) => (
    <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
      style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box', background: 'white' }} />
  )

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'white', borderRadius: '16px 16px 0 0', width: '100%', maxWidth: 560, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700 }}>📡 Manage Job Feeds</h3>
            <div style={{ fontSize: 11, color: '#718096', marginTop: 2 }}>Feeds are shared with all active users</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: 22, cursor: 'pointer', color: '#a0aec0' }}>✕</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
          <div style={{ background: '#f7fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 14, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: '#2d3748' }}>➕ Add New Feed</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>Feed Name</div>
                {inp(name, setName, 'e.g. Appcast Jobs, Indeed XML...')}
              </div>
              <div style={{ width: 100 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>Format</div>
                <select value={type} onChange={e => setType(e.target.value)}
                  style={{ width: '100%', padding: '9px 8px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, fontFamily: 'inherit', outline: 'none' }}>
                  <option value="json">JSON</option>
                  <option value="xml">XML</option>
                  <option value="csv">CSV</option>
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>Carrier Name <span style={{ fontWeight: 400, textTransform: 'none', color: '#a0aec0' }}>(if not in feed)</span></div>
              {inp(carrier, setCarrier, 'e.g. Roehl Transport...')}
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>Recruiter Phone <span style={{ fontWeight: 400, textTransform: 'none', color: '#a0aec0' }}>(if not in feed)</span></div>
              {inp(phone, setPhone, '+16151234567')}
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              {['url', 'paste'].map(m => (
                <button key={m} onClick={() => setInputMode(m)} style={{
                  padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer',
                  background: inputMode === m ? '#2d3748' : 'white',
                  color: inputMode === m ? 'white' : '#718096',
                  border: inputMode === m ? 'none' : '1px solid #e2e8f0'
                }}>{m === 'url' ? '🔗 URL' : '📋 Paste'}</button>
              ))}
            </div>
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 4 }}>
                {inputMode === 'url' ? 'Feed URL' : 'Paste Feed Content'}
              </div>
              {inputMode === 'url'
                ? inp(source, setSource, 'https://jobs.example.com/feed.xml')
                : <textarea value={source} onChange={e => setSource(e.target.value)} placeholder="Paste your XML, JSON, or CSV here..." rows={4}
                    style={{ width: '100%', padding: '9px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, outline: 'none', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box' }} />
              }
            </div>
            <button onClick={addFeed} disabled={adding} style={{
              width: '100%', padding: '11px', background: adding ? '#a0aec0' : '#534AB7', color: 'white',
              border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit'
            }}>{adding ? 'Adding...' : '➕ Add & Sync Feed'}</button>
          </div>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: '#2d3748' }}>
            Active Feeds <span style={{ fontSize: 11, fontWeight: 400, color: '#718096' }}>— visible to all users</span>
          </div>
          {feeds.length === 0
            ? <div style={{ textAlign: 'center', padding: 24, color: '#a0aec0', fontSize: 12 }}>No feeds added yet.</div>
            : feeds.map(f => {
              const statusColor = f.status === 'active' ? '#38a169' : f.status === 'error' ? '#e53e3e' : '#718096'
              const synced = f.last_synced ? new Date(f.last_synced).toLocaleString() : 'Never'
              return (
                <div key={f.id} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 14px', marginBottom: 8, background: 'white' }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 600, fontSize: 13 }}>{f.name}</span>
                        <span style={{ padding: '1px 7px', borderRadius: 10, fontSize: 10, fontWeight: 600, background: statusColor + '22', color: statusColor }}>{f.status}</span>
                        <span style={{ padding: '1px 7px', borderRadius: 10, fontSize: 10, background: '#f0f4f8', color: '#4a5568', textTransform: 'uppercase' }}>{f.feed_type}</span>
                      </div>
                      <div style={{ fontSize: 11, color: '#718096', marginTop: 3 }}>{f.job_count || 0} jobs · Last synced: {synced}</div>
                      {f.error_msg && <div style={{ fontSize: 11, color: '#c53030', marginTop: 3 }}>⚠ {f.error_msg.substring(0, 100)}</div>}
                    </div>
                    <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                      <button onClick={() => syncFeed(f.id)} disabled={syncing === f.id} style={{ padding: '5px 10px', background: '#ebf8ff', color: '#3182ce', border: '1px solid #bee3f8', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>
                        {syncing === f.id ? '...' : '↺ Sync'}
                      </button>
                      <button onClick={() => deleteFeed(f.id, f.name)} style={{ padding: '5px 10px', background: 'white', color: '#e53e3e', border: '1px solid #fed7d7', borderRadius: 6, fontSize: 11, cursor: 'pointer' }}>🗑</button>
                    </div>
                  </div>
                </div>
              )
            })}
        </div>
        {toast && (
          <div style={{ margin: '0 16px 16px', padding: '10px 14px', background: '#c6f6d5', color: '#22543d', border: '1px solid #9ae6b4', borderRadius: 8, fontSize: 13, textAlign: 'center' }}>{toast}</div>
        )}
      </div>
    </div>
  )
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Carriers() {
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'

  const [jobs, setJobs] = useState([])
  const [feeds, setFeeds] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [minScore, setMinScore] = useState('0')
  const [feedFilter, setFeedFilter] = useState('')
  const [rulesOn, setRulesOn] = useState(false)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const [showFeedManager, setShowFeedManager] = useState(false)
  const [syncing, setSyncing] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [expanded, setExpanded] = useState(null)
  const [toast, setToast] = useState('')
  const searchTimer = useRef(null)

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const loadFeeds = async () => {
    try {
      const r = await client.get('/api/feeds/feeds')
      setFeeds(r.data.feeds || [])
    } catch (e) {}
  }

  const loadJobs = async (p = 1, sm = minScore, ff = feedFilter, ro = rulesOn, sr = search) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: p, per_page: 20, min_score: sm, apply_rules: ro })
      if (ff) params.set('feed_id', ff)
      if (sr) params.set('search', sr)
      const r = await client.get(`/api/feeds/feeds/jobs?${params}`)
      setJobs(r.data.jobs || [])
      setTotal(r.data.total || 0)
      setTotalPages(r.data.total_pages || 1)
      setPage(p)
      setSelected(new Set())
      setExpanded(null)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }

  useEffect(() => { loadFeeds(); loadJobs(1, '0', '', false, '') }, [])
  useEffect(() => { loadJobs(1, minScore, feedFilter, rulesOn, search) }, [minScore, feedFilter, rulesOn])

  const handleSearch = (v) => {
    setSearch(v)
    clearTimeout(searchTimer.current)
    searchTimer.current = setTimeout(() => loadJobs(1, minScore, feedFilter, rulesOn, v), 350)
  }

  const queueJob = async (jobId) => {
    try {
      await client.post(`/api/feeds/feeds/jobs/${jobId}/queue`)
      showToast('Added to Carrier Outreach!')
      setJobs(prev => prev.filter(j => j.id !== jobId))
      setSelected(prev => { const n = new Set(prev); n.delete(jobId); return n })
      if (expanded === jobId) setExpanded(null)
    } catch (e) { showToast('Failed to add') }
  }

  const queueSelected = async () => {
    if (!selected.size) return
    try {
      const r = await client.post('/api/feeds/feeds/jobs/queue-bulk', { job_ids: Array.from(selected) })
      showToast(`Added ${r.data.queued} jobs to Outreach!`)
      loadJobs(page, minScore, feedFilter, rulesOn, search)
    } catch (e) { showToast('Failed') }
  }

  const syncFeed = async (feedId) => {
    if (!isAdmin) return
    setSyncing(feedId)
    try {
      const r = await client.post(`/api/feeds/feeds/${feedId}/sync`)
      showToast(`Synced — ${r.data.jobs_parsed} jobs`)
      loadFeeds()
      loadJobs(1, minScore, feedFilter, rulesOn, search)
    } catch (e) { showToast('Sync failed') }
    finally { setSyncing(null) }
  }

  const rescore = async () => {
    showToast('Re-scoring jobs...')
    try {
      const r = await client.post('/api/feeds/feeds/rescore')
      showToast(`Re-scored ${r.data.updated} jobs`)
      loadJobs(1, minScore, feedFilter, rulesOn, search)
    } catch (e) { showToast('Re-score failed') }
  }

  const toggleSelect = (id) => {
    setSelected(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const handleExpand = (id) => {
    const next = expanded === id ? null : id
    setExpanded(next)
    if (next) {
      setTimeout(() => {
        document.getElementById(`carrier-card-${next}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', background: '#f7fafc' }}>

      {/* Top bar */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '10px 14px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: feeds.length > 0 ? 10 : 0 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1a202c' }}>Find Carriers</div>
            <div style={{ fontSize: 11, color: '#718096' }}>
              {total} jobs{feeds.length > 0 ? ` · ${feeds.length} feed${feeds.length !== 1 ? 's' : ''}` : ''}
              {!isAdmin && feeds.length > 0 && <span style={{ marginLeft: 4, color: '#a0aec0' }}>· managed by admin</span>}
            </div>
          </div>
          {isAdmin && (
            <button onClick={() => setShowFeedManager(true)} style={{ padding: '8px 14px', background: '#534AB7', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>+ Feed</button>
          )}
        </div>

        {/* Feed pills */}
        {feeds.length > 0 && (
          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4, marginBottom: 10 }}>
            <button onClick={() => setFeedFilter('')} style={{
              padding: '4px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer', flexShrink: 0,
              background: !feedFilter ? '#534AB7' : 'white', color: !feedFilter ? 'white' : '#718096',
              border: `1px solid ${!feedFilter ? '#534AB7' : '#e2e8f0'}`
            }}>All feeds</button>
            {feeds.map(f => (
              <button key={f.id} onClick={() => setFeedFilter(String(f.id))} style={{
                padding: '4px 12px', borderRadius: 16, fontSize: 11, cursor: 'pointer', flexShrink: 0,
                background: feedFilter === String(f.id) ? '#534AB7' : 'white',
                color: feedFilter === String(f.id) ? 'white' : '#718096',
                border: `1px solid ${feedFilter === String(f.id) ? '#534AB7' : '#e2e8f0'}`,
                display: 'flex', alignItems: 'center', gap: 4
              }}>
                {f.name}
                <span style={{ opacity: 0.7 }}>({f.job_count || 0})</span>
                {isAdmin && (
                  <span onClick={e => { e.stopPropagation(); syncFeed(f.id) }}
                    style={{ marginLeft: 2, color: feedFilter === String(f.id) ? 'rgba(255,255,255,0.8)' : '#3182ce', cursor: 'pointer', fontSize: 12 }}>
                    {syncing === f.id ? '...' : '↺'}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Search + filters */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input value={search} onChange={e => handleSearch(e.target.value)} placeholder="Search carriers..."
            style={{ flex: 1, padding: '8px 12px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 13, outline: 'none', fontFamily: 'inherit' }} />
          <select value={minScore} onChange={e => setMinScore(e.target.value)}
            style={{ padding: '8px', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12, outline: 'none', background: 'white', flexShrink: 0 }}>
            <option value="0">All scores</option>
            <option value="60">60+</option>
            <option value="70">70+</option>
            <option value="80">80+</option>
          </select>
          <button onClick={() => setRulesOn(r => !r)} style={{
            padding: '8px 10px', borderRadius: 8, fontSize: 11, cursor: 'pointer', flexShrink: 0,
            background: rulesOn ? '#534AB7' : 'white', color: rulesOn ? 'white' : '#718096',
            border: `1px solid ${rulesOn ? '#534AB7' : '#e2e8f0'}`, fontWeight: rulesOn ? 600 : 400
          }}>⚡ Rules</button>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{ background: '#ebf8ff', borderBottom: '1px solid #bee3f8', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontSize: 13, color: '#2c5282', fontWeight: 500 }}>{selected.size} selected</span>
          <button onClick={queueSelected} style={{ marginLeft: 'auto', padding: '6px 16px', background: '#3182ce', color: 'white', border: 'none', borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>→ Add to Outreach</button>
          <button onClick={() => setSelected(new Set())} style={{ padding: '6px 10px', background: 'white', color: '#718096', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>Clear</button>
        </div>
      )}

      {/* Admin tools */}
      {isAdmin && (
        <div style={{ background: 'white', borderBottom: '1px solid #f0f0f0', padding: '6px 14px', display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: '#a0aec0', textTransform: 'uppercase', letterSpacing: '.4px' }}>Admin</span>
          <button onClick={rescore} style={{ padding: '4px 10px', background: 'white', color: '#718096', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>⚡ Re-score all</button>
          <button onClick={() => setShowFeedManager(true)} style={{ padding: '4px 10px', background: 'white', color: '#718096', border: '1px solid #e2e8f0', borderRadius: 5, fontSize: 11, cursor: 'pointer' }}>⚙ Manage Feeds</button>
        </div>
      )}

      {/* No feeds empty state */}
      {!loading && feeds.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 24px', color: '#a0aec0' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📡</div>
          <div style={{ fontWeight: 600, fontSize: 14, color: '#4a5568', marginBottom: 6 }}>No job feeds yet</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>
            {isAdmin ? 'Add a feed to start loading carrier jobs.' : "Your admin hasn't added any feeds yet. Check back soon."}
          </div>
          {isAdmin && (
            <button onClick={() => setShowFeedManager(true)} style={{ padding: '10px 24px', background: '#534AB7', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>⚙ Add Your First Feed</button>
          )}
        </div>
      )}

      {/* Job cards */}
      {(loading || feeds.length > 0) && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {loading ? (
            [1, 2, 3, 4].map(i => <div key={i} style={{ background: 'white', borderRadius: 10, height: 80, border: '1px solid #e2e8f0' }} />)
          ) : jobs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#a0aec0' }}>
              <div style={{ fontSize: 13 }}>No jobs match your filters. Try adjusting your search.</div>
            </div>
          ) : jobs.map(job => {
            const isSel = selected.has(job.id)
            const isExp = expanded === job.id

            // Pull from raw_data first (full schema), fallback to top-level columns
            const raw = parseRaw(job)

            const carrierName   = raw.client_name    || job.carrier_name  || '—'
            const jobTitle      = raw.job_title       || job.job_title     || '—'
            const location      = raw.city && raw.state ? `${raw.city}, ${raw.state}` : job.location || ''
            const homeTime      = raw.campaign_name_filter || raw.home_time || job.home_time || ''
            const driverType    = raw.driver_type     || ''
            const truckType     = raw.truck_type      || ''
            const licenseType   = raw.license_type    || ''
            const jobType       = raw.job_type        || ''
            const jobStatus     = raw.job_status      || ''
            const salary        = raw.salary          || raw.base_salary   || ''
            const annualPay     = raw.pay             || ''

            // Pay — prefer stored columns, fall back to raw
            const weeklyPay     = job.weekly_pay      || null
            const cpm           = job.cpm             || (raw.cents_per_mile ? String(raw.cents_per_mile) : null)

            // Content sections — all from raw_data schema fields
            const description   = stripHtml(raw.description   || job.description   || '')
            const benefits      = stripHtml(raw.job_benefits   || job.job_benefits  || '')
            const requirements  = stripHtml(raw.job_requirements || job.job_requirements || '')

            // Application link — application_link from schema (NOT base_url)
            const appLink = raw.application_link || job.application_link || ''

            const score = job.match_score || 0

            return (
              <div key={job.id} id={`carrier-card-${job.id}`} style={{
                background: isSel ? '#ebf8ff' : 'white',
                borderRadius: 10,
                border: `1px solid ${isSel ? '#3182ce' : isExp ? '#AFA9EC' : '#e2e8f0'}`,
                transition: 'border-color 0.15s'
              }}>

                {/* Summary row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '11px 13px' }}>

                  {/* Checkbox */}
                  <div onClick={() => toggleSelect(job.id)} style={{
                    width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 2, cursor: 'pointer',
                    border: `2px solid ${isSel ? '#3182ce' : '#cbd5e0'}`,
                    background: isSel ? '#3182ce' : 'white',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'white'
                  }}>{isSel ? '✓' : ''}</div>

                  {/* Info — tap to expand */}
                  <div onClick={() => handleExpand(job.id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: '#1a202c', marginBottom: 1 }}>{carrierName}</div>
                    <div style={{ fontSize: 12, color: '#718096', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{jobTitle}</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 5 }}>
                      {location  && <span style={{ fontSize: 11, color: '#4a5568' }}>📍 {location}</span>}
                      {homeTime  && <span style={{ fontSize: 11, color: '#718096' }}>🏠 {homeTime}</span>}
                      {truckType && <span style={{ fontSize: 11, color: '#a0aec0' }}>🚛 {truckType}</span>}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {weeklyPay && <span style={{ fontSize: 12, fontWeight: 700, color: '#276749' }}>${Number(weeklyPay).toLocaleString()}/wk</span>}
                      {cpm && <span style={{ fontSize: 12, fontWeight: 600, color: '#2b6cb0' }}>{cpm}¢/mi</span>}
                      {salary && !weeklyPay && !cpm && <span style={{ fontSize: 12, color: '#718096' }}>{salary}</span>}
                      <ScoreBar score={score} />
                      <span style={{ fontSize: 10, color: isExp ? '#534AB7' : '#cbd5e0', marginLeft: 'auto' }}>
                        {isExp ? '▲ less' : '▼ details'}
                      </span>
                    </div>
                  </div>

                  {/* Quick add */}
                  <button onClick={e => { e.stopPropagation(); queueJob(job.id) }} style={{
                    padding: '7px 12px', background: '#534AB7', color: 'white', border: 'none',
                    borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0
                  }}>Add</button>
                </div>

                {/* Expanded panel */}
                {isExp && (
                  <div style={{ borderTop: '1px solid #f0f0f0', padding: '14px 14px 16px', background: '#fafbfc', borderRadius: '0 0 10px 10px' }}>

                    {/* Pay / type tiles */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
                      {weeklyPay && (
                        <div style={{ background: '#f0fff4', border: '1px solid #9ae6b4', borderRadius: 8, padding: '8px 12px', flex: 1, minWidth: 80 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#276749', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>Weekly Pay</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#276749' }}>${Number(weeklyPay).toLocaleString()}<span style={{ fontSize: 11, fontWeight: 400 }}>/wk</span></div>
                        </div>
                      )}
                      {cpm && (
                        <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: 8, padding: '8px 12px', flex: 1, minWidth: 80 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#2b6cb0', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>CPM Rate</div>
                          <div style={{ fontSize: 16, fontWeight: 700, color: '#2b6cb0' }}>{cpm}<span style={{ fontSize: 11, fontWeight: 400 }}>¢/mile</span></div>
                        </div>
                      )}
                      {annualPay && (
                        <div style={{ background: '#f0fff4', border: '1px solid #9ae6b4', borderRadius: 8, padding: '8px 12px', flex: 1, minWidth: 80 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#276749', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>Annual Pay</div>
                          <div style={{ fontSize: 14, fontWeight: 700, color: '#276749' }}>{annualPay}</div>
                        </div>
                      )}
                      {homeTime && (
                        <div style={{ background: '#faf5ff', border: '1px solid #d6bcfa', borderRadius: 8, padding: '8px 12px', flex: 1, minWidth: 80 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: '#553c9a', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 3 }}>Home Time</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#553c9a' }}>{homeTime}</div>
                        </div>
                      )}
                    </div>

                    {/* Meta tags row */}
                    {(driverType || truckType || licenseType || jobType || jobStatus) && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                        {driverType  && <span style={{ padding: '3px 9px', background: '#EEEDFE', color: '#3C3489', border: '1px solid #AFA9EC', borderRadius: 10, fontSize: 11, fontWeight: 500 }}>{driverType}</span>}
                        {licenseType && <span style={{ padding: '3px 9px', background: '#EEEDFE', color: '#3C3489', border: '1px solid #AFA9EC', borderRadius: 10, fontSize: 11, fontWeight: 500 }}>{licenseType}</span>}
                        {truckType   && <span style={{ padding: '3px 9px', background: '#f0f4f8', color: '#4a5568', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 11 }}>{truckType}</span>}
                        {jobType     && <span style={{ padding: '3px 9px', background: '#f0f4f8', color: '#4a5568', border: '1px solid #e2e8f0', borderRadius: 10, fontSize: 11 }}>{jobType}</span>}
                        {jobStatus   && <span style={{ padding: '3px 9px', background: '#f0fff4', color: '#276749', border: '1px solid #9ae6b4', borderRadius: 10, fontSize: 11 }}>{jobStatus}</span>}
                      </div>
                    )}

                    {/* Job Description */}
                    {description && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>📋 Job Details</div>
                        <div style={{ fontSize: 12, color: '#2d3748', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                          {description.length > 800 ? description.slice(0, 800) + '...' : description}
                        </div>
                      </div>
                    )}

                    {/* Benefits */}
                    {benefits && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>🏆 Benefits</div>
                        <div style={{ fontSize: 12, color: '#2d3748', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                          {benefits.length > 600 ? benefits.slice(0, 600) + '...' : benefits}
                        </div>
                      </div>
                    )}

                    {/* Requirements */}
                    {requirements && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: '#4a5568', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>✅ Requirements</div>
                        <div style={{ fontSize: 12, color: '#2d3748', lineHeight: 1.8, whiteSpace: 'pre-wrap' }}>
                          {requirements.length > 600 ? requirements.slice(0, 600) + '...' : requirements}
                        </div>
                      </div>
                    )}

                    {/* Source */}
                    {job.feed_name && (
                      <div style={{ fontSize: 11, color: '#a0aec0', marginBottom: 12 }}>📡 Source: {job.feed_name}</div>
                    )}

                    {/* Action buttons */}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => queueJob(job.id)} style={{
                        flex: 1, padding: '11px', background: '#534AB7', color: 'white', border: 'none',
                        borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        boxShadow: '0 2px 8px rgba(83,74,183,0.3)'
                      }}>+ Add to Outreach</button>
                      {appLink && (
                        <a href={appLink} target="_blank" rel="noreferrer" style={{
                          flex: 1, padding: '11px', background: 'white', color: '#534AB7',
                          border: '1px solid #AFA9EC', borderRadius: 8, fontSize: 13, fontWeight: 600,
                          textDecoration: 'none', textAlign: 'center',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4
                        }}>Full App ↗</a>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ background: 'white', borderTop: '1px solid #e2e8f0', padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <span style={{ fontSize: 12, color: '#718096', flex: 1 }}>Page {page} of {totalPages} · {total} jobs</span>
          <button onClick={() => loadJobs(page - 1, minScore, feedFilter, rulesOn, search)} disabled={page <= 1} style={{ padding: '5px 12px', border: '1px solid #e2e8f0', background: 'white', borderRadius: 6, fontSize: 12, cursor: 'pointer', opacity: page <= 1 ? 0.4 : 1 }}>‹ Prev</button>
          <button onClick={() => loadJobs(page + 1, minScore, feedFilter, rulesOn, search)} disabled={page >= totalPages} style={{ padding: '5px 12px', border: '1px solid #e2e8f0', background: 'white', borderRadius: 6, fontSize: 12, cursor: 'pointer', opacity: page >= totalPages ? 0.4 : 1 }}>Next ›</button>
        </div>
      )}

      {isAdmin && showFeedManager && (
        <FeedManager onClose={() => setShowFeedManager(false)} onRefresh={() => { loadFeeds(); loadJobs(1, minScore, feedFilter, rulesOn, search) }} />
      )}

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