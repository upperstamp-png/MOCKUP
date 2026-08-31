import { create } from 'zustand';
import { SellerProfile, LicenseStatus } from '@mockup/types';

interface SessionStoreState {
  token: string | null;
  sessionToken: string | null;
  profile: SellerProfile | null;
  tenantId: string | null;
  licenseStatus: LicenseStatus | null;
  maxSessions: number;
  activeSessionsCount: number;
  isSessionLimitReached: boolean;
  heartbeatIntervalId: NodeJS.Timeout | null;

  // Actions
  setSession: (params: {
    token: string;
    sessionToken: string;
    profile: SellerProfile;
    licenseStatus: LicenseStatus;
  }) => void;
  updateHeartbeatStatus: (data: {
    activeSessionsCount: number;
    maxSessions: number;
    licenseStatus: LicenseStatus;
  }) => void;
  clearSession: () => void;
  startHeartbeat: (apiBaseUrl: string) => void;
  stopHeartbeat: () => void;
}

export const useSessionStore = create<SessionStoreState>((set, get) => ({
  token: typeof window !== 'undefined' ? localStorage.getItem('mockup_auth_token') : null,
  sessionToken: typeof window !== 'undefined' ? localStorage.getItem('mockup_session_token') : null,
  profile: null,
  tenantId: null,
  licenseStatus: 'active',
  maxSessions: 3,
  activeSessionsCount: 1,
  isSessionLimitReached: false,
  heartbeatIntervalId: null,

  setSession: ({ token, sessionToken, profile, licenseStatus }) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('mockup_auth_token', token);
      localStorage.setItem('mockup_session_token', sessionToken);
    }
    set({
      token,
      sessionToken,
      profile,
      tenantId: profile.tenant_id,
      licenseStatus,
      isSessionLimitReached: false,
    });
  },

  updateHeartbeatStatus: ({ activeSessionsCount, maxSessions, licenseStatus }) => {
    set({
      activeSessionsCount,
      maxSessions,
      licenseStatus,
      isSessionLimitReached: activeSessionsCount > maxSessions,
    });
  },

  clearSession: () => {
    get().stopHeartbeat();
    if (typeof window !== 'undefined') {
      localStorage.removeItem('mockup_auth_token');
      localStorage.removeItem('mockup_session_token');
    }
    set({
      token: null,
      sessionToken: null,
      profile: null,
      tenantId: null,
      licenseStatus: null,
      isSessionLimitReached: false,
    });
  },

  startHeartbeat: (apiBaseUrl: string) => {
    get().stopHeartbeat();

    const sendPulse = async () => {
      const { sessionToken, token } = get();
      if (!sessionToken || !token) return;

      try {
        const res = await fetch(`${apiBaseUrl}/session/heartbeat`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ sessionToken }),
        });

        if (res.ok) {
          const data = await res.json();
          get().updateHeartbeatStatus({
            activeSessionsCount: data.activeSessionsCount,
            maxSessions: data.maxSessions,
            licenseStatus: data.licenseStatus,
          });
        }
      } catch {
        // Falha transitória
      }
    };

    // Executa a cada 45 segundos
    const id = setInterval(sendPulse, 45000);
    set({ heartbeatIntervalId: id });
  },

  stopHeartbeat: () => {
    const id = get().heartbeatIntervalId;
    if (id) {
      clearInterval(id);
      set({ heartbeatIntervalId: null });
    }
  },
}));
