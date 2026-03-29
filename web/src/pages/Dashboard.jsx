import { Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import Outreach from './Outreach'
import Carriers from './Carriers'
import Profile from './Profile'
import Rules from './Rules'
import CallLog from './CallLog'

const NAV = [
  { to: '/', label: 'Outreach', icon: OutreachIcon, exact: true },
  { to: '/carriers', label: 'Carriers', icon: CarriersIcon },
  { to: '/rules', label: 'Rules', icon: RulesIcon },
  { to: '/calls', label: 'Calls', icon: CallsIcon },
  { to: '/profile', label: 'Profile', icon: ProfileIcon },
]

export default function Dashboard() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">

      {/* Desktop sidebar */}
      <aside className="hidden md:flex flex-col w-56 bg-proxie-deep text-white flex-shrink-0">
        <div className="flex items-center gap-3 px-4 py-5 border-b border-white/10">
          <div className="w-9 h-9 rounded-xl bg-proxie-purple flex items-center justify-center flex-shrink-0">
            <LogoMark size={20} />
          </div>
          <div>
            <div className="text-sm font-semibold leading-tight">
              Proxie<span className="text-proxie-lavender">Agent</span>
            </div>
            <div className="text-xs text-white/30 leading-tight">by CIA</div>
          </div>
        </div>

        <nav className="flex-1 px-2 py-4 space-y-1">
          {NAV.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive
                    ? 'bg-proxie-purple text-white'
                    : 'text-white/60 hover:text-white hover:bg-white/10'
                }`
              }
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-white/10">
          <div className="text-xs text-white/40 mb-1">{user?.email}</div>
          <button
            onClick={handleLogout}
            className="text-xs text-white/50 hover:text-white transition-colors"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-proxie-purple text-white flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-proxie-deep flex items-center justify-center">
              <LogoMark size={16} />
            </div>
            <span className="font-semibold text-sm">
              Proxie<span className="text-proxie-lavender">Agent</span>
            </span>
          </div>
          <div className="text-xs text-white/60">{user?.first_name}</div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
          <Routes>
            <Route path="/" element={<Outreach />} />
            <Route path="/carriers" element={<Carriers />} />
            <Route path="/rules" element={<Rules />} />
            <Route path="/calls" element={<CallLog />} />
            <Route path="/profile" element={<Profile />} />
          </Routes>
        </main>

        {/* Mobile bottom tab bar */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 flex z-50">
          {NAV.map(({ to, label, icon: Icon, exact }) => (
            <NavLink
              key={to}
              to={to}
              end={exact}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center justify-center py-2 text-xs transition-colors ${
                  isActive ? 'text-proxie-purple' : 'text-gray-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={22} active={isActive} />
                  <span className="mt-0.5 text-[10px]">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

      </div>
    </div>
  )
}

function LogoMark({ size = 24 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="44" r="20" fill="#AFA9EC" />
      <path d="M28 92 C28 68 92 68 92 92" stroke="#AFA9EC" strokeWidth="7" strokeLinecap="round" fill="none" />
      <circle cx="88" cy="82" r="16" fill="#7F77DD" />
      <path d="M82 82 L87 87 L96 76" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

function OutreachIcon({ size, active }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round">
      <rect x="3" y="3" width="18" height="14" rx="2" />
      <path d="M3 9h18M9 21l3-4 3 4" />
    </svg>
  )
}

function CarriersIcon({ size, active }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round">
      <rect x="1" y="13" width="15" height="8" rx="1" />
      <path d="M16 17h5l2-4v-4h-7v8z" />
      <circle cx="5.5" cy="21.5" r="1.5" />
      <circle cx="18.5" cy="21.5" r="1.5" />
    </svg>
  )
}

function RulesIcon({ size, active }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round">
      <path d="M12 2a10 10 0 100 20A10 10 0 0012 2z" />
      <path d="M12 8v4l3 3" />
    </svg>
  )
}

function CallsIcon({ size, active }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round">
      <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.8 19.79 19.79 0 01.01 1.18 2 2 0 012 .01h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
    </svg>
  )
}

function ProfileIcon({ size, active }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.5 : 1.8} strokeLinecap="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  )
}