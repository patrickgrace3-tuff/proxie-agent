import { useEffect, useState } from 'react'
import { client } from '../store/auth'

const OUTCOME_COLORS = {
  interested: 'text-green-600',
  not_interested: 'text-red-500',
  no_answer: 'text-gray-400',
  callback: 'text-blue-500',
  hired: 'text-purple-600',
}

export default function CallLog() {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    client.get('/api/voice/call-log')
      .then(r => setCalls(r.data.calls || r.data || []))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const formatDuration = (seconds) => {
    if (!seconds) return '—'
    const m = Math.floor(seconds / 60)
    const s = seconds % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  return (
    <div className="p-4 max-w-2xl mx-auto">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900">Call Log</h1>
        <p className="text-sm text-gray-500">{calls.length} calls recorded</p>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl p-4 h-20 animate-pulse border border-gray-100" />)}
        </div>
      ) : calls.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 bg-white rounded-2xl border border-gray-100">
          <div className="text-4xl mb-3">📞</div>
          <p className="text-gray-600 font-medium">No calls yet</p>
          <p className="text-gray-400 text-sm mt-1">Calls will appear here after outreach</p>
        </div>
      ) : (
        <div className="space-y-3">
          {calls.map(call => (
            <div key={call.id} className="bg-white rounded-2xl border border-gray-100 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-900 truncate">{call.carrier || call.driver_name}</div>
                  <div className="text-xs text-gray-400 mt-0.5">{call.recruiter_phone}</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`text-sm font-medium ${OUTCOME_COLORS[call.outcome] || 'text-gray-500'}`}>
                    {call.outcome?.replace('_', ' ') || call.status}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">{formatDuration(call.duration_seconds)}</div>
                </div>
              </div>
              {call.summary && (
                <div className="mt-3 pt-3 border-t border-gray-50 text-xs text-gray-500 line-clamp-2">
                  {call.summary}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}