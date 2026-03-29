import { useEffect, useState, useCallback } from 'react'
import { client } from '../store/auth'

function Toggle({ label, description, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ flex: 1, paddingRight: 12 }}>
        <div style={{ fontSize: 13, color: '#2d3748' }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: '#a0aec0', marginTop: 2 }}>{description}</div>}
      </div>
      <div onClick={() => onChange(!value)} style={{
        width: 42, height: 24, borderRadius: 12, cursor: 'pointer', flexShrink: 0,
        background: value ? '#534AB7' : '#e2e8f0', position: 'relative', transition: 'background 0.2s'
      }}>
        <div style={{
          position: 'absolute', top: 2, left: value ? 20 : 2, width: 20, height: 20,
          background: 'white', borderRadius: '50%', transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }} />
      </div>
    </div>
  )
}

function Section({ title, children, danger }) {
  return (
    <div style={{
      background: 'white', borderRadius: 12, marginBottom: 12,
      border: danger ? '1px solid #fed7d7' : '1px solid #e2e8f0', overflow: 'hidden'
    }}>
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid #f0f0f0', fontSize: 12,
        fontWeight: 700, color: danger ? '#c53030' : '#4a5568',
        background: danger ? '#fff5f5' : 'white'
      }}>{title}</div>
      <div style={{ padding: '4px 16px 12px' }}>{children}</div>
    </div>
  )
}

function NumberInput({ label, value, onChange, prefix, suffix, placeholder }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ fontSize: 13, color: '#2d3748' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {prefix && <span style={{ fontSize: 12, color: '#718096' }}>{prefix}</span>}
        <input type="number" value={value || ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
          placeholder={placeholder || '—'}
          style={{ width: 72, border: '1px solid #e2e8f0', borderRadius: 7, padding: '5px 8px', fontSize: 13, textAlign: 'right', outline: 'none', fontFamily: 'inherit' }} />
        {suffix && <span style={{ fontSize: 12, color: '#718096' }}>{suffix}</span>}
      </div>
    </div>
  )
}

function Slider({ label, value, onChange, min, max, step = 1, format }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 13, color: '#2d3748' }}>{label}</div>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#2d3748' }}>{format ? format(value) : value}</div>
      </div>
      <input type="range" min={min} max={max} step={step} value={value || min}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#534AB7' }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#a0aec0', marginTop: 2 }}>
        <span>{format ? format(min) : min}</span>
        <span>{format ? format(max) : max}</span>
      </div>
    </div>
  )
}

function RadioGroup({ options, value, onChange }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, paddingTop: 8 }}>
      {options.map(opt => (
        <button key={opt.value} onClick={() => onChange(opt.value)} style={{
          padding: '8px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer', textAlign: 'left',
          border: `1px solid ${value === opt.value ? '#534AB7' : '#e2e8f0'}`,
          background: value === opt.value ? '#EEEDFE' : 'white',
          color: value === opt.value ? '#3C3489' : '#4a5568',
          fontWeight: value === opt.value ? 600 : 400, fontFamily: 'inherit'
        }}>{opt.label}</button>
      ))}
    </div>
  )
}

function CheckGroup({ options, value = [], onChange }) {
  const toggle = (v) => {
    const arr = value.includes(v) ? value.filter(x => x !== v) : [...value, v]
    onChange(arr)
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, paddingTop: 8 }}>
      {options.map(opt => (
        <button key={opt} onClick={() => toggle(opt)} style={{
          padding: '7px 10px', borderRadius: 8, fontSize: 12, cursor: 'pointer', textAlign: 'left',
          border: `1px solid ${value.includes(opt) ? '#534AB7' : '#e2e8f0'}`,
          background: value.includes(opt) ? '#EEEDFE' : 'white',
          color: value.includes(opt) ? '#3C3489' : '#4a5568',
          fontWeight: value.includes(opt) ? 600 : 400, fontFamily: 'inherit'
        }}>{opt}</button>
      ))}
    </div>
  )
}

const GEO_MODES = [
  { value: 'radius', label: '📍 Radius' },
  { value: 'statewide', label: '🗺 Statewide' },
  { value: 'regions', label: '🌎 Regions' },
]

const HOME_TIME_OPTIONS = [
  { value: '', label: 'Flexible / Any' },
  { value: 'Daily', label: 'Daily (local)' },
  { value: 'Weekly', label: 'Home weekly' },
  { value: 'Bi-Weekly', label: 'Every 2 weeks' },
  { value: 'Regional OTR', label: 'Regional OTR' },
  { value: 'OTR', label: 'OTR (3-4 wks)' },
]

const REGIONS = ['Southeast', 'Northeast', 'Midwest', 'Southwest', 'Northwest', 'National']
const PAY_TYPES = ['CPM', 'Percentage', 'Hourly', 'Salary']

export default function Rules() {
  const [rules, setRules] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [toast, setToast] = useState('')

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const load = useCallback(async () => {
    try {
      const r = await client.get('/api/rules/')
      setRules(r.data)
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const update = (key, value) => setRules(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    try {
      await client.post('/api/rules/save', rules)
      setSaved(true)
      showToast('Rules saved!')
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      showToast('Save failed: ' + (e?.response?.data?.detail || e.message))
    } finally { setSaving(false) }
  }

  const handleActivate = async () => {
    try {
      await handleSave()
      const endpoint = rules?.rules_active ? '/api/rules/deactivate' : '/api/rules/activate'
      await client.post(endpoint)
      update('rules_active', !rules?.rules_active)
      showToast(rules?.rules_active ? 'Agent deactivated' : 'Agent activated!')
    } catch (e) { showToast('Failed') }
  }

  if (loading) return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1, 2, 3].map(i => <div key={i} style={{ background: 'white', borderRadius: 12, height: 100, border: '1px solid #e2e8f0' }} />)}
    </div>
  )

  const active = rules?.rules_active

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', background: '#f7fafc' }}>

      {/* Status bar */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: active ? '#68d391' : '#e53e3e', boxShadow: active ? '0 0 6px #68d391' : 'none' }} />
          <span style={{ fontWeight: 600, fontSize: 13, color: active ? '#276749' : '#c53030' }}>
            {active ? 'Agent rules active' : 'Agent rules inactive'}
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button onClick={load} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', background: 'white', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>↺ Discard</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: '6px 12px', background: '#38a169', color: 'white', border: 'none',
            borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1
          }}>{saving ? 'Saving...' : saved ? '✓ Saved!' : '✓ Save'}</button>
          <button onClick={handleActivate} style={{
            padding: '6px 14px', color: 'white', border: 'none', borderRadius: 7,
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
            background: active ? '#e53e3e' : '#534AB7'
          }}>{active ? 'Deactivate' : 'Activate Agent'}</button>
        </div>
      </div>

      {/* Tip */}
      <div style={{ background: '#f0fff4', borderBottom: '1px solid #9ae6b4', padding: '8px 16px', fontSize: 12, color: '#276749', flexShrink: 0 }}>
        💡 The agent uses these rules to score and filter carriers. Leave blank = flexible.
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 100px' }}>

        {/* Pay */}
        <Section title="💵 Pay Requirements">
          <NumberInput label="Minimum CPM" value={rules?.min_cpm} onChange={v => update('min_cpm', v)} suffix="¢/mile" placeholder="e.g. 55" />
          <NumberInput label="Minimum weekly gross" value={rules?.min_weekly_gross} onChange={v => update('min_weekly_gross', v)} prefix="$" placeholder="e.g. 1500" />
          <div style={{ paddingTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Accepted pay types</div>
            <CheckGroup options={PAY_TYPES} value={rules?.pay_types_accepted || []} onChange={v => update('pay_types_accepted', v)} />
          </div>
        </Section>

        {/* Home Time */}
        <Section title="🏠 Home Time">
          <div style={{ paddingTop: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Minimum home time required</div>
            <RadioGroup options={HOME_TIME_OPTIONS} value={rules?.home_time_requirement || ''} onChange={v => update('home_time_requirement', v)} />
          </div>
          <Slider label="Max consecutive days away" value={rules?.max_days_out || 14} onChange={v => update('max_days_out', v)} min={1} max={30} format={v => `${v} days`} />
          <Toggle label="Overnights OK" value={rules?.overnights_ok !== false} onChange={v => update('overnights_ok', v)} />
          <Toggle label="Open to team driving for higher pay" value={rules?.team_driving_ok} onChange={v => update('team_driving_ok', v)} />
        </Section>

        {/* Geography */}
        <Section title="🗺️ Geography & Territory">
          <div style={{ padding: '10px 0', borderBottom: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 13, color: '#2d3748', marginBottom: 6 }}>Home zip code</div>
            <input value={rules?.home_zip || ''} onChange={e => update('home_zip', e.target.value)} placeholder="e.g. 37122" maxLength={5}
              style={{ width: 120, border: '1px solid #e2e8f0', borderRadius: 7, padding: '7px 10px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
          </div>
          <div style={{ paddingTop: 10, paddingBottom: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 8 }}>Search area</div>
            <div style={{ display: 'flex', gap: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              {GEO_MODES.map(m => (
                <button key={m.value} onClick={() => update('geography_mode', m.value)} style={{
                  flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer', fontSize: 11,
                  fontFamily: 'inherit', fontWeight: rules?.geography_mode === m.value ? 600 : 400,
                  background: rules?.geography_mode === m.value ? '#534AB7' : 'white',
                  color: rules?.geography_mode === m.value ? 'white' : '#718096',
                  borderRight: '1px solid #e2e8f0'
                }}>{m.label}</button>
              ))}
            </div>
          </div>
          {rules?.geography_mode === 'radius' && (
            <Slider label="Miles from home zip" value={rules?.radius_miles || 250} onChange={v => update('radius_miles', v)} min={50} max={1000} step={50} format={v => `${v} mi`} />
          )}
          {rules?.geography_mode === 'regions' && (
            <div style={{ paddingTop: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#718096', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 6 }}>Preferred regions</div>
              <CheckGroup options={REGIONS} value={rules?.preferred_regions || []} onChange={v => update('preferred_regions', v)} />
            </div>
          )}
          {rules?.geography_mode === 'statewide' && (
            <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#2c5282', marginTop: 8 }}>
              Only contact carriers operating in your home state.
            </div>
          )}
          <div style={{ paddingTop: 10 }}>
            <div style={{ fontSize: 13, color: '#2d3748', marginBottom: 6 }}>Never operate in these states <span style={{ fontSize: 11, color: '#a0aec0' }}>(comma separated)</span></div>
            <input value={(rules?.states_blacklist || []).join(', ')} onChange={e => update('states_blacklist', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="e.g. CA, NY, IL"
              style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
        </Section>

        {/* Load Preferences */}
        <Section title="📦 Load Preferences">
          <Toggle label="No-touch freight required" description="Never unload" value={rules?.no_touch_freight_required} onChange={v => update('no_touch_freight_required', v)} />
          <Toggle label="Drop-and-hook preferred" value={rules?.drop_and_hook_preferred} onChange={v => update('drop_and_hook_preferred', v)} />
          <Toggle label="Hazmat loads accepted" value={rules?.hazmat_ok} onChange={v => update('hazmat_ok', v)} />
        </Section>

        {/* Benefits */}
        <Section title="🏢 Benefits & Company Requirements">
          <Toggle label="Health insurance required" value={rules?.requires_health_insurance} onChange={v => update('requires_health_insurance', v)} />
          <Toggle label="401(k) required" value={rules?.requires_401k} onChange={v => update('requires_401k', v)} />
          <Toggle label="Full benefits package required" value={rules?.requires_benefits} onChange={v => update('requires_benefits', v)} />
          <Toggle label="Pet policy required" value={rules?.pet_policy_required} onChange={v => update('pet_policy_required', v)} />
          <Toggle label="Rider policy required" value={rules?.rider_policy_required} onChange={v => update('rider_policy_required', v)} />
          <NumberInput label="Min fleet size (trucks)" value={rules?.min_fleet_size} onChange={v => update('min_fleet_size', v)} placeholder="e.g. 50" />
        </Section>

        {/* Carrier Lists */}
        <Section title="📋 Carrier Lists">
          <div style={{ paddingTop: 10, borderBottom: '1px solid #f0f0f0', paddingBottom: 12 }}>
            <div style={{ fontSize: 13, color: '#2d3748', marginBottom: 4 }}>⭐ Priority carriers <span style={{ fontSize: 11, color: '#a0aec0' }}>(contact first)</span></div>
            <input value={(rules?.preferred_carriers || []).join(', ')} onChange={e => update('preferred_carriers', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="e.g. Werner, Schneider, Swift"
              style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            <div style={{ fontSize: 10, color: '#a0aec0', marginTop: 3 }}>Comma separated — scored higher and contacted first</div>
          </div>
          <div style={{ paddingTop: 12 }}>
            <div style={{ fontSize: 13, color: '#2d3748', marginBottom: 4 }}>🚫 Blocked carriers <span style={{ fontSize: 11, color: '#a0aec0' }}>(never contact)</span></div>
            <input value={(rules?.blacklisted_carriers || []).join(', ')} onChange={e => update('blacklisted_carriers', e.target.value.split(',').map(s => s.trim()).filter(Boolean))}
              placeholder="e.g. Carrier A, Carrier B"
              style={{ width: '100%', border: '1px solid #e2e8f0', borderRadius: 7, padding: '8px 10px', fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
          </div>
        </Section>

        {/* Agent Behavior */}
        <Section title="🤖 Agent Behavior">
          <Toggle label="Require my approval before calling" description="Recommended" value={rules?.require_approval_before_call !== false} onChange={v => update('require_approval_before_call', v)} />
          <Toggle label="Allow agent to call autonomously" value={rules?.auto_call_enabled} onChange={v => update('auto_call_enabled', v)} />
          <Toggle label="Allow agent to email autonomously" value={rules?.auto_email_enabled} onChange={v => update('auto_email_enabled', v)} />
          {rules?.auto_call_enabled && (
            <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#c53030', margin: '8px 0' }}>
              ⚠️ The agent will make calls without asking first. Make sure your rules are set before enabling this.
            </div>
          )}
          <Slider label="Max outreach contacts per day" value={rules?.max_outreach_per_day || 5} onChange={v => update('max_outreach_per_day', v)} min={1} max={20} format={v => `${v}/day`} />
        </Section>

        {/* Auto-Reject */}
        <Section title="🚫 Auto-Reject Conditions" danger>
          <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#c53030', margin: '8px 0 4px' }}>
            Any carrier matching these conditions is automatically skipped — even if everything else looks good.
          </div>
          <Toggle label="Forced dispatch policy" value={rules?.reject_if_forced_dispatch} onChange={v => update('reject_if_forced_dispatch', v)} />
          <Toggle label="Lease-purchase only" description="Not company driver" value={rules?.reject_if_lease_purchase_only} onChange={v => update('reject_if_lease_purchase_only', v)} />
          <Toggle label="No ELD provided by carrier" value={rules?.reject_if_no_ELD_provided} onChange={v => update('reject_if_no_ELD_provided', v)} />
          <Toggle label="No sign-on bonus offered" value={rules?.reject_if_no_sign_on_bonus} onChange={v => update('reject_if_no_sign_on_bonus', v)} />
        </Section>

      </div>

      {/* Save button — sticky on mobile, inline on desktop */}
      <div style={{
        padding: '12px 14px 16px',
        borderTop: '1px solid #e2e8f0',
        background: 'white',
        flexShrink: 0,
      }}>
        <button onClick={handleSave} disabled={saving} style={{
          width: '100%', padding: '14px', background: saved ? '#38a169' : '#534AB7',
          color: 'white', border: 'none', borderRadius: 14, fontSize: 15, fontWeight: 700,
          cursor: 'pointer', boxShadow: '0 4px 16px rgba(83,74,183,0.3)',
          transition: 'background 0.2s', opacity: saving ? 0.7 : 1,
          fontFamily: 'inherit'
        }}>
          {saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Rules'}
        </button>
      </div>

      {/* Toast */}
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