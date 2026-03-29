import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import { useAuthStore } from './store/auth'

function PrivateRoute({ children }) {
  const isLoggedIn = useAuthStore((s) => s.isLoggedIn)
  return isLoggedIn ? children : <Navigate to="/login" replace />
}

export default function App() {
  const { login, isLoggedIn } = useAuthStore()

  useEffect(() => {
    const token = localStorage.getItem('DA_TOKEN')
    const user = localStorage.getItem('DA_USER')
    if (token && user) {
      login(token, JSON.parse(user))
    }
  }, [])

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/*" element={
        <PrivateRoute>
          <Dashboard />
        </PrivateRoute>
      } />
    </Routes>
  )
}
