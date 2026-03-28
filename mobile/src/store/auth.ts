import { create } from 'zustand';
import { setToken } from '../api/client';

interface AuthState {
  token: string | null;
  user: any | null;
  isLoggedIn: boolean;
  login: (token: string, user: any) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
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
}));