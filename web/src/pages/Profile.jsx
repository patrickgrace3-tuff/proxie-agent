import { useAuthStore } from '../store/auth'
import { useNavigate } from 'react-router-dom'

export default function Profile() {
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  return (
    <div className="p-4">
      <h1 className="text-xl font-semibold text-gray-900 mb-1">Profile</h1>
      <p className="text-sm text-gray-500 mb-6">Your driver profile and settings</p>
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-proxie-cloud flex items-center justify-center">
            <span className="text-proxie-purple font-semibold text-lg">
              {user?.first_name?.[0]}{user?.last_name?.[0]}
            </span>
          </div>
          <div>
            <div className="font-semibold text-gray-900">{user?.first_name} {user?.last_name}</div>
            <div className="text-sm text-gray-500">{user?.email}</div>
            <div className="text-xs text-proxie-purple mt-0.5 font-medium capitalize">{user?.role}</div>
          </div>
        </div>
      </div>
      <button
        onClick={() => { logout(); navigate('/login') }}
        className="w-full py-3 rounded-xl border border-red-200 text-red-500 text-sm font-medium hover:bg-red-50 transition-colors"
      >
        Sign Out
      </button>
    </div>
  )
}