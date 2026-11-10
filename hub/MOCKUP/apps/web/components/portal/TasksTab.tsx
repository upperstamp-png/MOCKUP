'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  Clock,
  ListTodo,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react';
import { formatDateBr, portalFetch, PortalApiError } from '@/lib/api-client';
import type { ModuleTabId, PortalMeResponse } from './PortalTypes';
import {
  EmptyStateCard,
  ErrorBanner,
  GlassModal,
  LoadingCard,
  StatusPill,
} from './UiPrimitives';

export type TaskType =
  | 'follow_up'
  | 'contato'
  | 'reuniao'
  | 'aprovacao_esperada'
  | 'vencimento'
  | 'entrega'
  | 'implantacao';

export type TaskPriority = 'urgent' | 'high' | 'normal' | 'low';
export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'canceled';

export interface TaskApiItem {
  id: string;
  unit_id?: string;
  task_type: TaskType | string;
  title: string;
  description: string | null;
  customer_id: string | null;
  customer_name: string | null;
  opportunity_id?: string | null;
  order_id: string | null;
  order_number: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  due_at: string;
  priority: TaskPriority | string;
  status: TaskStatus | string;
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface CustomerOption {
  id: string;
  name: string;
}

interface OrderOption {
  id: string;
  order_number: string;
  customer_id?: string | null;
  customer_name?: string | null;
}

interface UnitMember {
  user_id: string;
  full_name: string;
  role_name?: string;
}

type BucketFilter = 'hoje' | 'atrasadas' | 'abertas' | 'concluidas' | 'todas';

const PRIORITY_META: Record<
  string,
  { label: string; cls: string; weight: number }
> = {
  urgent: {
    label: 'Urgente',
    cls: 'bg-rose-500/20 text-rose-200 border-rose-400/45',
    weight: 0,
  },
  high: {
    label: 'Alta',
    cls: 'bg-amber-500/20 text-amber-200 border-amber-400/45',
    weight: 1,
  },
  normal: {
    label: 'Normal',
    cls: 'bg-[#2676ff]/20 text-blue-200 border-[#2676ff]/45',
    weight: 2,
  },
  low: {
    label: 'Baixa',
    cls: 'bg-slate-500/20 text-slate-300 border-slate-400/35',
    weight: 3,
  },
};

const TASK_TYPE_META: Record<string, { label: string; cls: string }> = {
  follow_up: {
    label: 'Follow-up',
    cls: 'bg-blue-500/15 text-blue-200 border-blue-400/30',
  },
  contato: {
    label: 'Contato',
    cls: 'bg-cyan-500/15 text-cyan-200 border-cyan-400/30',
  },
  reuniao: {
    label: 'Reunião',
    cls: 'bg-indigo-500/15 text-indigo-200 border-indigo-400/30',
  },
  aprovacao_esperada: {
    label: 'Aprovação esperada',
    cls: 'bg-amber-500/15 text-amber-200 border-amber-400/30',
  },
  vencimento: {
    label: 'Vencimento',
    cls: 'bg-rose-500/15 text-rose-200 border-rose-400/30',
  },
  entrega: {
    label: 'Entrega',
    cls: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
  },
  implantacao: {
    label: 'Implantação',
    cls: 'bg-violet-500/15 text-violet-200 border-violet-400/30',
  },
};

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function toDateTimeLocalValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function isTaskOpen(t: TaskApiItem): boolean {
  return t.status !== 'completed' && t.status !== 'canceled';
}

function isTaskOverdue(t: TaskApiItem, nowMs: number): boolean {
  if (!isTaskOpen(t) || !t.due_at) return false;
  const dueMs = new Date(t.due_at).getTime();
  return !Number.isNaN(dueMs) && dueMs < nowMs;
}

function isTaskDueToday(t: TaskApiItem, todayKey: string): boolean {
  if (!isTaskOpen(t) || !t.due_at) return false;
  const dt = new Date(t.due_at);
  if (Number.isNaN(dt.getTime())) return false;
  return toDateKey(dt) === todayKey;
}

function taskStatusPillProps(status: string): { value: string; customLabel?: string } {
  switch (status) {
    case 'pending':
      return { value: 'pending', customLabel: 'Pendente' };
    case 'in_progress':
      return { value: 'in_progress', customLabel: 'Em andamento' };
    case 'completed':
      return { value: 'approved', customLabel: 'Concluída' };
    case 'canceled':
      return { value: 'canceled', customLabel: 'Cancelada' };
    default:
      return { value: status };
  }
}

export function TasksTab({
  me,
  initialAction,
  onNavigate,
}: {
  me: PortalMeResponse;
  initialAction?: string | null;
  onNavigate?: (tab: ModuleTabId, opts?: { action?: string; entityId?: string }) => void;
}) {
  const canWriteTasks = me.activeRole.permissions.includes('tasks:write');

  const [tasks, setTasks] = useState<TaskApiItem[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [members, setMembers] = useState<UnitMember[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Filters
  const [bucket, setBucket] = useState<BucketFilter>('abertas');
  const [priorityFilter, setPriorityFilter] = useState<string>('todas');
  const [typeFilter, setTypeFilter] = useState<string>('todos');
  const [search, setSearch] = useState('');

  // Row-level busy / confirm delete
  const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Modal Create / Edit state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskApiItem | null>(null);
  const [savingModal, setSavingModal] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formTaskType, setFormTaskType] = useState<TaskType>('follow_up');
  const [formPriority, setFormPriority] = useState<TaskPriority>('normal');
  const [formDueAt, setFormDueAt] = useState('');
  const [formAssignedTo, setFormAssignedTo] = useState(me.user.id);
  const [formStatus, setFormStatus] = useState<TaskStatus>('pending');
  const [formCustomerId, setFormCustomerId] = useState('');
  const [formOrderId, setFormOrderId] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [tasksRes, custRes, ordRes, memRes] = await Promise.all([
        portalFetch<{ items: TaskApiItem[] }>('/crm/tasks'),
        portalFetch<{ items: CustomerOption[] }>('/crm/customers?limit=100').catch(() => ({
          items: [],
        })),
        portalFetch<{ items: OrderOption[] }>('/orders').catch(() => ({ items: [] })),
        portalFetch<{ members: UnitMember[] }>('/auth/unit-members').catch(() => ({
          members: [],
        })),
      ]);
      setTasks(tasksRes.items || []);
      setCustomers(custRes.items || []);
      setOrders(ordRes.items || []);
      setMembers(memRes.members || []);
    } catch (err) {
      setError(
        err instanceof PortalApiError ? err.message : 'Erro ao carregar tarefas da unidade.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll, me.activeUnit.id]);

  const openCreateModal = useCallback(() => {
    const defaultDue = new Date(Date.now() + 2 * 60 * 60 * 1000);
    defaultDue.setMinutes(0, 0, 0);

    setEditingTask(null);
    setModalError(null);
    setFormTitle('');
    setFormDescription('');
    setFormTaskType('follow_up');
    setFormPriority('normal');
    setFormDueAt(toDateTimeLocalValue(defaultDue));
    setFormAssignedTo(me.user.id);
    setFormStatus('pending');
    setFormCustomerId('');
    setFormOrderId('');
    setModalOpen(true);
  }, [me.user.id]);

  const openEditModal = useCallback(
    (task: TaskApiItem) => {
      const dt = task.due_at ? new Date(task.due_at) : new Date();
      const safeDt = Number.isNaN(dt.getTime()) ? new Date() : dt;

      setEditingTask(task);
      setModalError(null);
      setFormTitle(task.title || '');
      setFormDescription(task.description || '');
      setFormTaskType((task.task_type || 'follow_up') as TaskType);
      setFormPriority((task.priority || 'normal') as TaskPriority);
      setFormDueAt(toDateTimeLocalValue(safeDt));
      setFormAssignedTo(task.assigned_to || me.user.id);
      setFormStatus((task.status || 'pending') as TaskStatus);
      setFormCustomerId(task.customer_id || '');
      setFormOrderId(task.order_id || '');
      setModalOpen(true);
    },
    [me.user.id]
  );

  useEffect(() => {
    if (initialAction === 'new-task' && canWriteTasks) {
      openCreateModal();
    }
  }, [initialAction, canWriteTasks, openCreateModal]);

  const handleOrderSelect = (nextOrderId: string) => {
    setFormOrderId(nextOrderId);
    if (nextOrderId && !formCustomerId) {
      const matched = orders.find((o) => o.id === nextOrderId);
      if (matched?.customer_id) {
        setFormCustomerId(matched.customer_id);
      }
    }
  };

  const handleToggleComplete = async (task: TaskApiItem) => {
    if (!canWriteTasks) return;
    const isCompleted = task.status === 'completed';
    const nextStatus: TaskStatus = isCompleted ? 'pending' : 'completed';

    setBusyTaskId(task.id);
    setError(null);
    try {
      await portalFetch(`/crm/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setFeedback(
        nextStatus === 'completed'
          ? `Tarefa "${task.title}" concluída.`
          : `Tarefa "${task.title}" reaberta.`
      );
      await loadAll();
    } catch (err) {
      setError(
        err instanceof PortalApiError
          ? err.message
          : 'Não foi possível atualizar o status da tarefa.'
      );
    } finally {
      setBusyTaskId(null);
    }
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteTasks) return;
    if (formTitle.trim().length < 2) {
      setModalError('Informe um título com pelo menos 2 caracteres.');
      return;
    }
    const dueDt = new Date(formDueAt);
    if (!formDueAt || Number.isNaN(dueDt.getTime())) {
      setModalError('Informe uma data/hora válida para o vencimento.');
      return;
    }

    setSavingModal(true);
    setModalError(null);
    try {
      const dueIso = dueDt.toISOString();

      if (editingTask) {
        await portalFetch(`/crm/tasks/${editingTask.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: formTitle.trim(),
            description: formDescription.trim() || null,
            taskType: formTaskType,
            priority: formPriority,
            dueAt: dueIso,
            assignedTo: formAssignedTo || null,
            status: formStatus,
            customerId: formCustomerId || null,
            orderId: formOrderId || null,
          }),
        });
        setFeedback('Tarefa atualizada com sucesso.');
      } else {
        await portalFetch('/crm/tasks', {
          method: 'POST',
          body: JSON.stringify({
            taskType: formTaskType,
            title: formTitle.trim(),
            description: formDescription.trim() || null,
            priority: formPriority,
            dueAt: dueIso,
            assignedTo: formAssignedTo || me.user.id,
            customerId: formCustomerId || null,
            orderId: formOrderId || null,
          }),
        });
        setFeedback('Nova tarefa criada na rotina da unidade.');
      }

      setModalOpen(false);
      await loadAll();
    } catch (err) {
      setModalError(
        err instanceof PortalApiError ? err.message : 'Erro ao salvar tarefa.'
      );
    } finally {
      setSavingModal(false);
    }
  };

  const handleDeleteTask = async (id: string) => {
    if (!canWriteTasks) return;
    setBusyTaskId(id);
    setError(null);
    try {
      await portalFetch(`/crm/tasks/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      setFeedback('Tarefa excluída.');
      await loadAll();
    } catch (err) {
      setError(
        err instanceof PortalApiError ? err.message : 'Erro ao excluir tarefa.'
      );
    } finally {
      setBusyTaskId(null);
    }
  };

  // KPI Counters computed from all unit tasks
  const nowMs = Date.now();
  const todayKey = toDateKey(new Date());

  const counts = useMemo(() => {
    let hoje = 0;
    let atrasadas = 0;
    let abertas = 0;
    let concluidas = 0;

    for (const t of tasks) {
      if (t.status === 'completed') {
        concluidas++;
      } else if (isTaskOpen(t)) {
        abertas++;
        if (isTaskDueToday(t, todayKey)) hoje++;
        if (isTaskOverdue(t, nowMs)) atrasadas++;
      }
    }

    return {
      hoje,
      atrasadas,
      abertas,
      concluidas,
      todas: tasks.length,
    };
  }, [tasks, todayKey, nowMs]);

  const filteredTasks = useMemo(() => {
    const term = search.trim().toLowerCase();

    return tasks
      .filter((t) => {
        if (bucket === 'hoje' && !isTaskDueToday(t, todayKey)) return false;
        if (bucket === 'atrasadas' && !isTaskOverdue(t, nowMs)) return false;
        if (bucket === 'abertas' && !isTaskOpen(t)) return false;
        if (bucket === 'concluidas' && t.status !== 'completed') return false;

        if (priorityFilter !== 'todas' && t.priority !== priorityFilter) return false;
        if (typeFilter !== 'todos' && t.task_type !== typeFilter) return false;

        if (term) {
          const haystack = [
            t.title,
            t.description,
            t.customer_name,
            t.order_number,
            t.assigned_name,
          ]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(term)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aDone = a.status === 'completed' || a.status === 'canceled' ? 1 : 0;
        const bDone = b.status === 'completed' || b.status === 'canceled' ? 1 : 0;
        if (aDone !== bDone) return aDone - bDone;

        const aTime = new Date(a.due_at).getTime();
        const bTime = new Date(b.due_at).getTime();
        if (!Number.isNaN(aTime) && !Number.isNaN(bTime) && aTime !== bTime) {
          return aTime - bTime;
        }

        const aWeight = PRIORITY_META[a.priority]?.weight ?? 9;
        const bWeight = PRIORITY_META[b.priority]?.weight ?? 9;
        return aWeight - bWeight;
      });
  }, [tasks, bucket, priorityFilter, typeFilter, search, todayKey, nowMs]);

  const kpiCards: Array<{
    key: BucketFilter;
    label: string;
    value: number;
    hint: string;
    tone: string;
    activeBorder: string;
    icon: typeof Clock;
  }> = [
    {
      key: 'hoje',
      label: 'Para Hoje',
      value: counts.hoje,
      hint: 'Prazo para a data de hoje',
      tone: 'text-[#7fb2ff]',
      activeBorder: 'border-[#2676ff]/75 bg-[#2676ff]/12 shadow-[0_0_24px_rgba(38,118,255,0.22)]',
      icon: CalendarClock,
    },
    {
      key: 'atrasadas',
      label: 'Atrasadas',
      value: counts.atrasadas,
      hint: 'Passaram do horário previsto',
      tone: counts.atrasadas > 0 ? 'text-rose-300' : 'text-wise-ink',
      activeBorder: 'border-rose-400/70 bg-rose-500/12 shadow-[0_0_24px_rgba(244,63,94,0.2)]',
      icon: AlertTriangle,
    },
    {
      key: 'abertas',
      label: 'Em aberto',
      value: counts.abertas,
      hint: 'Pendentes ou em andamento',
      tone: 'text-amber-200',
      activeBorder: 'border-amber-400/65 bg-amber-500/10',
      icon: Clock,
    },
    {
      key: 'concluidas',
      label: 'Concluídas',
      value: counts.concluidas,
      hint: 'Finalizadas pela equipe',
      tone: 'text-emerald-300',
      activeBorder: 'border-emerald-400/65 bg-emerald-500/10',
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="space-y-5">
      {/* Top Header */}
      <section className="apple-glass rounded-3xl p-5 sm:p-6 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-wise-mute">
              Gestão Diária da Operação · {me.activeUnit.name}
            </p>
            <h1 className="text-xl sm:text-2xl font-bold text-wise-ink tracking-tight flex items-center gap-2.5">
              <ListTodo className="w-6 h-6 text-[#2676ff]" />
              Tarefas Diárias
            </h1>
            <p className="text-xs text-wise-body">
              Acompanhe follow-ups comerciais, aprovações de arte/grade, cobranças e entregas da unidade.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canWriteTasks ? (
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full apple-glass-cta text-white text-xs font-semibold transition-all"
              >
                <Plus className="w-4 h-4" />
                Nova tarefa
              </button>
            ) : null}
            <button
              type="button"
              onClick={loadAll}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-white/8 hover:bg-white/14 border border-white/14 text-xs font-semibold text-wise-body hover:text-white transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              Atualizar
            </button>
          </div>
        </div>

        {/* Summary KPI Counters (clickable to filter) */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {kpiCards.map((kpi) => {
            const Icon = kpi.icon;
            const isSelected = bucket === kpi.key;
            return (
              <button
                key={kpi.key}
                type="button"
                onClick={() => setBucket(kpi.key)}
                className={`text-left rounded-2xl p-4 border transition-all space-y-1.5 ${
                  isSelected
                    ? kpi.activeBorder
                    : 'apple-glass-subtle border-white/12 hover:border-white/25'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-wise-mute">
                    {kpi.label}
                  </span>
                  <Icon className={`w-4 h-4 ${kpi.tone}`} />
                </div>
                <p className={`text-2xl font-bold ${kpi.tone}`}>{kpi.value}</p>
                <p className="text-[11px] text-wise-mute">{kpi.hint}</p>
              </button>
            );
          })}
        </div>
      </section>

      {/* Controls Bar */}
      <section className="apple-glass-subtle rounded-3xl p-4 space-y-3 border border-white/12">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
          {/* Bucket Filter Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'hoje', label: 'Hoje', count: counts.hoje },
                { id: 'atrasadas', label: 'Atrasadas', count: counts.atrasadas },
                { id: 'abertas', label: 'Em aberto', count: counts.abertas },
                { id: 'concluidas', label: 'Concluídas', count: counts.concluidas },
                { id: 'todas', label: 'Todas', count: counts.todas },
              ] as const
            ).map((tab) => {
              const active = bucket === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setBucket(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    active
                      ? 'bg-[#2676ff] border-[#2676ff] text-white shadow-[0_0_14px_rgba(38,118,255,0.4)]'
                      : 'bg-white/6 border-white/10 text-wise-body hover:text-white hover:bg-white/12'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                      active ? 'bg-white/20 text-white' : 'bg-white/10 text-wise-mute'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Priority, Type & Search */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              aria-label="Filtrar por prioridade"
              className="apple-glass-well rounded-full px-3.5 py-2 text-xs font-semibold text-wise-ink outline-none focus:border-[#2676ff]"
            >
              <option value="todas" className="bg-[#141418]">
                Prioridade: Todas
              </option>
              <option value="urgent" className="bg-[#141418]">
                Urgente
              </option>
              <option value="high" className="bg-[#141418]">
                Alta
              </option>
              <option value="normal" className="bg-[#141418]">
                Normal
              </option>
              <option value="low" className="bg-[#141418]">
                Baixa
              </option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              aria-label="Filtrar por tipo de tarefa"
              className="apple-glass-well rounded-full px-3.5 py-2 text-xs font-semibold text-wise-ink outline-none focus:border-[#2676ff]"
            >
              <option value="todos" className="bg-[#141418]">
                Tipo: Todos
              </option>
              <option value="follow_up" className="bg-[#141418]">
                Follow-up
              </option>
              <option value="contato" className="bg-[#141418]">
                Contato
              </option>
              <option value="reuniao" className="bg-[#141418]">
                Reunião
              </option>
              <option value="aprovacao_esperada" className="bg-[#141418]">
                Aprovação esperada
              </option>
              <option value="vencimento" className="bg-[#141418]">
                Vencimento
              </option>
              <option value="entrega" className="bg-[#141418]">
                Entrega
              </option>
              <option value="implantacao" className="bg-[#141418]">
                Implantação
              </option>
            </select>

            <div className="relative flex-1 sm:flex-initial min-w-[200px]">
              <Search className="w-3.5 h-3.5 text-wise-mute absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar tarefa, cliente, pedido..."
                aria-label="Buscar tarefas"
                className="w-full sm:w-56 apple-glass-well rounded-full pl-8 pr-7 py-2 text-xs text-wise-ink placeholder:text-wise-mute outline-none focus:border-[#2676ff]"
              />
              {search ? (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Limpar busca"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-wise-mute hover:text-white"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {feedback ? (
        <div className="apple-glass-subtle rounded-2xl px-4 py-3 border border-emerald-400/35 bg-emerald-500/10 text-xs text-emerald-100 flex items-center justify-between gap-2">
          <span>{feedback}</span>
          <div className="flex items-center gap-3 shrink-0">
            {bucket === 'abertas' && counts.concluidas > 0 ? (
              <button
                type="button"
                onClick={() => setBucket('concluidas')}
                className="font-semibold underline text-emerald-200 hover:text-white"
              >
                Ver concluídas
              </button>
            ) : null}
            <button type="button" onClick={() => setFeedback(null)} className="underline">
              Fechar
            </button>
          </div>
        </div>
      ) : null}

      {error ? <ErrorBanner message={error} onRetry={loadAll} /> : null}

      {loading && tasks.length === 0 ? (
        <LoadingCard message="Carregando tarefas diárias da unidade..." />
      ) : filteredTasks.length === 0 ? (
        <EmptyStateCard
          title="Nenhuma tarefa encontrada neste filtro"
          description={
            bucket === 'atrasadas'
              ? 'Parabéns! Não há nenhuma tarefa atrasada no momento.'
              : bucket === 'hoje'
                ? 'Nenhuma tarefa aberta com prazo para hoje.'
                : 'Crie uma nova tarefa ou ajuste os filtros acima para visualizar outros itens.'
          }
          action={
            <div className="flex flex-wrap items-center justify-center gap-2">
              {bucket !== 'todas' ? (
                <button
                  type="button"
                  onClick={() => {
                    setBucket('todas');
                    setPriorityFilter('todas');
                    setTypeFilter('todos');
                    setSearch('');
                  }}
                  className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/16 border border-white/15 text-xs font-semibold text-white"
                >
                  Ver todas ({counts.todas})
                </button>
              ) : null}
              {canWriteTasks ? (
                <button
                  type="button"
                  onClick={openCreateModal}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Nova tarefa
                </button>
              ) : null}
            </div>
          }
        />
      ) : (
        <section className="space-y-3">
          {filteredTasks.map((task) => {
            const isCompleted = task.status === 'completed';
            const isCanceled = task.status === 'canceled';
            const overdue = isTaskOverdue(task, nowMs);
            const prioMeta = PRIORITY_META[task.priority] || PRIORITY_META.normal;
            const typeMeta = TASK_TYPE_META[task.task_type] || {
              label: task.task_type.replace(/_/g, ' '),
              cls: 'bg-white/10 text-wise-body border-white/15',
            };
            const statusPill = taskStatusPillProps(task.status);
            const isBusy = busyTaskId === task.id;

            return (
              <article
                key={task.id}
                className={`apple-glass rounded-2xl p-4 sm:p-5 transition-all border ${
                  overdue
                    ? 'border-rose-400/45 bg-rose-500/[0.04]'
                    : isCompleted
                      ? 'border-white/10 opacity-80'
                      : 'border-white/14 hover:border-[#2676ff]/45'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                  {/* Left: Checkbox + Content */}
                  <div className="flex items-start gap-3.5 min-w-0 flex-1">
                    <button
                      type="button"
                      disabled={!canWriteTasks || isBusy}
                      onClick={() => handleToggleComplete(task)}
                      aria-label={
                        isCompleted
                          ? `Reabrir tarefa ${task.title}`
                          : `Concluir tarefa ${task.title}`
                      }
                      title={
                        !canWriteTasks
                          ? 'Sem permissão para alterar tarefas'
                          : isCompleted
                            ? 'Clique para reabrir tarefa'
                            : 'Clique para concluir tarefa'
                      }
                      className={`mt-0.5 w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
                        isCompleted
                          ? 'bg-emerald-500/25 border-emerald-400 text-emerald-200 hover:bg-emerald-500/35'
                          : 'border-white/30 text-transparent hover:border-[#2676ff] hover:bg-[#2676ff]/20 hover:text-blue-200'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                      <Check className="w-3.5 h-3.5 stroke-[3]" />
                    </button>

                    <div className="space-y-2 min-w-0 flex-1">
                      {/* Badges row */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${prioMeta.cls}`}
                        >
                          {prioMeta.label}
                        </span>
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${typeMeta.cls}`}
                        >
                          {typeMeta.label}
                        </span>
                        {overdue ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold border bg-rose-500/25 text-rose-100 border-rose-400/50">
                            <AlertTriangle className="w-3 h-3" />
                            Atrasada
                          </span>
                        ) : null}
                        <StatusPill
                          value={statusPill.value}
                          customLabel={statusPill.customLabel}
                        />
                      </div>

                      {/* Title & Description */}
                      <div className="space-y-1">
                        <h2
                          className={`text-sm sm:text-base font-bold leading-snug ${
                            isCompleted || isCanceled
                              ? 'line-through text-wise-mute'
                              : 'text-wise-ink'
                          }`}
                        >
                          {task.title}
                        </h2>
                        {task.description ? (
                          <p className="text-xs text-wise-body leading-relaxed whitespace-pre-line">
                            {task.description}
                          </p>
                        ) : null}
                      </div>

                      {/* Metadata row */}
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-wise-body pt-0.5">
                        <span
                          className={`inline-flex items-center gap-1.5 font-semibold ${
                            overdue ? 'text-rose-300' : 'text-wise-ink'
                          }`}
                        >
                          <Clock className="w-3.5 h-3.5 text-[#2676ff]" />
                          {formatDateBr(task.due_at, { withTime: true })}
                        </span>

                        {task.customer_name ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-wise-mute" />
                            {onNavigate ? (
                              <button
                                type="button"
                                onClick={() =>
                                  onNavigate('crm', {
                                    entityId: task.customer_id || undefined,
                                  })
                                }
                                className="hover:text-white underline decoration-white/25"
                              >
                                {task.customer_name}
                              </button>
                            ) : (
                              <span>{task.customer_name}</span>
                            )}
                          </span>
                        ) : null}

                        {task.order_number ? (
                          <span className="inline-flex items-center gap-1.5">
                            <ShoppingBag className="w-3.5 h-3.5 text-wise-mute" />
                            {onNavigate && task.order_id ? (
                              <button
                                type="button"
                                onClick={() =>
                                  onNavigate('orders', {
                                    entityId: task.order_id || undefined,
                                  })
                                }
                                className="font-semibold text-[#7fb2ff] hover:text-white underline"
                              >
                                Pedido {task.order_number}
                              </button>
                            ) : (
                              <span className="font-semibold">Pedido {task.order_number}</span>
                            )}
                          </span>
                        ) : null}

                        <span className="inline-flex items-center gap-1.5 text-wise-mute">
                          <User className="w-3.5 h-3.5" />
                          Resp.:{' '}
                          <span className="text-wise-body">
                            {task.assigned_name || me.user.fullName}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  {canWriteTasks ? (
                    <div className="flex flex-wrap items-center gap-2 shrink-0 md:pt-1">
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => handleToggleComplete(task)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors disabled:opacity-50 ${
                          isCompleted
                            ? 'bg-white/8 hover:bg-white/15 border-white/15 text-wise-ink'
                            : 'bg-emerald-500/20 hover:bg-emerald-500/30 border-emerald-400/40 text-emerald-100'
                        }`}
                      >
                        {isCompleted ? (
                          <>
                            <RotateCcw className="w-3.5 h-3.5" />
                            Reabrir
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Concluir
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => openEditModal(task)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/15 border border-white/12 text-xs font-semibold text-wise-ink disabled:opacity-50"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Editar
                      </button>

                      {confirmDeleteId === task.id ? (
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => handleDeleteTask(task.id)}
                            className="px-3 py-1.5 rounded-full bg-rose-500/30 hover:bg-rose-500/45 border border-rose-400/50 text-xs font-bold text-rose-100 disabled:opacity-50"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-1.5 rounded-full bg-white/8 text-xs text-wise-mute"
                          >
                            Não
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setConfirmDeleteId(task.id)}
                          aria-label={`Excluir tarefa ${task.title}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/6 hover:bg-rose-500/20 border border-white/12 hover:border-rose-400/40 text-xs font-semibold text-wise-body hover:text-rose-100 disabled:opacity-50"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Excluir
                        </button>
                      )}
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>
      )}

      {/* Modal Create / Edit Task */}
      <GlassModal
        open={modalOpen}
        title={editingTask ? 'Editar tarefa' : 'Nova tarefa operacional'}
        subtitle={
          editingTask
            ? `Atualize prazo, prioridade, status ou vínculos da tarefa.`
            : 'Cadastre uma tarefa diária vinculada opcionalmente a cliente, pedido e membro da unidade.'
        }
        onClose={() => setModalOpen(false)}
        maxWidthClass="max-w-2xl"
      >
        <form onSubmit={handleSaveTask} className="space-y-4">
          {modalError ? <ErrorBanner message={modalError} /> : null}

          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">
              Título da tarefa *
            </label>
            <input
              type="text"
              required
              minLength={2}
              value={formTitle}
              onChange={(e) => setFormTitle(e.target.value)}
              placeholder="Ex: Confirmar grade de numeração com a Escolinha Alpha"
              className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none focus:border-[#2676ff]"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Tipo</label>
              <select
                value={formTaskType}
                onChange={(e) => setFormTaskType(e.target.value as TaskType)}
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none focus:border-[#2676ff]"
              >
                <option value="follow_up" className="bg-[#141418]">
                  Follow-up
                </option>
                <option value="contato" className="bg-[#141418]">
                  Contato
                </option>
                <option value="reuniao" className="bg-[#141418]">
                  Reunião
                </option>
                <option value="aprovacao_esperada" className="bg-[#141418]">
                  Aprovação esperada
                </option>
                <option value="vencimento" className="bg-[#141418]">
                  Vencimento
                </option>
                <option value="entrega" className="bg-[#141418]">
                  Entrega
                </option>
                <option value="implantacao" className="bg-[#141418]">
                  Implantação
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Prioridade</label>
              <select
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value as TaskPriority)}
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none focus:border-[#2676ff]"
              >
                <option value="urgent" className="bg-[#141418]">
                  Urgente
                </option>
                <option value="high" className="bg-[#141418]">
                  Alta
                </option>
                <option value="normal" className="bg-[#141418]">
                  Normal
                </option>
                <option value="low" className="bg-[#141418]">
                  Baixa
                </option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">
                Prazo (data e hora) *
              </label>
              <input
                type="datetime-local"
                required
                value={formDueAt}
                onChange={(e) => setFormDueAt(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none focus:border-[#2676ff]"
              />
            </div>
          </div>

          <div
            className={`grid grid-cols-1 ${
              editingTask ? 'sm:grid-cols-2' : ''
            } gap-3`}
          >
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Responsável</label>
              <select
                value={formAssignedTo}
                onChange={(e) => setFormAssignedTo(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none focus:border-[#2676ff]"
              >
                {members.length === 0 ? (
                  <option value={me.user.id} className="bg-[#141418]">
                    {me.user.fullName}
                  </option>
                ) : (
                  members.map((m) => (
                    <option key={m.user_id} value={m.user_id} className="bg-[#141418]">
                      {m.full_name}
                      {m.role_name ? ` (${m.role_name})` : ''}
                    </option>
                  ))
                )}
              </select>
            </div>

            {editingTask ? (
              <div>
                <label className="block text-xs font-semibold text-wise-ink mb-1">Status</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as TaskStatus)}
                  className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none focus:border-[#2676ff]"
                >
                  <option value="pending" className="bg-[#141418]">
                    Pendente
                  </option>
                  <option value="in_progress" className="bg-[#141418]">
                    Em andamento
                  </option>
                  <option value="completed" className="bg-[#141418]">
                    Concluída
                  </option>
                  <option value="canceled" className="bg-[#141418]">
                    Cancelada
                  </option>
                </select>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">
                Cliente vinculado (opcional)
              </label>
              <select
                value={formCustomerId}
                onChange={(e) => setFormCustomerId(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none focus:border-[#2676ff]"
              >
                <option value="" className="bg-[#141418]">
                  Nenhum cliente vinculado
                </option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#141418]">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">
                Pedido vinculado (opcional)
              </label>
              <select
                value={formOrderId}
                onChange={(e) => handleOrderSelect(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none focus:border-[#2676ff]"
              >
                <option value="" className="bg-[#141418]">
                  Nenhum pedido vinculado
                </option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id} className="bg-[#141418]">
                    {o.order_number}
                    {o.customer_name ? ` · ${o.customer_name}` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">
              Descrição / Observações
            </label>
            <textarea
              rows={3}
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
              placeholder="Detalhes do contato, pendências ou próximos passos..."
              className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none focus:border-[#2676ff]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-full bg-white/8 hover:bg-white/14 text-xs font-semibold text-wise-body"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingModal}
              className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white disabled:opacity-50"
            >
              {savingModal
                ? 'Salvando...'
                : editingTask
                  ? 'Salvar alterações'
                  : 'Criar tarefa'}
            </button>
          </div>
        </form>
      </GlassModal>
    </div>
  );
}
