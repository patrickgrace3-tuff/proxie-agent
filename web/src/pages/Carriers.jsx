import { useEffect, useState } from 'react'
import { client } from '../store/auth'

export default function Carriers() {
  const [jobs, setJobs] = useState([])
  const [feeds, setFeeds] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(null)
  const [showAddFeed, setShowAddFeed] = useState(false)
  const [newFeed, setNewFeed] = useState({ name: '', feed_type: 'json', source: '', is_url: true })

  const loadJobs = () => {
    client.get('/api/feeds/feeds/jobs?page=1&per_page=50&min_score=0')
      .then(r => setJobs(r.data.jobs || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }

  const loadFeeds = () => {
    client.get('/api/feeds/feeds')
      .then(r => setFeeds(r.data.feeds || []))
      .catch(console.error)
  }

  useEffect(() => { loadJobs(); loadFeeds() }, [])

  const handleSync = async (feedId) => {
    setSyncing(feedId)
    try {
      await client.post(`/api/feeds/feeds/${feedId}/sync`)
      loadJobs()
      loadFeeds()
    } catch (e) {
      alert('Sync failed: ' + (e?.response?.data?.detail || e.message))
    } finally {
      setSyncing(null)
    }
  }

  const handleAddFeed = async () => {
    try {
      await client.post('/api/feeds/feeds', newFeed)
      setShowAddFeed(false)
      setNewFeed({ name: '', feed_type: 'json', source: '', is_url: true })
      loadFeeds()
    } catch (e) {
      alert('Failed: ' + (e?.response?.data?.detail || e.message))
    }
  }

  const handleQueue = async (jobId) => {
    try {
      await client.post(`/api/feeds/feeds/jobs/${jobId}/queue`)
      setJobs(prev => prev.filter(j => j.id !== jobId))
    } catch (e) {
      alert('Failed to queue job')
    }
  }

  const filtered = jobs.filter(j =>
    j.carrier_name?.toLowerCase().includes(search.toLowerCase()) ||
    j.job_title?.toLowerCase().includes(search.toLowerCase()) ||
    j.location?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Find Carriers</h1>
          <p className="text-sm text-gray-500">{jobs.length} jobs from {feeds.length} feeds</p>
        </div>
        <button
          onClick={() => setShowAddFeed(true)}
          className="bg-proxie-purple text-white text-sm px-4 py-2 rounded-xl font-medium hover:bg-proxie-deep transition-colors"
        >
          + Feed
        </button>
      </div>

      {feeds.length > 0 && (
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {feeds.map(feed => (
            <div key={feed.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2 flex-shrink-0">
              <span className="text-xs font-medium text-gray-700">{feed.name}</span>
              <span className="text-xs text-gray-400">{feed.job_count || 0} jobs</span>
              <button
                onClick={() => handleSync(feed.id)}
                disabled={syncing === feed.id}
                className="text-xs text-proxie-purple font-medium disabled:opacity-50"
              >
                {syncing === feed.id ? 'Syncing...' : 'Sync'}
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        type="text"
        placeholder="Search carriers, locations..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-proxie-purple bg-white"
      />

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 animate-pulse h-24" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-gray-100">
          <div className="text-4xl mb-3">🚛</div>
          <p className="text-gray-600 font-medium">No carrier jobs yet</p>
          <p className="text-gray-400 text-sm mt-1">Add a feed and click Sync</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(job => (
            <div key={job.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 truncate">{job.carrier_name}</div>
                  <div className="text-sm text-gray-500 truncate">{job.job_title}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{job.location}</div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                    job.match_score >= 70 ? 'bg-green-100 text-green-700' :
                    job.match_score >= 50 ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {job.match_score}%
                  </span>
                  <button
                    onClick={() => handleQueue(job.id)}
                    className="text-xs bg-proxie-purple text-white px-3 py-1 rounded-lg font-medium hover:bg-proxie-deep transition-colors"
                  >
                    Add
                  </button>
                </div>
              </div>
              {(job.cpm || job.weekly_pay || job.home_time) && (
                <div className="flex gap-4 mt-3 pt-3 border-t border-gray-50">
                  {job.cpm && <span className="text-xs text-gray-600"><span className="font-medium">{job.cpm}¢</span> CPM</span>}
                  {job.weekly_pay && <span className="text-xs text-gray-600"><span className="font-medium">${job.weekly_pay?.toLocaleString()}</span>/wk</span>}
                  {job.home_time && <span className="text-xs text-gray-600">{job.home_time}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {showAddFeed && (
        <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-5">
            <h2 className="font-semibold text-gray-900 mb-4">Add Feed</h2>
            <input
              placeholder="Feed name"
              value={newFeed.name}
              onChange={e => setNewFeed(p => ({ ...p, name: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-proxie-purple"
            />
            <select
              value={newFeed.feed_type}
              onChange={e => setNewFeed(p => ({ ...p, feed_type: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-3 focus:outline-none"
            >
              <option value="json">JSON</option>
              <option value="xml">XML</option>
              <option value="csv">CSV</option>
            </select>
            <input
              placeholder="Feed URL"
              value={newFeed.source}
              onChange={e => setNewFeed(p => ({ ...p, source: e.target.value }))}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-proxie-purple"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddFeed(false)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={handleAddFeed}
                className="flex-1 py-2.5 rounded-xl bg-proxie-purple text-white text-sm font-medium"
              >
                Add Feed
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}