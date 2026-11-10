'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  CalendarDays,
  CheckCircle2,
  CheckSquare,
  Clock,
  GraduationCap,
  MapPin,
  Megaphone,
  Package,
  Plus,
  RefreshCw,
  ShieldAlert,
  TrendingUp,
  Video,
} from 'lucide-react';
import { formatBrl, formatDateBr, hubAsset, portalFetch, PortalApiError } from '@/lib/api-client';
import type {
  ModuleTabId,
  MyDayResponse,
  PortalMeResponse,
  ScheduleEventItem,
} from './PortalTypes';
import { EmptyStateCard, ErrorBanner, GlassModal, LoadingCard, StatusPill } from './UiPrimitives';

interface UnitMember {
  user_id: string;
  full_name: string;
  role_name: string;
}

interface MyDayTabProps {
  me: PortalMeResponse;
  onNavigate: (tab: ModuleTabId, opts?: { action?: string; filter?: string; entityId?: string }) => void;
}

const PERIOD_OPTIONS = [
  { key: 'today', label: 'Hoje' },
  { key: '7d', label: '7 dias' },
  { key: 'month', label: 'Mês atual' },
  { key: '90d', label: '90 dias' },
  { key: 'all', label: 'Todo período' },
];

const EVENT_TYPE_META: Record<
  ScheduleEventItem['event_type'],
  { label: string; cls: string }
> = {
  entrega: {
    label: 'Entrega',
    cls: 'bg-emerald-500/20 border-emerald-400/40 text-emerald-200',
  },
  reuniao: {
    label: 'Reunião',
    cls: 'bg-blue-500/20 border-blue-400/40 text-blue-200',
  },
  follow_up: {
    label: 'Follow-up',
    cls: 'bg-cyan-500/20 border-cyan-400/40 text-cyan-200',
  },
  outro: {
    label: 'Compromisso',
    cls: 'bg-white/10 border-white/20 text-slate-200',
  },
};

const EVENT_STATUS_META: Record<
  ScheduleEventItem['status'],
  { label: string; cls: string }
> = {
  scheduled: {
    label: 'Agendado',
    cls: 'bg-sky-500/20 border-sky-400/35 text-sky-200',
  },
  confirmed: {
    label: 'Confirmado',
    cls: 'bg-blue-500/20 border-blue-400/35 text-blue-200',
  },
  completed: {
    label: 'Concluído',
    cls: 'bg-emerald-500/20 border-emerald-400/35 text-emerald-200',
  },
  canceled: {
    label: 'Cancelado',
    cls: 'bg-rose-500/20 border-rose-400/35 text-rose-200',
  },
};

const EVENT_COLOR_DOT: Record<ScheduleEventItem['color_tag'], string> = {
  blue: 'bg-blue-400',
  cyan: 'bg-cyan-400',
  emerald: 'bg-emerald-400',
  amber: 'bg-amber-400',
  slate: 'bg-slate-400',
};

export function MyDayTab({ me, onNavigate }: MyDayTabProps) {
  const [period, setPeriod] = useState<string>('month');
  const [data, setData] = useState<MyDayResponse | null>(null);
  const [members, setMembers] = useState<UnitMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Task Modal State
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskType, setTaskType] = useState<'contato' | 'reuniao' | 'follow_up' | 'vencimento' | 'aprovacao_esperada' | 'entrega'>('follow_up');
  const [taskDueAt, setTaskDueAt] = useState(() => {
    const d = new Date(Date.now() + 3600_000 * 4);
    return d.toISOString().slice(0, 16);
  });
  const [taskAssignedTo, setTaskAssignedTo] = useState<string>(me.user.id);
  const [taskPriority, setTaskPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [taskDesc, setTaskDesc] = useState('');
  const [submittingTask, setSubmittingTask] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);

  // Reschedule modal
  const [rescheduleTask, setRescheduleTask] = useState<MyDayResponse['agenda'][number] | null>(null);
  const [rescheduleDue, setRescheduleDue] = useState('');
  const [rescheduleAssignee, setRescheduleAssignee] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [res, membersRes] = await Promise.all([
        portalFetch<MyDayResponse>(`/dashboard/my-day?period=${encodeURIComponent(period)}`),
        portalFetch<{ members: UnitMember[] }>('/auth/unit-members').catch(() => ({ members: [] })),
      ]);
      setData(res);
      setMembers(membersRes.members || []);
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Falha ao carregar painel Meu Dia.');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    loadData();
  }, [loadData, me.activeUnit.id]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingTask(true);
    setTaskError(null);
    try {
      await portalFetch('/crm/tasks', {
        method: 'POST',
        body: JSON.stringify({
          taskType,
          title: taskTitle.trim(),
          description: taskDesc.trim() || null,
          dueAt: new Date(taskDueAt).toISOString(),
          assignedTo: taskAssignedTo || me.user.id,
          priority: taskPriority,
        }),
      });
      setTaskModalOpen(false);
      setTaskTitle('');
      setTaskDesc('');
      await loadData();
    } catch (err) {
      setTaskError(err instanceof PortalApiError ? err.message : 'Erro ao criar tarefa na agenda.');
    } finally {
      setSubmittingTask(false);
    }
  };

  const handleCompleteTask = async (id: string) => {
    try {
      await portalFetch(`/crm/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed' }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Não foi possível concluir a tarefa.');
    }
  };

  const handleSaveReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rescheduleTask) return;
    try {
      await portalFetch(`/crm/tasks/${rescheduleTask.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          dueAt: rescheduleDue ? new Date(rescheduleDue).toISOString() : undefined,
          assignedTo: rescheduleAssignee || undefined,
        }),
      });
      setRescheduleTask(null);
      await loadData();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao reagendar atividade.');
    }
  };

  if (loading && !data) return <LoadingCard message="Consolidando prioridades operacionais da unidade..." />;
  if (error && !data) return <ErrorBanner message={error} onRetry={loadData} />;
  if (!data) return null;

  const canWriteCrm = me.activeRole.permissions.includes('crm:write');
  const canWriteQuotes = me.activeRole.permissions.includes('quotes:write');
  const canWriteTasks = me.activeRole.permissions.includes('tasks:write');
  const canReadAgenda =
    me.activeRole.permissions.includes('agenda:read') ||
    me.activeRole.permissions.includes('tasks:read');
  const canWriteAgenda =
    me.activeRole.permissions.includes('agenda:write') ||
    me.activeRole.permissions.includes('tasks:write');
  const canReadTasks = me.activeRole.permissions.includes('tasks:read');

  const todayDisplay = new Date().toLocaleDateString('pt-BR', {
    timeZone: me.activeUnit.timezone || 'America/Sao_Paulo',
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });

  const gov = data.unitGovernance;
  const scheduleEvents = data.scheduleEvents ?? [];

  const commercialModalityLabel =
    gov.commercialModality === 'pending_definition'
      ? 'Modalidade a definir pela rede'
      : gov.commercialModality === 'revenda'
        ? 'Revenda direta'
        : gov.commercialModality === 'intermediacao'
          ? 'Intermediação'
          : gov.commercialModality;

  const territoryRuleLabel =
    gov.territoryRuleStatus === 'not_configured' ||
    gov.territoryRuleStatus === 'pending_contract_definition'
      ? 'Pendente de definição contratual'
      : gov.territoryRuleStatus === 'non_exclusive' ||
          gov.territoryRuleStatus === 'configured_non_exclusive'
        ? 'Sem exclusividade regional'
        : gov.territoryRuleStatus === 'exclusive' ||
            gov.territoryRuleStatus === 'configured_exclusive'
          ? 'Exclusividade regional aprovada'
          : gov.territoryRuleStatus;

  return (
    <div className="space-y-6">
      {error ? <ErrorBanner message={error} onRetry={loadData} /> : null}

      {/* A. Banner Visual Superior & Governança da Unidade */}
      <section className="relative overflow-hidden rounded-3xl border border-white/15 bg-[#07070b] shadow-2xl">
        <img
          src={hubAsset('/king-sports/dashboard-banner.jpg')}
          alt="King Sports Franchising Studio & Operação"
          className="absolute inset-0 w-full h-full object-cover object-right sm:object-center opacity-75 sm:opacity-85"
          style={{
            WebkitMaskImage: 'linear-gradient(to left, rgba(0,0,0,0.96) 28%, rgba(0,0,0,0.55) 56%, rgba(0,0,0,0.08) 92%)',
            maskImage: 'linear-gradient(to left, rgba(0,0,0,0.96) 28%, rgba(0,0,0,0.55) 56%, rgba(0,0,0,0.08) 92%)',
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#07070b]/96 via-[#07070b]/84 to-[#07070b]/35" />
        <div className="pointer-events-none absolute inset-0 rounded-3xl bg-gradient-to-t from-[#07070b]/80 via-transparent to-[#07070b]/25 ring-1 ring-inset ring-white/15 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)]" />

        <div className="relative z-10 p-5 sm:p-7 space-y-4">
          {/* Compact top metadata row */}
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-200/90">
            <span className="capitalize font-medium text-white">{todayDisplay}</span>
            <span className="text-white/40">·</span>
            <span className="font-medium text-slate-200">
              {me.activeUnit.name} ({me.activeUnit.code}) — {me.activeUnit.city}/{me.activeUnit.state}
            </span>
            <StatusPill value={gov.operationalStatus} />
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white/10 backdrop-blur-md border border-white/18 text-white">
              {me.activeRole.name}
            </span>
          </div>

          {/* Executive headline + primary CTAs */}
          <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
            <div className="space-y-2 max-w-3xl">
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight leading-tight">
                Portal Operacional · {me.user.fullName}
              </h1>
              <p className="text-xs text-slate-200/85 flex flex-wrap items-center gap-x-2 gap-y-1 leading-relaxed">
                <span>
                  Capacitação:{' '}
                  <strong className="text-white font-semibold">
                    {gov.trainingCompleted ? 'Concluída' : 'Em andamento'}
                  </strong>
                </span>
                <span className="text-white/35">|</span>
                <span>
                  Banca Prática:{' '}
                  <strong className="text-white font-semibold">
                    {gov.bancaApproved ? 'Aprovada' : 'Pendente'}
                  </strong>
                </span>
                <span className="text-white/35">|</span>
                <span>
                  Unidade:{' '}
                  <strong className="text-white font-semibold">
                    {gov.implantationApproved ? 'Ativa para pedidos' : 'Aguardando conclusão'}
                  </strong>
                </span>
                <span className="text-white/35">|</span>
                <span className="text-slate-300">
                  Atualizado em {formatDateBr(data.generatedAt, { withTime: true })}
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {canWriteCrm ? (
                <button
                  type="button"
                  onClick={() => onNavigate('crm', { action: 'new-opportunity' })}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full apple-glass-cta text-white text-xs font-semibold transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Nova oportunidade
                </button>
              ) : null}
              {canWriteQuotes ? (
                <button
                  type="button"
                  onClick={() => onNavigate('quotes', { action: 'new-quote' })}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#07070b]/65 hover:bg-white/16 backdrop-blur-md border border-white/20 text-white text-xs font-semibold transition-all"
                >
                  <Plus className="w-4 h-4" />
                  Novo orçamento
                </button>
              ) : null}
              {canWriteAgenda ? (
                <button
                  type="button"
                  onClick={() => onNavigate('agenda', { action: 'new-event' })}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full bg-[#07070b]/65 hover:bg-white/16 backdrop-blur-md border border-white/20 text-white text-xs font-semibold transition-all"
                >
                  <CalendarDays className="w-4 h-4 text-blue-300" />
                  Agendar entrega/reunião
                </button>
              ) : null}
              <button
                type="button"
                onClick={loadData}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-[#07070b]/65 hover:bg-white/16 backdrop-blur-md border border-white/16 text-slate-200 hover:text-white text-xs font-semibold transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
            </div>
          </div>

          {/* Filtro de período & regra comercial */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3.5 border-t border-white/12">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] uppercase font-bold tracking-wider text-slate-300 mr-1">
                Período comercial:
              </span>
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setPeriod(opt.key)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold backdrop-blur-md transition-all ${
                    period === opt.key
                      ? 'bg-blue-500/30 border border-blue-400/70 text-white shadow-[0_0_16px_-4px_rgba(59,130,246,0.55)]'
                      : 'bg-[#07070b]/55 border border-white/14 text-slate-200 hover:text-white hover:bg-white/12'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <span className="text-[11px] text-slate-200/85 bg-[#07070b]/55 backdrop-blur-md px-3 py-1 rounded-full border border-white/12">
              {commercialModalityLabel} · {territoryRuleLabel}
            </span>
          </div>

          {/* Pendências de Implantação / Habilitação (se aplicável) */}
          {gov.implantationPendingItems.length > 0 ? (
            <div className="rounded-2xl bg-[#07070b]/75 backdrop-blur-md border border-amber-400/40 p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-200">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Pendências para habilitação completa da unidade ({gov.implantationPendingItems.length})</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {gov.implantationPendingItems.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center justify-between gap-3 rounded-xl bg-black/45 border border-white/12 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{item.label}</p>
                      <p className="text-[11px] text-slate-300 truncate">{item.detail}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const mapped: ModuleTabId =
                          item.tab === 'university'
                            ? 'training'
                            : item.tab === 'banca'
                              ? 'sandbox'
                              : (item.tab as ModuleTabId);
                        onNavigate(mapped);
                      }}
                      className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-amber-400/20 hover:bg-amber-400/30 border border-amber-300/45 text-amber-100 text-[11px] font-semibold"
                    >
                      Resolver <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {/* B1. Indicadores Comerciais e Financeiros do Período */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-wise-ink flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-400" />
            Comercial &amp; Financeiro · {data.commercialKpis.periodLabel}
          </h2>
          <span className="text-[11px] text-wise-mute">{gov.initialFeeNote}</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => onNavigate('crm', { filter: 'open' })}
            className="text-left apple-glass-subtle hover:border-blue-400/50 rounded-2xl p-4 space-y-1.5 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-wise-mute">Oportunidades abertas</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-wise-body">{data.commercialKpis.periodLabel}</span>
            </div>
            <p className="text-2xl font-bold text-wise-ink">{data.commercialKpis.openOpportunities.count}</p>
            <p className="text-xs font-semibold text-blue-300">
              Pipeline est.: {formatBrl(data.commercialKpis.openOpportunities.estimatedValueCents)}
            </p>
            <p className="text-[11px] text-wise-mute leading-snug">{data.commercialKpis.openOpportunities.definition}</p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('quotes', { filter: 'sent' })}
            className="text-left apple-glass-subtle hover:border-blue-400/50 rounded-2xl p-4 space-y-1.5 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-wise-mute">Orçamentos enviados</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-wise-body">{data.commercialKpis.periodLabel}</span>
            </div>
            <p className="text-2xl font-bold text-wise-ink">{data.commercialKpis.sentQuotes.count}</p>
            <p className="text-xs font-semibold text-blue-300">
              Volume proposto: {formatBrl(data.commercialKpis.sentQuotes.totalValueCents)}
            </p>
            <p className="text-[11px] text-wise-mute leading-snug">{data.commercialKpis.sentQuotes.definition}</p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('quotes')}
            className="text-left apple-glass-subtle hover:border-blue-400/50 rounded-2xl p-4 space-y-1.5 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-wise-mute">Conversão de propostas</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-wise-body">{data.commercialKpis.periodLabel}</span>
            </div>
            <p className="text-2xl font-bold text-wise-ink">
              {data.commercialKpis.proposalConversion.ratePct !== null
                ? `${data.commercialKpis.proposalConversion.ratePct}%`
                : 'Sem base'}
            </p>
            <p className="text-xs font-semibold text-wise-body">
              {data.commercialKpis.proposalConversion.convertedCount} de {data.commercialKpis.proposalConversion.baseCount} enviadas
            </p>
            <p className="text-[11px] text-wise-mute leading-snug">{data.commercialKpis.proposalConversion.definition}</p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('orders', { filter: 'confirmed' })}
            className="text-left apple-glass-subtle hover:border-blue-400/50 rounded-2xl p-4 space-y-1.5 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-wise-mute">Pedidos confirmados</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-wise-body">{data.commercialKpis.periodLabel}</span>
            </div>
            <p className="text-2xl font-bold text-wise-ink">
              {formatBrl(data.commercialKpis.confirmedOrders.totalValueCents)}
            </p>
            <p className="text-xs font-semibold text-blue-300">
              {data.commercialKpis.confirmedOrders.count} pedido(s) ativo(s)
            </p>
            <p className="text-[11px] text-wise-mute leading-snug">{data.commercialKpis.confirmedOrders.definition}</p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('finance')}
            className="text-left apple-glass-subtle hover:border-blue-400/50 rounded-2xl p-4 space-y-1.5 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-wise-mute">Valor recebido (Caixa líquido)</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/8 text-wise-body">{data.commercialKpis.periodLabel}</span>
            </div>
            <p className="text-2xl font-bold text-emerald-300">
              {formatBrl(data.commercialKpis.receivedValue.amountCents)}
            </p>
            <p className="text-[11px] text-wise-mute leading-snug">{data.commercialKpis.receivedValue.definition}</p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('finance', { filter: 'open' })}
            className="text-left apple-glass-subtle hover:border-blue-400/50 rounded-2xl p-4 space-y-1.5 transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase text-wise-mute">Saldo a receber</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-200">Fotografia atual</span>
            </div>
            <p className="text-2xl font-bold text-wise-ink">
              {formatBrl(data.commercialKpis.openReceivablesBalance.amountCents)}
            </p>
            <p className="text-xs font-semibold text-rose-300">
              Em atraso: {formatBrl(data.commercialKpis.openReceivablesBalance.overdueCents)}
            </p>
            <p className="text-[11px] text-wise-mute leading-snug">{data.commercialKpis.openReceivablesBalance.definition}</p>
          </button>
        </div>
      </section>

      {/* B2. Indicadores Operacionais (Fotografia Atual) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wider text-wise-ink flex items-center gap-2">
            <Package className="w-4 h-4 text-blue-400" />
            Operação · Fotografia Atual da Unidade
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            {
              label: 'Artes aguardando ação',
              val: data.operationSnapshotKpis.artsAwaitingAction.count,
              def: data.operationSnapshotKpis.artsAwaitingAction.definition,
              tab: 'studio' as ModuleTabId,
              tone: 'text-amber-300',
            },
            {
              label: 'Pedidos em produção (SP)',
              val: data.operationSnapshotKpis.ordersInProduction.count,
              def: data.operationSnapshotKpis.ordersInProduction.definition,
              tab: 'orders' as ModuleTabId,
              tone: 'text-blue-300',
            },
            {
              label: 'Pedidos com atraso',
              val: data.operationSnapshotKpis.delayedOrders.count,
              def: data.operationSnapshotKpis.delayedOrders.definition,
              tab: 'orders' as ModuleTabId,
              tone: data.operationSnapshotKpis.delayedOrders.count > 0 ? 'text-rose-300' : 'text-wise-ink',
            },
            {
              label: 'Entregas próximas (14d)',
              val: data.operationSnapshotKpis.upcomingDeliveries.count,
              def: data.operationSnapshotKpis.upcomingDeliveries.definition,
              tab: 'orders' as ModuleTabId,
              tone: 'text-emerald-300',
            },
            {
              label: 'Chamados SAC abertos',
              val: data.operationSnapshotKpis.openTickets.count,
              def: data.operationSnapshotKpis.openTickets.definition,
              tab: 'support' as ModuleTabId,
              tone: data.operationSnapshotKpis.openTickets.count > 0 ? 'text-amber-200' : 'text-wise-ink',
            },
          ].map((k) => (
            <button
              key={k.label}
              type="button"
              onClick={() => onNavigate(k.tab)}
              className="text-left apple-glass-subtle hover:border-blue-400/50 rounded-2xl p-4 space-y-1 transition-all"
            >
              <span className="text-[11px] font-bold text-wise-mute block">{k.label}</span>
              <p className={`text-2xl font-bold ${k.tone}`}>{k.val}</p>
              <p className="text-[11px] text-wise-mute leading-snug">{k.def}</p>
            </button>
          ))}
        </div>
      </section>

      {/* C + D. Prioridades do Dia & Agenda */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* C. Prioridades do Dia */}
        <section className="xl:col-span-2 apple-glass rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-wise-ink flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-300" />
                Prioridades do dia ({data.priorities.length})
              </h2>
              <p className="text-xs text-wise-mute">
                Pendências consolidadas por pedido/item e ordenadas por urgência e prazo do cliente.
              </p>
            </div>
          </div>

          {data.priorities.length === 0 ? (
            <EmptyStateCard
              title="Nenhuma pendência crítica no momento"
              description="Todos os pedidos ativos, artes, parcelas e chamados desta unidade estão em dia."
            />
          ) : (
            <div className="space-y-3">
              {data.priorities.map((prio) => (
                <div
                  key={prio.id}
                  className={`rounded-2xl p-4 border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
                    prio.severity === 'critical'
                      ? 'bg-rose-500/10 border-rose-400/35'
                      : prio.severity === 'high'
                        ? 'bg-amber-500/10 border-amber-400/30'
                        : 'bg-white/5 border-white/12'
                  }`}
                >
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          prio.severity === 'critical'
                            ? 'bg-rose-500/30 text-rose-100'
                            : prio.severity === 'high'
                              ? 'bg-amber-500/30 text-amber-100'
                              : 'bg-blue-500/25 text-blue-100'
                        }`}
                      >
                        {prio.severity === 'critical' ? 'Crítico' : prio.severity === 'high' ? 'Alta' : 'Atenção'}
                      </span>
                      <span className="font-bold text-wise-ink">{prio.customerName}</span>
                      <span className="text-wise-mute">· Ref.: {prio.referenceCode}</span>
                      {prio.deadline ? (
                        <span className="text-wise-body">· Prazo: {formatDateBr(prio.deadline)}</span>
                      ) : null}
                    </div>
                    <p className="text-sm font-semibold text-wise-ink">{prio.problem}</p>
                    <p className="text-xs text-wise-body">
                      Impacto: {prio.impact} · Responsável: {prio.responsibleName}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => onNavigate(prio.actionTab, { entityId: prio.actionEntityId })}
                    className="shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full apple-glass-cta text-white text-xs font-semibold whitespace-nowrap"
                  >
                    <span>{prio.recommendedAction}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* D. Agenda Operacional */}
        <section className="apple-glass rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-wise-ink flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-400" />
                Agenda ({scheduleEvents.length + data.agenda.length})
              </h2>
              <p className="text-xs text-wise-mute">Entregas, reuniões, follow-ups e aprovações.</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {canReadAgenda ? (
                <button
                  type="button"
                  onClick={() => onNavigate('agenda')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/15 border border-white/14 text-wise-ink hover:text-white text-xs font-semibold transition-colors"
                >
                  <CalendarDays className="w-3.5 h-3.5 text-blue-300" />
                  Abrir Google Agenda
                </button>
              ) : null}
              {canReadTasks ? (
                <button
                  type="button"
                  onClick={() => onNavigate('tasks')}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/15 border border-white/14 text-wise-ink hover:text-white text-xs font-semibold transition-colors"
                >
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-300" />
                  Todas tarefas
                </button>
              ) : null}
              {canWriteTasks ? (
                <button
                  type="button"
                  onClick={() => setTaskModalOpen(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full apple-glass-cta text-white text-xs font-semibold"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nova tarefa
                </button>
              ) : null}
            </div>
          </div>

          {scheduleEvents.length === 0 && data.agenda.length === 0 ? (
            <EmptyStateCard
              title="Agenda limpa"
              description="Agende entregas, reuniões comerciais ou crie follow-ups e lembretes de aprovação."
            />
          ) : (
            <div className="space-y-4">
              {scheduleEvents.length > 0 ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-wise-mute">
                      Entregas &amp; Reuniões ({scheduleEvents.length})
                    </span>
                    {canReadAgenda ? (
                      <button
                        type="button"
                        onClick={() => onNavigate('agenda')}
                        className="text-[11px] font-semibold text-blue-300 hover:text-white inline-flex items-center gap-1"
                      >
                        Ver agenda <ArrowRight className="w-3 h-3" />
                      </button>
                    ) : null}
                  </div>
                  <div className="space-y-2">
                    {scheduleEvents.map((evt) => {
                      const typeMeta = EVENT_TYPE_META[evt.event_type] || EVENT_TYPE_META.outro;
                      const statusMeta = EVENT_STATUS_META[evt.status] || {
                        label: evt.status,
                        cls: 'bg-white/10 border-white/20 text-wise-ink',
                      };
                      const dotCls = EVENT_COLOR_DOT[evt.color_tag] || EVENT_COLOR_DOT.blue;
                      return (
                        <div
                          key={evt.id}
                          className="rounded-2xl apple-glass-well p-3.5 space-y-2 border border-white/12 hover:border-blue-400/35 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 space-y-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span
                                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${typeMeta.cls}`}
                                >
                                  <span className={`w-1.5 h-1.5 rounded-full ${dotCls}`} />
                                  {typeMeta.label}
                                </span>
                                <span
                                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${statusMeta.cls}`}
                                >
                                  {statusMeta.label}
                                </span>
                              </div>
                              <p className="text-xs font-bold text-wise-ink">{evt.title}</p>
                            </div>
                            <span className="text-[11px] text-wise-mute shrink-0 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {evt.all_day
                                ? `${formatDateBr(evt.start_at)} · Dia todo`
                                : formatDateBr(evt.start_at, { withTime: true })}
                            </span>
                          </div>

                          {(evt.customer_name || evt.order_number || evt.assigned_name || evt.location || evt.meeting_url) ? (
                            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-wise-body">
                              {evt.customer_name ? <span>Cliente: {evt.customer_name}</span> : null}
                              {evt.order_number ? <span>Pedido {evt.order_number}</span> : null}
                              {evt.location ? (
                                <span className="inline-flex items-center gap-1 text-wise-mute">
                                  <MapPin className="w-3 h-3" />
                                  {evt.location}
                                </span>
                              ) : null}
                              {evt.meeting_url ? (
                                <span className="inline-flex items-center gap-1 text-blue-300">
                                  <Video className="w-3 h-3" />
                                  Videoconferência
                                </span>
                              ) : null}
                              {evt.assigned_name ? <span>Resp.: {evt.assigned_name}</span> : null}
                            </div>
                          ) : null}

                          {canReadAgenda ? (
                            <div className="pt-0.5">
                              <button
                                type="button"
                                onClick={() => onNavigate('agenda', { entityId: evt.id })}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/8 hover:bg-white/15 border border-white/12 text-wise-body hover:text-white text-[11px] font-semibold transition-colors"
                              >
                                Ver compromisso <ArrowRight className="w-3 h-3" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {data.agenda.length > 0 ? (
                <div className="space-y-2.5">
                  {scheduleEvents.length > 0 ? (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-wise-mute">
                        Tarefas em aberto ({data.agenda.length})
                      </span>
                      {canReadTasks ? (
                        <button
                          type="button"
                          onClick={() => onNavigate('tasks')}
                          className="text-[11px] font-semibold text-blue-300 hover:text-white inline-flex items-center gap-1"
                        >
                          Gerenciar tarefas <ArrowRight className="w-3 h-3" />
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {data.agenda.map((task) => (
                    <div key={task.id} className="rounded-2xl apple-glass-well p-3.5 space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] uppercase font-bold text-blue-300">{task.task_type.replace(/_/g, ' ')}</span>
                          <p className="text-xs font-bold text-wise-ink">{task.title}</p>
                        </div>
                        <span className="text-[11px] text-wise-mute shrink-0 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {formatDateBr(task.due_at, { withTime: true })}
                        </span>
                      </div>
                      <p className="text-[11px] text-wise-body">
                        {task.customer_name ? `Cliente: ${task.customer_name} · ` : ''}
                        {task.order_number ? `Pedido ${task.order_number} · ` : ''}
                        Resp.: {task.assigned_name || me.user.fullName}
                      </p>
                      {canWriteTasks ? (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleCompleteTask(task.id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-200 text-[11px] font-semibold"
                          >
                            <CheckCircle2 className="w-3 h-3" /> Concluir
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRescheduleTask(task);
                              setRescheduleDue(new Date(task.due_at).toISOString().slice(0, 16));
                              setRescheduleAssignee(me.user.id);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/8 hover:bg-white/15 border border-white/12 text-wise-body text-[11px] font-semibold"
                          >
                            Reagendar / Atribuir
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </section>
      </div>

      {/* E. Pedidos em Destaque */}
      <section className="apple-glass rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-wise-ink">Pedidos em destaque</h2>
            <p className="text-xs text-wise-mute">Acompanhamento dos pedidos ativos ordenados por prazo do evento/entrega.</p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('orders')}
            className="text-xs font-semibold text-blue-300 hover:text-white inline-flex items-center gap-1"
          >
            Ver todos os pedidos <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {data.featuredOrders.length === 0 ? (
          <EmptyStateCard
            title="Sem pedidos ativos nesta unidade"
            description="Quando você converter um orçamento ou criar um pedido, ele aparecerá aqui."
          />
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/12 text-[11px] uppercase text-wise-mute">
                    <th className="py-2.5 pr-4">Número</th>
                    <th className="py-2.5 pr-4">Cliente</th>
                    <th className="py-2.5 pr-4">Qtd</th>
                    <th className="py-2.5 pr-4">Status / Etapa</th>
                    <th className="py-2.5 pr-4">Prev. entrega</th>
                    <th className="py-2.5 pr-4">Pendência</th>
                    <th className="py-2.5 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8 text-xs">
                  {data.featuredOrders.map((ord) => (
                    <tr key={ord.id} className="hover:bg-white/4">
                      <td className="py-3 pr-4 font-bold text-wise-ink">{ord.order_number}</td>
                      <td className="py-3 pr-4 text-wise-ink">{ord.customer_name}</td>
                      <td className="py-3 pr-4 text-wise-body">{ord.total_pieces} pç</td>
                      <td className="py-3 pr-4">
                        <div className="flex flex-wrap gap-1.5">
                          <StatusPill value={ord.approval_status} />
                          <StatusPill value={ord.production_status} />
                          <StatusPill value={ord.logistics_status} />
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-wise-body">
                        {formatDateBr(ord.estimated_delivery_date)}
                        {ord.event_date ? (
                          <span className="block text-[10px] text-amber-300">Evento: {formatDateBr(ord.event_date)}</span>
                        ) : null}
                      </td>
                      <td className="py-3 pr-4 max-w-xs text-wise-mute">
                        {Array.isArray(ord.release_block_reasons) && ord.release_block_reasons.length > 0
                          ? ord.release_block_reasons[0]
                          : 'Liberado'}
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onNavigate('orders', { entityId: ord.id })}
                          className="px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/16 border border-white/15 text-xs font-semibold text-white"
                        >
                          Abrir detalhe
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Cards */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
              {data.featuredOrders.map((ord) => (
                <div key={ord.id} className="rounded-2xl apple-glass-well p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold text-wise-ink">{ord.order_number}</span>
                    <span className="text-xs text-wise-body">{ord.total_pieces} peças</span>
                  </div>
                  <p className="text-xs font-semibold text-wise-ink">{ord.customer_name}</p>
                  <div className="flex flex-wrap gap-1.5">
                    <StatusPill value={ord.approval_status} />
                    <StatusPill value={ord.production_status} />
                  </div>
                  <p className="text-[11px] text-wise-mute">
                    Prev.: {formatDateBr(ord.estimated_delivery_date)}
                    {ord.event_date ? ` · Evento: ${formatDateBr(ord.event_date)}` : ''}
                  </p>
                  {Array.isArray(ord.release_block_reasons) && ord.release_block_reasons.length > 0 ? (
                    <p className="text-[11px] text-amber-200">{ord.release_block_reasons[0]}</p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onNavigate('orders', { entityId: ord.id })}
                    className="w-full mt-1 py-2 rounded-full bg-white/10 border border-white/15 text-xs font-semibold text-white"
                  >
                    Abrir detalhe do pedido
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* F. Comunicados e Formação (Rodapé discreto sem competir com alertas) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="apple-glass-subtle rounded-3xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-wise-ink flex items-center gap-2">
              <GraduationCap className="w-4 h-4 text-blue-400" />
              Formação na Universidade King Sports
            </h2>
            <button
              type="button"
              onClick={() => onNavigate('training')}
              className="text-xs font-semibold text-blue-300 hover:text-white"
            >
              Continuar trilha →
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl apple-glass-well p-3">
              <span className="text-[11px] text-wise-mute">Cursos obrigatórios</span>
              <p className="text-lg font-bold text-wise-ink">
                {data.trainingSummary.completedMandatoryCourses} / {data.trainingSummary.totalMandatoryCourses}
              </p>
            </div>
            <div className="rounded-2xl apple-glass-well p-3">
              <span className="text-[11px] text-wise-mute">Aulas concluídas</span>
              <p className="text-lg font-bold text-wise-ink">
                {data.trainingSummary.completedLessons} / {data.trainingSummary.totalLessons}
              </p>
            </div>
          </div>
        </section>

        <section className="apple-glass-subtle rounded-3xl p-5 space-y-3">
          <h2 className="text-sm font-bold text-wise-ink flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-blue-400" />
            Comunicados da Franqueadora
          </h2>
          {data.announcements.length === 0 ? (
            <p className="text-xs text-wise-mute">Nenhum comunicado recente.</p>
          ) : (
            <div className="space-y-2.5">
              {data.announcements.map((ann) => (
                <div key={ann.id} className="rounded-2xl bg-white/5 border border-white/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-bold text-wise-ink">{ann.title}</span>
                    <span className="text-[10px] text-wise-mute shrink-0">{formatDateBr(ann.published_at)}</span>
                  </div>
                  <p className="text-xs text-wise-body mt-1">{ann.body}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Modal Criar Tarefa na Agenda */}
      <GlassModal
        open={taskModalOpen}
        title="Nova tarefa na agenda operacional"
        subtitle="Atribua um contato, follow-up, cobrança ou entrega com prazo definido."
        onClose={() => setTaskModalOpen(false)}
      >
        <form onSubmit={handleCreateTask} className="space-y-4">
          {taskError ? <ErrorBanner message={taskError} /> : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Tipo</label>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as typeof taskType)}
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
              >
                <option value="follow_up" className="bg-[#181818]">Follow-up comercial</option>
                <option value="contato" className="bg-[#181818]">Contato com cliente</option>
                <option value="reuniao" className="bg-[#181818]">Reunião / Visita</option>
                <option value="aprovacao_esperada" className="bg-[#181818]">Cobrança de aprovação</option>
                <option value="vencimento" className="bg-[#181818]">Vencimento financeiro</option>
                <option value="entrega" className="bg-[#181818]">Acompanhamento entrega</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Prioridade</label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as typeof taskPriority)}
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
              >
                <option value="normal" className="bg-[#181818]">Normal</option>
                <option value="high" className="bg-[#181818]">Alta</option>
                <option value="urgent" className="bg-[#181818]">Urgente</option>
                <option value="low" className="bg-[#181818]">Baixa</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Título da atividade</label>
            <input
              type="text"
              required
              minLength={2}
              value={taskTitle}
              onChange={(e) => setTaskTitle(e.target.value)}
              placeholder="Ex: Confirmar grade P-GG do Colégio Delta"
              className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Data e hora</label>
              <input
                type="datetime-local"
                required
                value={taskDueAt}
                onChange={(e) => setTaskDueAt(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Responsável</label>
              <select
                value={taskAssignedTo}
                onChange={(e) => setTaskAssignedTo(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
              >
                {members.length === 0 ? (
                  <option value={me.user.id} className="bg-[#181818]">{me.user.fullName}</option>
                ) : (
                  members.map((m) => (
                    <option key={m.user_id} value={m.user_id} className="bg-[#181818]">
                      {m.full_name} ({m.role_name})
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Observações</label>
            <textarea
              rows={2}
              value={taskDesc}
              onChange={(e) => setTaskDesc(e.target.value)}
              className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setTaskModalOpen(false)}
              className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submittingTask}
              className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white disabled:opacity-50"
            >
              {submittingTask ? 'Salvando...' : 'Agendar tarefa'}
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Modal Reagendar / Reatribuir */}
      <GlassModal
        open={Boolean(rescheduleTask)}
        title="Reagendar ou reatribuir tarefa"
        subtitle={rescheduleTask?.title}
        onClose={() => setRescheduleTask(null)}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleSaveReschedule} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Nova data/hora</label>
            <input
              type="datetime-local"
              value={rescheduleDue}
              onChange={(e) => setRescheduleDue(e.target.value)}
              className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
              required
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Responsável</label>
            <select
              value={rescheduleAssignee}
              onChange={(e) => setRescheduleAssignee(e.target.value)}
              className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
            >
              {members.length === 0 ? (
                <option value={me.user.id} className="bg-[#181818]">{me.user.fullName}</option>
              ) : (
                members.map((m) => (
                  <option key={m.user_id} value={m.user_id} className="bg-[#181818]">
                    {m.full_name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setRescheduleTask(null)}
              className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body"
            >
              Cancelar
            </button>
            <button type="submit" className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white">
              Salvar alteração
            </button>
          </div>
        </form>
      </GlassModal>
    </div>
  );
}
