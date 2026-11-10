'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Home, Shield, Sparkles } from 'lucide-react';
import { hubAsset, portalFetch, PortalApiError } from '@/lib/api-client';
import type { PortalMeResponse } from '@/components/portal/PortalTypes';
import { NetworkAdminTab } from '@/components/portal/NotificationsAndAdminTabs';
import { ErrorBanner, LoadingCard } from '@/components/portal/UiPrimitives';

interface DiskTexture {
  id: string;
  name: string;
  thumbnail_url: string;
  svg_file_url: string;
  created_at: string;
}

export default function AdminPage() {
  const router = useRouter();
  const [me, setMe] = useState<PortalMeResponse | null>(null);
  const [diskTextures, setDiskTextures] = useState<DiskTexture[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await portalFetch<PortalMeResponse>('/auth/me');
      setMe(profile);

      if (profile.activeRole.scope !== 'unit') {
        const texRes = await fetch(hubAsset('/api/textures')).then((r) => r.json()).catch(() => null);
        if (texRes?.success && Array.isArray(texRes.textures)) {
          setDiskTextures(texRes.textures);
        }
      }
    } catch (err) {
      if (err instanceof PortalApiError && err.statusCode === 401) {
        router.replace('/login');
        return;
      }
      setError(err instanceof PortalApiError ? err.message : 'Erro ao validar acesso corporativo.');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  return (
    <div className="king-studio apple-backdrop min-h-screen text-wise-ink flex flex-col">
      <header className="h-16 apple-glass border-x-0 border-t-0 border-b border-white/15 px-6 flex items-center justify-between gap-4 shrink-0 sticky top-0 z-20">
        <div className="flex items-center gap-3 flex-wrap">
          <Link
            href="/"
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
            <Shield className="w-5 h-5 text-blue-400" />
            <h1 className="text-sm font-bold text-wise-ink tracking-tight">
              Torre de Controle Corporativa · Rede King Sports
            </h1>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 sm:p-8 max-w-6xl mx-auto w-full space-y-6">
        {error && <ErrorBanner message={error} onRetry={loadData} />}
        {loading ? (
          <LoadingCard message="Verificando escopo de governança..." />
        ) : me ? (
          <>
            <NetworkAdminTab me={me} />

            {me.activeRole.scope !== 'unit' && diskTextures.length > 0 && (
              <section className="apple-glass rounded-3xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-bold text-wise-ink flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-400" />
                    Acervo de Estampas Vetorizadas (Studio 3D)
                  </h2>
                  <span className="text-xs text-wise-mute">{diskTextures.length} textura(s)</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {diskTextures.map((tex) => (
                    <div
                      key={tex.id}
                      className="apple-glass-well rounded-2xl p-2.5 text-center space-y-1.5"
                    >
                      <div className="aspect-square rounded-xl bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center p-1">
                        <img
                          src={hubAsset(tex.thumbnail_url)}
                          alt={tex.name}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <p className="text-[11px] font-semibold text-wise-ink truncate">{tex.name}</p>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        ) : null}
      </main>
    </div>
  );
}
