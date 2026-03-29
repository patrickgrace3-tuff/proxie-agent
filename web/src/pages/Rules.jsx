import { useEffect, useState } from 'react'
import { client } from '../store/auth'

function Toggle({ label, description, value, onChange }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div className="flex-1 min-w-0 pr-4">
        <div className="text-sm font-medium text-gray-800">{label}</div>
        {description && <div className="text-xs text-gray-400 mt-0.5">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${value ? 'bg-proxie-purple' : 'bg-gray-200'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${value ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  )
}

function NumberInput({ label, value, onChange, prefix, suffix, min, max, step = 1 }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-gray-50 last:border-0">
      <div className="text-sm font-medium text-gray-800">{label}</div>
      <div className="flex items-center gap-1.5">
        {prefix && <span className="text-sm text-gray-400">{prefix}</span>}
        <input
          type="number"
          value={value || ''}
          onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
          min={min} max={max} step={step}
          className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-proxie-purple"
        />
        {suffix && <span className="text-sm text-gray-400">{suffix}</span>}
      </div>
    </div>
  )
}

export default function Rules() {
  const [rules, setRules] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    client.get('/api/rules/')
      .then(r => setRules(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  const update = (key, value) => setRules(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await client.post('/api/rules/save', rules)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      alert('Save failed: ' + (e?.response?.data?.detail || e.message))
    } finally {
      setSaving(false)
    }
  }

  const handleActivate = async () => {
    try {
      await client.post(rules?.rules_active ? '/api/rules/deactivate' : '/api/rules/activate')
      setRules(prev => ({ ...prev, rules_active: !prev.rules_active }))
    } catch (e) {
      alert('Failed to toggle rules')
    }
  }

  if (loading) return (
    <div className="p-4 space-y-3">
      {[1,2,3].map(i => <div key={i} className="bg-white rounded-2xl p-4 h-32 animate-pulse border border-gray-100" />)}
    </div>
  )

  return (
    <div className="p-4 max-w-2xl mx-auto pb-24">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Proxie Rules</h1>
          <p className="text-sm text-gray-500">Set your job preferences</p>
        </div>
        <button
          onClick={handleActivate}
          className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
            rules?.rules_active
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          {rules?.rules_active ? '✓ Active' : 'Inactive'}
        </button>
      </div>

      <div className="space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Pay Requirements</h2>
          <NumberInput label="Minimum CPM" value={rules?.min_cpm} onChange={v => update('min_cpm', v)} suffix="¢" min={0} max={200} />
          <NumberInput label="Minimum Weekly" value={rules?.min_weekly_gross} onChange={v => update('min_weekly_gross', v)} prefix="$" min={0} step={50} />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Home Time</h2>
          <div className="py-2">
            <label className="text-sm font-medium text-gray-800 block mb-2">Requirement</label>
            <select
              value={rules?.home_time_requirement || ''}
              onChange={e => update('home_time_requirement', e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-proxie-purple"
            >
              <option value="">Any</option>
              <option value="Daily">Daily</option>
              <option value="Weekly">Weekly</option>
              <option value="Bi-Weekly">Bi-Weekly</option>
              <option value="Regional OTR">Regional OTR</option>
              <option value="OTR">OTR</option>
            </select>
          </div>
          <NumberInput label="Max Days Out" value={rules?.max_days_out} onChange={v => update('max_days_out', v)} suffix="days" min={0} max={30} />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Freight Preferences</h2>
          <Toggle label="No Touch Freight Required" value={rules?.no_touch_freight_required} onChange={v => update('no_touch_freight_required', v)} />
          <Toggle label="Drop & Hook Preferred" value={rules?.drop_and_hook_preferred} onChange={v => update('drop_and_hook_preferred', v)} />
          <Toggle label="Hazmat OK" value={rules?.hazmat_ok} onChange={v => update('hazmat_ok', v)} />
          <Toggle label="Team Driving OK" value={rules?.team_driving_ok} onChange={v => update('team_driving_ok', v)} />
          <Toggle label="Overnights OK" value={rules?.overnights_ok} onChange={v => update('overnights_ok', v)} />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Benefits</h2>
          <Toggle label="Requires Health Insurance" value={rules?.requires_health_insurance} onChange={v => update('requires_health_insurance', v)} />
          <Toggle label="Requires 401k" value={rules?.requires_401k} onChange={v => update('requires_401k', v)} />
          <Toggle label="Pet Policy Required" value={rules?.pet_policy_required} onChange={v => update('pet_policy_required', v)} />
          <Toggle label="Rider Policy Required" value={rules?.rider_policy_required} onChange={v => update('rider_policy_required', v)} />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Outreach Settings</h2>
          <Toggle label="Auto Call Enabled" value={rules?.auto_call_enabled} onChange={v => update('auto_call_enabled', v)} />
          <Toggle label="Require Approval Before Call" value={rules?.require_approval_before_call} onChange={v => update('require_approval_before_call', v)} />
          <NumberInput label="Max Outreach Per Day" value={rules?.max_outreach_per_day} onChange={v => update('max_outreach_per_day', v)} suffix="per day" min={1} max={50} />
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-4">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Reject If</h2>
          <Toggle label="Forced Dispatch" value={rules?.reject_if_forced_dispatch} onChange={v => update('reject_if_forced_dispatch', v)} />
          <Toggle label="Lease Purchase Only" value={rules?.reject_if_lease_purchase_only} onChange={v => update('reject_if_lease_purchase_only', v)} />
          <Toggle label="No ELD Provided" value={rules?.reject_if_no_ELD_provided} onChange={v => update('reject_if_no_ELD_provided', v)} />
          <Toggle label="No Sign-On Bonus" value={rules?.reject_if_no_sign_on_bonus} onChange={v => update('reject_if_no_sign_on_bonus', v)} />
        </div>
      </div>

      <div className="fixed bottom-16 md:bottom-4 left-0 right-0 px-4 md:px-8 md:max-w-2xl md:mx-auto">
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-proxie-purple text-white py-3.5 rounded-2xl font-semibold text-sm shadow-lg disabled:opacity-60 hover:bg-proxie-deep transition-colors"
        >
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Rules'}
        </button>
      </div>
    </div>
  )
}