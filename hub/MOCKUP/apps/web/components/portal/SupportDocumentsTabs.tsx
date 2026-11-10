'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  CircleHelp,
  Download,
  FileLock2,
  Lock,
  MessageSquare,
  Paperclip,
  Plus,
  Send,
  ShieldCheck,
  Upload,
} from 'lucide-react';
import { fileToDataUrl, formatBrl, formatDateBr, portalFetch, PortalApiError } from '@/lib/api-client';
import type { PortalMeResponse } from './PortalTypes';
import { EmptyStateCard, ErrorBanner, GlassModal, LoadingCard, StatusPill } from './UiPrimitives';

interface SupportTicketItem {
  id: string;
  ticket_number: string;
  unit_code: string;
  unit_name: string;
  order_id: string | null;
  order_number: string | null;
  customer_id: string | null;
  customer_name: string | null;
  category: string;
  priority: string;
  status: string;
  subject: string;
  description: string;
  resolution_summary: string | null;
  rework_cost_cents: number;
  sla_due_at: string | null;
  created_at: string;
  updated_at: string;
}

interface SupportMessage {
  id: string;
  sender_name: string;
  sender_role: string;
  is_internal: boolean;
  body: string;
  attachments: Array<{ fileName: string; storagePath: string; mimeType?: string }>;
  created_at: string;
}

const TICKET_CATEGORIES = [
  'Produto',
  'Arte',
  'Produção',
  'Entrega',
  'Financeiro',
  'Sistema',
  'Documentação',
] as const;

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  franqueado: 'Franqueado',
};

const CLASSIFICATION_LABELS: Record<string, string> = {
  modelo: 'Modelo de referência',
  minuta: 'Minuta',
  aprovado: 'Aprovado',
  assinado: 'Assinado',
};

export function SupportTab({
  me,
  initialEntityId,
}: {
  me: PortalMeResponse;
  initialEntityId?: string | null;
}) {
  const [tickets, setTickets] = useState<SupportTicketItem[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [orders, setOrders] = useState<Array<{ id: string; order_number: string; customer_name: string }>>([]);
  const [statusFilter, setStatusFilter] = useState('todos');
  const [categoryFilter, setCategoryFilter] = useState('todos');
  const [scopeAll, setScopeAll] = useState(me.activeRole.scope !== 'unit');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Create ticket modal
  const [createOpen, setCreateOpen] = useState(false);
  const [category, setCategory] = useState<(typeof TICKET_CATEGORIES)[number]>('Produto');
  const [priority, setPriority] = useState<'low' | 'normal' | 'high' | 'urgent'>('normal');
  const [orderId, setOrderId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [savingTicket, setSavingTicket] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Detail modal
  const [detail, setDetail] = useState<{ ticket: SupportTicketItem; messages: SupportMessage[] } | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [replyBody, setReplyBody] = useState('');
  const [replyInternal, setReplyInternal] = useState(false);
  const [replyFile, setReplyFile] = useState<File | null>(null);
  const [nextStatus, setNextStatus] = useState('in_progress');
  const [resolutionSummary, setResolutionSummary] = useState('');
  const [reworkReais, setReworkReais] = useState('0.00');
  const [busyAction, setBusyAction] = useState(false);

  const canWrite = me.activeRole.permissions.includes('tickets:write');
  const canInternalNotes = me.activeRole.permissions.includes('tickets:internal_notes');
  const isNetworkOrFactory = me.activeRole.scope !== 'unit';

  const loadTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (statusFilter !== 'todos') qs.set('status', statusFilter);
      if (categoryFilter !== 'todos') qs.set('category', categoryFilter);
      if (isNetworkOrFactory && scopeAll) qs.set('scope', 'all');

      const [tRes, cRes, oRes] = await Promise.all([
        portalFetch<{ items: SupportTicketItem[] }>(`/support/tickets?${qs.toString()}`),
        portalFetch<{ items: Array<{ id: string; name: string }> }>('/crm/customers?limit=100').catch(() => ({ items: [] })),
        portalFetch<{ items: Array<{ id: string; order_number: string; customer_name: string }> }>('/orders').catch(() => ({ items: [] })),
      ]);
      setTickets(tRes.items || []);
      setCustomers(cRes.items || []);
      setOrders(oRes.items || []);
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao carregar chamados do SAC.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, categoryFilter, isNetworkOrFactory, scopeAll]);

  const openDetail = useCallback(async (id: string) => {
    setError(null);
    setDetailError(null);
    try {
      const res = await portalFetch<{ ticket: SupportTicketItem; messages: SupportMessage[] }>(
        `/support/tickets/${id}`
      );
      setDetail(res);
      setNextStatus(res.ticket.status);
      setResolutionSummary(res.ticket.resolution_summary || '');
      setReworkReais(((res.ticket.rework_cost_cents || 0) / 100).toFixed(2));
      setReplyBody('');
      setReplyInternal(false);
      setReplyFile(null);
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao abrir chamado.');
    }
  }, []);

  useEffect(() => {
    loadTickets();
  }, [loadTickets, me.activeUnit.id]);

  useEffect(() => {
    if (initialEntityId) {
      openDetail(initialEntityId);
    }
  }, [initialEntityId, openDetail]);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    setCreateError(null);
    if (subject.trim().length < 4) {
      setCreateError('Informe um assunto claro (mínimo 4 caracteres).');
      return;
    }
    if (description.trim().length < 6) {
      setCreateError('Descreva a ocorrência com mais detalhes (mínimo 6 caracteres).');
      return;
    }
    setSavingTicket(true);
    setError(null);
    try {
      const attachment = attachmentFile
        ? { fileName: attachmentFile.name, dataUrl: await fileToDataUrl(attachmentFile) }
        : null;
      await portalFetch('/support/tickets', {
        method: 'POST',
        body: JSON.stringify({
          orderId: orderId || null,
          customerId: customerId || null,
          category,
          priority,
          subject: subject.trim(),
          description: description.trim(),
          attachment,
        }),
      });
      setCreateOpen(false);
      setCreateError(null);
      setSubject('');
      setDescription('');
      setAttachmentFile(null);
      setFeedback('Chamado aberto com SLA registrado.');
      await loadTickets();
    } catch (err) {
      setCreateError(err instanceof PortalApiError ? err.message : 'Erro ao abrir chamado.');
    } finally {
      setSavingTicket(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    if (replyBody.trim().length < 2) {
      setDetailError('Escreva uma mensagem com pelo menos 2 caracteres antes de enviar.');
      return;
    }
    setBusyAction(true);
    setDetailError(null);
    try {
      const attachment = replyFile
        ? { fileName: replyFile.name, dataUrl: await fileToDataUrl(replyFile) }
        : null;
      await portalFetch(`/support/tickets/${detail.ticket.id}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          body: replyBody.trim(),
          isInternal: canInternalNotes ? replyInternal : false,
          attachment,
        }),
      });
      await openDetail(detail.ticket.id);
      await loadTickets();
      setFeedback('Resposta registrada no chamado.');
    } catch (err) {
      setDetailError(err instanceof PortalApiError ? err.message : 'Erro ao enviar mensagem.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleUpdateTicket = async () => {
    if (!detail) return;
    setDetailError(null);
    const parsedRework = Number(reworkReais.replace(',', '.'));
    if (reworkReais.trim() !== '' && (!Number.isFinite(parsedRework) || parsedRework < 0)) {
      setDetailError('Informe um valor numérico válido e não negativo para o custo de retrabalho.');
      return;
    }
    setBusyAction(true);
    try {
      const reworkCostCents = Math.max(0, Math.round((parsedRework || 0) * 100));
      await portalFetch(`/support/tickets/${detail.ticket.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: nextStatus,
          resolutionSummary: resolutionSummary.trim() || null,
          reworkCostCents,
        }),
      });
      await openDetail(detail.ticket.id);
      await loadTickets();
      setFeedback('Status e resumo do chamado atualizados.');
    } catch (err) {
      setDetailError(err instanceof PortalApiError ? err.message : 'Erro ao atualizar chamado.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleDownloadAttachment = async (storagePath: string) => {
    try {
      const res = await portalFetch<{ signedUrl: string }>(
        `/support/attachments/download?path=${encodeURIComponent(storagePath)}`
      );
      window.open(res.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao baixar anexo.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="apple-glass rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-wise-mute font-semibold">
            Atendimento &amp; Ocorrências Operacionais
          </p>
          <h2 className="text-xl font-bold text-wise-ink mt-1 flex items-center gap-2">
            <CircleHelp className="w-5 h-5 text-blue-400" />
            SAC &amp; Ocorrências · {me.activeUnit.name}
          </h2>
          <p className="text-xs text-wise-body mt-1">
            Acompanhe solicitações por pedido/cliente com prazo SLA, evidências privadas e histórico auditado.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isNetworkOrFactory && (
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-white/6 border border-white/15 text-xs text-wise-ink cursor-pointer">
              <input
                type="checkbox"
                checked={scopeAll}
                onChange={(e) => setScopeAll(e.target.checked)}
                className="accent-blue-500"
              />
              Ver toda a rede
            </label>
          )}
          {canWrite && (
            <button
              type="button"
              onClick={() => {
                setCreateError(null);
                setCreateOpen(true);
              }}
              className="apple-glass-cta text-white text-xs font-semibold px-4 py-2.5 rounded-full inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Abrir Chamado
            </button>
          )}
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
      {error && <ErrorBanner message={error} onRetry={loadTickets} />}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="apple-glass-well rounded-full px-3.5 py-2 text-xs text-wise-ink outline-none"
        >
          <option value="todos">Todos os status</option>
          <option value="open">Aberto</option>
          <option value="in_progress">Em tratativa</option>
          <option value="waiting_unit">Aguarda unidade</option>
          <option value="resolved">Resolvido</option>
          <option value="closed">Encerrado</option>
        </select>

        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="apple-glass-well rounded-full px-3.5 py-2 text-xs text-wise-ink outline-none"
        >
          <option value="todos">Todas as categorias</option>
          {TICKET_CATEGORIES.map((cat) => (
            <option key={cat} value={cat}>
              {cat}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <LoadingCard message="Carregando chamados e SLA..." />
      ) : tickets.length === 0 ? (
        <EmptyStateCard
          title="Nenhum chamado encontrado"
          description="Esta unidade não possui ocorrências registradas para os filtros atuais."
          action={
            canWrite ? (
              <button
                type="button"
                onClick={() => {
                  setCreateError(null);
                  setCreateOpen(true);
                }}
                className="apple-glass-cta text-white text-xs font-semibold px-4 py-2 rounded-full"
              >
                Abrir primeiro chamado
              </button>
            ) : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {tickets.map((t) => {
            const slaOverdue = t.sla_due_at && !['resolved', 'closed'].includes(t.status) && new Date(t.sla_due_at).getTime() < Date.now();
            return (
              <article
                key={t.id}
                className="apple-glass-subtle rounded-2xl p-4 border border-white/12 flex flex-wrap items-center justify-between gap-4 hover:border-white/25 transition-colors"
              >
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-blue-300">{t.ticket_number}</span>
                    <StatusPill value={t.status} />
                    <span className="px-2 py-0.5 rounded-full bg-white/8 text-[11px] font-semibold text-wise-body">
                      {t.category}
                    </span>
                    {slaOverdue && (
                      <span className="px-2 py-0.5 rounded-full bg-rose-500/20 border border-rose-400/35 text-[11px] font-semibold text-rose-200">
                        SLA vencido
                      </span>
                    )}
                    {isNetworkOrFactory && (
                      <span className="text-[11px] text-wise-mute">
                        {t.unit_code} · {t.unit_name}
                      </span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-wise-ink">{t.subject}</h3>
                  <p className="text-xs text-wise-body line-clamp-2">{t.description}</p>
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-wise-mute pt-1">
                    {t.order_number && <span>Pedido: {t.order_number}</span>}
                    {t.customer_name && <span>Cliente: {t.customer_name}</span>}
                    <span>SLA até: {formatDateBr(t.sla_due_at, { withTime: true })}</span>
                    {t.rework_cost_cents > 0 && (
                      <span className="text-amber-200">Custo retrabalho: {formatBrl(t.rework_cost_cents)}</span>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openDetail(t.id)}
                  className="apple-glass-cta text-white text-xs font-semibold px-4 py-2 rounded-full inline-flex items-center gap-1.5 shrink-0"
                >
                  <MessageSquare className="w-3.5 h-3.5" />
                  Abrir tratativa
                </button>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal Novo Chamado */}
      <GlassModal
        open={createOpen}
        title="Abrir Chamado / Ocorrência SAC"
        subtitle={`Unidade emissora: ${me.activeUnit.name} (${me.activeUnit.code})`}
        onClose={() => {
          setCreateOpen(false);
          setCreateError(null);
        }}
      >
        <form onSubmit={handleCreateTicket} className="space-y-4">
          {createError ? <ErrorBanner message={createError} /> : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Categoria</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as (typeof TICKET_CATEGORIES)[number])}
                className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              >
                {TICKET_CATEGORIES.map((c) => (
                  <option key={c} value={c} className="bg-[#181818]">
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Prioridade (SLA)</label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as 'low' | 'normal' | 'high' | 'urgent')}
                className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              >
                <option value="low" className="bg-[#181818]">Baixa (48h)</option>
                <option value="normal" className="bg-[#181818]">Normal (48h)</option>
                <option value="high" className="bg-[#181818]">Alta (12h)</option>
                <option value="urgent" className="bg-[#181818]">Urgente (4h)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Pedido relacionado (opcional)</label>
              <select
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              >
                <option value="" className="bg-[#181818]">Sem pedido vinculado</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id} className="bg-[#181818]">
                    {o.order_number} · {o.customer_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Cliente relacionado (opcional)</label>
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              >
                <option value="" className="bg-[#181818]">Sem cliente específico</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#181818]">
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Assunto</label>
            <input
              type="text"
              required
              minLength={4}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ex: Divergência de numeração no lote G do pedido KS-1042"
              className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Descrição detalhada</label>
            <textarea
              required
              minLength={6}
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva a ocorrência, peças afetadas e impacto no evento do cliente..."
              className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">
              Evidência / Foto / PDF (armazenado em bucket privado)
            </label>
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(e) => setAttachmentFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-wise-body"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCreateOpen(false);
                setCreateError(null);
              }}
              className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={savingTicket}
              className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white disabled:opacity-50"
            >
              {savingTicket ? 'Registrando...' : 'Registrar Chamado'}
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Modal Detalhe + Mensagens */}
      <GlassModal
        open={Boolean(detail)}
        title={detail ? `${detail.ticket.ticket_number} · ${detail.ticket.subject}` : ''}
        subtitle={
          detail
            ? `${detail.ticket.category} · Unidade ${detail.ticket.unit_name} · SLA ${formatDateBr(detail.ticket.sla_due_at, { withTime: true })}`
            : undefined
        }
        onClose={() => {
          setDetail(null);
          setDetailError(null);
        }}
        maxWidthClass="max-w-3xl"
      >
        {detail && (
          <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
            {detailError ? <ErrorBanner message={detailError} /> : null}
            <div className="flex flex-wrap items-center justify-between gap-2 apple-glass-well rounded-2xl p-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill value={detail.ticket.status} />
                {detail.ticket.order_number && (
                  <span className="text-xs text-wise-body">Pedido: {detail.ticket.order_number}</span>
                )}
                {detail.ticket.customer_name && (
                  <span className="text-xs text-wise-body">Cliente: {detail.ticket.customer_name}</span>
                )}
              </div>
              <span className="text-xs text-wise-mute">
                Retrabalho registrado: {formatBrl(detail.ticket.rework_cost_cents || 0)}
              </span>
            </div>

            {/* Thread de mensagens */}
            <div className="space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-wise-mute">
                Histórico de Tratativa ({detail.messages.length})
              </h4>
              {detail.messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`rounded-2xl p-3.5 border text-xs space-y-1.5 ${
                    msg.is_internal
                      ? 'bg-amber-500/10 border-amber-400/35 text-amber-50'
                      : 'bg-white/5 border-white/12 text-wise-ink'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{msg.sender_name}</span>
                      <span className="text-[11px] text-wise-mute">
                        ({ROLE_LABELS[msg.sender_role] || msg.sender_role})
                      </span>
                      {msg.is_internal && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-[10px] font-bold text-amber-200">
                          <Lock className="w-3 h-3" />
                          Nota interna da equipe (oculta para a unidade)
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-wise-mute">{formatDateBr(msg.created_at, { withTime: true })}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-wise-body leading-relaxed">{msg.body}</p>
                  {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {msg.attachments.map((att, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleDownloadAttachment(att.storagePath)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 hover:bg-white/15 border border-white/15 text-[11px] text-blue-200"
                        >
                          <Paperclip className="w-3 h-3" />
                          {att.fileName}
                          <Download className="w-3 h-3" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {canWrite && (
              <form onSubmit={handleSendMessage} className="apple-glass-well rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-wise-ink">Nova mensagem na tratativa</h4>
                <textarea
                  rows={3}
                  required
                  minLength={2}
                  value={replyBody}
                  onChange={(e) => setReplyBody(e.target.value)}
                  placeholder="Escreva a atualização, instrução ou resposta para este chamado..."
                  className="w-full bg-black/40 border border-white/12 rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                />
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <input
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(e) => setReplyFile(e.target.files?.[0] || null)}
                      className="text-[11px] text-wise-body"
                    />
                    {canInternalNotes && (
                      <label className="inline-flex items-center gap-1.5 text-xs text-amber-200 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={replyInternal}
                          onChange={(e) => setReplyInternal(e.target.checked)}
                          className="accent-amber-400"
                        />
                        Nota interna (oculta para o franqueado)
                      </label>
                    )}
                  </div>
                  <button
                    type="submit"
                    disabled={busyAction}
                    className="apple-glass-cta text-white text-xs font-semibold px-4 py-2 rounded-full inline-flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Enviar resposta
                  </button>
                </div>
              </form>
            )}

            {canWrite && (
              <div className="apple-glass-well rounded-2xl p-4 space-y-3">
                <h4 className="text-xs font-bold text-wise-ink">Encerramento &amp; Retrabalho</h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-wise-mute mb-1">Status</label>
                    <select
                      value={nextStatus}
                      onChange={(e) => setNextStatus(e.target.value)}
                      className="w-full bg-black/40 border border-white/12 rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                    >
                      <option value="open">Aberto</option>
                      <option value="in_progress">Em tratativa</option>
                      <option value="waiting_unit">Aguarda unidade</option>
                      <option value="resolved">Resolvido</option>
                      <option value="closed">Encerrado</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-wise-mute mb-1">Custo de retrabalho (R$)</label>
                    <input
                      type="text"
                      value={reworkReais}
                      onChange={(e) => setReworkReais(e.target.value)}
                      className="w-full bg-black/40 border border-white/12 rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                    />
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      disabled={busyAction}
                      onClick={handleUpdateTicket}
                      className="w-full py-2 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-xs font-semibold text-emerald-100"
                    >
                      Atualizar status
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  value={resolutionSummary}
                  onChange={(e) => setResolutionSummary(e.target.value)}
                  placeholder="Resumo da resolução adotada..."
                  className="w-full bg-black/40 border border-white/12 rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                />
              </div>
            )}
          </div>
        )}
      </GlassModal>
    </div>
  );
}

interface DocumentVersion {
  id: string;
  version_number: number;
  classification: 'modelo' | 'minuta' | 'aprovado' | 'assinado';
  file_name: string | null;
  storage_path: string | null;
  external_url: string | null;
  evidence_notes: string | null;
  created_at: string;
}

interface DocumentItem {
  id: string;
  unit_id: string | null;
  doc_category: string;
  requirement_level: string;
  title: string;
  description: string | null;
  current_classification: 'modelo' | 'minuta' | 'aprovado' | 'assinado';
  status: string;
  customer_name: string | null;
  order_number: string | null;
  valid_until: string | null;
  versions: DocumentVersion[];
}

const DOC_CATEGORY_LABELS: Record<string, string> = {
  franquia: 'Franquia & COF',
  unidade: 'Documentação da Unidade',
  contrato: 'Contrato Social / Franquia',
  termo_cliente: 'Termo de Cliente',
  aprovacao: 'Aprovação Formal',
  autorizacao: 'Autorização de Uso / Escudo',
  manual: 'Manual Operacional',
  comprovante: 'Comprovante',
};

export function DocumentsTab({ me }: { me: PortalMeResponse }) {
  const [docs, setDocs] = useState<DocumentItem[]>([]);
  const [catFilter, setCatFilter] = useState('todos');
  const [classFilter, setClassFilter] = useState('todos');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Create doc modal
  const [createOpen, setCreateOpen] = useState(false);
  const [docCategory, setDocCategory] = useState('unidade');
  const [requirementLevel, setRequirementLevel] = useState<'mandatory_onboarding' | 'mandatory_order_production' | 'reference' | 'optional'>('mandatory_onboarding');
  const [classification, setClassification] = useState<'modelo' | 'minuta' | 'aprovado' | 'assinado'>('minuta');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [evidenceNotes, setEvidenceNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [busyDocId, setBusyDocId] = useState<string | null>(null);

  // New version modal
  const [verTargetDoc, setVerTargetDoc] = useState<DocumentItem | null>(null);
  const [verClass, setVerClass] = useState<'modelo' | 'minuta' | 'aprovado' | 'assinado'>('minuta');
  const [verNotes, setVerNotes] = useState('');
  const [verFile, setVerFile] = useState<File | null>(null);
  const [verError, setVerError] = useState<string | null>(null);

  const canWrite = me.activeRole.permissions.includes('documents:write');
  const canApprove = me.activeRole.permissions.includes('documents:approve');

  const loadDocs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (catFilter !== 'todos') qs.set('category', catFilter);
      if (classFilter !== 'todos') qs.set('classification', classFilter);
      const res = await portalFetch<{ items: DocumentItem[] }>(`/documents?${qs.toString()}`);
      setDocs(res.items || []);
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao listar cofre documental.');
    } finally {
      setLoading(false);
    }
  }, [catFilter, classFilter]);

  useEffect(() => {
    loadDocs();
  }, [loadDocs, me.activeUnit.id]);

  const handleCreateDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    if (title.trim().length < 3) {
      setCreateError('Informe um título para o documento (mínimo 3 caracteres).');
      return;
    }
    setSaving(true);
    try {
      const uploaded = file ? { fileName: file.name, dataUrl: await fileToDataUrl(file) } : null;
      await portalFetch('/documents', {
        method: 'POST',
        body: JSON.stringify({
          docCategory,
          requirementLevel,
          title: title.trim(),
          description: description.trim() || null,
          classification,
          evidenceNotes: evidenceNotes.trim() || null,
          file: uploaded,
        }),
      });
      setCreateOpen(false);
      setCreateError(null);
      setTitle('');
      setDescription('');
      setEvidenceNotes('');
      setFile(null);
      setFeedback('Documento registrado no cofre privado da unidade.');
      await loadDocs();
    } catch (err) {
      setCreateError(err instanceof PortalApiError ? err.message : 'Erro ao salvar documento.');
    } finally {
      setSaving(false);
    }
  };

  const handleUploadVersion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verTargetDoc) return;
    setSaving(true);
    setVerError(null);
    try {
      const uploaded = verFile ? { fileName: verFile.name, dataUrl: await fileToDataUrl(verFile) } : null;
      await portalFetch(`/documents/${verTargetDoc.id}/versions`, {
        method: 'POST',
        body: JSON.stringify({
          classification: verClass,
          evidenceNotes: verNotes.trim() || null,
          file: uploaded,
        }),
      });
      setVerTargetDoc(null);
      setVerError(null);
      setVerNotes('');
      setVerFile(null);
      setFeedback('Nova versão documental adicionada.');
      await loadDocs();
    } catch (err) {
      setVerError(err instanceof PortalApiError ? err.message : 'Erro ao enviar versão.');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (docId: string, status: 'approved' | 'signed' | 'rejected') => {
    setBusyDocId(docId);
    setError(null);
    try {
      await portalFetch(`/documents/${docId}/status`, {
        method: 'POST',
        body: JSON.stringify({
          status,
          classification: status === 'signed' ? 'assinado' : status === 'approved' ? 'aprovado' : undefined,
        }),
      });
      setFeedback('Status documental atualizado com carimbo de auditoria.');
      await loadDocs();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao atualizar status documental.');
    } finally {
      setBusyDocId(null);
    }
  };

  const handleDownloadVersion = async (docId: string, verId: string) => {
    try {
      const res = await portalFetch<{ signedUrl: string }>(`/documents/${docId}/versions/${verId}/download`);
      window.open(res.signedUrl, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao gerar link assinado.');
    }
  };

  return (
    <div className="space-y-5">
      <div className="apple-glass rounded-3xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.16em] text-wise-mute font-semibold">
            Cofre Documental &amp; Evidências Legais
          </p>
          <h2 className="text-xl font-bold text-wise-ink mt-1 flex items-center gap-2">
            <FileLock2 className="w-5 h-5 text-blue-400" />
            Documentos, Modelos &amp; Termos · {me.activeUnit.name}
          </h2>
          <p className="text-xs text-wise-body mt-1">
            Separação explícita entre <strong>Modelo de Referência</strong>, <strong>Minuta</strong>,{' '}
            <strong>Aprovado</strong> e <strong>Assinado</strong> — armazenamento privado via Supabase Storage.
          </p>
        </div>

        {canWrite && (
          <button
            type="button"
            onClick={() => {
              setCreateError(null);
              setCreateOpen(true);
            }}
            className="apple-glass-cta text-white text-xs font-semibold px-4 py-2.5 rounded-full inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            Enviar Documento
          </button>
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
      {error && <ErrorBanner message={error} onRetry={loadDocs} />}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value)}
          className="apple-glass-well rounded-full px-3.5 py-2 text-xs text-wise-ink outline-none"
        >
          <option value="todos">Todas as categorias</option>
          {Object.entries(DOC_CATEGORY_LABELS).map(([k, label]) => (
            <option key={k} value={k}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={classFilter}
          onChange={(e) => setClassFilter(e.target.value)}
          className="apple-glass-well rounded-full px-3.5 py-2 text-xs text-wise-ink outline-none"
        >
          <option value="todos">Todas classificações</option>
          <option value="modelo">Modelo de Referência</option>
          <option value="minuta">Minuta em Revisão</option>
          <option value="aprovado">Aprovado</option>
          <option value="assinado">Assinado / Válido</option>
        </select>
      </div>

      {loading ? (
        <LoadingCard message="Carregando cofre documental..." />
      ) : docs.length === 0 ? (
        <EmptyStateCard
          title="Nenhum documento encontrado"
          description="Envie contratos sociais, termos de autorização de escudos ou comprovantes vinculados à unidade."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {docs.map((doc) => {
            const latestVer = doc.versions?.[0];
            const isNetworkTemplate = doc.unit_id === null;
            return (
              <article
                key={doc.id}
                className="apple-glass-subtle rounded-2xl p-4 border border-white/12 flex flex-wrap items-start justify-between gap-4"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2 py-0.5 rounded-full bg-white/10 text-[11px] font-semibold text-wise-ink">
                      {DOC_CATEGORY_LABELS[doc.doc_category] || doc.doc_category}
                    </span>
                    <StatusPill value={doc.status} />
                    <span className="px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-400/30 text-[11px] font-semibold text-blue-200">
                      {CLASSIFICATION_LABELS[doc.current_classification] || doc.current_classification}
                    </span>
                    {doc.requirement_level === 'mandatory_onboarding' && (
                      <span className="px-2 py-0.5 rounded-full bg-amber-500/15 border border-amber-400/30 text-[10px] font-semibold text-amber-200">
                        Obrigatório Implantação
                      </span>
                    )}
                    {isNetworkTemplate && (
                      <span className="text-[11px] text-wise-mute">Padrão da Franqueadora</span>
                    )}
                  </div>
                  <h3 className="text-sm font-bold text-wise-ink">{doc.title}</h3>
                  {doc.description && <p className="text-xs text-wise-body">{doc.description}</p>}
                  <div className="flex flex-wrap items-center gap-3 text-[11px] text-wise-mute">
                    <span>{doc.versions?.length || 0} versão(ões)</span>
                    {doc.order_number && <span>Pedido: {doc.order_number}</span>}
                    {doc.customer_name && <span>Cliente: {doc.customer_name}</span>}
                    {doc.valid_until && <span>Validade: {formatDateBr(doc.valid_until)}</span>}
                  </div>
                  {latestVer?.evidence_notes && (
                    <p className="text-[11px] text-wise-body bg-white/5 border border-white/10 rounded-xl px-2.5 py-1.5 mt-1">
                      v{latestVer.version_number}: {latestVer.evidence_notes}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {latestVer && (latestVer.storage_path || latestVer.external_url) && (
                    <button
                      type="button"
                      onClick={() => handleDownloadVersion(doc.id, latestVer.id)}
                      className="px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/14 border border-white/15 text-xs font-semibold text-wise-ink inline-flex items-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Baixar v{latestVer.version_number}
                    </button>
                  )}

                  {canWrite && (!isNetworkTemplate || me.activeRole.scope === 'network') && (
                    <button
                      type="button"
                      onClick={() => {
                        setVerTargetDoc(doc);
                        setVerClass(doc.current_classification);
                        setVerError(null);
                      }}
                      className="px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/14 border border-white/15 text-xs font-semibold text-wise-ink inline-flex items-center gap-1.5"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      Nova versão
                    </button>
                  )}

                  {canApprove && doc.status !== 'signed' && (
                    <button
                      type="button"
                      disabled={busyDocId === doc.id}
                      onClick={() => handleStatusChange(doc.id, 'signed')}
                      className="px-3 py-1.5 rounded-full bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-400/35 text-xs font-semibold text-emerald-100 inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      {busyDocId === doc.id ? 'Validando...' : 'Validar / Assinado'}
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Modal Novo Documento */}
      <GlassModal
        open={createOpen}
        title="Enviar Documento ao Cofre Privado"
        subtitle="Anexos são gravados no bucket privado Supabase com acesso auditado por unidade."
        onClose={() => {
          setCreateOpen(false);
          setCreateError(null);
        }}
      >
        <form onSubmit={handleCreateDoc} className="space-y-4">
          {createError ? <ErrorBanner message={createError} /> : null}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Categoria</label>
              <select
                value={docCategory}
                onChange={(e) => setDocCategory(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              >
                {Object.entries(DOC_CATEGORY_LABELS).map(([k, label]) => (
                  <option key={k} value={k}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Classificação jurídica</label>
              <select
                value={classification}
                onChange={(e) => setClassification(e.target.value as 'modelo' | 'minuta' | 'aprovado' | 'assinado')}
                className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              >
                <option value="minuta">Minuta (rascunho / revisão)</option>
                <option value="modelo">Modelo de referência</option>
                <option value="aprovado">Aprovado</option>
                <option value="assinado">Assinado / Válido</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Obrigatoriedade</label>
            <select
              value={requirementLevel}
              onChange={(e) =>
                setRequirementLevel(
                  e.target.value as 'mandatory_onboarding' | 'mandatory_order_production' | 'reference' | 'optional'
                )
              }
              className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
            >
              <option value="mandatory_onboarding">Obrigatório para Implantação da Unidade</option>
              <option value="mandatory_order_production">Obrigatório para Produção (Autorização de Marca)</option>
              <option value="reference">Material de Referência</option>
              <option value="optional">Opcional</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Título do documento</label>
            <input
              type="text"
              required
              minLength={3}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Contrato Social CNPJ SP-01 / Autorização Uso de Escudo"
              className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Descrição / Referência</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Notas de evidência / protocolo</label>
            <input
              type="text"
              value={evidenceNotes}
              onChange={(e) => setEvidenceNotes(e.target.value)}
              placeholder="Ex: Assinado digitalmente pelo sócio administrador via Gov.br"
              className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Arquivo PDF ou Imagem</label>
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-wise-body"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCreateOpen(false);
                setCreateError(null);
              }}
              className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white"
            >
              {saving ? 'Enviando...' : 'Salvar Documento'}
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Modal Nova Versão Documental */}
      <GlassModal
        open={Boolean(verTargetDoc)}
        title={verTargetDoc ? `Nova versão · ${verTargetDoc.title}` : ''}
        onClose={() => {
          setVerTargetDoc(null);
          setVerError(null);
        }}
      >
        <form onSubmit={handleUploadVersion} className="space-y-4">
          {verError ? <ErrorBanner message={verError} /> : null}
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Classificação desta versão</label>
            <select
              value={verClass}
              onChange={(e) => setVerClass(e.target.value as 'modelo' | 'minuta' | 'aprovado' | 'assinado')}
              className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
            >
              <option value="minuta" className="bg-[#181818]">Minuta</option>
              <option value="aprovado" className="bg-[#181818]">Aprovado</option>
              <option value="assinado" className="bg-[#181818]">Assinado</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Observações da revisão</label>
            <input
              type="text"
              value={verNotes}
              onChange={(e) => setVerNotes(e.target.value)}
              className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Arquivo</label>
            <input
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => setVerFile(e.target.files?.[0] || null)}
              className="w-full text-xs text-wise-body"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setVerTargetDoc(null);
                setVerError(null);
              }}
              className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body"
            >
              Cancelar
            </button>
            <button type="submit" disabled={saving} className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white">
              {saving ? 'Enviando...' : 'Publicar versão'}
            </button>
          </div>
        </form>
      </GlassModal>
    </div>
  );
}
