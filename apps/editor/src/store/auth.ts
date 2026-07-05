import { create } from 'zustand';
import { configureApiClient } from '../api/client.js';
import { authApi } from '../api/endpoints.js';
import type { User } from '../api/types.js';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => void;
  restoreSession: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  accessToken: null,
  status: 'idle',

  login: async (email, password) => {
    set({ status: 'loading' });
    const res = await authApi.login({ email, password });
    set({ user: res.user, accessToken: res.accessToken, status: 'authenticated' });
  },

  register: async (email, password, name) => {
    set({ status: 'loading' });
    const res = await authApi.register({ email, password, name });
    set({ user: res.user, accessToken: res.accessToken, status: 'authenticated' });
  },

  logout: () => {
    set({ user: null, accessToken: null, status: 'unauthenticated' });
  },

  restoreSession: async () => {
    if (!get().accessToken) {
      set({ status: 'unauthenticated' });
      return;
    }
    try {
      const user = await authApi.me();
      set({ user, status: 'authenticated' });
    } catch {
      set({ user: null, accessToken: null, status: 'unauthenticated' });
    }
  },
}));

configureApiClient({
  getAccessToken: () => useAuthStore.getState().accessToken,
  setAccessToken: (token) => useAuthStore.setState({ accessToken: token }),
  onLogout: () => useAuthStore.getState().logout(),
});
