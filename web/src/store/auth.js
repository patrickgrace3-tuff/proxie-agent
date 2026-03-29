import { create } from 'zustand'
import axios from 'axios'

const API = 'https://proxie-agent-api.onrender.com'

export const client = axios.create({ baseURL: API, timeout: 15000 })

export const useAuthStore = create((set) => ({
  token: null,
  user: null,
  isLoggedIn: false,

  login: (token, user) => {
    client.defaults.headers.common['Authorization'] = `Bearer ${token}`
    localStorage.setItem('DA_TOKEN', token)
    localStorage.setItem('DA_USER', JSON.stringify(user))
    set({ token, user, isLoggedIn: true })
  },

  logout: () => {
    delete client.defaults.headers.common['Authorization']
    localStorage.removeItem('DA_TOKEN')
    localStorage.removeItem('DA_USER')
    set({ token: null, user: null, isLoggedIn: false })
  },
}))