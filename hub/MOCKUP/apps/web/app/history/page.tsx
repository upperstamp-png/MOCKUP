'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Calendar,
  Download,
  ExternalLink,
  History,
  Home,
  Palette,
  Search,
  User,
} from 'lucide-react';
import { formatDateBr, portalFetch, PortalApiError, useUnifiedHubPrefix } from '@/lib/api-client';
import type { PortalMeResponse } from '@/components/portal/PortalTypes';
import {
  EmptyStateCard,
  ErrorBanner,
  LoadingCard,
  StatusPill,
} from '@/components/portal/UiPrimitives';

interface ArtHistoryItem {
  id: string;
  customer_id: string;
  customer_name: string;
  title: string;
  briefing: string;
  status: string;
  assignee_name: string | null;
  current_version_id: string | null;
  current_version_number: number | null;
  current_artifact_kind: string | null;
  approved_version_id: string | null;
  approved_version_number: number | null;
  versions_count: number;
  comments_count: number;
  updated_at: string;
}

export default function HistoryPage() {
  const router = useRouter();
  const hubPrefix = useUnifiedHubPrefix();
  const homeHref = hubPrefix ? `${hubPrefix}` : '/';
  const [me, setMe] = useState<PortalMeResponse | null>(null);
  const [projects, setProjects] = useState<ArtHistoryItem[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadMsg, setDownloadMsg] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const profile = await portalFetch<PortalMeResponse>('/auth/me');
      setMe(profile);

      if (!profile.activeRole.permissions.includes('arts:read')) {
        setProjects([]);
        setError('Seu perfil atual não possui permissão de visualização de projetos de arte.');
        return;
      }

      const artsRes = await portalFetch<{ items: ArtHistoryItem[] }>('/arts');
      setProjects(artsRes.items || []);
    } catch (err) {
      if (err instanceof PortalApiError && err.statusCode === 401) {
        router.replace('/login');
        return;
      }
      setError(
        err instanceof PortalApiError ? err.message : 'Falha ao carregar histórico de artes.'
      );
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleDownloadVersion = async (item: ArtHistoryItem) => {
    if (!item.current_version_id) {
      setDownloadMsg(`O projeto "${item.title}" ainda não possui versão anexada.`);
      return;
    }
    setDownloadMsg(null);
    try {
      const res = await portalFetch<{ signedUrl: string; fileName: string }>(
        `/arts/${item.id}/versions/${item.current_version_id}/download`
      );
      window.open(res.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setDownloadMsg(
        err instanceof PortalApiError
          ? err.message
          : 'Não foi possível gerar link assinado de download.'
      );
    }
  };

  const filtered = projects.filter((p) => {
    if (!searchTerm.trim()) return true;
    const q = searchTerm.trim().toLowerCase();
    return (
      p.title.toLowerCase().includes(q) ||
      p.customer_name.toLowerCase().includes(q)
    );
  });

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
            <span>Voltar ao Studio 3D</span>
          </Link>
          <div className="flex items-center gap-2 ml-1">
            <History className="w-5 h-5 text-wise-ink-deep" />
            <div>
              <h1 className="text-sm font-bold text-wise-ink tracking-tight">
                Histórico Versionado de Artes
              </h1>
              {me && (
                <p className="text-[11px] text-wise-mute">
                  {me.activeUnit.code} · {me.activeUnit.name}
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 sm:p-8 max-w-6xl mx-auto w-full space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="w-4 h-4 text-wise-body absolute left-4 top-3.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por cliente ou projeto de arte..."
              className="w-full apple-glass-well focus:border-blue-400/70 rounded-full px-5 py-3 pl-11 text-xs text-wise-ink font-semibold outline-none"
            />
          </div>
          <span className="text-xs font-semibold text-wise-mute bg-white/6 border border-white/12 rounded-full px-3.5 py-1.5">
            {filtered.length} projeto(s) na unidade
          </span>
        </div>

        {error && <ErrorBanner message={error} onRetry={loadData} />}
        {downloadMsg && (
          <div className="rounded-2xl bg-amber-500/15 border border-amber-400/35 px-4 py-3 text-xs text-amber-100">
            {downloadMsg}
          </div>
        )}

        {loading ? (
          <LoadingCard message="Carregando histórico oficial de artes da unidade..." />
        ) : filtered.length === 0 ? (
          <EmptyStateCard
            title="Nenhum projeto de arte registrado nesta unidade"
            description="Crie um novo projeto no módulo Studio de Artes ou salve uma prancha diretamente do Studio 3D."
            action={
              <Link
                href="/studio"
                className="inline-flex items-center gap-2 rounded-full apple-glass-cta px-5 py-2.5 text-xs font-semibold text-white"
              >
                <Palette className="w-4 h-4" />
                Abrir Studio 3D
              </Link>
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {filtered.map((item) => (
              <div
                key={item.id}
                className="apple-glass rounded-3xl p-5 flex flex-col justify-between space-y-4 border border-white/14"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-sm font-bold text-wise-ink truncate">{item.title}</h2>
                      <p className="text-xs text-wise-body flex items-center gap-1.5 mt-1 truncate">
                        <User className="w-3.5 h-3.5 text-blue-300 shrink-0" />
                        <span className="truncate">{item.customer_name}</span>
                      </p>
                    </div>
                    <StatusPill value={item.status} />
                  </div>

                  {item.briefing && (
                    <p className="text-xs text-wise-mute line-clamp-2 leading-relaxed">
                      {item.briefing}
                    </p>
                  )}

                  <div className="apple-glass-well rounded-2xl p-3 grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-wise-mute block">Versão atual</span>
                      <span className="font-bold text-wise-ink">
                        {item.current_version_number ? `v${item.current_version_number}` : 'Sem versão'}
                      </span>
                    </div>
                    <div>
                      <span className="text-wise-mute block">Versão aprovada</span>
                      <span className="font-bold text-emerald-300">
                        {item.approved_version_number ? `v${item.approved_version_number}` : 'Aguardando'}
                      </span>
                    </div>
                    <div>
                      <span className="text-wise-mute block">Total versões</span>
                      <span className="font-semibold text-wise-body">{item.versions_count}</span>
                    </div>
                    <div>
                      <span className="text-wise-mute block">Atualizado</span>
                      <span className="font-semibold text-wise-body inline-flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDateBr(item.updated_at)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-white/12 space-y-2">
                  <Link
                    href={`/studio?artProjectId=${encodeURIComponent(item.id)}`}
                    className="w-full apple-glass-cta text-white text-xs font-semibold py-2.5 rounded-full flex items-center justify-center gap-2 transition-all"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Abrir no Studio 3D</span>
                  </Link>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownloadVersion(item)}
                      className="bg-white/8 hover:bg-white/15 text-wise-ink text-xs font-semibold py-2 rounded-full flex items-center justify-center gap-1.5 border border-white/14"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar arquivo</span>
                    </button>
                    <Link
                      href={`${homeHref}?tab=studio`}
                      className="bg-white/6 hover:bg-white/12 text-wise-body hover:text-white text-xs font-semibold py-2 rounded-full flex items-center justify-center border border-white/12"
                    >
                      Aprovar / Versões
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
