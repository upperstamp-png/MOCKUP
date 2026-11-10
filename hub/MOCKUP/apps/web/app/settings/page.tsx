'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Home, LogOut, Settings } from 'lucide-react';
import { portalFetch, PortalApiError, useUnifiedHubPrefix } from '@/lib/api-client';
import type { PortalMeResponse } from '@/components/portal/PortalTypes';
import { UnitSettingsTab } from '@/components/portal/NotificationsAndAdminTabs';
import { ErrorBanner, LoadingCard } from '@/components/portal/UiPrimitives';

export default function SettingsPage() {
  const router = useRouter();
  const hubPrefix = useUnifiedHubPrefix();
  const homeHref = hubPrefix ? `${hubPrefix}` : '/';
  const [me, setMe] = useState<PortalMeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await portalFetch<PortalMeResponse>('/auth/me');
      setMe(profile);
    } catch (err) {
      if (err instanceof PortalApiError && err.statusCode === 401) {
        router.replace('/login');
        return;
      }
      setError(err instanceof PortalApiError ? err.message : 'Erro ao validar sessão.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const handleLogout = async () => {
    await portalFetch('/auth/logout', { method: 'POST', body: '{}' }).catch(() => undefined);
    router.replace('/login');
  };

  return (
    <div className="king-studio apple-backdrop min-h-screen text-wise-ink flex flex-col">
      <header className="h-16 apple-glass border-x-0 border-t-0 border-b border-white/15 px-6 flex items-center justify-between gap-4 shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href={homeHref}
            className="flex items-center gap-1.5 text-xs font-semibold text-wise-body hover:text-wise-ink bg-white/6 hover:bg-white/14 px-3.5 py-2 rounded-full transition-colors border border-white/12"
          >
            <Home className="w-3.5 h-3.5" />
            <span>Portal</span>
          </Link>
          <Link
            href="/studio"
            className="flex items-center gap-2 text-xs font-semibold text-wise-body hover:text-wise-ink bg-white/6 hover:bg-white/14 px-4 py-2 rounded-full transition-colors border border-white/12"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Studio 3D</span>
          </Link>
          <div className="flex items-center gap-2 ml-1">
            <Settings className="w-5 h-5 text-wise-ink-deep" />
            <h1 className="text-sm font-bold text-wise-ink tracking-tight">
              Configurações da Unidade &amp; Terminais
            </h1>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/30 text-xs font-semibold text-rose-200"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sair da conta</span>
        </button>
      </header>

      <main className="flex-1 p-6 sm:p-8 max-w-5xl mx-auto w-full space-y-6">
        {error && <ErrorBanner message={error} onRetry={loadSession} />}
        {loading ? (
          <LoadingCard message="Carregando terminais e parâmetros da unidade..." />
        ) : me ? (
          <UnitSettingsTab me={me} />
        ) : null}
      </main>
    </div>
  );
}
