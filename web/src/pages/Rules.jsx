import { useEffect, useState, useCallback } from 'react'
import { client } from '../store/auth'

// ── Shared UI ─────────────────────────────────────────────────────────────────
function Toggle({ label, description, value, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f7f7f7' }}>
      <div style={{ flex: 1, paddingRight: 12 }}>
        <div style={{ fontSize: 13, color: '#2d3748' }}>{label}</div>
        {description && <div style={{ fontSize: 11, color: '#a0aec0', marginTop: 1 }}>{description}</div>}
      </div>
      <div onClick={() => onChange(!value)} style={{
        width: 44, height: 26, borderRadius: 13, cursor: 'pointer', flexShrink: 0,
        background: value ? '#534AB7' : '#e2e8f0', position: 'relative', transition: 'background 0.2s'
      }}>
        <div style={{
          position: 'absolute', top: 3, left: value ? 21 : 3, width: 20, height: 20,
          background: 'white', borderRadius: '50%', transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }} />
      </div>
    </div>
  )
}

function Card({ title, danger, children }) {
  return (
    <div style={{ background: 'white', borderRadius: 12, marginBottom: 12, border: danger ? '1px solid #fed7d7' : '1px solid #e2e8f0', overflow: 'hidden' }}>
      <div style={{ padding: '11px 16px', borderBottom: '1px solid #f0f0f0', fontSize: 12, fontWeight: 700, color: danger ? '#c53030' : '#4a5568', background: danger ? '#fff5f5' : '#fafbfc' }}>{title}</div>
      <div style={{ padding: '8px 16px 14px' }}>{children}</div>
    </div>
  )
}

function NumberInput({ label, hint, value, onChange, prefix, suffix, placeholder }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f7f7f7' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13, color: '#2d3748' }}>{label}</div>
        {hint && <div style={{ fontSize: 10, color: '#a0aec0', marginTop: 1 }}>{hint}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        {prefix && <span style={{ fontSize: 12, color: '#718096' }}>{prefix}</span>}
        <input type="number" value={value || ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : null)}
          placeholder={placeholder || '—'}
          style={{ width: 80, border: '1px solid #e2e8f0', borderRadius: 7, padding: '6px 8px', fontSize: 13, textAlign: 'right', outline: 'none', fontFamily: 'inherit' }} />
        {suffix && <span style={{ fontSize: 12, color: '#718096' }}>{suffix}</span>}
      </div>
    </div>
  )
}

function Slider({ label, hint, value, onChange, min, max, step = 1, format }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid #f7f7f7' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 13, color: '#2d3748' }}>{label}</div>
          {hint && <div style={{ fontSize: 10, color: '#a0aec0', marginTop: 1 }}>{hint}</div>}
        </div>
        <div style={{ fontSize: 15, fontWeight: 700, color: '#2d3748' }}>{format ? format(value) : value}</div>
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

function RadioGroup({ label, options, value, onChange }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid #f7f7f7' }}>
      {label && <div style={{ fontSize: 13, color: '#2d3748', marginBottom: 8 }}>{label}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
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
    </div>
  )
}

function CheckGroup({ label, options, value = [], onChange }) {
  const toggle = (v) => {
    const arr = value.includes(v) ? value.filter(x => x !== v) : [...value, v]
    onChange(arr)
  }
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid #f7f7f7' }}>
      {label && <div style={{ fontSize: 13, color: '#2d3748', marginBottom: 8 }}>{label}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
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
    </div>
  )
}

function TagInput({ label, hint, tags = [], onChange, danger }) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim()
    if (!v || tags.includes(v)) return
    onChange([...tags, v])
    setInput('')
  }
  const remove = (i) => onChange(tags.filter((_, idx) => idx !== i))
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid #f7f7f7' }}>
      {label && <div style={{ fontSize: 13, color: '#2d3748', marginBottom: 4 }}>{label}</div>}
      {hint && <div style={{ fontSize: 11, color: '#a0aec0', marginBottom: 6 }}>{hint}</div>}
      <div style={{ display: 'flex', gap: 6 }}>
        <input value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
          placeholder="Type and press Enter or Add"
          style={{ flex: 1, padding: '7px 10px', border: `1px solid ${danger ? '#fed7d7' : '#e2e8f0'}`, borderRadius: 7, fontSize: 12, outline: 'none', fontFamily: 'inherit' }} />
        <button onClick={add} style={{
          padding: '7px 12px', borderRadius: 7, fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          background: danger ? '#fed7d7' : '#EEEDFE', color: danger ? '#c53030' : '#534AB7',
          border: `1px solid ${danger ? '#feb2b2' : '#AFA9EC'}`, fontWeight: 600
        }}>Add</button>
      </div>
      {tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
          {tags.map((t, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              padding: '3px 10px', borderRadius: 12, fontSize: 11, fontWeight: 500,
              background: danger ? '#fff5f5' : '#EEEDFE',
              color: danger ? '#c53030' : '#3C3489',
              border: `1px solid ${danger ? '#fed7d7' : '#AFA9EC'}`
            }}>
              {t}
              <button onClick={() => remove(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', fontSize: 13, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function TextInput({ label, hint, value, onChange, placeholder }) {
  return (
    <div style={{ padding: '10px 0', borderBottom: '1px solid #f7f7f7' }}>
      {label && <div style={{ fontSize: 13, color: '#2d3748', marginBottom: 4 }}>{label}</div>}
      {hint && <div style={{ fontSize: 11, color: '#a0aec0', marginBottom: 6 }}>{hint}</div>}
      <input value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width: '100%', padding: '8px 10px', border: '1px solid #e2e8f0', borderRadius: 7, fontSize: 13, outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
    </div>
  )
}

// ── Constants ─────────────────────────────────────────────────────────────────
const HOME_TIME_OPTS = [
  { value: '', label: 'Flexible / Any' },
  { value: 'Daily', label: 'Daily (local)' },
  { value: 'Weekly', label: 'Home weekly' },
  { value: 'Bi-Weekly', label: 'Every 2 weeks' },
  { value: 'Regional OTR', label: 'Regional OTR' },
  { value: 'OTR', label: 'OTR (3-4 wks)' },
]

const PAY_TYPES = ['CPM', 'Percentage', 'Hourly', 'Salary']
const REGIONS = ['Southeast', 'Northeast', 'Midwest', 'Southwest', 'Northwest', 'National']
const GEO_MODES = [
  { value: 'radius', label: '📍 Radius' },
  { value: 'statewide', label: '🗺 Statewide' },
  { value: 'regions', label: '🌎 Regions' },
]

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Rules() {
  const [rules, setRules] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [toast, setToast] = useState('')

  // Custom tag arrays (not stored in rules obj directly)
  const [customLoadPrefs, setCustomLoadPrefs] = useState([])
  const [customReqs, setCustomReqs] = useState([])
  const [customRejects, setCustomRejects] = useState([])

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 2500) }

  const load = useCallback(async () => {
    try {
      const r = await client.get('/api/rules/')
      const d = r.data
      setRules(d)
      setCustomLoadPrefs(d.custom_load_prefs || [])
      setCustomReqs(d.custom_requirements || [])
      setCustomRejects(d.custom_reject_conditions || [])
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const upd = (key, value) => setRules(prev => ({ ...prev, [key]: value }))

  const handleSave = async () => {
    setSaving(true)
    const payload = {
      ...rules,
      custom_load_prefs: customLoadPrefs,
      custom_requirements: customReqs,
      custom_reject_conditions: customRejects,
    }
    try {
      await client.post('/api/rules/save', payload)
      setSaved(true)
      showToast('Rules saved!')
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      showToast('Save failed: ' + (e?.response?.data?.detail || e.message))
    } finally { setSaving(false) }
  }

  const handleActivate = async () => {
    await handleSave()
    try {
      const endpoint = rules?.rules_active ? '/api/rules/deactivate' : '/api/rules/activate'
      await client.post(endpoint)
      upd('rules_active', !rules?.rules_active)
      showToast(rules?.rules_active ? 'Agent deactivated' : 'Agent activated!')
    } catch (e) { showToast('Failed') }
  }

  if (loading || !rules) return (
    <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[1,2,3].map(i => <div key={i} style={{ background: 'white', borderRadius: 12, height: 100, border: '1px solid #e2e8f0' }} />)}
    </div>
  )

  const active = rules.rules_active
  const r = rules

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: 'Inter, system-ui, sans-serif', background: '#f7fafc' }}>

      {/* Status bar */}
      <div style={{ background: 'white', borderBottom: '1px solid #e2e8f0', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0, flexWrap: 'wrap', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: active ? '#68d391' : '#e53e3e', boxShadow: active ? '0 0 6px #68d391' : 'none' }} />
          <span style={{ fontWeight: 600, fontSize: 13, color: active ? '#276749' : '#c53030' }}>
            {active ? 'Agent rules active' : 'Agent rules inactive'}
          </span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={load} style={{ padding: '6px 12px', border: '1px solid #e2e8f0', background: 'white', borderRadius: 7, fontSize: 12, cursor: 'pointer' }}>↺ Discard</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '6px 12px', background: '#38a169', color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving...' : saved ? '✓ Saved!' : '✓ Save'}
          </button>
          <button onClick={handleActivate} style={{ padding: '6px 14px', color: 'white', border: 'none', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: active ? '#e53e3e' : '#534AB7' }}>
            {active ? 'Deactivate' : 'Activate Agent'}
          </button>
        </div>
      </div>

      {/* Tip */}
      <div style={{ background: '#f0fff4', borderBottom: '1px solid #9ae6b4', padding: '8px 16px', fontSize: 12, color: '#276749', flexShrink: 0 }}>
        💡 The agent uses these rules to score and filter carriers. Anything left blank is treated as flexible.
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 12px 16px' }}>

        {/* ── PAY ── */}
        <Card title="💵 Pay Requirements">
          <NumberInput label="Minimum CPM" hint="Industry avg: 50–65¢" value={r.min_cpm} onChange={v => upd('min_cpm', v)} suffix="¢/mile" placeholder="e.g. 55" />
          <NumberInput label="Minimum weekly gross" hint="Industry avg: $1,200–$1,800" value={r.min_weekly_gross} onChange={v => upd('min_weekly_gross', v)} prefix="$" placeholder="e.g. 1500" />
          <CheckGroup label="Accepted pay structures" options={PAY_TYPES} value={r.pay_types_accepted || []} onChange={v => upd('pay_types_accepted', v)} />
          <div style={{ paddingTop: 10 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#92400e', background: '#fffbeb', border: '1px solid #fef3c7', borderRadius: 7, padding: '8px 10px', marginBottom: 6 }}>📈 Pay bonuses to look for</div>
            <Toggle label="Require sign-on bonus" value={r.reject_if_no_sign_on_bonus} onChange={v => upd('reject_if_no_sign_on_bonus', v)} />
            <Toggle label="Detention pay" value={r.requires_detention_pay} onChange={v => upd('requires_detention_pay', v)} />
            <Toggle label="Layover pay" value={r.requires_layover_pay} onChange={v => upd('requires_layover_pay', v)} />
            <Toggle label="Fuel surcharge" value={r.requires_fuel_surcharge} onChange={v => upd('requires_fuel_surcharge', v)} />
          </div>
        </Card>

        {/* ── HOME TIME ── */}
        <Card title="🏠 Home Time">
          <RadioGroup label="Minimum home time required" options={HOME_TIME_OPTS} value={r.home_time_requirement || ''} onChange={v => upd('home_time_requirement', v)} />
          <Slider label="Max consecutive days away from home" value={r.max_days_out || 14} onChange={v => upd('max_days_out', v)} min={1} max={30} format={v => `${v} days`} />
          <Toggle label="Overnights OK" value={r.overnights_ok !== false} onChange={v => upd('overnights_ok', v)} />
          <Toggle label="Open to team driving for higher pay" value={r.team_driving_ok} onChange={v => upd('team_driving_ok', v)} />
        </Card>

        {/* ── GEOGRAPHY ── */}
        <Card title="🗺️ Geography & Territory">
          <div style={{ padding: '10px 0', borderBottom: '1px solid #f7f7f7' }}>
            <div style={{ fontSize: 13, color: '#2d3748', marginBottom: 6 }}>Home zip code</div>
            <input value={r.home_zip || ''} onChange={e => upd('home_zip', e.target.value)} placeholder="e.g. 37122" maxLength={5}
              style={{ width: 110, border: '1px solid #e2e8f0', borderRadius: 7, padding: '7px 10px', fontSize: 14, outline: 'none', fontFamily: 'inherit' }} />
          </div>
          <div style={{ padding: '10px 0', borderBottom: '1px solid #f7f7f7' }}>
            <div style={{ fontSize: 13, color: '#2d3748', marginBottom: 8 }}>Search area</div>
            <div style={{ display: 'flex', gap: 0, border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
              {GEO_MODES.map(m => (
                <button key={m.value} onClick={() => upd('geography_mode', m.value)} style={{
                  flex: 1, padding: '8px 4px', border: 'none', cursor: 'pointer', fontSize: 11,
                  fontFamily: 'inherit', fontWeight: r.geography_mode === m.value ? 600 : 400,
                  background: r.geography_mode === m.value ? '#534AB7' : 'white',
                  color: r.geography_mode === m.value ? 'white' : '#718096',
                  borderRight: '1px solid #e2e8f0'
                }}>{m.label}</button>
              ))}
            </div>
          </div>
          {(!r.geography_mode || r.geography_mode === 'radius') && (
            <Slider label="Miles from home zip" value={r.radius_miles || 250} onChange={v => upd('radius_miles', v)} min={50} max={1000} step={50} format={v => `${v} mi`} />
          )}
          {r.geography_mode === 'regions' && (
            <CheckGroup label="Preferred regions" options={REGIONS} value={r.preferred_regions || []} onChange={v => upd('preferred_regions', v)} />
          )}
          {r.geography_mode === 'statewide' && (
            <div style={{ background: '#ebf8ff', border: '1px solid #bee3f8', borderRadius: 8, padding: '10px 12px', fontSize: 12, color: '#2c5282', marginTop: 8 }}>
              Only contact carriers operating in your home state.
            </div>
          )}
          <TextInput label="Never operate in these states" hint="Comma separated — e.g. CA, NY, IL"
            value={(r.states_blacklist || []).join(', ')}
            onChange={v => upd('states_blacklist', v.split(',').map(s => s.trim()).filter(Boolean))}
            placeholder="e.g. CA, NY, IL" />
        </Card>

        {/* ── LOAD PREFERENCES ── */}
        <Card title="📦 Load Preferences">
          <div style={{ fontSize: 11, color: '#718096', padding: '6px 0 4px' }}>Check everything you prefer or require. The agent scores carriers higher that match these.</div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#4a5568', paddingTop: 4 }}>Freight handling</div>
          <Toggle label="No-touch freight" description="Never unload" value={r.no_touch_freight_required} onChange={v => upd('no_touch_freight_required', v)} />
          <Toggle label="Drop-and-hook preferred" value={r.drop_and_hook_preferred} onChange={v => upd('drop_and_hook_preferred', v)} />
          <Toggle label="Hazmat loads accepted" value={r.hazmat_ok} onChange={v => upd('hazmat_ok', v)} />
          <Toggle label="Doubles / triples OK" value={r.doubles_ok} onChange={v => upd('doubles_ok', v)} />
          <div style={{ fontSize: 12, fontWeight: 600, color: '#4a5568', paddingTop: 8 }}>Route & miles</div>
          <Toggle label="Dedicated routes preferred" value={r.dedicated_preferred} onChange={v => upd('dedicated_preferred', v)} />
          <Toggle label="Consistent miles required" value={r.consistent_miles} onChange={v => upd('consistent_miles', v)} />
          <div style={{ fontSize: 12, fontWeight: 600, color: '#4a5568', paddingTop: 8 }}>Equipment</div>
          <Toggle label="ELD provided by carrier" value={r.eld_required} onChange={v => upd('eld_required', v)} />
          <Toggle label="Newer equipment preferred (2020+)" value={r.new_equipment_preferred} onChange={v => upd('new_equipment_preferred', v)} />
          <Toggle label="APU / idle-off required" value={r.apu_required} onChange={v => upd('apu_required', v)} />
          <TagInput label="Custom load preference" hint="Add your own — e.g. No flatbed, refrigerated only..."
            tags={customLoadPrefs} onChange={setCustomLoadPrefs} />
        </Card>

        {/* ── BENEFITS ── */}
        <Card title="🏢 Benefits & Company Requirements">
          <div style={{ fontSize: 12, fontWeight: 600, color: '#4a5568', paddingTop: 4 }}>Benefits</div>
          <Toggle label="Health insurance required" value={r.requires_health_insurance} onChange={v => upd('requires_health_insurance', v)} />
          <Toggle label="Dental & vision required" value={r.requires_dental_vision} onChange={v => upd('requires_dental_vision', v)} />
          <Toggle label="401(k) / retirement plan required" value={r.requires_401k} onChange={v => upd('requires_401k', v)} />
          <Toggle label="Full benefits package required" value={r.requires_benefits} onChange={v => upd('requires_benefits', v)} />
          <Toggle label="Pet policy required" value={r.pet_policy_required} onChange={v => upd('pet_policy_required', v)} />
          <Toggle label="Rider / passenger policy required" value={r.rider_policy_required} onChange={v => upd('rider_policy_required', v)} />
          <Toggle label="Paid orientation required" value={r.paid_orientation_required} onChange={v => upd('paid_orientation_required', v)} />
          <div style={{ fontSize: 12, fontWeight: 600, color: '#4a5568', paddingTop: 8 }}>Company standards</div>
          <NumberInput label="Min fleet size (trucks)" value={r.min_fleet_size} onChange={v => upd('min_fleet_size', v)} placeholder="e.g. 50" />
          <NumberInput label="Min years in business" value={r.min_company_age_years} onChange={v => upd('min_company_age_years', v)} placeholder="e.g. 5" />
          <TagInput label="Custom requirement" hint="e.g. Direct deposit only, no factoring..."
            tags={customReqs} onChange={setCustomReqs} />
        </Card>

        {/* ── CARRIER LISTS ── */}
        <Card title="📋 Carrier Lists">
          <TextInput label="⭐ Priority carriers" hint="Comma separated — contact these first, scored higher"
            value={(r.preferred_carriers || []).join(', ')}
            onChange={v => upd('preferred_carriers', v.split(',').map(s => s.trim()).filter(Boolean))}
            placeholder="e.g. Werner, Schneider, Swift" />
          <TextInput label="🚫 Blocked carriers" hint="Comma separated — completely excluded from outreach"
            value={(r.blacklisted_carriers || []).join(', ')}
            onChange={v => upd('blacklisted_carriers', v.split(',').map(s => s.trim()).filter(Boolean))}
            placeholder="e.g. Carrier A, Carrier B" />
        </Card>

        {/* ── AGENT BEHAVIOR ── */}
        <Card title="🤖 Agent Behavior">
          <Toggle label="Require my approval before calling" description="Recommended" value={r.require_approval_before_call !== false} onChange={v => upd('require_approval_before_call', v)} />
          <Toggle label="Allow agent to call autonomously" value={r.auto_call_enabled} onChange={v => upd('auto_call_enabled', v)} />
          <Toggle label="Allow agent to email autonomously" value={r.auto_email_enabled} onChange={v => upd('auto_email_enabled', v)} />
          {r.auto_call_enabled && (
            <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#c53030', margin: '8px 0' }}>
              ⚠️ The agent will make calls without asking first. Make sure your rules are fully configured.
            </div>
          )}
          <Slider label="Max outreach contacts per day" value={r.max_outreach_per_day || 5} onChange={v => upd('max_outreach_per_day', v)} min={1} max={20} format={v => `${v}/day`} />
        </Card>

        {/* ── AUTO-REJECT ── */}
        <Card title="🚫 Auto-Reject Conditions" danger>
          <div style={{ background: '#fff5f5', border: '1px solid #fed7d7', borderRadius: 8, padding: '8px 10px', fontSize: 11, color: '#c53030', margin: '8px 0 4px' }}>
            Any carrier matching these conditions is automatically skipped — even if everything else looks good.
          </div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#4a5568', paddingTop: 4 }}>Contract & dispatch</div>
          <Toggle label="Forced dispatch policy" value={r.reject_if_forced_dispatch} onChange={v => upd('reject_if_forced_dispatch', v)} />
          <Toggle label="Lease-purchase only" description="Not a company driver position" value={r.reject_if_lease_purchase_only} onChange={v => upd('reject_if_lease_purchase_only', v)} />
          <Toggle label="Independent contractor only" value={r.reject_if_ic_only} onChange={v => upd('reject_if_ic_only', v)} />
          <div style={{ fontSize: 12, fontWeight: 600, color: '#4a5568', paddingTop: 8 }}>Equipment & compliance</div>
          <Toggle label="No ELD provided by carrier" value={r.reject_if_no_ELD_provided} onChange={v => upd('reject_if_no_ELD_provided', v)} />
          <Toggle label="Equipment older than 5 years" value={r.reject_if_old_equipment} onChange={v => upd('reject_if_old_equipment', v)} />
          <div style={{ fontSize: 12, fontWeight: 600, color: '#4a5568', paddingTop: 8 }}>Pay & bonuses</div>
          <Toggle label="No sign-on bonus offered" value={r.reject_if_no_sign_on_bonus_hard} onChange={v => upd('reject_if_no_sign_on_bonus_hard', v)} />
          <Toggle label="No detention pay policy" value={r.reject_if_no_detention_pay} onChange={v => upd('reject_if_no_detention_pay', v)} />
          <TagInput label="Custom auto-reject condition" hint="e.g. No paid orientation, touch freight only..."
            tags={customRejects} onChange={setCustomRejects} danger />
        </Card>

        {/* Save button */}
        <div style={{ paddingTop: 4, paddingBottom: 8, borderTop: '1px solid #e2e8f0', background: 'white', borderRadius: 12, padding: 14, marginTop: 4 }}>
          <div style={{ fontSize: 12, color: '#718096', marginBottom: 10 }}>Changes are saved to your account and applied immediately on the next search or outreach.</div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={load} style={{ flex: 1, padding: '12px', border: '1px solid #e2e8f0', background: 'white', borderRadius: 10, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>↺ Discard</button>
            <button onClick={handleSave} disabled={saving} style={{
              flex: 2, padding: '12px', background: saved ? '#38a169' : '#534AB7', color: 'white', border: 'none',
              borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: 'pointer',
              opacity: saving ? 0.7 : 1, fontFamily: 'inherit',
              boxShadow: '0 4px 14px rgba(83,74,183,0.3)'
            }}>{saving ? 'Saving...' : saved ? '✓ Saved!' : 'Save Rules'}</button>
          </div>
        </div>

      </div>

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