import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from './store/auth'
import Dashboard from './pages/Dashboard'
import Login from './pages/Login'

// Wrap protected routes — if no token, send to /login
function RequireAuth({ children }) {
  const { token } = useAuthStore()
  const location = useLocation()

  if (!token) {
    // Save where they were trying to go so we can redirect after login
    return <Navigate to="/login" state={{ from: location }} replace />
  }
  return children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/*"
          element={
            <RequireAuth>
              <Dashboard />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}