'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  Bell,
  Check,
  CheckCheck,
  Laptop,
  Megaphone,
  Plus,
  RefreshCw,
  Settings,
  Shield,
  Sliders,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { formatBrl, formatDateBr, portalFetch, PortalApiError } from '@/lib/api-client';
import type { IntegrationsStatus, PortalMeResponse } from './PortalTypes';
import { EmptyStateCard, ErrorBanner, GlassModal, LoadingCard, StatusPill } from './UiPrimitives';

interface NotificationItem {
  id: string;
  event_type: string;
  title: string;
  body: string;
  is_read: boolean;
  created_at: string;
}

interface NotificationsResponse {
  items: NotificationItem[];
  preferences: {
    in_app_enabled: boolean;
    email_enabled: boolean;
    muted_event_types: string[];
  };
  integrationsStatus: IntegrationsStatus;
  integrationAttempts: Array<{
    id: string;
    provider: string;
    operation: string;
    status: string;
    detail_message: string;
    created_at: string;
  }>;
}

export function NotificationsTab({
  me,
  onUnreadChange,
}: {
  me: PortalMeResponse;
  onUnreadChange?: () => void;
}) {
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await portalFetch<NotificationsResponse>('/notifications');
      setData(res);
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao carregar notificações.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const handleMarkRead = async (id: string) => {
    try {
      await portalFetch(`/notifications/${id}/read`, { method: 'POST', body: '{}' });
      await loadNotifications();
      onUnreadChange?.();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao marcar leitura.');
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await portalFetch('/notifications/read-all', { method: 'POST', body: '{}' });
      setFeedback('Todas as notificações desta unidade foram marcadas como lidas.');
      await loadNotifications();
      onUnreadChange?.();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao limpar notificações.');
    }
  };

  const handleTogglePreference = async (field: 'inApp' | 'email', value: boolean) => {
    if (!data) return;
    try {
      await portalFetch('/notifications/preferences', {
        method: 'PUT',
        body: JSON.stringify({
          inAppEnabled: field === 'inApp' ? value : data.preferences.in_app_enabled,
          emailEnabled: field === 'email' ? value : data.preferences.email_enabled,
          mutedEventTypes: data.preferences.muted_event_types || [],
        }),
      });
      setFeedback('Preferências de alerta salvas.');
      await loadNotifications();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao salvar preferências.');
    }
  };

  const integrationEntries: Array<{ key: keyof IntegrationsStatus; label: string; scope: string }> = [
    { key: 'postgresql', label: 'PostgreSQL / Banco Relacional', scope: 'Persistência transacional e RLS' },
    { key: 'supabase_auth', label: 'Supabase Auth (Cookies HttpOnly)', scope: 'Sessão e controle de acesso' },
    { key: 'supabase_storage', label: 'Supabase Storage (Buckets Privados)', scope: 'Artes, comprovantes e cofre' },
    { key: 'asaas_payments', label: 'Asaas Pagamentos / Split', scope: 'Cobrança externa e webhooks' },
    { key: 'nfe_emitter', label: 'Emissor Fiscal NF-e', scope: 'Emissão automática tributária' },
    { key: 'whatsapp_api', label: 'WhatsApp Business API', scope: 'Envio automatizado de alertas' },
    { key: 'email_smtp', label: 'Servidor E-mail SMTP', scope: 'Disparo transacional por e-mail' },
  ];

  return (
    <div className="space-y-5">
      <div className="apple-glass rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-wise-mute font-semibold">
            Central de Alertas &amp; Integrações
          </p>
          <h2 className="text-xl font-bold text-wise-ink mt-1 flex items-center gap-2">
            <Bell className="w-5 h-5 text-blue-400" />
            Notificações &amp; Diagnóstico · {me.activeUnit.name}
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="px-4 py-2 rounded-full bg-white/8 hover:bg-white/14 border border-white/15 text-xs font-semibold text-wise-ink inline-flex items-center gap-1.5"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Marcar todas como lidas
          </button>
        </div>
      </div>

      {feedback && (
        <div className="apple-glass-subtle rounded-2xl p-3.5 border border-emerald-400/35 bg-emerald-500/10 text-xs text-emerald-100 flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline">
            Fechar
          </button>
        </div>
      )}
      {error && <ErrorBanner message={error} onRetry={loadNotifications} />}

      {loading ? (
        <LoadingCard message="Carregando central de notificações..." />
      ) : data ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 apple-glass rounded-3xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-wise-ink">Alertas da Unidade ({data.items.length})</h3>
            {data.items.length === 0 ? (
              <EmptyStateCard
                title="Sem alertas no momento"
                description="Quando houver atualizações em pedidos, artes, financeiro ou chamados, elas aparecerão aqui."
              />
            ) : (
              <div className="space-y-2.5">
                {data.items.map((n) => (
                  <div
                    key={n.id}
                    className={`rounded-2xl p-3.5 border flex items-start justify-between gap-3 ${
                      n.is_read
                        ? 'bg-white/4 border-white/10 opacity-75'
                        : 'bg-blue-500/12 border-blue-400/35'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-400" />}
                        <span className="text-xs font-bold text-wise-ink">{n.title}</span>
                      </div>
                      <p className="text-xs text-wise-body">{n.body}</p>
                      <span className="text-[11px] text-wise-mute block">{formatDateBr(n.created_at, { withTime: true })}</span>
                    </div>
                    {!n.is_read && (
                      <button
                        type="button"
                        onClick={() => handleMarkRead(n.id)}
                        className="px-3 py-1 rounded-full bg-white/10 hover:bg-white/16 border border-white/15 text-[11px] font-semibold text-white shrink-0 inline-flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" />
                        Lida
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-5">
            <div className="apple-glass rounded-3xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-wise-ink">Preferências de Alerta</h3>
              <label className="flex items-center justify-between text-xs text-wise-body cursor-pointer">
                <span>Notificações no Portal (In-App)</span>
                <input
                  type="checkbox"
                  checked={data.preferences.in_app_enabled}
                  onChange={(e) => handleTogglePreference('inApp', e.target.checked)}
                  className="accent-blue-500"
                />
              </label>
              <label className="flex items-center justify-between text-xs text-wise-body cursor-pointer">
                <span>Envio por E-mail (requer SMTP ativo)</span>
                <input
                  type="checkbox"
                  checked={data.preferences.email_enabled}
                  onChange={(e) => handleTogglePreference('email', e.target.checked)}
                  className="accent-blue-500"
                />
              </label>
            </div>

            <div className="apple-glass rounded-3xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-wise-ink">Status Real das Integrações</h3>
              <div className="space-y-2">
                {integrationEntries.map((item) => {
                  const active = Boolean(data.integrationsStatus[item.key]);
                  return (
                    <div
                      key={item.key}
                      className="rounded-xl apple-glass-well p-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-wise-ink">{item.label}</p>
                        <p className="text-[11px] text-wise-mute">{item.scope}</p>
                      </div>
                      <StatusPill
                        value={active ? 'approved' : 'pending'}
                        customLabel={active ? 'Ativa' : 'Não configurada'}
                      />
                    </div>
                  );
                })}
              </div>

              {data.integrationAttempts.length > 0 && (
                <div className="pt-2 border-t border-white/10 space-y-1.5">
                  <p className="text-[11px] font-bold uppercase text-wise-mute">
                    Últimos registros de integração
                  </p>
                  {data.integrationAttempts.slice(0, 6).map((att) => (
                    <div key={att.id} className="text-[11px] text-wise-body bg-white/5 rounded-lg p-2">
                      <span className="font-bold text-wise-ink">{att.provider}</span> · {att.operation} ·{' '}
                      <span className="text-amber-200">{att.status}</span>
                      <p className="text-wise-mute">{att.detail_message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface DevicesResponse {
  unit: {
    id: string;
    code: string;
    name: string;
    legal_name: string | null;
    cnpj: string | null;
    city: string;
    state: string;
    operational_status: string;
    training_completed: boolean;
    banca_approved: boolean;
    implantation_approved: boolean;
    implantation_notes: string | null;
    initial_franchise_fee_cents: number;
    initial_fee_status: string;
    max_devices: number;
  };
  devices: Array<{
    id: string;
    device_name: string;
    user_agent: string;
    ip_address: string;
    is_active: boolean;
    last_login_at: string;
    user_name: string;
    user_email: string;
  }>;
  activeSessions: Array<{
    id: string;
    device_label: string;
    ip_address: string;
    last_seen_at: string;
    user_name: string;
    is_current: boolean;
  }>;
}

export function UnitSettingsTab({ me }: { me: PortalMeResponse }) {
  const [data, setData] = useState<DevicesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const loadDevices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await portalFetch<DevicesResponse>('/auth/devices');
      setData(res);
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao carregar dados da unidade.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDevices();
  }, [loadDevices]);

  const handleRevoke = async (deviceId: string) => {
    try {
      await portalFetch(`/auth/devices/${deviceId}/revoke`, { method: 'POST', body: '{}' });
      setFeedback('Dispositivo e sessões vinculadas revogados.');
      await loadDevices();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao revogar terminal.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="apple-glass rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-wise-mute font-semibold">
            Governança da Unidade &amp; Terminais Autorizados
          </p>
          <h2 className="text-xl font-bold text-wise-ink mt-1 flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-400" />
            Configurações da Unidade · {me.activeUnit.name}
          </h2>
        </div>
        <button
          type="button"
          onClick={loadDevices}
          className="px-4 py-2 rounded-full bg-white/8 hover:bg-white/14 border border-white/15 text-xs font-semibold text-wise-ink inline-flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Atualizar
        </button>
      </div>

      {feedback && (
        <div className="apple-glass-subtle rounded-2xl p-3.5 border border-emerald-400/35 bg-emerald-500/10 text-xs text-emerald-100 flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline">
            Fechar
          </button>
        </div>
      )}
      {error && <ErrorBanner message={error} onRetry={loadDevices} />}

      {loading ? (
        <LoadingCard message="Carregando configurações reais da unidade..." />
      ) : data ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="apple-glass-subtle rounded-2xl p-4 border border-white/12 space-y-1">
              <p className="text-[11px] font-bold uppercase text-wise-mute">Dados da Unidade</p>
              <p className="text-sm font-bold text-wise-ink">
                {data.unit.name} ({data.unit.code})
              </p>
              <p className="text-xs text-wise-body">
                {data.unit.city}/{data.unit.state} {data.unit.cnpj ? `· CNPJ ${data.unit.cnpj}` : ''}
              </p>
              <div className="pt-1">
                <StatusPill value={data.unit.operational_status} />
              </div>
            </div>

            <div className="apple-glass-subtle rounded-2xl p-4 border border-white/12 space-y-1">
              <p className="text-[11px] font-bold uppercase text-wise-mute">
                Taxa Inicial de Franquia (Contratual)
              </p>
              <p className="text-lg font-bold text-wise-ink">
                {formatBrl(data.unit.initial_franchise_fee_cents || 2000000)}
              </p>
              <p className="text-[11px] text-wise-body">
                Status: {data.unit.initial_fee_status} · Nunca contabilizada como faturamento comercial.
              </p>
            </div>

            <div className="apple-glass-subtle rounded-2xl p-4 border border-white/12 space-y-1">
              <p className="text-[11px] font-bold uppercase text-wise-mute">Seu Perfil Ativo</p>
              <p className="text-sm font-bold text-wise-ink">{me.activeRole.name}</p>
              <p className="text-xs text-wise-body">
                {me.user.email} · Limite {data.unit.max_devices} terminais
              </p>
            </div>
          </div>

          <div className="apple-glass rounded-3xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-wise-ink">
              Sessões Ativas ({data.activeSessions.length})
            </h3>
            {data.activeSessions.length === 0 ? (
              <p className="text-xs text-wise-body">Nenhuma sessão ativa registrada.</p>
            ) : (
              <div className="space-y-2">
                {data.activeSessions.map((s) => (
                  <div
                    key={s.id}
                    className={`rounded-2xl p-3 border flex items-center justify-between gap-3 text-xs ${
                      s.is_current ? 'bg-blue-500/12 border-blue-400/40' : 'apple-glass-well border-white/12'
                    }`}
                  >
                    <div>
                      <span className="font-bold text-wise-ink">{s.device_label}</span>
                      {s.is_current && (
                        <span className="ml-2 px-2 py-0.5 rounded-full apple-glass-cta text-[10px] text-white">
                          Sessão Atual
                        </span>
                      )}
                      <p className="text-[11px] text-wise-mute mt-0.5">
                        Usuário: {s.user_name} · IP: {s.ip_address} · Ativo em {formatDateBr(s.last_seen_at, { withTime: true })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="apple-glass rounded-3xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-wise-ink">
              Dispositivos Registrados ({data.devices.length})
            </h3>
            <div className="space-y-2">
              {data.devices.map((dev) => (
                <div
                  key={dev.id}
                  className="apple-glass-well rounded-2xl p-3 border border-white/12 flex flex-wrap items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Laptop className="w-4 h-4 text-blue-300 shrink-0" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-wise-ink truncate">{dev.device_name}</span>
                        <StatusPill
                          value={dev.is_active ? 'active' : 'revoked'}
                          customLabel={dev.is_active ? 'Autorizado' : 'Revogado'}
                        />
                      </div>
                      <p className="text-[11px] text-wise-mute truncate">
                        {dev.user_name} ({dev.user_email}) · Último login: {formatDateBr(dev.last_login_at, { withTime: true })}
                      </p>
                    </div>
                  </div>
                  {dev.is_active && (
                    <button
                      type="button"
                      onClick={() => handleRevoke(dev.id)}
                      className="px-3 py-1.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/35 text-xs font-semibold text-rose-200 inline-flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Revogar
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface NetworkUnit {
  id: string;
  code: string;
  name: string;
  city: string;
  state: string;
  unit_type: string;
  operational_status: 'onboarding' | 'pending_approval' | 'active' | 'restricted' | 'suspended';
  training_completed: boolean;
  banca_approved: boolean;
  implantation_approved: boolean;
  implantation_notes: string | null;
  config_status: string | null;
  commercial_modality: string | null;
  royalty_bps: number | null;
  marketing_fund_bps: number | null;
  territory_rule_status: string | null;
  default_price_list_code: string | null;
  max_discount_bps: number | null;
  confirmed_orders_count: number;
  confirmed_orders_cents: string;
  users_count: number;
}

interface NetworkAdminOverview {
  units: NetworkUnit[];
  productionSummary: Array<{ production_status: string; cnt: number }>;
  openNetworkTickets: number;
  bancaQueue: Array<{
    id: string;
    unit_code: string;
    unit_name: string;
    student_name: string;
    case_title: string;
    status: string;
    final_score: number | null;
    created_at: string;
  }>;
  auditLogs: Array<{
    id: string;
    unit_code: string | null;
    actor_email: string;
    actor_role: string;
    action: string;
    entity_type: string;
    created_at: string;
  }>;
}

interface NetworkUserItem {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  memberships: Array<{ unitCode: string; unitName: string; roleSlug: string; status: string }>;
}

export function NetworkAdminTab({ me }: { me: PortalMeResponse }) {
  const [overview, setOverview] = useState<NetworkAdminOverview | null>(null);
  const [users, setUsers] = useState<NetworkUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Modals
  const [enableModalUnit, setEnableModalUnit] = useState<NetworkUnit | null>(null);
  const [opStatus, setOpStatus] = useState<NetworkUnit['operational_status']>('active');
  const [trainDone, setTrainDone] = useState(false);
  const [bancaDone, setBancaDone] = useState(false);
  const [implantDone, setImplantDone] = useState(false);
  const [implantNotes, setImplantNotes] = useState('');

  const [cfgModalUnit, setCfgModalUnit] = useState<NetworkUnit | null>(null);
  const [cfgStatus, setCfgStatus] = useState<'not_configured' | 'pending_approval' | 'approved'>('not_configured');
  const [cfgModality, setCfgModality] = useState<'pending_definition' | 'revenda' | 'intermediacao'>('pending_definition');
  const [cfgRoyaltyBps, setCfgRoyaltyBps] = useState('');
  const [cfgMktBps, setCfgMktBps] = useState('');
  const [cfgTransferBps, setCfgTransferBps] = useState('');
  const [cfgMaxDiscBps, setCfgMaxDiscBps] = useState('500');
  const [cfgTerritory, setCfgTerritory] = useState('not_configured');
  const [cfgPriceList, setCfgPriceList] = useState('TAB-COMERCIAL-2026');
  const [cfgNotes, setCfgNotes] = useState('');

  const [newUnitOpen, setNewUnitOpen] = useState(false);
  const [unitCode, setUnitCode] = useState('');
  const [unitName, setUnitName] = useState('');
  const [unitCity, setUnitCity] = useState('');
  const [unitState, setUnitState] = useState('SP');

  const [annOpen, setAnnOpen] = useState(false);
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annPinned, setAnnPinned] = useState(false);

  const [newUserOpen, setNewUserOpen] = useState(false);
  const [usrName, setUsrName] = useState('');
  const [usrEmail, setUsrEmail] = useState('');
  const [usrPassword, setUsrPassword] = useState('');
  const [usrUnitId, setUsrUnitId] = useState('');
  const [usrRole, setUsrRole] = useState('franqueado');

  const isAllowed =
    me.activeRole.slug === 'admin' ||
    me.activeRole.scope === 'network' ||
    me.activeRole.scope === 'factory';
  const isNetworkAdmin =
    me.activeRole.slug === 'admin' ||
    (me.activeRole.scope === 'network' && me.activeRole.permissions.includes('network:admin'));

  const loadData = useCallback(async () => {
    if (!isAllowed) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const ov = await portalFetch<NetworkAdminOverview>('/network-admin/overview');
      setOverview(ov);
      if (ov.units?.[0]) {
        setUsrUnitId((prev) => prev || ov.units[0].id);
      }

      if (isNetworkAdmin) {
        const uRes = await portalFetch<{ users: NetworkUserItem[] }>('/network-admin/users');
        setUsers(uRes.users || []);
      }
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao carregar visão administrativa da rede.');
    } finally {
      setLoading(false);
    }
  }, [isAllowed, isNetworkAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!isAllowed) {
    return (
      <div className="apple-glass rounded-3xl p-8 border border-rose-400/35 bg-rose-500/10 space-y-2">
        <h2 className="text-lg font-bold text-rose-100 flex items-center gap-2">
          <Shield className="w-5 h-5" />
          Acesso restrito à Franqueadora / Fábrica
        </h2>
        <p className="text-xs text-rose-200">
          Controles globais de rede, aprovação de regras comerciais e auditoria multi-unidade não estão disponíveis no portal operacional da unidade franqueada.
        </p>
      </div>
    );
  }

  const handleSaveEnablement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!enableModalUnit) return;
    try {
      await portalFetch(`/network-admin/units/${enableModalUnit.id}/enablement`, {
        method: 'PATCH',
        body: JSON.stringify({
          operationalStatus: opStatus,
          trainingCompleted: trainDone,
          bancaApproved: bancaDone,
          implantationApproved: implantDone,
          implantationNotes: implantNotes || null,
        }),
      });
      setEnableModalUnit(null);
      setFeedback('Habilitação da unidade atualizada com auditoria.');
      await loadData();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao atualizar habilitação.');
    }
  };

  const handleSaveCommercialCfg = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cfgModalUnit) return;
    try {
      await portalFetch(`/network-admin/units/${cfgModalUnit.id}/commercial-config`, {
        method: 'PATCH',
        body: JSON.stringify({
          configStatus: cfgStatus,
          commercialModality: cfgModality,
          royaltyBps: cfgRoyaltyBps.trim() ? Number(cfgRoyaltyBps) : null,
          marketingFundBps: cfgMktBps.trim() ? Number(cfgMktBps) : null,
          factoryTransferBps: cfgTransferBps.trim() ? Number(cfgTransferBps) : null,
          maxDiscountBps: Number(cfgMaxDiscBps) || 500,
          territoryRuleStatus: cfgTerritory,
          defaultPriceListCode: cfgPriceList || null,
          notes: cfgNotes || null,
        }),
      });
      setCfgModalUnit(null);
      setFeedback('Configuração comercial da unidade atualizada.');
      await loadData();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao salvar configuração comercial.');
    }
  };

  const handleCreateUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await portalFetch('/network-admin/units', {
        method: 'POST',
        body: JSON.stringify({ code: unitCode, name: unitName, city: unitCity, state: unitState }),
      });
      setNewUnitOpen(false);
      setUnitCode('');
      setUnitName('');
      setUnitCity('');
      setFeedback('Nova unidade criada em estado onboarding com taxa inicial R$ 20.000,00 e config comercial pendente.');
      await loadData();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao criar unidade.');
    }
  };

  const handlePublishAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await portalFetch('/network-admin/announcements', {
        method: 'POST',
        body: JSON.stringify({ title: annTitle, body: annBody, category: 'operacional', isPinned: annPinned }),
      });
      setAnnOpen(false);
      setAnnTitle('');
      setAnnBody('');
      setFeedback('Comunicado publicado para toda a rede!');
      await loadData();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao publicar comunicado.');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await portalFetch('/network-admin/users', {
        method: 'POST',
        body: JSON.stringify({
          fullName: usrName,
          email: usrEmail,
          password: usrPassword,
          unitId: usrUnitId,
          roleSlug: usrRole,
        }),
      });
      setNewUserOpen(false);
      setUsrName('');
      setUsrEmail('');
      setUsrPassword('');
      setFeedback('Usuário provisionado no Supabase Auth e vinculado à unidade.');
      await loadData();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao provisionar usuário.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="apple-glass rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-wise-mute font-semibold">
            Governança Global · Acesso Corporativo Matriz/Fábrica
          </p>
          <h2 className="text-xl font-bold text-wise-ink mt-1 flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-400" />
            Administração da Rede King Sports
          </h2>
        </div>

        {isNetworkAdmin && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setAnnOpen(true)}
              className="px-4 py-2 rounded-full bg-white/8 hover:bg-white/14 border border-white/15 text-xs font-semibold text-wise-ink inline-flex items-center gap-1.5"
            >
              <Megaphone className="w-3.5 h-3.5" />
              Comunicado
            </button>
            <button
              type="button"
              onClick={() => setNewUserOpen(true)}
              className="px-4 py-2 rounded-full bg-white/8 hover:bg-white/14 border border-white/15 text-xs font-semibold text-wise-ink inline-flex items-center gap-1.5"
            >
              <UserPlus className="w-3.5 h-3.5" />
              Novo Usuário
            </button>
            <button
              type="button"
              onClick={() => setNewUnitOpen(true)}
              className="apple-glass-cta text-white text-xs font-semibold px-4 py-2 rounded-full inline-flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Nova Unidade
            </button>
          </div>
        )}
      </div>

      {feedback && (
        <div className="apple-glass-subtle rounded-2xl p-3.5 border border-emerald-400/35 bg-emerald-500/10 text-xs text-emerald-100 flex items-center justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline">
            Fechar
          </button>
        </div>
      )}
      {error && <ErrorBanner message={error} onRetry={loadData} />}

      {loading ? (
        <LoadingCard message="Carregando governança da rede..." />
      ) : overview ? (
        <div className="space-y-5">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="apple-glass-subtle rounded-2xl p-4 border border-white/12">
              <p className="text-[11px] uppercase font-bold text-wise-mute">Unidades na Rede</p>
              <p className="text-2xl font-bold text-wise-ink mt-1">{overview.units.length}</p>
            </div>
            <div className="apple-glass-subtle rounded-2xl p-4 border border-white/12">
              <p className="text-[11px] uppercase font-bold text-wise-mute">Pedidos Confirmados (Rede)</p>
              <p className="text-2xl font-bold text-wise-ink mt-1">
                {overview.units.reduce((acc, u) => acc + Number(u.confirmed_orders_count || 0), 0)}
              </p>
            </div>
            <div className="apple-glass-subtle rounded-2xl p-4 border border-white/12">
              <p className="text-[11px] uppercase font-bold text-wise-mute">Volume Comercial Ativo</p>
              <p className="text-2xl font-bold text-wise-ink mt-1">
                {formatBrl(
                  overview.units.reduce((acc, u) => acc + Number(u.confirmed_orders_cents || 0), 0)
                )}
              </p>
            </div>
            <div className="apple-glass-subtle rounded-2xl p-4 border border-white/12">
              <p className="text-[11px] uppercase font-bold text-wise-mute">Chamados Abertos (Rede)</p>
              <p className="text-2xl font-bold text-wise-ink mt-1">{overview.openNetworkTickets}</p>
            </div>
          </div>

          <div className="apple-glass rounded-3xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-wise-ink">Unidades, Habilitação &amp; Parâmetros Comerciais</h3>
            <div className="space-y-2.5">
              {overview.units.map((u) => (
                <div
                  key={u.id}
                  className="apple-glass-well rounded-2xl p-4 border border-white/12 flex flex-wrap items-center justify-between gap-4 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-blue-300">{u.code}</span>
                      <span className="font-bold text-wise-ink">{u.name}</span>
                      <StatusPill value={u.operational_status} />
                      <StatusPill
                        value={u.config_status || 'not_configured'}
                        customLabel={
                          u.config_status === 'approved'
                            ? `Config aprovada (${u.commercial_modality})`
                            : 'Regra comercial pendente'
                        }
                      />
                    </div>
                    <p className="text-[11px] text-wise-mute">
                      {u.city}/{u.state} · {u.users_count} usuário(s) · {u.confirmed_orders_count} pedido(s) ·{' '}
                      {formatBrl(Number(u.confirmed_orders_cents || 0))} · Treino:{' '}
                      {u.training_completed ? 'OK' : 'Pendente'} · Banca: {u.banca_approved ? 'Aprovada' : 'Pendente'}
                    </p>
                  </div>

                  {isNetworkAdmin && (
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEnableModalUnit(u);
                          setOpStatus(u.operational_status);
                          setTrainDone(u.training_completed);
                          setBancaDone(u.banca_approved);
                          setImplantDone(u.implantation_approved);
                          setImplantNotes(u.implantation_notes || '');
                        }}
                        className="px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/14 border border-white/15 text-xs font-semibold text-wise-ink"
                      >
                        Habilitação
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setCfgModalUnit(u);
                          setCfgStatus((u.config_status as 'not_configured' | 'pending_approval' | 'approved') || 'not_configured');
                          setCfgModality((u.commercial_modality as 'pending_definition' | 'revenda' | 'intermediacao') || 'pending_definition');
                          setCfgRoyaltyBps(u.royalty_bps !== null ? String(u.royalty_bps) : '');
                          setCfgMktBps(u.marketing_fund_bps !== null ? String(u.marketing_fund_bps) : '');
                          setCfgTransferBps('');
                          setCfgMaxDiscBps(String(u.max_discount_bps ?? 500));
                          setCfgTerritory(u.territory_rule_status || 'not_configured');
                          setCfgPriceList(u.default_price_list_code || '');
                          setCfgNotes('');
                        }}
                        className="px-3 py-1.5 rounded-full apple-glass-cta text-xs font-semibold text-white inline-flex items-center gap-1"
                      >
                        <Sliders className="w-3.5 h-3.5" />
                        Config Comercial
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {isNetworkAdmin && users.length > 0 && (
            <div className="apple-glass rounded-3xl p-5 space-y-3">
              <h3 className="text-sm font-bold text-wise-ink">Contas Supabase &amp; Vínculos ({users.length})</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {users.map((usr) => (
                  <div key={usr.id} className="apple-glass-well rounded-2xl p-3 border border-white/12 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-wise-ink">{usr.full_name}</span>
                      <StatusPill value={usr.is_active ? 'active' : 'revoked'} />
                    </div>
                    <p className="text-[11px] text-wise-mute">{usr.email}</p>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {usr.memberships?.map((m, i) => (
                        <span key={i} className="px-2 py-0.5 rounded-full bg-white/8 text-[10px] text-wise-body">
                          {m.unitCode}: {m.roleSlug}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="apple-glass rounded-3xl p-5 space-y-3">
            <h3 className="text-sm font-bold text-wise-ink">Log de Auditoria Recente</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] text-wise-mute uppercase border-b border-white/10">
                  <tr>
                    <th className="py-2 pr-3">Data</th>
                    <th className="py-2 pr-3">Unidade</th>
                    <th className="py-2 pr-3">Ator</th>
                    <th className="py-2 pr-3">Ação</th>
                    <th className="py-2">Entidade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8 text-wise-body">
                  {overview.auditLogs.slice(0, 20).map((log) => (
                    <tr key={log.id}>
                      <td className="py-2 pr-3 whitespace-nowrap">{formatDateBr(log.created_at, { withTime: true })}</td>
                      <td className="py-2 pr-3">{log.unit_code || 'REDE'}</td>
                      <td className="py-2 pr-3">{log.actor_email}</td>
                      <td className="py-2 pr-3 font-mono text-[11px] text-blue-300">{log.action}</td>
                      <td className="py-2">{log.entity_type}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {/* Modal Habilitação */}
      <GlassModal
        open={Boolean(enableModalUnit)}
        title={enableModalUnit ? `Habilitação · ${enableModalUnit.name}` : ''}
        onClose={() => setEnableModalUnit(null)}
      >
        <form onSubmit={handleSaveEnablement} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Status operacional da unidade</label>
            <select
              value={opStatus}
              onChange={(e) => setOpStatus(e.target.value as NetworkUnit['operational_status'])}
              className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
            >
              <option value="onboarding">Em implantação (onboarding)</option>
              <option value="pending_approval">Aguardando liberação</option>
              <option value="active">Ativa para operação</option>
              <option value="restricted">Restrita</option>
              <option value="suspended">Suspensa</option>
            </select>
          </div>
          <div className="space-y-2 text-xs text-wise-ink">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={trainDone} onChange={(e) => setTrainDone(e.target.checked)} className="accent-blue-500" />
              Treinamento obrigatório concluído
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={bancaDone} onChange={(e) => setBancaDone(e.target.checked)} className="accent-blue-500" />
              Banca prática aprovada
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={implantDone} onChange={(e) => setImplantDone(e.target.checked)} className="accent-blue-500" />
              Implantação documental aprovada
            </label>
          </div>
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Notas de implantação</label>
            <input
              type="text"
              value={implantNotes}
              onChange={(e) => setImplantNotes(e.target.value)}
              className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEnableModalUnit(null)} className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body">
              Cancelar
            </button>
            <button type="submit" className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white">
              Salvar Habilitação
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Modal Configuração Comercial */}
      <GlassModal
        open={Boolean(cfgModalUnit)}
        title={cfgModalUnit ? `Parâmetros Comerciais · ${cfgModalUnit.name}` : ''}
        subtitle="Informe apenas percentuais formalmente aprovados em contrato/aditivo (em basis points: 500 = 5%)."
        onClose={() => setCfgModalUnit(null)}
      >
        <form onSubmit={handleSaveCommercialCfg} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Status da configuração</label>
              <select
                value={cfgStatus}
                onChange={(e) => setCfgStatus(e.target.value as 'not_configured' | 'pending_approval' | 'approved')}
                className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              >
                <option value="not_configured">Não configurada</option>
                <option value="pending_approval">Pendente de aprovação</option>
                <option value="approved">Aprovada</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Modalidade comercial</label>
              <select
                value={cfgModality}
                onChange={(e) => setCfgModality(e.target.value as 'pending_definition' | 'revenda' | 'intermediacao')}
                className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              >
                <option value="pending_definition">Pendente de definição</option>
                <option value="revenda">Revenda</option>
                <option value="intermediacao">Intermediação</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-wise-mute mb-1">Royalties (bps)</label>
              <input type="number" min="0" max="10000" value={cfgRoyaltyBps} onChange={(e) => setCfgRoyaltyBps(e.target.value)} placeholder="Em branco" className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-wise-mute mb-1">Fundo Mkt (bps)</label>
              <input type="number" min="0" max="10000" value={cfgMktBps} onChange={(e) => setCfgMktBps(e.target.value)} placeholder="Em branco" className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-wise-mute mb-1">Repasse Fábrica (bps)</label>
              <input type="number" min="0" max="10000" value={cfgTransferBps} onChange={(e) => setCfgTransferBps(e.target.value)} placeholder="Em branco" className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none" />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-wise-mute mb-1">Teto Desconto (bps)</label>
              <input type="number" min="0" max="5000" value={cfgMaxDiscBps} onChange={(e) => setCfgMaxDiscBps(e.target.value)} className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Regra territorial</label>
              <select
                value={cfgTerritory}
                onChange={(e) => setCfgTerritory(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              >
                <option value="not_configured">Não configurada</option>
                <option value="pending_contract_definition">Pendente de definição contratual</option>
                <option value="configured_non_exclusive">Configurada sem exclusividade</option>
                <option value="configured_priority">Configurada com prioridade regional</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Código da tabela padrão</label>
              <input type="text" value={cfgPriceList} onChange={(e) => setCfgPriceList(e.target.value)} className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none" />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCfgModalUnit(null)} className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body">
              Cancelar
            </button>
            <button type="submit" className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white">
              Salvar Regras
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Modal Nova Unidade */}
      <GlassModal open={newUnitOpen} title="Cadastrar Nova Unidade Franqueada" onClose={() => setNewUnitOpen(false)}>
        <form onSubmit={handleCreateUnit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Código</label>
              <input type="text" required value={unitCode} onChange={(e) => setUnitCode(e.target.value)} placeholder="KS-RPO-05" className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Nome da unidade</label>
              <input type="text" required value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="Franquia Ribeirão Preto" className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Cidade</label>
              <input type="text" required value={unitCity} onChange={(e) => setUnitCity(e.target.value)} className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">UF</label>
              <input type="text" required maxLength={2} value={unitState} onChange={(e) => setUnitState(e.target.value)} className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none" />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setNewUnitOpen(false)} className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body">Cancelar</button>
            <button type="submit" className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white">Criar Unidade</button>
          </div>
        </form>
      </GlassModal>

      {/* Modal Comunicado */}
      <GlassModal open={annOpen} title="Publicar Comunicado Oficial da Rede" onClose={() => setAnnOpen(false)}>
        <form onSubmit={handlePublishAnnouncement} className="space-y-4">
          <input type="text" required value={annTitle} onChange={(e) => setAnnTitle(e.target.value)} placeholder="Título do comunicado" className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none" />
          <textarea required rows={4} value={annBody} onChange={(e) => setAnnBody(e.target.value)} placeholder="Texto oficial..." className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none" />
          <label className="flex items-center gap-2 text-xs text-wise-ink cursor-pointer">
            <input type="checkbox" checked={annPinned} onChange={(e) => setAnnPinned(e.target.checked)} className="accent-blue-500" />
            Fixar no topo do Meu Dia
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAnnOpen(false)} className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body">Cancelar</button>
            <button type="submit" className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white">Publicar</button>
          </div>
        </form>
      </GlassModal>

      {/* Modal Novo Usuário */}
      <GlassModal open={newUserOpen} title="Provisionar Usuário Supabase + Vínculo de Unidade" onClose={() => setNewUserOpen(false)}>
        <form onSubmit={handleCreateUser} className="space-y-4">
          <input type="text" required value={usrName} onChange={(e) => setUsrName(e.target.value)} placeholder="Nome completo" className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none" />
          <input type="email" required value={usrEmail} onChange={(e) => setUsrEmail(e.target.value)} placeholder="E-mail de login" className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none" />
          <input type="password" required minLength={8} value={usrPassword} onChange={(e) => setUsrPassword(e.target.value)} placeholder="Senha inicial (mínimo 8 caracteres)" className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <select value={usrUnitId} onChange={(e) => setUsrUnitId(e.target.value)} className="apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none">
              {overview?.units.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.code} · {u.name}
                </option>
              ))}
            </select>
            <select value={usrRole} onChange={(e) => setUsrRole(e.target.value)} className="apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none">
              <option value="franqueado" className="bg-[#181818]">Franqueado</option>
              <option value="admin" className="bg-[#181818]">Admin</option>
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setNewUserOpen(false)} className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body">Cancelar</button>
            <button type="submit" className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white">Criar Usuário</button>
          </div>
        </form>
      </GlassModal>
    </div>
  );
}
