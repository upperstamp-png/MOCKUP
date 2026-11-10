'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Bell,
  BookOpen,
  Boxes,
  CalendarDays,
  CheckSquare,
  CircleHelp,
  ClipboardList,
  FileLock2,
  FileText,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Palette,
  Settings,
  Shield,
  Sparkles,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { hubAsset, portalFetch, PortalApiError } from '@/lib/api-client';
import type { ModuleTabId, PortalMeResponse } from '@/components/portal/PortalTypes';
import { LoadingCard, StatusPill } from '@/components/portal/UiPrimitives';
import { MyDayTab } from '@/components/portal/MyDayTab';
import { AgendaCalendarTab } from '@/components/portal/AgendaCalendarTab';
import { TasksTab } from '@/components/portal/TasksTab';
import { CrmTab, QuotesTab } from '@/components/portal/CrmAndQuotesTabs';
import { CatalogTab } from '@/components/portal/CatalogTab';
import { StudioArtsTab } from '@/components/portal/StudioArtsTab';
import { OrdersTab, type InitialQuoteConversion } from '@/components/portal/OrdersTab';
import { FinanceTab } from '@/components/portal/FinanceTab';
import { DocumentsTab, SupportTab } from '@/components/portal/SupportDocumentsTabs';
import { SandboxTab, TrainingTab } from '@/components/portal/TrainingSandboxTabs';
import {
  NetworkAdminTab,
  NotificationsTab,
  UnitSettingsTab,
} from '@/components/portal/NotificationsAndAdminTabs';

interface NavItemConfig {
  id: ModuleTabId;
  label: string;
  section: 'operacao' | 'governanca' | 'sistema';
  icon: typeof LayoutDashboard;
  isAllowed: (me: PortalMeResponse) => boolean;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    id: 'day',
    label: 'Meu dia',
    section: 'operacao',
    icon: LayoutDashboard,
    isAllowed: () => true,
  },
  {
    id: 'agenda',
    label: 'Agenda',
    section: 'operacao',
    icon: CalendarDays,
    isAllowed: (me) =>
      me.activeRole.permissions.includes('agenda:read') ||
      me.activeRole.permissions.includes('tasks:read'),
  },
  {
    id: 'tasks',
    label: 'Tarefas',
    section: 'operacao',
    icon: CheckSquare,
    isAllowed: (me) => me.activeRole.permissions.includes('tasks:read'),
  },
  {
    id: 'crm',
    label: 'CRM Comercial',
    section: 'operacao',
    icon: Users,
    isAllowed: (me) => me.activeRole.permissions.includes('crm:read'),
  },
  {
    id: 'catalog',
    label: 'Produtos e preços',
    section: 'operacao',
    icon: Boxes,
    isAllowed: (me) => me.activeRole.permissions.includes('catalog:read'),
  },
  {
    id: 'quotes',
    label: 'Orçamentos',
    section: 'operacao',
    icon: FileText,
    isAllowed: (me) => me.activeRole.permissions.includes('quotes:read'),
  },
  {
    id: 'studio',
    label: 'Studio de Artes',
    section: 'operacao',
    icon: Palette,
    isAllowed: (me) => me.activeRole.permissions.includes('arts:read'),
  },
  {
    id: 'orders',
    label: 'Pedidos e produção',
    section: 'operacao',
    icon: ClipboardList,
    isAllowed: (me) => me.activeRole.permissions.includes('orders:read'),
  },
  {
    id: 'finance',
    label: 'Financeiro',
    section: 'operacao',
    icon: Wallet,
    isAllowed: (me) => me.activeRole.permissions.includes('finance:read'),
  },
  {
    id: 'support',
    label: 'SAC e ocorrências',
    section: 'operacao',
    icon: CircleHelp,
    isAllowed: (me) => me.activeRole.permissions.includes('tickets:read'),
  },
  {
    id: 'documents',
    label: 'Documentos',
    section: 'governanca',
    icon: FileLock2,
    isAllowed: (me) => me.activeRole.permissions.includes('documents:read'),
  },
  {
    id: 'training',
    label: 'Treinamento',
    section: 'governanca',
    icon: BookOpen,
    isAllowed: (me) => me.activeRole.permissions.includes('training:read'),
  },
  {
    id: 'sandbox',
    label: 'Sandbox e banca',
    section: 'governanca',
    icon: FlaskConical,
    isAllowed: (me) =>
      me.activeRole.permissions.includes('sandbox:access') ||
      me.activeRole.permissions.includes('sandbox:review'),
  },
  {
    id: 'notifications',
    label: 'Alertas e integrações',
    section: 'sistema',
    icon: Bell,
    isAllowed: () => true,
  },
  {
    id: 'settings',
    label: 'Unidade e terminais',
    section: 'sistema',
    icon: Settings,
    isAllowed: () => true,
  },
  {
    id: 'network_admin',
    label: 'Torre da rede',
    section: 'sistema',
    icon: Shield,
    isAllowed: (me) =>
      me.activeRole.slug === 'admin' ||
      (me.activeRole.scope !== 'unit' && me.activeRole.permissions.includes('network:admin')),
  },
];

function normalizeTabParam(raw: string | null): ModuleTabId {
  if (!raw) return 'day';
  const aliasMap: Record<string, ModuleTabId> = {
    day: 'day',
    agenda: 'agenda',
    calendario: 'agenda',
    tasks: 'tasks',
    tarefas: 'tasks',
    crm: 'crm',
    catalog: 'catalog',
    quotes: 'quotes',
    studio: 'studio',
    design: 'studio',
    orders: 'orders',
    finance: 'finance',
    support: 'support',
    documents: 'documents',
    training: 'training',
    university: 'training',
    sandbox: 'sandbox',
    banca: 'sandbox',
    notifications: 'notifications',
    settings: 'settings',
    network_admin: 'network_admin',
    admin: 'network_admin',
  };
  return aliasMap[raw.toLowerCase()] || 'day';
}

function HubContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [me, setMe] = useState<PortalMeResponse | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [switchingUnit, setSwitchingUnit] = useState(false);

  const [activeTab, setActiveTab] = useState<ModuleTabId>(() =>
    normalizeTabParam(searchParams.get('tab') || searchParams.get('area'))
  );
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Estado para navegação contextual entre módulos (ex: CRM -> Orçamento -> Pedido)
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pendingEntityId, setPendingEntityId] = useState<string | null>(null);
  const [pendingCustomerId, setPendingCustomerId] = useState<string | null>(null);
  const [pendingOpportunityId, setPendingOpportunityId] = useState<string | null>(null);
  const [pendingQuoteConversion, setPendingQuoteConversion] =
    useState<InitialQuoteConversion | null>(null);

  const fetchMe = useCallback(async () => {
    try {
      const profile = await portalFetch<PortalMeResponse>('/auth/me');
      setMe(profile);
      setAuthError(null);
    } catch (err) {
      if (err instanceof PortalApiError && err.statusCode === 401) {
        router.replace('/login');
        return;
      }
      setAuthError(
        err instanceof PortalApiError ? err.message : 'Falha ao validar sessão do portal.'
      );
    } finally {
      setAuthLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  // Sincroniza alterações diretas na querystring ?tab= / ?area=
  useEffect(() => {
    const paramTab = searchParams.get('tab') || searchParams.get('area');
    if (paramTab) {
      setActiveTab(normalizeTabParam(paramTab));
    }
  }, [searchParams]);

  const allowedNavItems = useMemo(() => {
    if (!me) return [];
    return NAV_ITEMS.filter((item) => item.isAllowed(me));
  }, [me]);

  // Garante que uma aba bloqueada para o perfil volte com segurança para 'day'
  useEffect(() => {
    if (!me) return;
    const isPermitted = allowedNavItems.some((item) => item.id === activeTab);
    if (!isPermitted) {
      setActiveTab('day');
    }
  }, [me, activeTab, allowedNavItems]);

  const handleSelectTab = useCallback(
    (
      tab: ModuleTabId,
      opts?: {
        action?: string;
        filter?: string;
        entityId?: string;
        customerId?: string;
        opportunityId?: string;
        fromQuote?: unknown;
      }
    ) => {
      if (me && !allowedNavItems.some((item) => item.id === tab)) {
        return;
      }
      setPendingAction(opts?.action || null);
      setPendingEntityId(opts?.entityId || null);
      setPendingCustomerId(opts?.customerId || null);
      setPendingOpportunityId(opts?.opportunityId || null);
      setPendingQuoteConversion((opts?.fromQuote as InitialQuoteConversion) || null);
      setActiveTab(tab);
      setMobileMenuOpen(false);
    },
    [me, allowedNavItems]
  );

  const handleSwitchUnit = async (unitId: string) => {
    if (!me || unitId === me.activeUnit.id) return;
    setSwitchingUnit(true);
    try {
      await portalFetch('/auth/switch-unit', {
        method: 'POST',
        body: JSON.stringify({ unitId }),
      });
      await fetchMe();
      setPendingAction(null);
      setPendingEntityId(null);
      setPendingCustomerId(null);
      setPendingOpportunityId(null);
      setPendingQuoteConversion(null);
      setActiveTab('day');
    } catch (err) {
      setAuthError(
        err instanceof PortalApiError ? err.message : 'Não foi possível alternar a unidade ativa.'
      );
    } finally {
      setSwitchingUnit(false);
    }
  };

  const handleLogout = async () => {
    await portalFetch('/auth/logout', { method: 'POST', body: '{}' }).catch(() => undefined);
    router.replace('/login');
  };

  if (authLoading) {
    return (
      <div className="apple-backdrop min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <LoadingCard message="Validando sua sessão e permissões na unidade..." />
        </div>
      </div>
    );
  }

  if (!me) {
    return (
      <div className="apple-backdrop min-h-screen flex items-center justify-center p-6">
        <div className="apple-glass rounded-3xl p-8 max-w-md w-full space-y-4 text-center">
          <h1 className="text-lg font-bold text-wise-ink">Sessão indisponível</h1>
          <p className="text-xs text-wise-body">
            {authError || 'Faça login com sua conta autorizada para acessar o portal.'}
          </p>
          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={fetchMe}
              className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/16 border border-white/15 text-xs font-semibold text-white"
            >
              Tentar novamente
            </button>
            <Link
              href="/login"
              className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white"
            >
              Ir para login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const canUseStudio3D = me.activeRole.permissions.includes('arts:read');
  const activeNavMeta = allowedNavItems.find((i) => i.id === activeTab) || allowedNavItems[0];

  const renderSidebarInner = (compactMobile = false) => (
    <div className="flex flex-col h-full gap-3">
      {/* Brand */}
      <div className="px-2 pt-0.5 flex items-center justify-between gap-2">
        <div className="space-y-0.5">
          <img src={hubAsset('/king-sports/logo.png')} alt="King Sports" width={126} height={32} />
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-wise-mute">
            Portal do Franqueado
          </p>
        </div>
        {compactMobile && (
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Fechar menu"
            className="p-2 rounded-full bg-white/8 border border-white/15 text-wise-ink"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Multi-unit switcher (rendered strictly when user legitimately has > 1 unit) */}
      {me.availableUnits.length > 1 ? (
        <div className="apple-glass-well rounded-2xl p-3 space-y-1.5">
          <label
            htmlFor={compactMobile ? 'unit-select-mobile' : 'unit-select-desktop'}
            className="block text-[10px] font-bold uppercase tracking-wider text-wise-mute"
          >
            Unidade autorizada
          </label>
          <select
            id={compactMobile ? 'unit-select-mobile' : 'unit-select-desktop'}
            value={me.activeUnit.id}
            disabled={switchingUnit}
            onChange={(e) => handleSwitchUnit(e.target.value)}
            className="w-full bg-black/55 border border-white/15 rounded-xl px-2.5 py-2 text-xs font-semibold text-wise-ink outline-none focus:border-blue-400"
          >
            {me.availableUnits.map((u) => (
              <option key={u.id} value={u.id} className="bg-[#141414]">
                {u.code} · {u.name}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div className="apple-glass-well rounded-2xl p-3 space-y-1">
          <p className="text-[10px] font-bold uppercase tracking-wider text-wise-mute">Unidade ativa</p>
          <p className="text-xs font-bold text-wise-ink truncate">
            {me.activeUnit.code} · {me.activeUnit.name}
          </p>
          <div className="pt-0.5">
            <StatusPill value={me.activeUnit.operationalStatus} />
          </div>
        </div>
      )}

      {/* Navigation Sections */}
      <nav aria-label="Módulos do Portal" className="flex-1 space-y-2.5 overflow-y-auto pr-1">
        {(['operacao', 'governanca', 'sistema'] as const).map((sec) => {
          const items = allowedNavItems.filter((item) => item.section === sec);
          if (items.length === 0) return null;
          const secTitle =
            sec === 'operacao'
              ? 'Fluxo Comercial & Fábrica'
              : sec === 'governanca'
                ? 'Base & Habilitação'
                : 'Conta & Sistema';
          return (
            <div key={sec} className="space-y-0.5">
              <p className="px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-wise-mute">
                {secTitle}
              </p>
              <div className="space-y-0.5">
                {items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      aria-current={isActive ? 'page' : undefined}
                      onClick={() => handleSelectTab(item.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all text-left ${
                        isActive
                          ? 'apple-glass-cta text-white'
                          : 'bg-transparent border-transparent text-wise-body hover:bg-white/8 hover:border-white/12 hover:text-white'
                      }`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <span className="truncate flex-1">{item.label}</span>
                      {item.id === 'notifications' && me.unreadNotifications > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/30 border border-blue-300/40 text-white">
                          {me.unreadNotifications}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Studio 3D Shortcut + User Footer */}
      <div className="pt-3 border-t border-white/12 space-y-3">
        {canUseStudio3D && (
          <div className="flex flex-wrap gap-1.5">
            <Link
              href="/studio"
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-full bg-white/8 hover:bg-white/15 border border-white/14 text-[11px] font-semibold text-wise-ink transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-400" />
              Studio 3D
            </Link>
            <Link
              href="/history"
              className="inline-flex items-center justify-center px-3 py-2 rounded-full bg-white/6 hover:bg-white/14 border border-white/12 text-[11px] font-semibold text-wise-body hover:text-white transition-colors"
            >
              Pranchas
            </Link>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 px-1">
          <div className="min-w-0">
            <p className="text-xs font-bold text-wise-ink truncate">{me.user.fullName}</p>
            <p className="text-[11px] text-wise-mute truncate">{me.activeRole.name}</p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            title="Sair do portal"
            aria-label="Sair do portal"
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-white/8 hover:bg-rose-500/20 border border-white/12 hover:border-rose-400/40 text-[11px] font-semibold text-wise-body hover:text-rose-100 transition-colors shrink-0"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sair</span>
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="apple-backdrop min-h-screen text-wise-ink flex flex-col lg:flex-row">
      {/* Desktop Sticky Sidebar */}
      <aside className="hidden lg:flex w-[272px] shrink-0 sticky top-0 h-screen overflow-y-auto apple-glass border-y-0 border-l-0 border-r border-white/14 px-4 py-5 flex-col z-20">
        {renderSidebarInner(false)}
      </aside>

      {/* Mobile Compact Header */}
      <header className="lg:hidden sticky top-0 z-30 apple-glass border-x-0 border-t-0 border-b border-white/14 px-4 py-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <img src={hubAsset('/king-sports/logo.png')} alt="King Sports" width={104} height={26} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-bold text-wise-ink truncate">{activeNavMeta?.label}</p>
            <p className="text-[10px] text-wise-mute truncate">
              {me.activeUnit.code} · {me.activeRole.name}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {me.unreadNotifications > 0 && (
            <button
              type="button"
              onClick={() => handleSelectTab('notifications')}
              aria-label="Abrir alertas"
              className="relative p-2 rounded-full bg-white/8 border border-white/14 text-wise-ink"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute -top-1 -right-1 px-1.5 rounded-full text-[9px] font-bold bg-blue-500 text-white">
                {me.unreadNotifications}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Abrir menu completo"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white/10 hover:bg-white/16 border border-white/15 text-xs font-semibold text-white"
          >
            <Menu className="w-4 h-4" />
            <span>Menu</span>
          </button>
        </div>
      </header>

      {/* Mobile Full Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex">
          <div className="w-[86%] max-w-[320px] h-full apple-glass border-y-0 border-l-0 border-r border-white/18 p-4 overflow-y-auto">
            {renderSidebarInner(true)}
          </div>
          <button
            type="button"
            aria-label="Fechar navegação"
            className="flex-1 h-full"
            onClick={() => setMobileMenuOpen(false)}
          />
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 min-w-0">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-7 space-y-6">
          {authError && (
            <div className="rounded-2xl bg-rose-500/15 border border-rose-400/35 px-4 py-3 text-xs text-rose-100">
              {authError}
            </div>
          )}

          {activeTab === 'day' && <MyDayTab me={me} onNavigate={handleSelectTab} />}

          {activeTab === 'agenda' && (
            <AgendaCalendarTab
              key={`ag-${me.activeUnit.id}`}
              me={me}
              initialAction={pendingAction}
              onNavigate={handleSelectTab}
            />
          )}

          {activeTab === 'tasks' && (
            <TasksTab
              key={`tsk-${me.activeUnit.id}`}
              me={me}
              initialAction={pendingAction}
              onNavigate={handleSelectTab}
            />
          )}

          {activeTab === 'crm' && (
            <CrmTab
              key={`crm-${me.activeUnit.id}-${pendingAction || 'list'}`}
              me={me}
              initialAction={pendingAction}
              onNavigate={handleSelectTab}
            />
          )}

          {activeTab === 'catalog' && <CatalogTab me={me} onNavigate={handleSelectTab} />}

          {activeTab === 'quotes' && (
            <QuotesTab
              key={`quotes-${me.activeUnit.id}-${pendingCustomerId || ''}-${pendingOpportunityId || ''}-${pendingAction || ''}`}
              me={me}
              initialAction={pendingAction}
              initialCustomerId={pendingCustomerId}
              initialOpportunityId={pendingOpportunityId}
              onNavigate={handleSelectTab}
            />
          )}

          {activeTab === 'studio' && (
            <StudioArtsTab
              key={`studio-${me.activeUnit.id}-${pendingEntityId || ''}`}
              me={me}
              initialEntityId={pendingEntityId}
            />
          )}

          {activeTab === 'orders' && (
            <OrdersTab
              key={`orders-${me.activeUnit.id}-${pendingEntityId || ''}-${pendingQuoteConversion?.id || ''}`}
              me={me}
              initialEntityId={pendingEntityId}
              initialQuote={pendingQuoteConversion}
            />
          )}

          {activeTab === 'finance' && <FinanceTab key={`fin-${me.activeUnit.id}`} me={me} />}

          {activeTab === 'support' && (
            <SupportTab
              key={`sup-${me.activeUnit.id}-${pendingEntityId || ''}`}
              me={me}
              initialEntityId={pendingEntityId}
            />
          )}

          {activeTab === 'documents' && (
            <DocumentsTab key={`doc-${me.activeUnit.id}`} me={me} />
          )}

          {activeTab === 'training' && (
            <TrainingTab key={`trn-${me.activeUnit.id}`} me={me} />
          )}

          {activeTab === 'sandbox' && (
            <SandboxTab key={`sbx-${me.activeUnit.id}`} me={me} />
          )}

          {activeTab === 'notifications' && (
            <NotificationsTab
              key={`ntf-${me.activeUnit.id}`}
              me={me}
              onUnreadChange={fetchMe}
            />
          )}

          {activeTab === 'settings' && (
            <UnitSettingsTab key={`set-${me.activeUnit.id}`} me={me} />
          )}

          {activeTab === 'network_admin' && (
            <NetworkAdminTab key={`adm-${me.activeUnit.id}`} me={me} />
          )}
        </div>
      </main>
    </div>
  );
}

export default function Hub() {
  return (
    <Suspense
      fallback={
        <div className="apple-backdrop min-h-screen flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            <LoadingCard message="Inicializando Portal do Franqueado..." />
          </div>
        </div>
      }
    >
      <HubContent />
    </Suspense>
  );
}
