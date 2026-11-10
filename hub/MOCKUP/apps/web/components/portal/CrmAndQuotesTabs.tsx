'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Copy,
  FileText,
  Kanban,
  List,
  MessageSquarePlus,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  Trash2,
  UserPlus,
} from 'lucide-react';
import { formatBrl, formatDateBr, hubAsset, portalFetch, PortalApiError } from '@/lib/api-client';
import type { ModuleTabId, PortalMeResponse } from './PortalTypes';
import { EmptyStateCard, ErrorBanner, GlassModal, LoadingCard, StatusPill } from './UiPrimitives';

const PIPELINE_STAGES = [
  { key: 'novo', label: 'Novo' },
  { key: 'contato_iniciado', label: 'Contato iniciado' },
  { key: 'qualificacao', label: 'Qualificação' },
  { key: 'orcamento', label: 'Orçamento' },
  { key: 'negociacao', label: 'Negociação' },
  { key: 'ganho', label: 'Ganho' },
  { key: 'perdido', label: 'Perdido' },
] as const;

interface CustomerItem {
  id: string;
  name: string;
  document_number: string | null;
  customer_type: string;
  segment: string | null;
  city: string | null;
  state: string | null;
  origin: string | null;
  notes: string | null;
  owner_name: string | null;
  open_opportunities_count: number;
  active_orders_count: number;
  contacts: Array<{
    id: string;
    name: string;
    role_title: string | null;
    email: string | null;
    phone: string | null;
    whatsapp: string | null;
    is_primary: boolean;
  }> | null;
}

interface OpportunityItem {
  id: string;
  customer_id: string;
  customer_name: string;
  customer_type: string;
  title: string;
  stage: string;
  status: string;
  segment: string | null;
  city: string | null;
  state: string | null;
  origin: string | null;
  estimated_value_cents: string | null;
  products_of_interest: string[];
  event_date: string | null;
  next_action: string | null;
  next_action_at: string | null;
  owner_name: string | null;
  loss_reason: string | null;
  reopen_history: Array<{ reopenedAt: string; reopenedBy: string; fromStage: string; toStage: string; reason: string }>;
  notes: string | null;
  quotes_count: number;
  activities_count: number;
}

export function CrmTab({
  me,
  initialAction,
  onNavigate,
}: {
  me: PortalMeResponse;
  initialAction?: string | null;
  onNavigate: (tab: ModuleTabId, opts?: { action?: string; customerId?: string; opportunityId?: string }) => void;
}) {
  const [subTab, setSubTab] = useState<'pipeline' | 'customers'>('pipeline');
  const [viewMode, setViewMode] = useState<'kanban' | 'table'>('kanban');
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [opportunities, setOpportunities] = useState<OpportunityItem[]>([]);
  const [members, setMembers] = useState<Array<{ user_id: string; full_name: string }>>([]);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('todos');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Modals
  const [custModalOpen, setCustModalOpen] = useState(false);
  const [custName, setCustName] = useState('');
  const [custDoc, setCustDoc] = useState('');
  const [custType, setCustType] = useState('time');
  const [custSegment, setCustSegment] = useState('');
  const [custCity, setCustCity] = useState(me.activeUnit.city);
  const [custState, setCustState] = useState(me.activeUnit.state);
  const [custOrigin, setCustOrigin] = useState('Prospecção direta');
  const [contactName, setContactName] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [duplicatesWarning, setDuplicatesWarning] = useState<string | null>(null);
  const [possibleDups, setPossibleDups] = useState<Array<{ id: string; name: string; city: string | null }>>([]);

  const [oppModalOpen, setOppModalOpen] = useState(initialAction === 'new-opportunity');
  const [oppCustomerId, setOppCustomerId] = useState('');
  const [oppTitle, setOppTitle] = useState('');
  const [oppOrigin, setOppOrigin] = useState('Indicação local');
  const [oppEstValue, setOppEstValue] = useState('');
  const [oppProducts, setOppProducts] = useState('Camisa Authentic');
  const [oppEventDate, setOppEventDate] = useState('');
  const [oppNextAction, setOppNextAction] = useState('');
  const [oppOwner, setOppOwner] = useState(me.user.id);

  // Selected Opportunity Drawer
  const [selectedOpp, setSelectedOpp] = useState<{
    opportunity: OpportunityItem;
    activities: Array<{ id: string; activity_type: string; title: string; description: string | null; created_at: string; created_by_name: string | null }>;
    quotes: Array<{ id: string; quote_number: string; status: string; total_cents: string; created_at: string }>;
  } | null>(null);
  const [targetStage, setTargetStage] = useState('');
  const [lossReason, setLossReason] = useState('');
  const [reopenReason, setReopenReason] = useState('');
  const [actTitle, setActTitle] = useState('');
  const [actType, setActType] = useState<'note' | 'call' | 'whatsapp' | 'meeting' | 'email'>('whatsapp');
  const [actDesc, setActDesc] = useState('');

  // Customer Detail / Add Contact
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerItem | null>(null);
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactRole, setNewContactRole] = useState('');

  const canWrite = me.activeRole.permissions.includes('crm:write');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [custRes, oppRes, memRes] = await Promise.all([
        portalFetch<{ items: CustomerItem[] }>(`/crm/customers?search=${encodeURIComponent(search)}`),
        portalFetch<{ items: OpportunityItem[] }>(
          `/crm/opportunities?stage=${encodeURIComponent(stageFilter)}&search=${encodeURIComponent(search)}`
        ),
        portalFetch<{ members: Array<{ user_id: string; full_name: string }> }>('/auth/unit-members').catch(() => ({
          members: [],
        })),
      ]);
      setCustomers(custRes.items || []);
      setOpportunities(oppRes.items || []);
      setMembers(memRes.members || []);
      if (!oppCustomerId && custRes.items?.[0]) setOppCustomerId(custRes.items[0].id);
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao carregar dados do CRM.');
    } finally {
      setLoading(false);
    }
  }, [search, stageFilter, oppCustomerId]);

  useEffect(() => {
    loadAll();
  }, [loadAll, me.activeUnit.id]);

  // Duplicate check while typing customer name/doc/phone
  useEffect(() => {
    if (!custModalOpen) return;
    if (custName.trim().length < 3 && custDoc.trim().length < 5 && contactPhone.trim().length < 6) {
      setDuplicatesWarning(null);
      setPossibleDups([]);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const res = await portalFetch<{
          message: string | null;
          possibleDuplicates: Array<{ id: string; name: string; city: string | null }>;
        }>(
          `/crm/customers/duplicates-check?name=${encodeURIComponent(custName)}&documentNumber=${encodeURIComponent(custDoc)}&phone=${encodeURIComponent(contactPhone)}`
        );
        setDuplicatesWarning(res.message);
        setPossibleDups(res.possibleDuplicates || []);
      } catch {
        // non-blocking
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [custModalOpen, custName, custDoc, contactPhone]);

  const handleCreateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const created = await portalFetch<{ customer: { id: string } }>('/crm/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: custName.trim(),
          documentNumber: custDoc.trim() || null,
          customerType: custType,
          segment: custSegment.trim() || null,
          city: custCity.trim() || null,
          state: custState.trim().toUpperCase().slice(0, 2) || null,
          origin: custOrigin.trim() || null,
          primaryContact: contactName.trim()
            ? {
                name: contactName.trim(),
                phone: contactPhone.trim() || null,
                whatsapp: contactPhone.trim() || null,
                email: contactEmail.trim() || null,
              }
            : undefined,
        }),
      });
      setCustModalOpen(false);
      setCustName('');
      setCustDoc('');
      setContactName('');
      setContactPhone('');
      setContactEmail('');
      setFeedback('Cliente cadastrado com sucesso na carteira da unidade.');
      setOppCustomerId(created.customer.id);
      await loadAll();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao cadastrar cliente.');
    }
  };

  const handleCreateOpportunity = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const valueNum = Number(oppEstValue.replace(',', '.'));
      await portalFetch('/crm/opportunities', {
        method: 'POST',
        body: JSON.stringify({
          customerId: oppCustomerId,
          title: oppTitle.trim(),
          origin: oppOrigin.trim() || null,
          estimatedValueCents: Number.isFinite(valueNum) && valueNum > 0 ? Math.round(valueNum * 100) : null,
          productsOfInterest: oppProducts
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          eventDate: oppEventDate || null,
          nextAction: oppNextAction.trim() || null,
          ownerUserId: oppOwner || me.user.id,
        }),
      });
      setOppModalOpen(false);
      setOppTitle('');
      setOppEstValue('');
      setOppNextAction('');
      setFeedback('Oportunidade registrada no funil comercial.');
      await loadAll();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao criar oportunidade.');
    }
  };

  const openOppDetail = async (id: string) => {
    try {
      const detail = await portalFetch<{
        opportunity: OpportunityItem;
        activities: Array<{ id: string; activity_type: string; title: string; description: string | null; created_at: string; created_by_name: string | null }>;
        quotes: Array<{ id: string; quote_number: string; status: string; total_cents: string; created_at: string }>;
      }>(`/crm/opportunities/${id}`);
      setSelectedOpp(detail);
      setTargetStage(detail.opportunity.stage);
      setLossReason(detail.opportunity.loss_reason || '');
      setReopenReason('');
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao abrir oportunidade.');
    }
  };

  const handleStageUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOpp) return;
    setError(null);
    try {
      const res = await portalFetch<{ nextStepHint: string | null }>(
        `/crm/opportunities/${selectedOpp.opportunity.id}/stage`,
        {
          method: 'PATCH',
          body: JSON.stringify({
            stage: targetStage,
            lossReason: targetStage === 'perdido' ? lossReason : null,
            reopenReason:
              selectedOpp.opportunity.status !== 'open' && !['ganho', 'perdido'].includes(targetStage)
                ? reopenReason
                : null,
          }),
        }
      );
      if (res.nextStepHint) setFeedback(res.nextStepHint);
      await openOppDetail(selectedOpp.opportunity.id);
      await loadAll();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao atualizar etapa.');
    }
  };

  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOpp) return;
    try {
      await portalFetch(`/crm/opportunities/${selectedOpp.opportunity.id}/activities`, {
        method: 'POST',
        body: JSON.stringify({ activityType: actType, title: actTitle.trim(), description: actDesc.trim() || null }),
      });
      setActTitle('');
      setActDesc('');
      await openOppDetail(selectedOpp.opportunity.id);
      await loadAll();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao registrar atividade.');
    }
  };

  const handleAddContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCustomer) return;
    try {
      await portalFetch(`/crm/customers/${selectedCustomer.id}/contacts`, {
        method: 'POST',
        body: JSON.stringify({
          name: newContactName.trim(),
          roleTitle: newContactRole.trim() || null,
          phone: newContactPhone.trim() || null,
          whatsapp: newContactPhone.trim() || null,
        }),
      });
      setNewContactName('');
      setNewContactPhone('');
      setNewContactRole('');
      setSelectedCustomer(null);
      await loadAll();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao adicionar contato.');
    }
  };

  if (loading && customers.length === 0 && opportunities.length === 0) {
    return <LoadingCard message="Carregando CRM comercial da unidade..." />;
  }

  return (
    <div className="space-y-5">
      {error ? <ErrorBanner message={error} onRetry={loadAll} /> : null}
      {feedback ? (
        <div className="rounded-2xl bg-emerald-500/15 border border-emerald-400/35 px-4 py-3 text-xs font-semibold text-emerald-100 flex items-center justify-between gap-3">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline text-[11px]">
            Dispensar
          </button>
        </div>
      ) : null}

      {/* Header & Controls */}
      <div className="apple-glass rounded-3xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-wise-ink">CRM Comercial · Clientes &amp; Oportunidades</h2>
          <p className="text-xs text-wise-mute">
            Carteira isolada de clientes compradores de uniformes. Marcar &quot;Ganho&quot; não libera fábrica sem proposta, arte e grade aprovadas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canWrite ? (
            <>
              <button
                type="button"
                onClick={() => setCustModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-white/10 hover:bg-white/16 border border-white/15 text-xs font-semibold text-white"
              >
                <UserPlus className="w-4 h-4" />
                Novo cliente
              </button>
              <button
                type="button"
                onClick={() => setOppModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white"
              >
                <Plus className="w-4 h-4" />
                Nova oportunidade
              </button>
            </>
          ) : null}
        </div>
      </div>

      {/* Filters & View Switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setSubTab('pipeline')}
            className={`px-4 py-2 rounded-full text-xs font-semibold border ${
              subTab === 'pipeline'
                ? 'apple-glass-cta text-white'
                : 'bg-white/6 border-white/12 text-wise-body hover:text-white'
            }`}
          >
            Funil de Oportunidades ({opportunities.length})
          </button>
          <button
            type="button"
            onClick={() => setSubTab('customers')}
            className={`px-4 py-2 rounded-full text-xs font-semibold border ${
              subTab === 'customers'
                ? 'apple-glass-cta text-white'
                : 'bg-white/6 border-white/12 text-wise-body hover:text-white'
            }`}
          >
            Carteira de Clientes ({customers.length})
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-wise-mute absolute left-3 top-3" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar cliente ou oportunidade..."
              className="apple-glass-well rounded-full pl-9 pr-4 py-2 text-xs text-wise-ink outline-none w-56 sm:w-64"
            />
          </div>
          {subTab === 'pipeline' ? (
            <>
              <select
                value={stageFilter}
                onChange={(e) => setStageFilter(e.target.value)}
                className="apple-glass-well rounded-full px-3 py-2 text-xs text-wise-ink outline-none"
              >
                <option value="todos" className="bg-[#181818]">Todas as etapas</option>
                {PIPELINE_STAGES.map((st) => (
                  <option key={st.key} value={st.key} className="bg-[#181818]">{st.label}</option>
                ))}
              </select>
              <div className="flex items-center apple-glass-well rounded-full p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode('kanban')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${
                    viewMode === 'kanban' ? 'bg-blue-500/35 text-white' : 'text-wise-mute'
                  }`}
                >
                  <Kanban className="w-3.5 h-3.5" /> Kanban
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold inline-flex items-center gap-1 ${
                    viewMode === 'table' ? 'bg-blue-500/35 text-white' : 'text-wise-mute'
                  }`}
                >
                  <List className="w-3.5 h-3.5" /> Lista
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* SubTab: Pipeline */}
      {subTab === 'pipeline' ? (
        opportunities.length === 0 ? (
          <EmptyStateCard
            title="Nenhuma oportunidade neste filtro"
            description="Cadastre uma oportunidade vinculada a um cliente da sua unidade para iniciar o funil."
          />
        ) : viewMode === 'kanban' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-7 gap-3 overflow-x-auto pb-2">
            {PIPELINE_STAGES.map((stage) => {
              const items = opportunities.filter((o) => o.stage === stage.key);
              return (
                <div key={stage.key} className="apple-glass-subtle rounded-2xl p-3 space-y-2.5 min-w-[230px]">
                  <div className="flex items-center justify-between border-b border-white/10 pb-2">
                    <span className="text-xs font-bold text-wise-ink">{stage.label}</span>
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-wise-body font-semibold">
                      {items.length}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {items.map((opp) => (
                      <button
                        key={opp.id}
                        type="button"
                        onClick={() => openOppDetail(opp.id)}
                        className="w-full text-left rounded-2xl apple-glass-well hover:border-blue-400/50 p-3 space-y-1.5 transition-all"
                      >
                        <p className="text-xs font-bold text-wise-ink leading-snug">{opp.title}</p>
                        <p className="text-[11px] text-blue-300 font-semibold">{opp.customer_name}</p>
                        <div className="flex items-center justify-between text-[11px] text-wise-mute pt-1">
                          <span>{opp.estimated_value_cents ? formatBrl(opp.estimated_value_cents) : 'Sem estimativa'}</span>
                          <span>{opp.quotes_count} orç.</span>
                        </div>
                        {opp.next_action ? (
                          <p className="text-[10px] text-wise-body bg-white/5 rounded-lg px-2 py-1 truncate">
                            Próx.: {opp.next_action}
                          </p>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="apple-glass rounded-3xl p-4 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/12 text-[11px] uppercase text-wise-mute">
                  <th className="py-2.5 pr-3">Oportunidade</th>
                  <th className="py-2.5 pr-3">Cliente</th>
                  <th className="py-2.5 pr-3">Etapa</th>
                  <th className="py-2.5 pr-3">Valor Est.</th>
                  <th className="py-2.5 pr-3">Evento</th>
                  <th className="py-2.5 pr-3">Responsável</th>
                  <th className="py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8 text-xs">
                {opportunities.map((opp) => (
                  <tr key={opp.id} className="hover:bg-white/5">
                    <td className="py-3 pr-3 font-bold text-wise-ink">{opp.title}</td>
                    <td className="py-3 pr-3 text-wise-body">{opp.customer_name}</td>
                    <td className="py-3 pr-3"><StatusPill value={opp.stage} /></td>
                    <td className="py-3 pr-3 text-wise-ink">{opp.estimated_value_cents ? formatBrl(opp.estimated_value_cents) : '—'}</td>
                    <td className="py-3 pr-3 text-wise-mute">{formatDateBr(opp.event_date)}</td>
                    <td className="py-3 pr-3 text-wise-mute">{opp.owner_name || 'Unidade'}</td>
                    <td className="py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openOppDetail(opp.id)}
                        className="px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/16 border border-white/12 font-semibold text-white"
                      >
                        Abrir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {/* SubTab: Carteira de Clientes */}
      {subTab === 'customers' ? (
        customers.length === 0 ? (
          <EmptyStateCard
            title="Nenhum cliente encontrado"
            description="Cadastre times, escolinhas, academias, empresas ou organizadores de eventos."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {customers.map((c) => {
              const primary = c.contacts?.find((x) => x.is_primary) || c.contacts?.[0];
              return (
                <div key={c.id} className="apple-glass-subtle rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-blue-300">{c.customer_type.replace(/_/g, ' ')}</span>
                      <h3 className="text-sm font-bold text-wise-ink">{c.name}</h3>
                    </div>
                    <span className="text-[11px] text-wise-mute">{c.city ? `${c.city}/${c.state || ''}` : ''}</span>
                  </div>
                  <p className="text-xs text-wise-body">
                    {c.document_number ? `Doc: ${c.document_number} · ` : ''}
                    Origem: {c.origin || 'Não informada'}
                  </p>
                  {primary ? (
                    <p className="text-xs text-wise-mute">
                      Contato principal: <strong className="text-wise-ink">{primary.name}</strong> {primary.phone ? `· ${primary.phone}` : ''}
                    </p>
                  ) : null}
                  <div className="flex items-center justify-between pt-2 border-t border-white/10 text-[11px] text-wise-mute">
                    <span>{c.open_opportunities_count} oport. · {c.active_orders_count} pedido(s)</span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedCustomer(c)}
                        className="px-2.5 py-1 rounded-full bg-white/8 hover:bg-white/15 border border-white/12 text-white font-semibold"
                      >
                        Contatos ({c.contacts?.length || 0})
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigate('quotes', { action: 'new-quote', customerId: c.id })}
                        className="px-2.5 py-1 rounded-full apple-glass-cta text-white font-semibold"
                      >
                        Orçar
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : null}

      {/* Modal Novo Cliente com Check de Duplicidade */}
      <GlassModal
        open={custModalOpen}
        title="Cadastrar cliente"
        subtitle="Times, escolinhas, academias, empresas ou organizadores da sua região."
        onClose={() => setCustModalOpen(false)}
      >
        <form onSubmit={handleCreateCustomer} className="space-y-4">
          {duplicatesWarning ? (
            <div className="rounded-2xl bg-amber-500/15 border border-amber-400/40 p-3 space-y-1 text-xs text-amber-100">
              <p className="font-bold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                Possível duplicidade detectada (aviso informativo)
              </p>
              <p>{duplicatesWarning}</p>
              <ul className="list-disc pl-5 text-[11px]">
                {possibleDups.map((d) => (
                  <li key={d.id}>
                    {d.name} {d.city ? `(${d.city})` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Nome da instituição / equipe *</label>
              <input
                type="text"
                required
                value={custName}
                onChange={(e) => setCustName(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Tipo</label>
              <select
                value={custType}
                onChange={(e) => setCustType(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
              >
                <option value="time" className="bg-[#181818]">Time Amador / Liga</option>
                <option value="escolinha" className="bg-[#181818]">Escolinha / Colégio</option>
                <option value="academia" className="bg-[#181818]">Academia / Box</option>
                <option value="empresa" className="bg-[#181818]">Empresa / Corporativo</option>
                <option value="organizador_eventos" className="bg-[#181818]">Organizador de Eventos</option>
                <option value="atletica" className="bg-[#181818]">Atlética Universitária</option>
                <option value="outro" className="bg-[#181818]">Outro</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">CPF/CNPJ (opcional)</label>
              <input
                type="text"
                value={custDoc}
                onChange={(e) => setCustDoc(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Cidade</label>
              <input
                type="text"
                value={custCity}
                onChange={(e) => setCustCity(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">UF</label>
              <input
                type="text"
                maxLength={2}
                value={custState}
                onChange={(e) => setCustState(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none uppercase"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Segmento / Modalidade</label>
              <input
                type="text"
                value={custSegment}
                onChange={(e) => setCustSegment(e.target.value)}
                placeholder="Ex: Futebol Society, Basquete"
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Origem</label>
              <input
                type="text"
                value={custOrigin}
                onChange={(e) => setCustOrigin(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
              />
            </div>
          </div>

          <div className="rounded-2xl apple-glass-well p-3.5 space-y-3">
            <span className="text-[11px] font-bold uppercase text-wise-mute block">Contato principal</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <input
                type="text"
                placeholder="Nome do responsável"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                className="bg-black/35 border border-white/12 rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              />
              <input
                type="text"
                placeholder="WhatsApp / Telefone"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="bg-black/35 border border-white/12 rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              />
              <input
                type="email"
                placeholder="E-mail"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="bg-black/35 border border-white/12 rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setCustModalOpen(false)} className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body">
              Cancelar
            </button>
            <button type="submit" className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white">
              Salvar cliente
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Modal Nova Oportunidade */}
      <GlassModal
        open={oppModalOpen}
        title="Nova oportunidade comercial"
        subtitle="Vincule a um cliente e defina a próxima ação e data do evento."
        onClose={() => setOppModalOpen(false)}
      >
        <form onSubmit={handleCreateOpportunity} className="space-y-4">
          {customers.length === 0 ? (
            <div className="p-3 rounded-2xl bg-amber-500/15 border border-amber-400/35 text-xs text-amber-100">
              Cadastre primeiro um cliente em &quot;Novo cliente&quot; antes de abrir uma oportunidade.
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-semibold text-wise-ink mb-1">Cliente *</label>
                <select
                  required
                  value={oppCustomerId}
                  onChange={(e) => setOppCustomerId(e.target.value)}
                  className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id} className="bg-[#181818]">
                      {c.name} ({c.customer_type})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-wise-ink mb-1">Título da oportunidade *</label>
                <input
                  type="text"
                  required
                  value={oppTitle}
                  onChange={(e) => setOppTitle(e.target.value)}
                  placeholder="Ex: 40 Conjuntos Jogo Oficial 2026"
                  className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-wise-ink mb-1">Valor estimado (R$)</label>
                  <input
                    type="text"
                    value={oppEstValue}
                    onChange={(e) => setOppEstValue(e.target.value)}
                    placeholder="Ex: 3960.00"
                    className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-wise-ink mb-1">Data do evento</label>
                  <input
                    type="date"
                    value={oppEventDate}
                    onChange={(e) => setOppEventDate(e.target.value)}
                    className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-wise-ink mb-1">Origem</label>
                  <input
                    type="text"
                    value={oppOrigin}
                    onChange={(e) => setOppOrigin(e.target.value)}
                    className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-wise-ink mb-1">Produtos de interesse (vírgula)</label>
                  <input
                    type="text"
                    value={oppProducts}
                    onChange={(e) => setOppProducts(e.target.value)}
                    className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-wise-ink mb-1">Responsável</label>
                  <select
                    value={oppOwner}
                    onChange={(e) => setOppOwner(e.target.value)}
                    className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
                  >
                    {members.length === 0 ? (
                      <option value={me.user.id} className="bg-[#181818]">{me.user.fullName}</option>
                    ) : (
                      members.map((m) => (
                        <option key={m.user_id} value={m.user_id} className="bg-[#181818]">{m.full_name}</option>
                      ))
                    )}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-wise-ink mb-1">Próxima ação</label>
                <input
                  type="text"
                  value={oppNextAction}
                  onChange={(e) => setOppNextAction(e.target.value)}
                  placeholder="Ex: Enviar mockup 3D e orçamento"
                  className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOppModalOpen(false)} className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body">
                  Cancelar
                </button>
                <button type="submit" className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white">
                  Criar oportunidade
                </button>
              </div>
            </>
          )}
        </form>
      </GlassModal>

      {/* Detalhe da Oportunidade (Etapas, Motivo Perda, Reabertura, Atividades) */}
      <GlassModal
        open={Boolean(selectedOpp)}
        title={selectedOpp?.opportunity.title || 'Oportunidade'}
        subtitle={
          selectedOpp
            ? `${selectedOpp.opportunity.customer_name} · Etapa atual: ${selectedOpp.opportunity.stage}`
            : ''
        }
        onClose={() => setSelectedOpp(null)}
        maxWidthClass="max-w-3xl"
      >
        {selectedOpp ? (
          <div className="space-y-5">
            {canWrite ? (
              <form onSubmit={handleStageUpdate} className="rounded-2xl apple-glass-well p-4 space-y-3">
                <span className="text-xs font-bold text-wise-ink block">Atualizar etapa / perda / reabertura</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <select
                    value={targetStage}
                    onChange={(e) => setTargetStage(e.target.value)}
                    className="bg-black/40 border border-white/12 rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                  >
                    {PIPELINE_STAGES.map((st) => (
                      <option key={st.key} value={st.key} className="bg-[#181818]">{st.label}</option>
                    ))}
                  </select>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white"
                  >
                    Salvar etapa
                  </button>
                </div>
                {targetStage === 'perdido' ? (
                  <input
                    type="text"
                    required
                    minLength={3}
                    value={lossReason}
                    onChange={(e) => setLossReason(e.target.value)}
                    placeholder="Motivo obrigatório da perda (ex: Preço, Prazo, Concorrente)"
                    className="w-full bg-black/40 border border-rose-400/40 rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                  />
                ) : null}
                {selectedOpp.opportunity.status !== 'open' && !['ganho', 'perdido'].includes(targetStage) ? (
                  <input
                    type="text"
                    value={reopenReason}
                    onChange={(e) => setReopenReason(e.target.value)}
                    placeholder="Motivo da reabertura (ficará gravado no histórico)"
                    className="w-full bg-black/40 border border-blue-400/40 rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                  />
                ) : null}
              </form>
            ) : null}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const cid = selectedOpp.opportunity.customer_id;
                  const oid = selectedOpp.opportunity.id;
                  setSelectedOpp(null);
                  onNavigate('quotes', { action: 'new-quote', customerId: cid, opportunityId: oid });
                }}
                className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/18 border border-white/15 text-xs font-semibold text-white inline-flex items-center gap-1.5"
              >
                <FileText className="w-3.5 h-3.5" /> Gerar orçamento desta oportunidade
              </button>
            </div>

            {Array.isArray(selectedOpp.opportunity.reopen_history) && selectedOpp.opportunity.reopen_history.length > 0 ? (
              <div className="rounded-2xl bg-blue-500/10 border border-blue-400/30 p-3 text-xs space-y-1">
                <span className="font-bold text-blue-200">Histórico de reaberturas:</span>
                {selectedOpp.opportunity.reopen_history.map((rh, i) => (
                  <p key={i} className="text-[11px] text-wise-body">
                    {formatDateBr(rh.reopenedAt, { withTime: true })} por {rh.reopenedBy}: {rh.fromStage} → {rh.toStage} ({rh.reason})
                  </p>
                ))}
              </div>
            ) : null}

            {/* Timeline de atividades */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold uppercase text-wise-mute">Atividades registradas</h3>
              {canWrite ? (
                <form onSubmit={handleAddActivity} className="flex flex-col sm:flex-row gap-2">
                  <select
                    value={actType}
                    onChange={(e) => setActType(e.target.value as typeof actType)}
                    className="apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                  >
                    <option value="whatsapp" className="bg-[#181818]">WhatsApp</option>
                    <option value="call" className="bg-[#181818]">Ligação</option>
                    <option value="meeting" className="bg-[#181818]">Reunião</option>
                    <option value="email" className="bg-[#181818]">E-mail</option>
                    <option value="note" className="bg-[#181818]">Nota</option>
                  </select>
                  <input
                    type="text"
                    required
                    value={actTitle}
                    onChange={(e) => setActTitle(e.target.value)}
                    placeholder="Resumo da interação..."
                    className="flex-1 apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-full bg-white/10 hover:bg-white/18 border border-white/15 text-xs font-semibold text-white inline-flex items-center gap-1"
                  >
                    <MessageSquarePlus className="w-3.5 h-3.5" /> Registrar
                  </button>
                </form>
              ) : null}

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {selectedOpp.activities.map((a) => (
                  <div key={a.id} className="rounded-xl bg-white/5 border border-white/10 p-3 text-xs">
                    <div className="flex items-center justify-between text-[11px] text-wise-mute">
                      <span className="uppercase font-bold text-blue-300">{a.activity_type}</span>
                      <span>{formatDateBr(a.created_at, { withTime: true })}</span>
                    </div>
                    <p className="font-semibold text-wise-ink mt-0.5">{a.title}</p>
                    {a.description ? <p className="text-wise-body mt-0.5">{a.description}</p> : null}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </GlassModal>

      {/* Modal Contatos do Cliente */}
      <GlassModal
        open={Boolean(selectedCustomer)}
        title={`Contatos · ${selectedCustomer?.name || ''}`}
        onClose={() => setSelectedCustomer(null)}
        maxWidthClass="max-w-lg"
      >
        {selectedCustomer ? (
          <div className="space-y-4">
            <div className="space-y-2">
              {(selectedCustomer.contacts || []).length === 0 ? (
                <p className="text-xs text-wise-mute">Nenhum contato adicional cadastrado.</p>
              ) : (
                (selectedCustomer.contacts || []).map((ct) => (
                  <div key={ct.id} className="rounded-xl apple-glass-well p-3 text-xs flex justify-between items-center">
                    <div>
                      <p className="font-bold text-wise-ink">
                        {ct.name} {ct.is_primary ? '(Principal)' : ''}
                      </p>
                      <p className="text-wise-body">
                        {ct.role_title ? `${ct.role_title} · ` : ''}
                        {ct.phone || ct.email || 'Sem telefone'}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
            {canWrite ? (
              <form onSubmit={handleAddContact} className="space-y-2 border-t border-white/12 pt-3">
                <span className="text-xs font-bold text-wise-ink block">Adicionar novo contato</span>
                <input
                  type="text"
                  required
                  placeholder="Nome"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Cargo / Função"
                    value={newContactRole}
                    onChange={(e) => setNewContactRole(e.target.value)}
                    className="apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Telefone / WhatsApp"
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    className="apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                  />
                </div>
                <button type="submit" className="px-4 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white">
                  Salvar contato
                </button>
              </form>
            ) : null}
          </div>
        ) : null}
      </GlassModal>
    </div>
  );
}

// ============================================================================
// ABA ORÇAMENTOS / PROPOSTAS
// ============================================================================
interface CatalogProductRow {
  id: string;
  sku: string;
  name: string;
  availability_status: string;
  supply_price_cents: number | null;
  suggested_sale_price_cents: number | null;
  unit_cost_cents: number | null;
  min_quantity: number;
}

interface QuoteRow {
  id: string;
  quote_number: string;
  customer_id: string;
  customer_name: string;
  opportunity_id: string | null;
  opportunity_title: string | null;
  status: string;
  total_cents: string;
  subtotal_cents: string;
  discount_cents: string;
  shipping_cents: string;
  known_cost_cents: string | null;
  margin_on_sale_pct: string | null;
  estimation_status: 'complete' | 'incomplete';
  valid_until: string | null;
  payment_terms: string | null;
  share_token: string;
  items: Array<{
    product_id: string | null;
    product_sku: string;
    product_name: string;
    quantity: number;
    unit_sale_price_cents: number;
    personalization_summary: string | null;
    personalization_cents: number;
    line_total_cents: number;
  }>;
}

export function QuotesTab({
  me,
  initialAction,
  initialCustomerId,
  initialOpportunityId,
  onNavigate,
}: {
  me: PortalMeResponse;
  initialAction?: string | null;
  initialCustomerId?: string | null;
  initialOpportunityId?: string | null;
  onNavigate: (tab: ModuleTabId, opts?: { action?: string; fromQuote?: QuoteRow }) => void;
}) {
  const [quotes, setQuotes] = useState<QuoteRow[]>([]);
  const [customers, setCustomers] = useState<CustomerItem[]>([]);
  const [products, setProducts] = useState<CatalogProductRow[]>([]);
  const [activePriceListId, setActivePriceListId] = useState<string | null>(null);
  const [priceListName, setPriceListName] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Create quote state
  const [modalOpen, setModalOpen] = useState(initialAction === 'new-quote');
  const [customerId, setCustomerId] = useState(initialCustomerId || '');
  const [opportunityId] = useState(initialOpportunityId || '');
  const [shippingReais, setShippingReais] = useState('45.00');
  const [discountReais, setDiscountReais] = useState('0.00');
  const [paymentTerms, setPaymentTerms] = useState('50% entrada + 50% antes do despacho SP');
  const [validUntil, setValidUntil] = useState(() => new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10));
  const [deliveryDays, setDeliveryDays] = useState('15');
  const [draftItems, setDraftItems] = useState<
    Array<{
      productId: string;
      quantity: number;
      unitSalePriceReais: string;
      personalizationSummary: string;
      personalizationReais: string;
    }>
  >([]);

  const canWrite = me.activeRole.permissions.includes('quotes:write');

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [qRes, custRes, catRes] = await Promise.all([
        portalFetch<{ items: QuoteRow[] }>(
          `/quotes?status=${encodeURIComponent(statusFilter)}&search=${encodeURIComponent(search)}`
        ),
        portalFetch<{ items: CustomerItem[] }>('/crm/customers?limit=100').catch(() => ({ items: [] })),
        portalFetch<{
          activePriceList: { id: string; name: string; version_code: string } | null;
          items: CatalogProductRow[];
        }>('/catalog/products').catch(() => ({ activePriceList: null, items: [] })),
      ]);
      setQuotes(qRes.items || []);
      setCustomers(custRes.items || []);
      setProducts(catRes.items || []);
      setActivePriceListId(catRes.activePriceList?.id || null);
      setPriceListName(
        catRes.activePriceList
          ? `${catRes.activePriceList.name} (${catRes.activePriceList.version_code})`
          : 'Sem tabela configurada'
      );
      if (!customerId && custRes.items?.[0]) setCustomerId(custRes.items[0].id);
      if (draftItems.length === 0) {
        const firstSellable = (catRes.items || []).find((p) => p.availability_status !== 'legal_review');
        if (firstSellable) {
          setDraftItems([
            {
              productId: firstSellable.id,
              quantity: Math.max(10, firstSellable.min_quantity || 10),
              unitSalePriceReais: firstSellable.suggested_sale_price_cents
                ? (firstSellable.suggested_sale_price_cents / 100).toFixed(2)
                : '99.90',
              personalizationSummary: 'Escudo sublimado + nome/número costas',
              personalizationReais: '0.00',
            },
          ]);
        }
      }
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao carregar orçamentos.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, customerId, draftItems.length]);

  useEffect(() => {
    loadData();
  }, [loadData, me.activeUnit.id]);

  const handleCreateQuote = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const payloadItems = draftItems.map((it) => {
        const prod = products.find((p) => p.id === it.productId)!;
        const knownCost = prod.unit_cost_cents ?? prod.supply_price_cents ?? null;
        return {
          productId: prod.id,
          productSku: prod.sku,
          productName: prod.name,
          quantity: Math.max(1, Math.trunc(Number(it.quantity))),
          unitSalePriceCents: Math.round((Number(it.unitSalePriceReais.replace(',', '.')) || 0) * 100),
          unitSupplyCostCents: knownCost,
          personalizationSummary: it.personalizationSummary.trim() || null,
          personalizationCents: Math.round((Number(it.personalizationReais.replace(',', '.')) || 0) * 100),
        };
      });

      const created = await portalFetch<{
        quote: { quote_number: string; estimation_status: string };
      }>('/quotes', {
        method: 'POST',
        body: JSON.stringify({
          customerId,
          opportunityId: opportunityId || null,
          priceListId: activePriceListId,
          shippingCents: Math.round((Number(shippingReais.replace(',', '.')) || 0) * 100),
          discountCents: Math.round((Number(discountReais.replace(',', '.')) || 0) * 100),
          paymentTerms,
          validUntil: validUntil || null,
          estimatedDeliveryDays: Number(deliveryDays) || 15,
          items: payloadItems,
        }),
      });
      setModalOpen(false);
      setFeedback(
        `Orçamento ${created.quote.quote_number} salvo (${created.quote.estimation_status === 'incomplete' ? 'estimativa de margem incompleta por item sem custo definido' : 'cálculo completo'}).`
      );
      await loadData();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao criar orçamento.');
    }
  };

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const approvedByName =
        status === 'approved' ? window.prompt('Nome completo de quem aprovou pelo cliente:') || 'Cliente' : null;
      await portalFetch(`/quotes/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status, approvedByName }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao atualizar status da proposta.');
    }
  };

  const copyShareUrl = (token: string) => {
    const url = `${window.location.origin}${hubAsset(`/quotes/shared/${token}`)}`;
    navigator.clipboard?.writeText(url).catch(() => {});
    setFeedback(`Link público controlado copiado: ${url}`);
  };

  if (loading && quotes.length === 0) return <LoadingCard message="Carregando propostas comerciais..." />;

  return (
    <div className="space-y-5">
      {error ? <ErrorBanner message={error} onRetry={loadData} /> : null}
      {feedback ? (
        <div className="rounded-2xl bg-emerald-500/15 border border-emerald-400/35 px-4 py-3 text-xs font-semibold text-emerald-100 flex justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline">Fechar</button>
        </div>
      ) : null}

      <div className="apple-glass rounded-3xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-wise-ink">Orçamentos &amp; Propostas Comerciais</h2>
          <p className="text-xs text-wise-mute">
            Tabela vigente: <strong className="text-wise-ink">{priceListName}</strong> · Itens sem custo definido marcam &quot;Estimativa incompleta&quot; sem inventar margens.
          </p>
        </div>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full apple-glass-cta text-xs font-semibold text-white"
          >
            <Plus className="w-4 h-4" />
            Novo orçamento
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-wise-mute absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar número ou cliente..."
            className="apple-glass-well rounded-full pl-9 pr-4 py-2 text-xs text-wise-ink outline-none w-60"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="apple-glass-well rounded-full px-3.5 py-2 text-xs text-wise-ink outline-none"
        >
          <option value="todos" className="bg-[#181818]">Todos os status</option>
          <option value="draft" className="bg-[#181818]">Rascunho</option>
          <option value="sent" className="bg-[#181818]">Enviado</option>
          <option value="approved" className="bg-[#181818]">Aprovado</option>
          <option value="converted" className="bg-[#181818]">Convertido em Pedido</option>
          <option value="rejected" className="bg-[#181818]">Rejeitado</option>
        </select>
      </div>

      {quotes.length === 0 ? (
        <EmptyStateCard
          title="Nenhum orçamento registrado"
          description="Crie um orçamento comercial vinculado a um cliente para gerar PDF/link controlado."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {quotes.map((qt) => (
            <div key={qt.id} className="apple-glass-subtle rounded-2xl p-5 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-wise-ink">{qt.quote_number}</span>
                    <StatusPill value={qt.status} />
                    {qt.estimation_status === 'incomplete' ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-200 text-[11px] font-semibold">
                        Estimativa incompleta (custo unitário pendente)
                      </span>
                    ) : qt.margin_on_sale_pct !== null ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-400/30 text-emerald-200 text-[11px] font-semibold">
                        Margem bruta est.: {qt.margin_on_sale_pct}%
                      </span>
                    ) : null}
                  </div>
                  <p className="text-xs text-wise-body mt-1">
                    Cliente: <strong className="text-wise-ink">{qt.customer_name}</strong>
                    {qt.valid_until ? ` · Validade: ${formatDateBr(qt.valid_until)}` : ''}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-wise-ink">{formatBrl(qt.total_cents)}</p>
                  <p className="text-[11px] text-wise-mute">
                    Desc.: {formatBrl(qt.discount_cents)} · Frete: {formatBrl(qt.shipping_cents)}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px] text-wise-body">
                {(qt.items || []).map((it, idx) => (
                  <span key={idx} className="px-2.5 py-1 rounded-xl bg-white/5 border border-white/10">
                    {it.quantity}× {it.product_name} ({formatBrl(it.unit_sale_price_cents)}/un)
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-white/10">
                <div className="flex flex-wrap items-center gap-2">
                  <a
                    href={`/api/v1/quotes/${qt.id}/print`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white"
                  >
                    <Printer className="w-3.5 h-3.5" /> PDF / Impressão
                  </a>
                  <button
                    type="button"
                    onClick={() => copyShareUrl(qt.share_token)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full bg-white/8 hover:bg-white/15 border border-white/15 text-xs font-semibold text-white"
                  >
                    <Copy className="w-3.5 h-3.5" /> Link Cliente
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {canWrite && qt.status === 'draft' ? (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(qt.id, 'sent')}
                      className="px-3 py-1.5 rounded-full bg-blue-500/20 border border-blue-400/40 text-xs font-semibold text-blue-100"
                    >
                      Marcar Enviado
                    </button>
                  ) : null}
                  {canWrite && ['draft', 'sent'].includes(qt.status) ? (
                    <button
                      type="button"
                      onClick={() => handleStatusChange(qt.id, 'approved')}
                      className="px-3 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-xs font-semibold text-emerald-100"
                    >
                      Registrar Aceite
                    </button>
                  ) : null}
                  {qt.status !== 'converted' && me.activeRole.permissions.includes('orders:create') ? (
                    <button
                      type="button"
                      onClick={() => onNavigate('orders', { action: 'new-order-from-quote', fromQuote: qt })}
                      className="inline-flex items-center gap-1 px-3.5 py-1.5 rounded-full apple-glass-cta text-xs font-semibold text-white"
                    >
                      <ShoppingBag className="w-3.5 h-3.5" /> Converter em Pedido
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Novo Orçamento */}
      <GlassModal
        open={modalOpen}
        title="Novo orçamento comercial"
        subtitle={`Baseado em ${priceListName}. Itens sem custo exibem aviso honesto em vez de margem fictícia.`}
        onClose={() => setModalOpen(false)}
        maxWidthClass="max-w-3xl"
      >
        <form onSubmit={handleCreateQuote} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Cliente *</label>
              <select
                required
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
              >
                {customers.map((c) => (
                  <option key={c.id} value={c.id} className="bg-[#181818]">{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Validade da proposta</label>
              <input
                type="date"
                value={validUntil}
                onChange={(e) => setValidUntil(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
              />
            </div>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-wise-ink">Itens do orçamento</span>
              <button
                type="button"
                onClick={() => {
                  const first = products.find((p) => p.availability_status !== 'legal_review');
                  if (!first) return;
                  setDraftItems((prev) => [
                    ...prev,
                    {
                      productId: first.id,
                      quantity: 10,
                      unitSalePriceReais: first.suggested_sale_price_cents
                        ? (first.suggested_sale_price_cents / 100).toFixed(2)
                        : '99.90',
                      personalizationSummary: '',
                      personalizationReais: '0.00',
                    },
                  ]);
                }}
                className="text-xs font-semibold text-blue-300 hover:text-white inline-flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar item
              </button>
            </div>

            {draftItems.map((it, idx) => {
              const selProd = products.find((p) => p.id === it.productId);
              const noCost = selProd && selProd.unit_cost_cents === null && selProd.supply_price_cents === null;
              return (
                <div key={idx} className="rounded-2xl apple-glass-well p-3 space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div className="sm:col-span-2">
                      <select
                        value={it.productId}
                        onChange={(e) => {
                          const np = products.find((p) => p.id === e.target.value);
                          setDraftItems((prev) =>
                            prev.map((row, rIdx) =>
                              rIdx === idx
                                ? {
                                    ...row,
                                    productId: e.target.value,
                                    unitSalePriceReais: np?.suggested_sale_price_cents
                                      ? (np.suggested_sale_price_cents / 100).toFixed(2)
                                      : row.unitSalePriceReais,
                                  }
                                : row
                            )
                          );
                        }}
                        className="w-full bg-black/40 border border-white/12 rounded-xl px-2.5 py-2 text-xs text-wise-ink outline-none"
                      >
                        {products.map((p) => (
                          <option
                            key={p.id}
                            value={p.id}
                            disabled={p.availability_status === 'legal_review'}
                            className="bg-[#181818]"
                          >
                            {p.name} ({p.sku})
                            {p.availability_status === 'legal_review' ? ' — BLOQUEADO MARCA P03' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="number"
                      min={1}
                      value={it.quantity}
                      onChange={(e) =>
                        setDraftItems((prev) =>
                          prev.map((row, rIdx) => (rIdx === idx ? { ...row, quantity: Number(e.target.value) } : row))
                        )
                      }
                      placeholder="Qtd"
                      className="bg-black/40 border border-white/12 rounded-xl px-2.5 py-2 text-xs text-wise-ink outline-none"
                    />
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={it.unitSalePriceReais}
                        onChange={(e) =>
                          setDraftItems((prev) =>
                            prev.map((row, rIdx) =>
                              rIdx === idx ? { ...row, unitSalePriceReais: e.target.value } : row
                            )
                          )
                        }
                        placeholder="Venda R$"
                        className="w-full bg-black/40 border border-white/12 rounded-xl px-2.5 py-2 text-xs text-wise-ink outline-none"
                      />
                      {draftItems.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => setDraftItems((prev) => prev.filter((_, rIdx) => rIdx !== idx))}
                          className="p-2 text-rose-300 hover:bg-rose-500/20 rounded-xl"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={it.personalizationSummary}
                      onChange={(e) =>
                        setDraftItems((prev) =>
                          prev.map((row, rIdx) =>
                            rIdx === idx ? { ...row, personalizationSummary: e.target.value } : row
                          )
                        )
                      }
                      placeholder="Personalização (bordado, DTF, número...)"
                      className="sm:col-span-2 bg-black/40 border border-white/12 rounded-xl px-2.5 py-2 text-xs text-wise-ink outline-none"
                    />
                    <input
                      type="text"
                      value={it.personalizationReais}
                      onChange={(e) =>
                        setDraftItems((prev) =>
                          prev.map((row, rIdx) =>
                            rIdx === idx ? { ...row, personalizationReais: e.target.value } : row
                          )
                        )
                      }
                      placeholder="Adicional R$/un"
                      className="bg-black/40 border border-white/12 rounded-xl px-2.5 py-2 text-xs text-wise-ink outline-none"
                    />
                  </div>
                  {noCost ? (
                    <p className="text-[11px] text-amber-200">
                      Item sem preço/custo de fornecimento configurado nesta tabela: cálculo marcará Estimativa incompleta.
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Frete estimado (R$)</label>
              <input
                type="text"
                value={shippingReais}
                onChange={(e) => setShippingReais(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Desconto (R$)</label>
              <input
                type="text"
                value={discountReais}
                onChange={(e) => setDiscountReais(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Prazo indicativo (dias)</label>
              <input
                type="number"
                value={deliveryDays}
                onChange={(e) => setDeliveryDays(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Condições de pagamento</label>
            <input
              type="text"
              value={paymentTerms}
              onChange={(e) => setPaymentTerms(e.target.value)}
              className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body">
              Cancelar
            </button>
            <button type="submit" className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white">
              Gerar orçamento
            </button>
          </div>
        </form>
      </GlassModal>
    </div>
  );
}
