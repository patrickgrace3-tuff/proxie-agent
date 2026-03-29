import { create } from 'zustand';
import { setToken } from '../api/client';

export const useAuthStore = create((set) => ({
  token: null,
  user: null,
  isLoggedIn: false,

  login: (token, user) => {
    setToken(token);
    set({ token, user, isLoggedIn: true });
  },

  logout: () => {
    setToken(null);
    set({ token: null, user: null, isLoggedIn: false });
  },

  setUser: (user) => set({ user }),
}));