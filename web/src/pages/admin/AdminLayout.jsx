import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/auth'
import AdminUsers from './AdminUsers'

function LogoMark({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <rect width="120" height="120" rx="28" fill="#26215C" />
      <circle cx="60" cy="44" r="20" fill="#AFA9EC" />
      <path d="M28 92 C28 68 92 68 92 92" stroke="#AFA9EC" strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="88" cy="82" r="16" fill="#7F77DD" />
      <path d="M82 82 L87 87 L96 76" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

const ADMIN_NAV = [
  {
    section: 'Users',
    items: [
      { to: '/admin/users', label: '🛡 All Drivers', exact: true },
    ]
  },
  {
    section: 'Content',
    items: [
      { to: '/admin/feeds', label: '📡 Job Feeds' },
    ]
  },
  {
    section: 'App',
    items: [
      { to: '/', label: '← Back to App' },
    ]
  },
]

export default function AdminLayout() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}>

      {/* Sidebar */}
      <aside style={{ width: 220, background: '#1a1a2e', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>

        {/* Logo */}
        <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <LogoMark size={36} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>
              Proxie<span style={{ color: '#AFA9EC' }}>Agent</span>
            </div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '.8px', textTransform: 'uppercase' }}>Admin Panel</div>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '8px 0', overflowY: 'auto' }}>
          {ADMIN_NAV.map(group => (
            <div key={group.section}>
              <div style={{ padding: '14px 16px 4px', fontSize: 9, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '1px' }}>
                {group.section}
              </div>
              {group.items.map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.exact}
                  style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '9px 16px', fontSize: 13,
                    color: isActive ? 'white' : 'rgba(255,255,255,0.6)',
                    background: isActive ? 'rgba(83,74,183,0.4)' : 'transparent',
                    borderLeft: `3px solid ${isActive ? '#534AB7' : 'transparent'}`,
                    textDecoration: 'none', transition: 'all 0.15s'
                  })}
                >
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: 6 }}>{user?.email}</div>
          <button onClick={handleLogout} style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Sign out
          </button>
        </div>
      </aside>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#f0f2f5' }}>
        <Routes>
          <Route path="/" element={<AdminUsers />} />
          <Route path="/users" element={<AdminUsers />} />
          <Route path="/feeds" element={<AdminFeedsPlaceholder />} />
        </Routes>
      </div>
    </div>
  )
}

function AdminFeedsPlaceholder() {
  return (
    <div style={{ padding: 40, color: '#718096', textAlign: 'center' }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📡</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#2d3748', marginBottom: 8 }}>Feed Management</div>
      <div style={{ fontSize: 13 }}>Use the Carriers page in the main app to manage feeds.</div>
    </div>
  )
}