'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Link2,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShoppingBag,
  Tag,
  Trash2,
  Truck,
  User,
  Users,
  Video,
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

export type ScheduleEventType = 'entrega' | 'reuniao' | 'follow_up' | 'outro';
export type ScheduleEventStatus = 'scheduled' | 'confirmed' | 'completed' | 'canceled';
export type ScheduleColorTag = 'blue' | 'cyan' | 'emerald' | 'amber' | 'slate';

export interface ScheduleEventApi {
  id: string;
  unit_id?: string;
  event_type: ScheduleEventType | string;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string | null;
  all_day: boolean;
  location: string | null;
  meeting_url: string | null;
  customer_id: string | null;
  customer_name?: string | null;
  order_id: string | null;
  order_number?: string | null;
  assigned_to: string | null;
  assigned_name?: string | null;
  status: ScheduleEventStatus | string;
  color_tag?: ScheduleColorTag | string | null;
  created_at?: string;
  updated_at?: string;
}

interface CustomerOption {
  id: string;
  name: string;
  city?: string | null;
  state?: string | null;
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

type CalendarViewMode = 'month' | 'week' | 'day';
type TypeFilter = 'todos' | 'entrega' | 'reuniao' | 'outros';

const WEEKDAY_LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'] as const;
const HOURS_SLOTS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as const;
const WEEK_ROW_HEIGHT = 56;
const DAY_ROW_HEIGHT = 68;
const GRID_START_MIN = 8 * 60;
const GRID_END_MIN = 21 * 60;

const EVENT_TYPE_META: Record<
  string,
  {
    label: string;
    shortLabel: string;
    defaultColor: ScheduleColorTag;
  }
> = {
  entrega: {
    label: 'Entrega de Pedido',
    shortLabel: 'Entrega',
    defaultColor: 'emerald',
  },
  reuniao: {
    label: 'Reunião Comercial / Alinhamento',
    shortLabel: 'Reunião',
    defaultColor: 'blue',
  },
  follow_up: {
    label: 'Follow-up',
    shortLabel: 'Follow-up',
    defaultColor: 'amber',
  },
  outro: {
    label: 'Outro',
    shortLabel: 'Outro',
    defaultColor: 'slate',
  },
};

const COLOR_STYLES: Record<
  ScheduleColorTag,
  {
    pill: string;
    card: string;
    dot: string;
    label: string;
    swatch: string;
  }
> = {
  emerald: {
    pill: 'bg-emerald-500/20 border-emerald-400/45 text-emerald-100 hover:bg-emerald-500/30',
    card: 'bg-gradient-to-br from-emerald-500/25 via-cyan-500/15 to-emerald-900/30 border-emerald-400/50 text-emerald-50',
    dot: 'bg-emerald-400',
    label: 'Esmeralda (Entregas)',
    swatch: 'bg-emerald-400',
  },
  cyan: {
    pill: 'bg-cyan-500/20 border-cyan-400/45 text-cyan-100 hover:bg-cyan-500/30',
    card: 'bg-gradient-to-br from-cyan-500/25 via-sky-500/15 to-cyan-950/35 border-cyan-400/50 text-cyan-50',
    dot: 'bg-cyan-400',
    label: 'Ciano',
    swatch: 'bg-cyan-400',
  },
  blue: {
    pill: 'bg-[#2676ff]/25 border-[#2676ff]/55 text-blue-100 hover:bg-[#2676ff]/35',
    card: 'bg-gradient-to-br from-[#2676ff]/30 via-blue-600/20 to-blue-950/40 border-[#2676ff]/60 text-blue-50',
    dot: 'bg-[#2676ff]',
    label: 'Azul Royal (Reuniões)',
    swatch: 'bg-[#2676ff]',
  },
  amber: {
    pill: 'bg-amber-500/20 border-amber-400/45 text-amber-100 hover:bg-amber-500/30',
    card: 'bg-gradient-to-br from-amber-500/25 via-orange-500/15 to-amber-950/35 border-amber-400/50 text-amber-50',
    dot: 'bg-amber-400',
    label: 'Âmbar (Follow-up)',
    swatch: 'bg-amber-400',
  },
  slate: {
    pill: 'bg-slate-500/25 border-slate-400/40 text-slate-200 hover:bg-slate-500/35',
    card: 'bg-gradient-to-br from-slate-500/25 via-slate-600/15 to-slate-900/40 border-slate-400/45 text-slate-100',
    dot: 'bg-slate-400',
    label: 'Grafite / Slate',
    swatch: 'bg-slate-400',
  },
};

function resolveColorKey(ev: Pick<ScheduleEventApi, 'event_type' | 'color_tag'>): ScheduleColorTag {
  const tag = ev.color_tag;
  if (tag === 'blue' || tag === 'cyan' || tag === 'emerald' || tag === 'amber' || tag === 'slate') {
    return tag;
  }
  return EVENT_TYPE_META[ev.event_type]?.defaultColor || 'slate';
}

function getEventIcon(eventType: string, className = 'w-3.5 h-3.5 shrink-0') {
  if (eventType === 'entrega') return <Truck className={className} />;
  if (eventType === 'reuniao') return <Video className={className} />;
  if (eventType === 'follow_up') return <Clock className={className} />;
  return <Tag className={className} />;
}

function toDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function addDays(date: Date, delta: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta, 0, 0, 0, 0);
  return next;
}

function getMondayOfWeek(date: Date): Date {
  const day = date.getDay();
  const diff = (day + 6) % 7; // Mon = 0, Sun = 6
  return addDays(date, -diff);
}

function parseEventDate(value: string | null | undefined, allDay = false): Date | null {
  if (!value) return null;
  if (
    allDay &&
    (/^\d{4}-\d{2}-\d{2}$/.test(value) ||
      value.endsWith('T00:00:00.000Z') ||
      value.endsWith('T00:00:00Z'))
  ) {
    const [y, m, d] = value.slice(0, 10).split('-').map(Number);
    return new Date(y, m - 1, d, 9, 0, 0, 0);
  }
  const normalized = value.length === 10 ? `${value}T09:00:00` : value;
  const dt = new Date(normalized);
  return Number.isNaN(dt.getTime()) ? null : dt;
}

function toDateTimeLocalValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function formatTimeShort(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function sanitizeExternalUrl(url: string | null | undefined): string | null {
  if (!url || !url.trim()) return null;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(trimmed)) return `https://${trimmed}`;
  return null;
}

function capitalizePt(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function statusPillProps(status: string): { value: string; customLabel?: string } {
  switch (status) {
    case 'scheduled':
      return { value: 'open', customLabel: 'Agendado' };
    case 'confirmed':
      return { value: 'confirmed', customLabel: 'Confirmado' };
    case 'completed':
      return { value: 'approved', customLabel: 'Concluído' };
    case 'canceled':
      return { value: 'canceled', customLabel: 'Cancelado' };
    default:
      return { value: status };
  }
}

interface PositionedEvent {
  event: ScheduleEventApi;
  startMin: number;
  endMin: number;
  col: number;
  totalCols: number;
}

function layoutDayTimedEvents(dayEvents: ScheduleEventApi[], dayKey: string): {
  allDayOrOutside: ScheduleEventApi[];
  timed: PositionedEvent[];
} {
  const allDayOrOutside: ScheduleEventApi[] = [];
  const rawTimed: Array<{ event: ScheduleEventApi; startMin: number; endMin: number }> = [];

  for (const ev of dayEvents) {
    if (ev.all_day) {
      allDayOrOutside.push(ev);
      continue;
    }
    const startDt = parseEventDate(ev.start_at, false);
    if (!startDt) continue;
    const endDt = parseEventDate(ev.end_at, false) || new Date(startDt.getTime() + 60 * 60 * 1000);
    const startKey = toDateKey(startDt);
    const endKey = toDateKey(endDt);

    if (startKey !== dayKey || endKey !== dayKey) {
      allDayOrOutside.push(ev);
      continue;
    }

    const rawStartMin = startDt.getHours() * 60 + startDt.getMinutes();
    const rawEndMin = Math.max(rawStartMin + 30, endDt.getHours() * 60 + endDt.getMinutes());

    if (rawEndMin <= GRID_START_MIN || rawStartMin >= GRID_END_MIN) {
      allDayOrOutside.push(ev);
      continue;
    }

    const startMin = Math.max(GRID_START_MIN, rawStartMin);
    const endMin = Math.min(GRID_END_MIN, Math.max(startMin + 30, rawEndMin));
    rawTimed.push({ event: ev, startMin, endMin });
  }

  rawTimed.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  // Assign columns per overlapping cluster
  const positioned: PositionedEvent[] = [];
  let cluster: Array<{ event: ScheduleEventApi; startMin: number; endMin: number; col: number }> = [];
  let clusterMaxEnd = -1;

  const flushCluster = () => {
    if (cluster.length === 0) return;
    const totalCols = Math.max(...cluster.map((c) => c.col)) + 1;
    for (const item of cluster) {
      positioned.push({
        event: item.event,
        startMin: item.startMin,
        endMin: item.endMin,
        col: item.col,
        totalCols,
      });
    }
    cluster = [];
    clusterMaxEnd = -1;
  };

  let activeColEnds: number[] = [];
  for (const item of rawTimed) {
    if (cluster.length > 0 && item.startMin >= clusterMaxEnd) {
      flushCluster();
      activeColEnds = [];
    }
    let assignedCol = activeColEnds.findIndex((endMin) => endMin <= item.startMin);
    if (assignedCol === -1) {
      assignedCol = activeColEnds.length;
      activeColEnds.push(item.endMin);
    } else {
      activeColEnds[assignedCol] = item.endMin;
    }
    cluster.push({ ...item, col: assignedCol });
    clusterMaxEnd = Math.max(clusterMaxEnd, item.endMin);
  }
  flushCluster();

  return { allDayOrOutside, timed: positioned };
}

export function AgendaCalendarTab({
  me,
  initialAction,
  onNavigate,
}: {
  me: PortalMeResponse;
  initialAction?: string | null;
  onNavigate?: (tab: ModuleTabId, opts?: { action?: string; entityId?: string }) => void;
}) {
  const canWriteAgenda = me.activeRole.permissions.includes('agenda:write');

  const [events, setEvents] = useState<ScheduleEventApi[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [orders, setOrders] = useState<OrderOption[]>([]);
  const [members, setMembers] = useState<UnitMember[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const [viewMode, setViewMode] = useState<CalendarViewMode>('month');
  const [cursorDate, setCursorDate] = useState<Date>(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  });
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('todos');
  const [search, setSearch] = useState('');

  // Modal Create / Edit state
  const [modalOpen, setModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<ScheduleEventApi | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyEventId, setBusyEventId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Form fields
  const [formEventType, setFormEventType] = useState<ScheduleEventType>('reuniao');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formAllDay, setFormAllDay] = useState(false);
  const [formStartAt, setFormStartAt] = useState('');
  const [formEndAt, setFormEndAt] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formMeetingUrl, setFormMeetingUrl] = useState('');
  const [formCustomerId, setFormCustomerId] = useState('');
  const [formOrderId, setFormOrderId] = useState('');
  const [formAssignedTo, setFormAssignedTo] = useState(me.user.id);
  const [formStatus, setFormStatus] = useState<ScheduleEventStatus>('scheduled');
  const [formColorTag, setFormColorTag] = useState<ScheduleColorTag>('blue');
  const [colorManuallyPicked, setColorManuallyPicked] = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [schedRes, custRes, ordRes, memRes] = await Promise.all([
        portalFetch<{ items: ScheduleEventApi[] }>('/schedule'),
        portalFetch<{ items: CustomerOption[] }>('/crm/customers?limit=100').catch(() => ({
          items: [],
        })),
        portalFetch<{ items: OrderOption[] }>('/orders').catch(() => ({ items: [] })),
        portalFetch<{ members: UnitMember[] }>('/auth/unit-members').catch(() => ({
          members: [],
        })),
      ]);
      setEvents(schedRes.items || []);
      setCustomers(custRes.items || []);
      setOrders(ordRes.items || []);
      setMembers(memRes.members || []);
    } catch (err) {
      setError(
        err instanceof PortalApiError
          ? err.message
          : 'Erro ao carregar agenda de entregas e reuniões.'
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll, me.activeUnit.id]);

  const openCreateModal = useCallback(
    (dateOverride?: Date, hourOverride?: number) => {
      const base = dateOverride
        ? new Date(dateOverride.getFullYear(), dateOverride.getMonth(), dateOverride.getDate())
        : new Date(cursorDate.getFullYear(), cursorDate.getMonth(), cursorDate.getDate());
      const startHour = typeof hourOverride === 'number' ? hourOverride : 9;
      const startDt = new Date(base.getFullYear(), base.getMonth(), base.getDate(), startHour, 0, 0);
      const endDt = new Date(startDt.getTime() + 60 * 60 * 1000);

      setEditingEvent(null);
      setConfirmDeleteId(null);
      setModalError(null);
      setFormEventType('reuniao');
      setFormTitle('');
      setFormDescription('');
      setFormAllDay(false);
      setFormStartAt(toDateTimeLocalValue(startDt));
      setFormEndAt(toDateTimeLocalValue(endDt));
      setFormLocation('');
      setFormMeetingUrl('');
      setFormCustomerId('');
      setFormOrderId('');
      setFormAssignedTo(me.user.id);
      setFormStatus('scheduled');
      setFormColorTag('blue');
      setColorManuallyPicked(false);
      setModalOpen(true);
    },
    [cursorDate, me.user.id]
  );

  const openEditModal = useCallback(
    (ev: ScheduleEventApi) => {
      const startDt =
        parseEventDate(ev.start_at, ev.all_day) || new Date();
      const endDt =
        parseEventDate(ev.end_at, ev.all_day) ||
        new Date(startDt.getTime() + 60 * 60 * 1000);

      setEditingEvent(ev);
      setConfirmDeleteId(null);
      setModalError(null);
      setFormEventType(
        (ev.event_type === 'entrega' ||
        ev.event_type === 'reuniao' ||
        ev.event_type === 'follow_up' ||
        ev.event_type === 'outro'
          ? ev.event_type
          : 'outro') as ScheduleEventType
      );
      setFormTitle(ev.title || '');
      setFormDescription(ev.description || '');
      setFormAllDay(Boolean(ev.all_day));
      setFormStartAt(
        ev.all_day ? toDateKey(startDt) : toDateTimeLocalValue(startDt)
      );
      setFormEndAt(
        ev.all_day ? toDateKey(endDt) : toDateTimeLocalValue(endDt)
      );
      setFormLocation(ev.location || '');
      setFormMeetingUrl(ev.meeting_url || '');
      setFormCustomerId(ev.customer_id || '');
      setFormOrderId(ev.order_id || '');
      setFormAssignedTo(ev.assigned_to || me.user.id);
      setFormStatus(
        (ev.status === 'scheduled' ||
        ev.status === 'confirmed' ||
        ev.status === 'completed' ||
        ev.status === 'canceled'
          ? ev.status
          : 'scheduled') as ScheduleEventStatus
      );
      setFormColorTag(resolveColorKey(ev));
      setColorManuallyPicked(true);
      setModalOpen(true);
    },
    [me.user.id]
  );

  useEffect(() => {
    if (initialAction === 'new-event' && canWriteAgenda) {
      openCreateModal();
    }
  }, [initialAction, canWriteAgenda, openCreateModal]);

  const handleEventTypeChange = (nextType: ScheduleEventType) => {
    setFormEventType(nextType);
    if (!colorManuallyPicked && !editingEvent) {
      setFormColorTag(EVENT_TYPE_META[nextType]?.defaultColor || 'blue');
    }
  };

  const handleToggleAllDay = (checked: boolean) => {
    setFormAllDay(checked);
    if (checked) {
      setFormStartAt((prev) => (prev ? prev.slice(0, 10) : toDateKey(cursorDate)));
      setFormEndAt((prev) => (prev ? prev.slice(0, 10) : toDateKey(cursorDate)));
    } else {
      const startKey = (formStartAt || toDateKey(cursorDate)).slice(0, 10);
      const endKey = (formEndAt || startKey).slice(0, 10);
      setFormStartAt(`${startKey}T09:00`);
      setFormEndAt(`${endKey}T10:00`);
    }
  };

  const handleOrderSelect = (nextOrderId: string) => {
    setFormOrderId(nextOrderId);
    if (nextOrderId && !formCustomerId) {
      const matched = orders.find((o) => o.id === nextOrderId);
      if (matched?.customer_id) {
        setFormCustomerId(matched.customer_id);
      }
    }
  };

  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWriteAgenda) return;
    if (!formTitle.trim()) {
      setModalError('Informe um título para o evento.');
      return;
    }

    setSaving(true);
    setModalError(null);

    try {
      const startDt = formAllDay
        ? new Date(`${formStartAt.slice(0, 10)}T00:00:00`)
        : new Date(formStartAt);
      if (!formStartAt || Number.isNaN(startDt.getTime())) {
        setModalError('Informe uma data/hora inicial válida.');
        setSaving(false);
        return;
      }

      const endDt = formEndAt
        ? formAllDay
          ? new Date(`${formEndAt.slice(0, 10)}T23:59:59`)
          : new Date(formEndAt)
        : formAllDay
          ? new Date(`${formStartAt.slice(0, 10)}T23:59:59`)
          : new Date(startDt.getTime() + 60 * 60 * 1000);

      if (Number.isNaN(endDt.getTime())) {
        setModalError('Informe uma data/hora final válida.');
        setSaving(false);
        return;
      }

      if (endDt.getTime() < startDt.getTime()) {
        setModalError('A data/hora de término não pode ser anterior ao início.');
        setSaving(false);
        return;
      }

      const startIso = startDt.toISOString();
      const endIso = endDt.toISOString();

      const payload = {
        eventType: formEventType,
        title: formTitle.trim(),
        description: formDescription.trim() || null,
        startAt: startIso,
        endAt: endIso,
        allDay: formAllDay,
        location: formLocation.trim() || null,
        meetingUrl: formMeetingUrl.trim() || null,
        customerId: formCustomerId || null,
        orderId: formOrderId || null,
        assignedTo: formAssignedTo || null,
        status: formStatus,
        colorTag: formColorTag,
      };

      if (editingEvent) {
        await portalFetch(`/schedule/${editingEvent.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        setFeedback('Evento atualizado na agenda da unidade.');
      } else {
        await portalFetch('/schedule', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        setFeedback('Novo evento agendado com sucesso.');
      }
      setModalOpen(false);
      await loadAll();
    } catch (err) {
      setModalError(err instanceof PortalApiError ? err.message : 'Erro ao salvar evento na agenda.');
    } finally {
      setSaving(false);
    }
  };

  const handleQuickStatus = async (ev: ScheduleEventApi, nextStatus: ScheduleEventStatus) => {
    if (!canWriteAgenda) return;
    setBusyEventId(ev.id);
    setError(null);
    try {
      await portalFetch(`/schedule/${ev.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      setFeedback(
        nextStatus === 'confirmed'
          ? `Evento "${ev.title}" confirmado.`
          : nextStatus === 'completed'
            ? `Evento "${ev.title}" marcado como concluído.`
            : `Status atualizado.`
      );
      if (editingEvent?.id === ev.id) {
        setModalOpen(false);
      }
      await loadAll();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Não foi possível atualizar o status.');
    } finally {
      setBusyEventId(null);
    }
  };

  const handleDeleteEvent = async (id: string) => {
    if (!canWriteAgenda) return;
    setSaving(true);
    setError(null);
    setModalError(null);
    try {
      await portalFetch(`/schedule/${id}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      setModalOpen(false);
      setFeedback('Evento removido da agenda.');
      await loadAll();
    } catch (err) {
      const msg = err instanceof PortalApiError ? err.message : 'Erro ao excluir evento.';
      if (modalOpen) setModalError(msg);
      else setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const todayKey = useMemo(() => toDateKey(new Date()), []);

  // Navigation logic
  const handleNavigatePeriod = (dir: -1 | 1) => {
    setCursorDate((prev) => {
      if (viewMode === 'month') {
        return new Date(prev.getFullYear(), prev.getMonth() + dir, 1);
      }
      if (viewMode === 'week') {
        return addDays(prev, dir * 7);
      }
      return addDays(prev, dir);
    });
  };

  const handleJumpToday = () => {
    const now = new Date();
    setCursorDate(new Date(now.getFullYear(), now.getMonth(), now.getDate()));
  };

  // Period display title
  const periodTitle = useMemo(() => {
    if (viewMode === 'month') {
      return capitalizePt(
        cursorDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      );
    }
    if (viewMode === 'week') {
      const mon = getMondayOfWeek(cursorDate);
      const sun = addDays(mon, 6);
      const sameMonth = mon.getMonth() === sun.getMonth() && mon.getFullYear() === sun.getFullYear();
      const sameYear = mon.getFullYear() === sun.getFullYear();
      if (sameMonth) {
        const mLabel = capitalizePt(mon.toLocaleDateString('pt-BR', { month: 'long' }));
        return `${mon.getDate()} – ${sun.getDate()} de ${mLabel} ${sun.getFullYear()}`;
      }
      const startStr = mon.toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'short',
        ...(sameYear ? {} : { year: 'numeric' }),
      });
      const endStr = sun.toLocaleDateString('pt-BR', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
      return `${startStr} – ${endStr}`;
    }
    return capitalizePt(
      cursorDate.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric',
      })
    );
  }, [cursorDate, viewMode]);

  // Filtered events
  const filteredEvents = useMemo(() => {
    const term = search.trim().toLowerCase();
    return events.filter((ev) => {
      if (typeFilter === 'entrega' && ev.event_type !== 'entrega') return false;
      if (typeFilter === 'reuniao' && ev.event_type !== 'reuniao') return false;
      if (typeFilter === 'outros' && (ev.event_type === 'entrega' || ev.event_type === 'reuniao')) {
        return false;
      }
      if (term) {
        const haystack = [
          ev.title,
          ev.description,
          ev.customer_name,
          ev.order_number,
          ev.location,
          ev.assigned_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      return true;
    });
  }, [events, typeFilter, search]);

  // Map events to date keys (supporting single-day and multi-day spans)
  const eventsByDateKey = useMemo(() => {
    const map = new Map<string, ScheduleEventApi[]>();
    for (const ev of filteredEvents) {
      const startDt = parseEventDate(ev.start_at, ev.all_day);
      if (!startDt) continue;
      const startKey = toDateKey(startDt);
      const endDt = parseEventDate(ev.end_at, ev.all_day);
      let spanDays = 0;

      if (endDt) {
        const endKey = toDateKey(endDt);
        if (endKey > startKey) {
          const endHasTime = ev.all_day || endDt.getHours() > 0 || endDt.getMinutes() > 0;
          const diffMs = fromDateKey(endKey).getTime() - fromDateKey(startKey).getTime();
          const diffDays = Math.round(diffMs / 86_400_000);
          spanDays = Math.min(31, endHasTime ? diffDays : Math.max(0, diffDays - 1));
        }
      }

      for (let i = 0; i <= spanDays; i++) {
        const key = toDateKey(addDays(fromDateKey(startKey), i));
        const list = map.get(key) || [];
        list.push(ev);
        map.set(key, list);
      }
    }

    // Sort events within each day: all_day first, then chronological
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => {
        if (a.all_day && !b.all_day) return -1;
        if (!a.all_day && b.all_day) return 1;
        return new Date(a.start_at).getTime() - new Date(b.start_at).getTime();
      });
      map.set(k, list);
    }

    return map;
  }, [filteredEvents]);

  // Month grid cells (35 or 42 days, Seg-Dom)
  const monthGridDays = useMemo(() => {
    const year = cursorDate.getFullYear();
    const month = cursorDate.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const leadingOffset = (firstOfMonth.getDay() + 6) % 7;
    const totalCells = leadingOffset + daysInMonth <= 35 ? 35 : 42;
    const gridStart = addDays(firstOfMonth, -leadingOffset);

    return Array.from({ length: totalCells }, (_, i) => {
      const date = addDays(gridStart, i);
      return {
        date,
        dateKey: toDateKey(date),
        isCurrentMonth: date.getMonth() === month && date.getFullYear() === year,
      };
    });
  }, [cursorDate]);

  // Week 7 days (Mon-Sun)
  const weekDays = useMemo(() => {
    const monday = getMondayOfWeek(cursorDate);
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(monday, i);
      return {
        date,
        dateKey: toDateKey(date),
      };
    });
  }, [cursorDate]);

  // Period stats (for visible month, week, or day)
  const periodStats = useMemo(() => {
    let rangeStartKey: string;
    let rangeEndKey: string;

    if (viewMode === 'month') {
      const y = cursorDate.getFullYear();
      const m = cursorDate.getMonth();
      rangeStartKey = toDateKey(new Date(y, m, 1));
      rangeEndKey = toDateKey(new Date(y, m + 1, 0));
    } else if (viewMode === 'week') {
      rangeStartKey = weekDays[0].dateKey;
      rangeEndKey = weekDays[6].dateKey;
    } else {
      const dk = toDateKey(cursorDate);
      rangeStartKey = dk;
      rangeEndKey = dk;
    }

    const inPeriod = filteredEvents.filter((ev) => {
      const startDt = parseEventDate(ev.start_at, ev.all_day);
      if (!startDt) return false;
      const startKey = toDateKey(startDt);
      const endDt = parseEventDate(ev.end_at, ev.all_day);
      const endKey = endDt ? toDateKey(endDt) : startKey;
      return endKey >= rangeStartKey && startKey <= rangeEndKey;
    });

    const entregas = inPeriod.filter(
      (e) => e.event_type === 'entrega' && e.status !== 'canceled'
    ).length;
    const reunioes = inPeriod.filter(
      (e) => e.event_type === 'reuniao' && e.status !== 'canceled'
    ).length;
    const confirmados = inPeriod.filter((e) => e.status === 'confirmed').length;

    return { total: inPeriod.length, entregas, reunioes, confirmados };
  }, [cursorDate, viewMode, weekDays, filteredEvents]);

  // Mobile Month days with events (plus selected day)
  const mobileMonthAgendaDays = useMemo(() => {
    const y = cursorDate.getFullYear();
    const m = cursorDate.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const list: Array<{ date: Date; dateKey: string; events: ScheduleEventApi[] }> = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dt = new Date(y, m, d);
      const dk = toDateKey(dt);
      const evs = eventsByDateKey.get(dk) || [];
      if (evs.length > 0 || dk === todayKey || dk === toDateKey(cursorDate)) {
        list.push({ date: dt, dateKey: dk, events: evs });
      }
    }
    return list;
  }, [cursorDate, eventsByDateKey, todayKey]);

  const currentDayKey = toDateKey(cursorDate);
  const currentDayEvents = eventsByDateKey.get(currentDayKey) || [];
  const currentDayLayout = useMemo(
    () => layoutDayTimedEvents(currentDayEvents, currentDayKey),
    [currentDayEvents, currentDayKey]
  );

  // Current time line offset (for Week / Day views)
  const nowMinutes = new Date().getHours() * 60 + new Date().getMinutes();
  const showNowLine = nowMinutes >= GRID_START_MIN && nowMinutes <= GRID_END_MIN;
  const nowFraction = (nowMinutes - GRID_START_MIN) / 60;

  return (
    <div className="space-y-5">
      {/* Top Google Calendar Toolbar */}
      <section className="apple-glass rounded-3xl p-4 sm:p-5 space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3.5">
          {/* Left: Primary CTA + Hoje + Arrows + Title */}
          <div className="flex flex-wrap items-center gap-2.5">
            {canWriteAgenda ? (
              <button
                type="button"
                onClick={() => openCreateModal()}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full apple-glass-cta text-white text-xs font-semibold transition-all shadow-lg"
              >
                <Plus className="w-4 h-4" />
                Agendar evento
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleJumpToday}
              className="px-3.5 py-2 rounded-full bg-white/8 hover:bg-white/14 border border-white/15 text-xs font-semibold text-wise-ink transition-colors"
            >
              Hoje
            </button>

            <div className="inline-flex items-center rounded-full apple-glass-well p-0.5">
              <button
                type="button"
                onClick={() => handleNavigatePeriod(-1)}
                aria-label="Período anterior"
                className="p-1.5 rounded-full hover:bg-white/12 text-wise-body hover:text-white transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => handleNavigatePeriod(1)}
                aria-label="Próximo período"
                className="p-1.5 rounded-full hover:bg-white/12 text-wise-body hover:text-white transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 pl-1">
              <Calendar className="w-4 h-4 text-[#2676ff] shrink-0 hidden sm:block" />
              <h1 className="text-base sm:text-xl font-bold text-wise-ink tracking-tight">
                {periodTitle}
              </h1>
            </div>
          </div>

          {/* Right: View Switcher + Refresh + Search */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 sm:flex-initial min-w-[190px]">
              <Search className="w-3.5 h-3.5 text-wise-mute absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar evento, cliente, pedido..."
                aria-label="Buscar eventos na agenda"
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

            {/* Segmented Control: Mês | Semana | Dia */}
            <div
              role="tablist"
              aria-label="Modo de visualização do calendário"
              className="inline-flex items-center rounded-full apple-glass-well p-1 gap-0.5"
            >
              {(
                [
                  { id: 'month', label: 'Mês' },
                  { id: 'week', label: 'Semana' },
                  { id: 'day', label: 'Dia' },
                ] as const
              ).map((v) => {
                const active = viewMode === v.id;
                return (
                  <button
                    key={v.id}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setViewMode(v.id)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      active
                        ? 'bg-[#2676ff] text-white shadow-[0_0_14px_rgba(38,118,255,0.45)]'
                        : 'text-wise-body hover:text-white hover:bg-white/8'
                    }`}
                  >
                    {v.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={loadAll}
              title="Atualizar agenda"
              aria-label="Atualizar agenda"
              className="p-2 rounded-full bg-white/6 hover:bg-white/12 border border-white/12 text-wise-body hover:text-white transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Type Filter Chips + Legend / Mini Stats Strip */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pt-3 border-t border-white/10">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: 'todos', label: 'Todos' },
                { id: 'entrega', label: 'Entregas', icon: Truck },
                { id: 'reuniao', label: 'Reuniões', icon: Video },
                { id: 'outros', label: 'Outros', icon: Tag },
              ] as const
            ).map((chip) => {
              const active = typeFilter === chip.id;
              const Icon = 'icon' in chip ? chip.icon : null;
              return (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => setTypeFilter(chip.id)}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                    active
                      ? 'bg-[#2676ff]/25 border-[#2676ff]/70 text-white shadow-[0_0_12px_rgba(38,118,255,0.25)]'
                      : 'bg-white/5 border-white/10 text-wise-body hover:text-white hover:bg-white/10'
                  }`}
                >
                  {Icon ? <Icon className="w-3.5 h-3.5" /> : null}
                  <span>{chip.label}</span>
                </button>
              );
            })}
          </div>

          {/* Mini Stats & Legend */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full apple-glass-well">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span className="text-wise-mute">Entregas no período:</span>
              <span className="font-bold text-emerald-300">{periodStats.entregas}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full apple-glass-well">
              <span className="w-2 h-2 rounded-full bg-[#2676ff]" />
              <span className="text-wise-mute">Reuniões no período:</span>
              <span className="font-bold text-blue-300">{periodStats.reunioes}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full apple-glass-well">
              <CheckCircle2 className="w-3.5 h-3.5 text-cyan-300" />
              <span className="text-wise-mute">Confirmados:</span>
              <span className="font-bold text-wise-ink">{periodStats.confirmados}</span>
            </div>
          </div>
        </div>
      </section>

      {feedback ? (
        <div className="apple-glass-subtle rounded-2xl px-4 py-3 border border-emerald-400/35 bg-emerald-500/10 text-xs text-emerald-100 flex items-center justify-between gap-2">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline shrink-0">
            Fechar
          </button>
        </div>
      ) : null}

      {error ? <ErrorBanner message={error} onRetry={loadAll} /> : null}

      {loading && events.length === 0 ? (
        <LoadingCard message="Carregando calendário de entregas e reuniões..." />
      ) : null}

      {/* VIEW 1: MONTH VIEW */}
      {viewMode === 'month' && !(loading && events.length === 0) ? (
        <section className="apple-glass rounded-3xl overflow-hidden">
          {/* Desktop / Tablet >= 640px: Google Calendar 7-Column Grid (Seg–Dom) */}
          <div className="hidden sm:block">
            <div className="grid grid-cols-7 border-b border-white/12 bg-white/[0.03]">
              {WEEKDAY_LABELS.map((wd) => (
                <div
                  key={wd}
                  className="py-2.5 px-3 text-center text-[11px] font-bold uppercase tracking-wider text-wise-mute border-r border-white/8 last:border-r-0"
                >
                  {wd}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7">
              {monthGridDays.map(({ date, dateKey, isCurrentMonth }) => {
                const dayEvents = eventsByDateKey.get(dateKey) || [];
                const isToday = dateKey === todayKey;
                const visibleEvents = dayEvents.slice(0, 3);
                const hiddenCount = Math.max(0, dayEvents.length - 3);

                return (
                  <div
                    key={dateKey}
                    onClick={() => {
                      if (canWriteAgenda) {
                        openCreateModal(date, 9);
                      } else {
                        setCursorDate(date);
                        setViewMode('day');
                      }
                    }}
                    className={`min-h-[124px] p-2 border-b border-r border-white/10 transition-colors flex flex-col gap-1 ${
                      canWriteAgenda ? 'cursor-pointer hover:bg-white/[0.04]' : ''
                    } ${!isCurrentMonth ? 'bg-black/25 opacity-55' : 'bg-transparent'} ${
                      isToday ? 'bg-[#2676ff]/[0.07] ring-1 ring-inset ring-[#2676ff]/40' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-0.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCursorDate(date);
                          setViewMode('day');
                        }}
                        title={`Ver dia ${formatDateBr(dateKey)}`}
                        className={`w-7 h-7 rounded-full inline-flex items-center justify-center text-xs font-bold transition-all ${
                          isToday
                            ? 'bg-[#2676ff] text-white ring-2 ring-[#2676ff]/60 shadow-[0_0_16px_rgba(38,118,255,0.75)]'
                            : isCurrentMonth
                              ? 'text-wise-ink hover:bg-white/12'
                              : 'text-wise-mute hover:bg-white/10'
                        }`}
                      >
                        {date.getDate()}
                      </button>

                      {dayEvents.length > 0 ? (
                        <span className="text-[10px] font-semibold text-wise-mute">
                          {dayEvents.length}
                        </span>
                      ) : null}
                    </div>

                    <div className="space-y-1 flex-1 min-w-0">
                      {visibleEvents.map((ev) => {
                        const colorKey = resolveColorKey(ev);
                        const styles = COLOR_STYLES[colorKey];
                        const dt = parseEventDate(ev.start_at, ev.all_day);
                        const timeLabel = ev.all_day
                          ? 'Dia'
                          : dt
                            ? formatTimeShort(dt)
                            : '';
                        const isCanceled = ev.status === 'canceled';
                        const isCompleted = ev.status === 'completed';

                        return (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(ev);
                            }}
                            title={`${timeLabel ? `${timeLabel} · ` : ''}${ev.title}${
                              ev.customer_name ? ` (${ev.customer_name})` : ''
                            }`}
                            className={`w-full text-left px-2 py-1 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition-all truncate ${
                              styles.pill
                            } ${isCanceled ? 'line-through opacity-55' : ''} ${
                              isCompleted ? 'opacity-75' : ''
                            }`}
                          >
                            {getEventIcon(ev.event_type, 'w-3 h-3 shrink-0')}
                            {timeLabel ? (
                              <span className="text-[10px] opacity-85 shrink-0">{timeLabel}</span>
                            ) : null}
                            <span className="truncate flex-1">{ev.title}</span>
                          </button>
                        );
                      })}

                      {hiddenCount > 0 ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCursorDate(date);
                            setViewMode('day');
                          }}
                          className="w-full text-left px-2 py-0.5 rounded-md text-[11px] font-bold text-[#7fb2ff] hover:text-white hover:bg-[#2676ff]/20 transition-colors"
                        >
                          +{hiddenCount} mais
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile < 640px: Compact Mini-Month + Stacked Agenda List */}
          <div className="sm:hidden p-4 space-y-4">
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAY_LABELS.map((wd) => (
                <div key={wd} className="text-[10px] font-bold uppercase text-wise-mute py-1">
                  {wd}
                </div>
              ))}
              {monthGridDays.map(({ date, dateKey, isCurrentMonth }) => {
                const count = (eventsByDateKey.get(dateKey) || []).length;
                const isToday = dateKey === todayKey;
                const isSelected = dateKey === currentDayKey;
                return (
                  <button
                    key={dateKey}
                    type="button"
                    onClick={() => {
                      setCursorDate(date);
                      if (count === 0 && canWriteAgenda) {
                        openCreateModal(date, 9);
                      }
                    }}
                    className={`relative py-1.5 rounded-xl text-xs font-semibold flex flex-col items-center justify-center transition-all ${
                      isToday
                        ? 'bg-[#2676ff] text-white ring-2 ring-[#2676ff]/60 shadow-[0_0_12px_rgba(38,118,255,0.7)]'
                        : isSelected
                          ? 'bg-white/15 border border-white/30 text-white'
                          : isCurrentMonth
                            ? 'text-wise-ink hover:bg-white/8'
                            : 'text-wise-mute opacity-45'
                    }`}
                  >
                    <span>{date.getDate()}</span>
                    {count > 0 ? (
                      <span
                        className={`w-1.5 h-1.5 rounded-full mt-0.5 ${
                          isToday ? 'bg-white' : 'bg-[#2676ff]'
                        }`}
                      />
                    ) : (
                      <span className="w-1.5 h-1.5 mt-0.5" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="space-y-3 pt-2 border-t border-white/10">
              {mobileMonthAgendaDays.length === 0 ? (
                <EmptyStateCard
                  title="Sem eventos neste mês"
                  description="Toque em um dia acima ou no botão + Agendar evento para cadastrar entregas e reuniões."
                />
              ) : (
                mobileMonthAgendaDays.map(({ date, dateKey, events: dayEvs }) => {
                  const isToday = dateKey === todayKey;
                  return (
                    <div
                      key={dateKey}
                      className={`rounded-2xl p-3 space-y-2 border ${
                        isToday
                          ? 'bg-[#2676ff]/10 border-[#2676ff]/45'
                          : 'apple-glass-well border-white/10'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCursorDate(date);
                            setViewMode('day');
                          }}
                          className="text-xs font-bold text-wise-ink capitalize text-left"
                        >
                          {date.toLocaleDateString('pt-BR', {
                            weekday: 'short',
                            day: '2-digit',
                            month: 'short',
                          })}
                          {isToday ? (
                            <span className="ml-2 px-2 py-0.5 rounded-full bg-[#2676ff] text-[10px] text-white">
                              Hoje
                            </span>
                          ) : null}
                        </button>
                        {canWriteAgenda ? (
                          <button
                            type="button"
                            onClick={() => openCreateModal(date, 9)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/8 text-[11px] font-semibold text-wise-body hover:text-white"
                          >
                            <Plus className="w-3 h-3" />
                            Agendar
                          </button>
                        ) : null}
                      </div>

                      {dayEvs.length === 0 ? (
                        <p className="text-[11px] text-wise-mute">Sem eventos agendados.</p>
                      ) : (
                        <div className="space-y-1.5">
                          {dayEvs.map((ev) => {
                            const styles = COLOR_STYLES[resolveColorKey(ev)];
                            const dt = parseEventDate(ev.start_at, ev.all_day);
                            return (
                              <button
                                key={ev.id}
                                type="button"
                                onClick={() => openEditModal(ev)}
                                className={`w-full text-left px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                                  styles.pill
                                } ${ev.status === 'canceled' ? 'line-through opacity-55' : ''}`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  {getEventIcon(ev.event_type)}
                                  <span className="font-semibold truncate">{ev.title}</span>
                                </div>
                                <span className="text-[11px] opacity-85 shrink-0">
                                  {ev.all_day ? 'Dia inteiro' : dt ? formatTimeShort(dt) : ''}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* VIEW 2: WEEK VIEW */}
      {viewMode === 'week' && !(loading && events.length === 0) ? (
        <section className="apple-glass rounded-3xl overflow-hidden">
          {/* Desktop / Tablet >= 640px: 7-col hourly timeline */}
          <div className="hidden sm:block overflow-x-auto">
            <div className="min-w-[840px]">
              {/* Day Column Headers */}
              <div className="grid grid-cols-[68px_repeat(7,minmax(0,1fr))] border-b border-white/12 bg-white/[0.03]">
                <div className="py-3 px-2 text-[10px] font-bold uppercase text-wise-mute text-right border-r border-white/10">
                  Hora
                </div>
                {weekDays.map(({ date, dateKey }, idx) => {
                  const isToday = dateKey === todayKey;
                  return (
                    <button
                      key={dateKey}
                      type="button"
                      onClick={() => {
                        setCursorDate(date);
                        setViewMode('day');
                      }}
                      className={`py-2.5 px-2 text-center border-r border-white/10 last:border-r-0 hover:bg-white/[0.05] transition-colors ${
                        isToday ? 'bg-[#2676ff]/10' : ''
                      }`}
                    >
                      <span className="block text-[10px] font-bold uppercase text-wise-mute">
                        {WEEKDAY_LABELS[idx]}
                      </span>
                      <span
                        className={`mt-1 inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold ${
                          isToday
                            ? 'bg-[#2676ff] text-white shadow-[0_0_14px_rgba(38,118,255,0.75)] ring-2 ring-[#2676ff]/50'
                            : 'text-wise-ink'
                        }`}
                      >
                        {date.getDate()}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* All-day / Off-hours row (rendered if any week day has allDay/outside events) */}
              {weekDays.some(
                ({ dateKey }) =>
                  layoutDayTimedEvents(eventsByDateKey.get(dateKey) || [], dateKey)
                    .allDayOrOutside.length > 0
              ) ? (
                <div className="grid grid-cols-[68px_repeat(7,minmax(0,1fr))] border-b border-white/12 bg-white/[0.02]">
                  <div className="p-2 text-[10px] font-semibold text-wise-mute text-right border-r border-white/10 flex items-center justify-end">
                    Dia / Ext.
                  </div>
                  {weekDays.map(({ dateKey }) => {
                    const { allDayOrOutside } = layoutDayTimedEvents(
                      eventsByDateKey.get(dateKey) || [],
                      dateKey
                    );
                    return (
                      <div
                        key={dateKey}
                        className="p-1.5 space-y-1 border-r border-white/10 last:border-r-0 min-h-[38px]"
                      >
                        {allDayOrOutside.map((ev) => {
                          const styles = COLOR_STYLES[resolveColorKey(ev)];
                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={() => openEditModal(ev)}
                              className={`w-full text-left px-1.5 py-1 rounded-md border text-[10px] font-semibold flex items-center gap-1 truncate ${
                                styles.pill
                              } ${ev.status === 'canceled' ? 'line-through opacity-55' : ''}`}
                            >
                              {getEventIcon(ev.event_type, 'w-3 h-3 shrink-0')}
                              <span className="truncate">{ev.title}</span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {/* Hourly Slots 08:00 - 20:00 */}
              <div className="grid grid-cols-[68px_repeat(7,minmax(0,1fr))] relative">
                {/* Time Gutter */}
                <div className="border-r border-white/10">
                  {HOURS_SLOTS.map((hour) => (
                    <div
                      key={hour}
                      style={{ height: WEEK_ROW_HEIGHT }}
                      className="pr-2 pt-1 text-right text-[11px] font-semibold text-wise-mute border-b border-white/8"
                    >
                      {String(hour).padStart(2, '0')}:00
                    </div>
                  ))}
                </div>

                {/* 7 Day Columns */}
                {weekDays.map(({ date, dateKey }) => {
                  const isToday = dateKey === todayKey;
                  const { timed } = layoutDayTimedEvents(
                    eventsByDateKey.get(dateKey) || [],
                    dateKey
                  );

                  return (
                    <div
                      key={dateKey}
                      className={`relative border-r border-white/10 last:border-r-0 ${
                        isToday ? 'bg-[#2676ff]/[0.03]' : ''
                      }`}
                    >
                      {/* Clickable Hour Slots */}
                      {HOURS_SLOTS.map((hour) => (
                        <div
                          key={hour}
                          style={{ height: WEEK_ROW_HEIGHT }}
                          onClick={() => {
                            if (canWriteAgenda) openCreateModal(date, hour);
                          }}
                          className={`border-b border-white/8 transition-colors ${
                            canWriteAgenda ? 'cursor-pointer hover:bg-white/[0.04]' : ''
                          }`}
                        />
                      ))}

                      {/* Current Time Indicator */}
                      {isToday && showNowLine ? (
                        <div
                          style={{ top: nowFraction * WEEK_ROW_HEIGHT }}
                          className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                        >
                          <span className="w-2 h-2 rounded-full bg-[#2676ff] -ml-1 shadow-[0_0_8px_#2676ff]" />
                          <div className="flex-1 h-[1.5px] bg-[#2676ff]/80" />
                        </div>
                      ) : null}

                      {/* Positioned Event Cards */}
                      {timed.map(({ event: ev, startMin, endMin, col, totalCols }) => {
                        const styles = COLOR_STYLES[resolveColorKey(ev)];
                        const topPx = ((startMin - GRID_START_MIN) / 60) * WEEK_ROW_HEIGHT + 2;
                        const heightPx = Math.max(
                          34,
                          ((endMin - startMin) / 60) * WEEK_ROW_HEIGHT - 4
                        );
                        const startDt = parseEventDate(ev.start_at, false);
                        const endDt = parseEventDate(ev.end_at, false);
                        const widthPct = 100 / totalCols;
                        const leftPct = col * widthPct;

                        return (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(ev);
                            }}
                            style={{
                              top: topPx,
                              height: heightPx,
                              left: `calc(${leftPct}% + 2px)`,
                              width: `calc(${widthPct}% - 4px)`,
                            }}
                            className={`absolute z-10 text-left rounded-xl border px-2 py-1 overflow-hidden flex flex-col justify-start gap-0.5 backdrop-blur-md shadow-md transition-transform hover:scale-[1.01] hover:z-30 ${
                              styles.card
                            } ${ev.status === 'canceled' ? 'line-through opacity-55' : ''}`}
                          >
                            <div className="flex items-center gap-1 text-[10px] font-bold opacity-90 truncate">
                              {getEventIcon(ev.event_type, 'w-3 h-3 shrink-0')}
                              <span>
                                {startDt ? formatTimeShort(startDt) : ''}
                                {endDt ? `–${formatTimeShort(endDt)}` : ''}
                              </span>
                            </div>
                            <p className="text-[11px] font-bold leading-tight truncate">
                              {ev.title}
                            </p>
                            {heightPx >= 52 && (ev.customer_name || ev.order_number) ? (
                              <p className="text-[10px] opacity-80 truncate">
                                {[ev.order_number, ev.customer_name].filter(Boolean).join(' · ')}
                              </p>
                            ) : null}
                            {heightPx >= 68 && (ev.location || ev.meeting_url) ? (
                              <p className="text-[10px] opacity-75 truncate">
                                {ev.location || ev.meeting_url}
                              </p>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Mobile < 640px Week List */}
          <div className="sm:hidden p-4 space-y-3">
            {weekDays.map(({ date, dateKey }, idx) => {
              const dayEvs = eventsByDateKey.get(dateKey) || [];
              const isToday = dateKey === todayKey;
              return (
                <div
                  key={dateKey}
                  className={`rounded-2xl p-3.5 space-y-2 border ${
                    isToday
                      ? 'bg-[#2676ff]/10 border-[#2676ff]/45'
                      : 'apple-glass-well border-white/10'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCursorDate(date);
                        setViewMode('day');
                      }}
                      className="text-xs font-bold text-wise-ink text-left"
                    >
                      {WEEKDAY_LABELS[idx]},{' '}
                      {date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}
                      {isToday ? (
                        <span className="ml-2 px-2 py-0.5 rounded-full bg-[#2676ff] text-[10px] text-white">
                          Hoje
                        </span>
                      ) : null}
                    </button>
                    {canWriteAgenda ? (
                      <button
                        type="button"
                        onClick={() => openCreateModal(date, 9)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/8 text-[11px] font-semibold text-wise-body"
                      >
                        <Plus className="w-3 h-3" />
                        Novo
                      </button>
                    ) : null}
                  </div>
                  {dayEvs.length === 0 ? (
                    <p className="text-[11px] text-wise-mute">Sem compromissos neste dia.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {dayEvs.map((ev) => {
                        const styles = COLOR_STYLES[resolveColorKey(ev)];
                        const dt = parseEventDate(ev.start_at, ev.all_day);
                        return (
                          <button
                            key={ev.id}
                            type="button"
                            onClick={() => openEditModal(ev)}
                            className={`w-full text-left px-3 py-2 rounded-xl border text-xs space-y-0.5 ${styles.pill}`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-bold flex items-center gap-1.5 truncate">
                                {getEventIcon(ev.event_type)}
                                <span className="truncate">{ev.title}</span>
                              </span>
                              <span className="text-[11px] shrink-0">
                                {ev.all_day ? 'Dia' : dt ? formatTimeShort(dt) : ''}
                              </span>
                            </div>
                            {ev.customer_name || ev.order_number ? (
                              <p className="text-[11px] opacity-80 truncate">
                                {[ev.order_number, ev.customer_name].filter(Boolean).join(' · ')}
                              </p>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* VIEW 3: DAY VIEW */}
      {viewMode === 'day' && !(loading && events.length === 0) ? (
        <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          {/* Left / Main: Hourly Timeline */}
          <div className="xl:col-span-2 apple-glass rounded-3xl overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/12 flex flex-wrap items-center justify-between gap-2 bg-white/[0.03]">
              <div className="flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-[#2676ff]" />
                <span className="text-sm font-bold text-wise-ink capitalize">
                  {cursorDate.toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                  })}
                </span>
                {currentDayKey === todayKey ? (
                  <span className="px-2.5 py-0.5 rounded-full bg-[#2676ff] text-[10px] font-bold text-white shadow-[0_0_12px_rgba(38,118,255,0.65)]">
                    Hoje
                  </span>
                ) : null}
              </div>
              <span className="text-xs text-wise-mute">
                {currentDayEvents.length} evento(s) no dia
              </span>
            </div>

            {/* All-day / outside 08:00-20:00 strip */}
            {currentDayLayout.allDayOrOutside.length > 0 ? (
              <div className="px-5 py-3 border-b border-white/12 bg-white/[0.02] space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-wise-mute">
                  Dia inteiro / Fora da grade 08:00–20:00
                </p>
                <div className="flex flex-wrap gap-2">
                  {currentDayLayout.allDayOrOutside.map((ev) => {
                    const styles = COLOR_STYLES[resolveColorKey(ev)];
                    const dt = parseEventDate(ev.start_at, ev.all_day);
                    return (
                      <button
                        key={ev.id}
                        type="button"
                        onClick={() => openEditModal(ev)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 ${
                          styles.pill
                        } ${ev.status === 'canceled' ? 'line-through opacity-55' : ''}`}
                      >
                        {getEventIcon(ev.event_type)}
                        <span>{ev.all_day ? 'Dia inteiro' : dt ? formatTimeShort(dt) : ''}</span>
                        <span>·</span>
                        <span>{ev.title}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {/* Hourly grid */}
            <div className="grid grid-cols-[68px_1fr] relative">
              <div className="border-r border-white/10">
                {HOURS_SLOTS.map((hour) => (
                  <div
                    key={hour}
                    style={{ height: DAY_ROW_HEIGHT }}
                    className="pr-3 pt-1.5 text-right text-[11px] font-semibold text-wise-mute border-b border-white/8"
                  >
                    {String(hour).padStart(2, '0')}:00
                  </div>
                ))}
              </div>

              <div className="relative">
                {HOURS_SLOTS.map((hour) => (
                  <div
                    key={hour}
                    style={{ height: DAY_ROW_HEIGHT }}
                    onClick={() => {
                      if (canWriteAgenda) openCreateModal(cursorDate, hour);
                    }}
                    className={`border-b border-white/8 px-3 py-1 flex items-start justify-end transition-colors ${
                      canWriteAgenda ? 'cursor-pointer hover:bg-white/[0.04] group' : ''
                    }`}
                  >
                    {canWriteAgenda ? (
                      <span className="opacity-0 group-hover:opacity-100 text-[10px] font-semibold text-[#7fb2ff] transition-opacity">
                        + Agendar às {String(hour).padStart(2, '0')}:00
                      </span>
                    ) : null}
                  </div>
                ))}

                {currentDayKey === todayKey && showNowLine ? (
                  <div
                    style={{ top: nowFraction * DAY_ROW_HEIGHT }}
                    className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                  >
                    <span className="w-2.5 h-2.5 rounded-full bg-[#2676ff] -ml-1.5 shadow-[0_0_10px_#2676ff]" />
                    <div className="flex-1 h-[2px] bg-[#2676ff]/80" />
                  </div>
                ) : null}

                {currentDayLayout.timed.map(({ event: ev, startMin, endMin, col, totalCols }) => {
                  const styles = COLOR_STYLES[resolveColorKey(ev)];
                  const topPx = ((startMin - GRID_START_MIN) / 60) * DAY_ROW_HEIGHT + 3;
                  const heightPx = Math.max(
                    42,
                    ((endMin - startMin) / 60) * DAY_ROW_HEIGHT - 6
                  );
                  const startDt = parseEventDate(ev.start_at, false);
                  const endDt = parseEventDate(ev.end_at, false);
                  const widthPct = 100 / totalCols;
                  const leftPct = col * widthPct;

                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditModal(ev);
                      }}
                      style={{
                        top: topPx,
                        height: heightPx,
                        left: `calc(${leftPct}% + 6px)`,
                        width: `calc(${widthPct}% - 12px)`,
                      }}
                      className={`absolute z-10 text-left rounded-2xl border px-3.5 py-2 overflow-hidden flex flex-col justify-between backdrop-blur-md shadow-lg transition-transform hover:scale-[1.005] hover:z-30 ${
                        styles.card
                      } ${ev.status === 'canceled' ? 'line-through opacity-55' : ''}`}
                    >
                      <div className="flex items-center justify-between gap-2 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          {getEventIcon(ev.event_type, 'w-4 h-4 shrink-0')}
                          <span className="text-xs font-bold truncate">{ev.title}</span>
                        </div>
                        <span className="text-[11px] font-semibold opacity-90 shrink-0">
                          {startDt ? formatTimeShort(startDt) : ''}
                          {endDt ? ` – ${formatTimeShort(endDt)}` : ''}
                        </span>
                      </div>

                      {heightPx >= 56 ? (
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] opacity-85 truncate">
                          {ev.customer_name ? <span>Cliente: {ev.customer_name}</span> : null}
                          {ev.order_number ? <span>Pedido {ev.order_number}</span> : null}
                          {ev.location ? <span>Local: {ev.location}</span> : null}
                        </div>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right: Detailed Event Cards for Selected Day */}
          <div className="space-y-3">
            <div className="apple-glass rounded-3xl p-4 sm:p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-wise-ink">Detalhes do dia</h2>
                  <p className="text-[11px] text-wise-mute">
                    Ações rápidas de confirmação, entrega e reunião.
                  </p>
                </div>
                {canWriteAgenda ? (
                  <button
                    type="button"
                    onClick={() => openCreateModal(cursorDate, 9)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full apple-glass-cta text-white text-xs font-semibold"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Novo
                  </button>
                ) : null}
              </div>

              {currentDayEvents.length === 0 ? (
                <EmptyStateCard
                  title="Dia livre na agenda"
                  description="Nenhum evento programado para esta data com os filtros atuais."
                  action={
                    canWriteAgenda ? (
                      <button
                        type="button"
                        onClick={() => openCreateModal(cursorDate, 9)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Agendar neste dia
                      </button>
                    ) : undefined
                  }
                />
              ) : (
                <div className="space-y-3">
                  {currentDayEvents.map((ev) => {
                    const styles = COLOR_STYLES[resolveColorKey(ev)];
                    const startDt = parseEventDate(ev.start_at, ev.all_day);
                    const endDt = parseEventDate(ev.end_at, ev.all_day);
                    const typeMeta = EVENT_TYPE_META[ev.event_type] || EVENT_TYPE_META.outro;
                    const safeMeetUrl = sanitizeExternalUrl(ev.meeting_url);
                    const pillMeta = statusPillProps(ev.status);
                    const completeLabel =
                      ev.event_type === 'entrega'
                        ? 'Concluir entrega'
                        : ev.event_type === 'reuniao'
                          ? 'Concluir reunião'
                          : 'Concluir';

                    return (
                      <article
                        key={ev.id}
                        className="rounded-2xl apple-glass-well p-4 space-y-3 border border-white/12"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${styles.pill}`}
                              >
                                {getEventIcon(ev.event_type, 'w-3 h-3')}
                                {typeMeta.shortLabel}
                              </span>
                              <StatusPill
                                value={pillMeta.value}
                                customLabel={pillMeta.customLabel}
                              />
                            </div>
                            <h3
                              className={`text-sm font-bold text-wise-ink ${
                                ev.status === 'canceled' ? 'line-through opacity-60' : ''
                              }`}
                            >
                              {ev.title}
                            </h3>
                          </div>

                          <span className="text-[11px] font-semibold text-wise-body shrink-0 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-[#2676ff]" />
                            {ev.all_day
                              ? 'Dia inteiro'
                              : `${startDt ? formatTimeShort(startDt) : ''}${
                                  endDt ? `–${formatTimeShort(endDt)}` : ''
                                }`}
                          </span>
                        </div>

                        {ev.description ? (
                          <p className="text-xs text-wise-body leading-relaxed whitespace-pre-line">
                            {ev.description}
                          </p>
                        ) : null}

                        <div className="space-y-1.5 text-xs text-wise-body">
                          {ev.customer_name ? (
                            <div className="flex items-center gap-2">
                              <Users className="w-3.5 h-3.5 text-wise-mute shrink-0" />
                              <span>
                                Cliente: <strong className="text-wise-ink">{ev.customer_name}</strong>
                              </span>
                            </div>
                          ) : null}

                          {ev.order_number ? (
                            <div className="flex items-center gap-2">
                              <ShoppingBag className="w-3.5 h-3.5 text-wise-mute shrink-0" />
                              <span>Pedido vinculado: </span>
                              {onNavigate && ev.order_id ? (
                                <button
                                  type="button"
                                  onClick={() =>
                                    onNavigate('orders', { entityId: ev.order_id || undefined })
                                  }
                                  className="font-bold text-[#7fb2ff] hover:text-white underline"
                                >
                                  {ev.order_number}
                                </button>
                              ) : (
                                <strong className="text-wise-ink">{ev.order_number}</strong>
                              )}
                            </div>
                          ) : null}

                          {ev.location ? (
                            <div className="flex items-start gap-2">
                              <MapPin className="w-3.5 h-3.5 text-emerald-300 shrink-0 mt-0.5" />
                              <span>{ev.location}</span>
                            </div>
                          ) : null}

                          {safeMeetUrl ? (
                            <div className="flex items-center gap-2">
                              <Link2 className="w-3.5 h-3.5 text-[#7fb2ff] shrink-0" />
                              <a
                                href={safeMeetUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[#7fb2ff] hover:text-white font-semibold underline truncate"
                              >
                                <span className="truncate">{ev.meeting_url}</span>
                                <ExternalLink className="w-3 h-3 shrink-0" />
                              </a>
                            </div>
                          ) : ev.meeting_url ? (
                            <div className="flex items-center gap-2">
                              <Link2 className="w-3.5 h-3.5 text-wise-mute shrink-0" />
                              <span className="truncate">{ev.meeting_url}</span>
                            </div>
                          ) : null}

                          {ev.assigned_name ? (
                            <div className="flex items-center gap-2">
                              <User className="w-3.5 h-3.5 text-wise-mute shrink-0" />
                              <span>Responsável: {ev.assigned_name}</span>
                            </div>
                          ) : null}
                        </div>

                        {canWriteAgenda ? (
                          <div className="flex flex-wrap items-center gap-1.5 pt-2 border-t border-white/10">
                            {ev.status === 'scheduled' ? (
                              <button
                                type="button"
                                disabled={busyEventId === ev.id}
                                onClick={() => handleQuickStatus(ev, 'confirmed')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#2676ff]/20 hover:bg-[#2676ff]/35 border border-[#2676ff]/50 text-blue-100 text-[11px] font-semibold disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Confirmar
                              </button>
                            ) : null}

                            {ev.status !== 'completed' && ev.status !== 'canceled' ? (
                              <button
                                type="button"
                                disabled={busyEventId === ev.id}
                                onClick={() => handleQuickStatus(ev, 'completed')}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-emerald-100 text-[11px] font-semibold disabled:opacity-50"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                {completeLabel}
                              </button>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => openEditModal(ev)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/8 hover:bg-white/15 border border-white/12 text-wise-ink text-[11px] font-semibold"
                            >
                              <Pencil className="w-3 h-3" />
                              Editar
                            </button>

                            {confirmDeleteId === ev.id ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => handleDeleteEvent(ev.id)}
                                  className="px-2.5 py-1 rounded-full bg-rose-500/30 hover:bg-rose-500/45 border border-rose-400/50 text-rose-100 text-[11px] font-bold disabled:opacity-50"
                                >
                                  {saving ? 'Excluindo...' : 'Confirmar exclusão'}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="px-2 py-1 rounded-full bg-white/8 text-[11px] text-wise-mute"
                                >
                                  Não
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(ev.id)}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/6 hover:bg-rose-500/20 border border-white/12 hover:border-rose-400/40 text-wise-body hover:text-rose-100 text-[11px] font-semibold"
                              >
                                <Trash2 className="w-3 h-3" />
                                Excluir
                              </button>
                            )}
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>
      ) : null}

      {/* Create / Edit / Detail GlassModal */}
      <GlassModal
        open={modalOpen}
        title={
          editingEvent
            ? canWriteAgenda
              ? 'Editar evento da agenda'
              : 'Detalhes do evento'
            : 'Agendar novo evento'
        }
        subtitle={
          editingEvent
            ? `Unidade ${me.activeUnit.name} · ${
                EVENT_TYPE_META[editingEvent.event_type]?.label || 'Evento'
              }`
            : 'Agende entregas de pedidos, reuniões comerciais ou follow-ups na grade da unidade.'
        }
        onClose={() => {
          setModalOpen(false);
          setConfirmDeleteId(null);
        }}
        maxWidthClass="max-w-2xl"
      >
        {/* Quick context links / status bar when viewing an existing event */}
        {editingEvent ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl apple-glass-well p-3 border border-white/10">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill
                value={statusPillProps(editingEvent.status).value}
                customLabel={statusPillProps(editingEvent.status).customLabel}
              />
              {sanitizeExternalUrl(editingEvent.meeting_url) ? (
                <a
                  href={sanitizeExternalUrl(editingEvent.meeting_url)!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-[#2676ff]/25 border border-[#2676ff]/50 text-xs font-semibold text-blue-100 hover:bg-[#2676ff]/40"
                >
                  <Video className="w-3.5 h-3.5" />
                  Abrir link da reunião
                  <ExternalLink className="w-3 h-3" />
                </a>
              ) : null}
              {onNavigate && editingEvent.order_id && editingEvent.order_number ? (
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    onNavigate('orders', { entityId: editingEvent.order_id || undefined });
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-xs font-semibold text-emerald-100 hover:bg-emerald-500/30"
                >
                  <ShoppingBag className="w-3.5 h-3.5" />
                  Pedido {editingEvent.order_number}
                </button>
              ) : null}
            </div>

            {canWriteAgenda ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {editingEvent.status === 'scheduled' ? (
                  <button
                    type="button"
                    disabled={busyEventId === editingEvent.id}
                    onClick={() => handleQuickStatus(editingEvent, 'confirmed')}
                    className="px-3 py-1 rounded-full bg-[#2676ff]/20 hover:bg-[#2676ff]/35 border border-[#2676ff]/50 text-[11px] font-semibold text-blue-100 disabled:opacity-50"
                  >
                    Confirmar
                  </button>
                ) : null}
                {editingEvent.status !== 'completed' && editingEvent.status !== 'canceled' ? (
                  <button
                    type="button"
                    disabled={busyEventId === editingEvent.id}
                    onClick={() => handleQuickStatus(editingEvent, 'completed')}
                    className="px-3 py-1 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/40 text-[11px] font-semibold text-emerald-100 disabled:opacity-50"
                  >
                    Concluir
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}

        {!canWriteAgenda && editingEvent ? (
          <div className="space-y-3 text-xs text-wise-body">
            <div className="rounded-2xl apple-glass-well p-4 space-y-2">
              <p className="text-sm font-bold text-wise-ink">{editingEvent.title}</p>
              <p>
                <strong>Início:</strong>{' '}
                {formatDateBr(editingEvent.start_at, { withTime: !editingEvent.all_day })}
              </p>
              {editingEvent.end_at ? (
                <p>
                  <strong>Término:</strong>{' '}
                  {formatDateBr(editingEvent.end_at, { withTime: !editingEvent.all_day })}
                </p>
              ) : null}
              {editingEvent.location ? (
                <p>
                  <strong>Local/Endereço:</strong> {editingEvent.location}
                </p>
              ) : null}
              {editingEvent.customer_name ? (
                <p>
                  <strong>Cliente:</strong> {editingEvent.customer_name}
                </p>
              ) : null}
              {editingEvent.order_number ? (
                <p>
                  <strong>Pedido:</strong> {editingEvent.order_number}
                </p>
              ) : null}
              {editingEvent.assigned_name ? (
                <p>
                  <strong>Responsável:</strong> {editingEvent.assigned_name}
                </p>
              ) : null}
              {editingEvent.description ? (
                <p className="pt-1 whitespace-pre-line">{editingEvent.description}</p>
              ) : null}
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-5 py-2 rounded-full bg-white/10 text-xs font-semibold text-white"
              >
                Fechar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSaveEvent} className="space-y-4">
            {modalError ? <ErrorBanner message={modalError} /> : null}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-wise-ink mb-1">Tipo</label>
                <select
                  value={formEventType}
                  onChange={(e) => handleEventTypeChange(e.target.value as ScheduleEventType)}
                  className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none focus:border-[#2676ff]"
                >
                  <option value="entrega" className="bg-[#141418]">
                    Entrega de Pedido
                  </option>
                  <option value="reuniao" className="bg-[#141418]">
                    Reunião Comercial / Alinhamento
                  </option>
                  <option value="follow_up" className="bg-[#141418]">
                    Follow-up
                  </option>
                  <option value="outro" className="bg-[#141418]">
                    Outro
                  </option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-wise-ink mb-1">Status</label>
                <select
                  value={formStatus}
                  onChange={(e) => setFormStatus(e.target.value as ScheduleEventStatus)}
                  className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none focus:border-[#2676ff]"
                >
                  <option value="scheduled" className="bg-[#141418]">
                    Agendado
                  </option>
                  <option value="confirmed" className="bg-[#141418]">
                    Confirmado
                  </option>
                  <option value="completed" className="bg-[#141418]">
                    Concluído
                  </option>
                  <option value="canceled" className="bg-[#141418]">
                    Cancelado
                  </option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Título *</label>
              <input
                type="text"
                required
                minLength={2}
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder={
                  formEventType === 'entrega'
                    ? 'Ex: Entrega Pedido KS-1041 - Atlético Centro'
                    : 'Ex: Reunião de aprovação de arte - Colégio Alpha'
                }
                className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none focus:border-[#2676ff]"
              />
            </div>

            <div className="flex items-center justify-between gap-3 rounded-xl apple-glass-well px-3.5 py-2.5">
              <label className="inline-flex items-center gap-2 text-xs font-semibold text-wise-ink cursor-pointer">
                <input
                  type="checkbox"
                  checked={formAllDay}
                  onChange={(e) => handleToggleAllDay(e.target.checked)}
                  className="accent-[#2676ff] w-4 h-4 rounded"
                />
                <span>Dia inteiro</span>
              </label>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-wise-mute mr-1">Cor:</span>
                {(['blue', 'cyan', 'emerald', 'amber', 'slate'] as const).map((colorKey) => {
                  const selected = formColorTag === colorKey;
                  return (
                    <button
                      key={colorKey}
                      type="button"
                      onClick={() => {
                        setFormColorTag(colorKey);
                        setColorManuallyPicked(true);
                      }}
                      title={COLOR_STYLES[colorKey].label}
                      aria-label={`Cor ${colorKey}`}
                      className={`w-5 h-5 rounded-full transition-transform ${
                        COLOR_STYLES[colorKey].swatch
                      } ${
                        selected
                          ? 'ring-2 ring-white scale-110'
                          : 'opacity-55 hover:opacity-100'
                      }`}
                    />
                  );
                })}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-wise-ink mb-1">
                  {formAllDay ? 'Data de início *' : 'Data/hora início *'}
                </label>
                <input
                  type={formAllDay ? 'date' : 'datetime-local'}
                  required
                  value={formStartAt}
                  onChange={(e) => setFormStartAt(e.target.value)}
                  className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none focus:border-[#2676ff]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-wise-ink mb-1">
                  {formAllDay ? 'Data de término' : 'Data/hora fim'}
                </label>
                <input
                  type={formAllDay ? 'date' : 'datetime-local'}
                  value={formEndAt}
                  onChange={(e) => setFormEndAt(e.target.value)}
                  className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none focus:border-[#2676ff]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-wise-ink mb-1">
                  Local / Endereço (ideal para entregas)
                </label>
                <input
                  type="text"
                  value={formLocation}
                  onChange={(e) => setFormLocation(e.target.value)}
                  placeholder="Ex: Rua das Palmeiras, 420 - Centro"
                  className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none focus:border-[#2676ff]"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-wise-ink mb-1">
                  Link da reunião (Meet / Zoom / WhatsApp)
                </label>
                <input
                  type="text"
                  value={formMeetingUrl}
                  onChange={(e) => setFormMeetingUrl(e.target.value)}
                  placeholder="https://meet.google.com/..."
                  className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none focus:border-[#2676ff]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-wise-ink mb-1">
                  Cliente vinculado
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
                  Pedido vinculado
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

              <div>
                <label className="block text-xs font-semibold text-wise-ink mb-1">
                  Responsável
                </label>
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
            </div>

            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Observações</label>
              <textarea
                rows={3}
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Detalhes de portaria, contato no local, pauta da reunião ou volumes da entrega..."
                className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none focus:border-[#2676ff]"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
              <div>
                {editingEvent ? (
                  confirmDeleteId === editingEvent.id ? (
                    <div className="inline-flex items-center gap-2">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleDeleteEvent(editingEvent.id)}
                        className="px-3.5 py-2 rounded-full bg-rose-500/30 hover:bg-rose-500/45 border border-rose-400/50 text-xs font-bold text-rose-100 disabled:opacity-50"
                      >
                        Confirmar exclusão
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="px-3 py-2 rounded-full bg-white/8 text-xs text-wise-body"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(editingEvent.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full bg-white/6 hover:bg-rose-500/20 border border-white/12 hover:border-rose-400/40 text-xs font-semibold text-wise-body hover:text-rose-100"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Excluir evento
                    </button>
                  )
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setModalOpen(false);
                    setConfirmDeleteId(null);
                  }}
                  className="px-4 py-2 rounded-full bg-white/8 hover:bg-white/14 text-xs font-semibold text-wise-body"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white disabled:opacity-50"
                >
                  {saving
                    ? 'Salvando...'
                    : editingEvent
                      ? 'Salvar alterações'
                      : 'Agendar evento'}
                </button>
              </div>
            </div>
          </form>
        )}
      </GlassModal>
    </div>
  );
}
