import { create } from 'zustand';
import { portalFetch } from '@/lib/api-client';
import type { PortalMeResponse } from '@/components/portal/PortalTypes';

interface SessionStoreState {
  me: PortalMeResponse | null;
  isLoading: boolean;
  error: string | null;
  fetchMe: () => Promise<PortalMeResponse | null>;
  clearSession: () => Promise<void>;
}

export const useSessionStore = create<SessionStoreState>((set) => ({
  me: null,
  isLoading: false,
  error: null,

  fetchMe: async () => {
    set({ isLoading: true, error: null });
    try {
      const me = await portalFetch<PortalMeResponse>('/auth/me');
      set({ me, isLoading: false, error: null });
      return me;
    } catch (err) {
      set({
        me: null,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Sessão expirada.',
      });
      return null;
    }
  },

  clearSession: async () => {
    try {
      await portalFetch('/auth/logout', { method: 'POST', body: '{}' });
    } catch {
      // Ignora erros ao invalidar cookie remoto
    }
    set({ me: null, isLoading: false, error: null });
  },
}));
