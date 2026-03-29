import { create } from 'zustand'
import axios from 'axios'

const API_URL = import.meta.env.VITE_API_URL || 'https://proxie-agent-api.onrender.com'

// Axios instance — token is always read fresh from localStorage so
// it survives page refreshes without any extra setup
export const client = axios.create({ baseURL: API_URL })

client.interceptors.request.use(config => {
  const token = localStorage.getItem('DA_TOKEN')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// On a 401 anywhere, clear auth and redirect to login
client.interceptors.response.use(
  res => res,
  err => {
    if (err?.response?.status === 401) {
      localStorage.removeItem('DA_TOKEN')
      localStorage.removeItem('DA_USER')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

// Restore user from localStorage on first load
function restoreUser() {
  try {
    const raw = localStorage.getItem('DA_USER')
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const useAuthStore = create((set) => ({
  token: localStorage.getItem('DA_TOKEN') || null,
  user:  restoreUser(),

  login: (token, user) => {
    localStorage.setItem('DA_TOKEN', token)
    localStorage.setItem('DA_USER', JSON.stringify(user))
    set({ token, user })
  },

  logout: () => {
    localStorage.removeItem('DA_TOKEN')
    localStorage.removeItem('DA_USER')
    set({ token: null, user: null })
  },

  setUser: (user) => {
    localStorage.setItem('DA_USER', JSON.stringify(user))
    set({ user })
  },
}))