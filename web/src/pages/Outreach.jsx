import { useEffect, useState } from 'react'
import { client } from '../store/auth'

const STATUS_COLORS = {
  pending: 'bg-yellow-100 text-yellow-700',
  contacted: 'bg-blue-100 text-blue-700',
  interested: 'bg-green-100 text-green-700',
  not_interested: 'bg-red-100 text-red-700',
  hired: 'bg-purple-100 text-purple-700',
  no_answer: 'bg-gray-100 text-gray-600',
}

export default function Outreach() {
  const [records, setRecords] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    client.get('/api/carriers/outreach-log')
      .then(r => setRecords(r.data.records || r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const filtered = records.filter(r =>
    r.carrier_name?.toLowerCase().includes(search.toLowerCase()) ||
    r.job_title?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Carrier Outreach</h1>
          <p className="text-sm text-gray-500">{records.length} leads in queue</p>
        </div>
      </div>

      <input
        type="text"
        placeholder="Search carriers..."
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-proxie-purple bg-white"
      />

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => (
            <div key={i} className="bg-white rounded-2xl p-4 border border-gray-100 animate-pulse h-24" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-gray-100">
          <div className="text-4xl mb-3">📋</div>
          <p className="text-gray-600 font-medium">No outreach records yet</p>
          <p className="text-gray-400 text-sm mt-1">Add carriers from the Carriers tab</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(record => (
            <div key={record.id} className="bg-white rounded-2xl border border-gray-100 p-4 hover:border-proxie-lavender transition-colors">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 truncate">{record.carrier_name}</div>
                  <div className="text-sm text-gray-500 truncate">{record.job_title}</div>
                  <div className="text-xs text-gray-400 mt-1">{record.location}</div>
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[record.status] || 'bg-gray-100 text-gray-600'}`}>
                    {record.status?.replace('_', ' ')}
                  </span>
                  {record.match_score > 0 && (
                    <span className="text-xs font-semibold text-proxie-purple">{record.match_score}% match</span>
                  )}
                </div>
              </div>
              {(record.cpm || record.weekly_pay_estimate) && (
                <div className="flex gap-4 mt-3 pt-3 border-t border-gray-50">
                  {record.cpm && <span className="text-xs text-gray-600"><span className="font-medium">{record.cpm}¢</span> CPM</span>}
                  {record.weekly_pay_estimate && <span className="text-xs text-gray-600"><span className="font-medium">${record.weekly_pay_estimate?.toLocaleString()}</span>/wk</span>}
                  {record.home_time && <span className="text-xs text-gray-600">{record.home_time}</span>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}