'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Factory,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Truck,
  XCircle,
} from 'lucide-react';
import { formatBrl, formatDateBr, portalFetch, PortalApiError } from '@/lib/api-client';
import type { PortalMeResponse } from './PortalTypes';
import { EmptyStateCard, ErrorBanner, GlassModal, LoadingCard, StatusPill } from './UiPrimitives';

interface OrderSummary {
  id: string;
  order_number: string;
  unit_code: string;
  unit_name: string;
  customer_name: string;
  commercial_status: string;
  financial_status: string;
  approval_status: string;
  production_status: string;
  logistics_status: string;
  grade_approved: boolean;
  production_released: boolean;
  total_cents: string;
  total_pieces: number;
  event_date: string | null;
  estimated_delivery_date: string | null;
  release_block_reasons: string[];
  art_project_id: string | null;
  art_project_title: string | null;
  approved_art_version_number: number | null;
}

interface OrderDetailResponse {
  order: OrderSummary & {
    delivery_address: Record<string, string>;
    shipping_method: string | null;
    factory_accepted: boolean;
    grade_approved_by: string | null;
    grade_approved_at: string | null;
    notes: string | null;
  };
  items: Array<{ id: string; product_sku: string; product_name: string; quantity: number; unit_price_cents: string; line_total_cents: string }>;
  personalizations: Array<{
    id?: string;
    size_code: string;
    player_name: string | null;
    player_number: string | null;
    shield_or_sponsor_notes: string | null;
    quantity: number;
  }>;
  productionEvents: Array<{ id: string; stage_code: string; status_label: string; notes: string | null; recorded_by_name: string | null; created_at: string }>;
  shipments: Array<{ id: string; carrier_name: string | null; tracking_code: string | null; status: string; receiver_name: string | null; dispatched_at: string | null; delivered_at: string | null }>;
  receivables: Array<{ id: string; description: string; due_date: string; amount_cents: string; paid_cents: string; status: string }>;
  releaseGate: {
    canRelease: boolean;
    checks: Array<{ key: string; label: string; passed: boolean; required: boolean; message: string }>;
    blockers: string[];
  };
}

const ART_STATUS_LABELS: Record<string, string> = {
  briefing_pendente: 'Briefing pendente',
  em_criacao: 'Em criação',
  revisao_interna: 'Revisão interna',
  enviado_ao_cliente: 'Enviado ao cliente',
  ajustes: 'Ajustes solicitados',
  aprovado: 'Aprovado',
};

export interface InitialQuoteConversion {
  id: string;
  customer_id: string;
  customer_name: string;
  opportunity_id: string | null;
  shipping_cents: string;
  discount_cents: string;
  items: Array<{
    product_id: string | null;
    product_sku: string;
    product_name: string;
    quantity: number;
    unit_sale_price_cents: number;
  }>;
}

export function OrdersTab({
  me,
  initialEntityId,
  initialQuote,
}: {
  me: PortalMeResponse;
  initialEntityId?: string | null;
  initialQuote?: InitialQuoteConversion | null;
}) {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string }>>([]);
  const [arts, setArts] = useState<Array<{ id: string; title: string; status: string }>>([]);
  const [products, setProducts] = useState<Array<{ id: string; sku: string; name: string; availability_status: string; suggested_sale_price_cents: number | null }>>([]);
  const [search, setSearch] = useState('');
  const [prodFilter, setProdFilter] = useState('todos');
  const [factoryScopeAll, setFactoryScopeAll] = useState(me.activeRole.scope !== 'unit');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Detail modal
  const [detail, setDetail] = useState<OrderDetailResponse | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [gradeRows, setGradeRows] = useState<
    Array<{ sizeCode: string; playerName: string; playerNumber: string; shieldOrSponsorNotes: string; quantity: number }>
  >([]);
  const [linkArtId, setLinkArtId] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [overrideModal, setOverrideModal] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [overrideError, setOverrideError] = useState<string | null>(null);

  // Approve Grade / Cancel Order Modals (replacing window.prompt)
  const [gradeApproveOpen, setGradeApproveOpen] = useState(false);
  const [gradeApproverName, setGradeApproverName] = useState(me.user.fullName || '');
  const [gradeApproveError, setGradeApproveError] = useState<string | null>(null);
  const [approvingGrade, setApprovingGrade] = useState(false);

  const [cancelOrderOpen, setCancelOrderOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelingOrder, setCancelingOrder] = useState(false);

  // Action busy flags
  const [savingDetails, setSavingDetails] = useState(false);
  const [savingGrade, setSavingGrade] = useState(false);
  const [releasingProd, setReleasingProd] = useState(false);
  const [factoryAccepting, setFactoryAccepting] = useState(false);
  const [advancingPcp, setAdvancingPcp] = useState(false);
  const [savingShipment, setSavingShipment] = useState(false);

  // Factory / PCP actions state
  const [pcpStage, setPcpStage] = useState('sublimation');
  const [pcpNotes, setPcpNotes] = useState('');
  const [shipStatus, setShipStatus] = useState('dispatched');
  const [shipCarrier, setShipCarrier] = useState('Jadlog Expresso');
  const [shipTracking, setShipTracking] = useState('');
  const [shipReceiver, setShipReceiver] = useState('');

  // Create order modal
  const [createOpen, setCreateOpen] = useState(Boolean(initialQuote));
  const [newCustomerId, setNewCustomerId] = useState(initialQuote?.customer_id || '');
  const [newArtId, setNewArtId] = useState('');
  const [newProductId, setNewProductId] = useState('');
  const [newQty, setNewQty] = useState(20);
  const [newPriceReais, setNewPriceReais] = useState('99.90');
  const [newCity, setNewCity] = useState(me.activeUnit.city);
  const [newStreet, setNewStreet] = useState('');
  const [newEventDate, setNewEventDate] = useState('');
  const [creatingOrder, setCreatingOrder] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const canCreate = me.activeRole.permissions.includes('orders:create');
  const isFactoryOrNetwork = me.activeRole.scope === 'factory' || me.activeRole.scope === 'network';
  const canAdvanceFactory = isFactoryOrNetwork && me.activeRole.permissions.includes('production:advance_stage');
  const canOverride = me.activeRole.permissions.includes('orders:override_release');
  const canLogistics = isFactoryOrNetwork && me.activeRole.permissions.includes('logistics:manage');

  const loadList = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (prodFilter !== 'todos') qs.set('productionStatus', prodFilter);
      if (search.trim()) qs.set('search', search.trim());
      if (factoryScopeAll && isFactoryOrNetwork) qs.set('scope', 'all');

      const [ordRes, custRes, artRes, catRes] = await Promise.all([
        portalFetch<{ items: OrderSummary[] }>(`/orders?${qs.toString()}`),
        portalFetch<{ items: Array<{ id: string; name: string }> }>('/crm/customers?limit=100').catch(() => ({ items: [] })),
        portalFetch<{ items: Array<{ id: string; title: string; status: string }> }>('/arts').catch(() => ({ items: [] })),
        portalFetch<{ items: Array<{ id: string; sku: string; name: string; availability_status: string; suggested_sale_price_cents: number | null }> }>('/catalog/products').catch(() => ({ items: [] })),
      ]);
      setOrders(ordRes.items || []);
      setCustomers(custRes.items || []);
      setArts(artRes.items || []);
      const sellable = (catRes.items || []).filter((p) => p.availability_status !== 'legal_review');
      setProducts(sellable);
      if (!newCustomerId && custRes.items?.[0]) setNewCustomerId(custRes.items[0].id);
      if (!newProductId && sellable[0]) {
        setNewProductId(sellable[0].id);
        if (sellable[0].suggested_sale_price_cents) {
          setNewPriceReais((sellable[0].suggested_sale_price_cents / 100).toFixed(2));
        }
      }
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao listar pedidos.');
    } finally {
      setLoading(false);
    }
  }, [prodFilter, search, factoryScopeAll, isFactoryOrNetwork, newCustomerId, newProductId]);

  const openDetail = useCallback(async (id: string) => {
    setError(null);
    setDetailError(null);
    try {
      const d = await portalFetch<OrderDetailResponse>(`/orders/${id}`);
      setDetail(d);
      setLinkArtId(d.order.art_project_id || '');
      setDeliveryCity(d.order.delivery_address?.city || '');
      setDeliveryStreet(d.order.delivery_address?.street || '');
      setGradeRows(
        (d.personalizations || []).map((p) => ({
          sizeCode: p.size_code,
          playerName: p.player_name || '',
          playerNumber: p.player_number || '',
          shieldOrSponsorNotes: p.shield_or_sponsor_notes || '',
          quantity: p.quantity,
        }))
      );
    } catch (err) {
      setError(err instanceof PortalApiError ? err.message : 'Erro ao carregar pedido.');
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList, me.activeUnit.id]);

  useEffect(() => {
    if (initialEntityId) openDetail(initialEntityId);
  }, [initialEntityId, openDetail]);

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError(null);
    setError(null);

    if (!initialQuote) {
      if (!newCustomerId) {
        setCreateError('Cadastre e selecione um cliente antes de criar o pedido.');
        return;
      }
      if (!newProductId) {
        setCreateError('Selecione um produto disponível do catálogo.');
        return;
      }
    }
    if (newCity.trim().length < 2 || newStreet.trim().length < 3) {
      setCreateError('Informe a cidade e o endereço completo de entrega.');
      return;
    }

    let items: Array<{
      productId: string | null;
      productSku: string;
      productName: string;
      sizeBreakdown: Record<string, number>;
      quantity: number;
      unitPriceCents: number;
    }>;

    if (initialQuote) {
      items = initialQuote.items.map((it) => ({
        productId: it.product_id,
        productSku: it.product_sku,
        productName: it.product_name,
        sizeBreakdown: { M: Math.ceil(it.quantity / 2), G: Math.floor(it.quantity / 2) },
        quantity: it.quantity,
        unitPriceCents: it.unit_sale_price_cents,
      }));
    } else {
      const p = products.find((x) => x.id === newProductId);
      if (!p) {
        setCreateError('Produto selecionado não encontrado no catálogo disponível.');
        return;
      }
      const qty = Math.trunc(Number(newQty));
      const unitPriceCents = Math.round((Number(newPriceReais.replace(',', '.')) || 0) * 100);
      if (!Number.isFinite(qty) || qty < 1) {
        setCreateError('Informe uma quantidade válida (mínimo 1 peça).');
        return;
      }
      if (!Number.isFinite(unitPriceCents) || unitPriceCents <= 0) {
        setCreateError('Informe um valor unitário maior que zero.');
        return;
      }
      items = [
        {
          productId: p.id,
          productSku: p.sku,
          productName: p.name,
          sizeBreakdown: { M: Math.ceil(qty / 2), G: Math.floor(qty / 2) },
          quantity: qty,
          unitPriceCents,
        },
      ];
    }

    setCreatingOrder(true);
    try {
      const created = await portalFetch<{ order: { id: string; order_number: string }; releaseGate: { blockers: string[] } }>(
        '/orders',
        {
          method: 'POST',
          body: JSON.stringify({
            customerId: initialQuote?.customer_id || newCustomerId,
            opportunityId: initialQuote?.opportunity_id || null,
            quoteId: initialQuote?.id || null,
            artProjectId: newArtId || null,
            shippingCents: initialQuote ? Number(initialQuote.shipping_cents) : 0,
            discountCents: initialQuote ? Number(initialQuote.discount_cents) : 0,
            deliveryAddress: { city: newCity.trim(), street: newStreet.trim() },
            eventDate: newEventDate || null,
            items,
          }),
        }
      );
      setCreateOpen(false);
      setFeedback(
        `Pedido ${created.order.order_number} criado. Bloqueios atuais antes da produção SP: ${created.releaseGate.blockers.length}.`
      );
      await loadList();
      await openDetail(created.order.id);
    } catch (err) {
      setCreateError(err instanceof PortalApiError ? err.message : 'Erro ao criar pedido.');
    } finally {
      setCreatingOrder(false);
    }
  };

  const handleSaveOrderDetails = async () => {
    if (!detail) return;
    setSavingDetails(true);
    setDetailError(null);
    setError(null);
    try {
      await portalFetch(`/orders/${detail.order.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          artProjectId: linkArtId || null,
          deliveryAddress: {
            ...detail.order.delivery_address,
            city: deliveryCity.trim(),
            street: deliveryStreet.trim(),
          },
        }),
      });
      setFeedback('Vínculo de arte e dados de entrega atualizados.');
      await openDetail(detail.order.id);
      await loadList();
    } catch (err) {
      setDetailError(err instanceof PortalApiError ? err.message : 'Erro ao atualizar dados do pedido.');
    } finally {
      setSavingDetails(false);
    }
  };

  const handleSaveGrade = async () => {
    if (!detail) return;
    setSavingGrade(true);
    setDetailError(null);
    setError(null);
    try {
      await portalFetch(`/orders/${detail.order.id}/personalizations`, {
        method: 'PUT',
        body: JSON.stringify({ personalizations: gradeRows }),
      });
      setFeedback('Grade salva! Como houve alteração na grade, registre a aprovação nominal da grade.');
      await openDetail(detail.order.id);
    } catch (err) {
      setDetailError(err instanceof PortalApiError ? err.message : 'Erro ao salvar grade.');
    } finally {
      setSavingGrade(false);
    }
  };

  const handleConfirmApproveGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    if (gradeApproverName.trim().length < 2) {
      setGradeApproveError('Informe o nome completo de quem conferiu e aprovou a grade (mínimo 2 caracteres).');
      return;
    }
    setApprovingGrade(true);
    setGradeApproveError(null);
    try {
      await portalFetch(`/orders/${detail.order.id}/approve-grade`, {
        method: 'POST',
        body: JSON.stringify({
          approvedByName: gradeApproverName.trim(),
          acceptanceEvidence: 'Conferência completa de tamanhos, nomes e números no Portal King Sports',
        }),
      });
      setGradeApproveOpen(false);
      setFeedback('Grade e personalizações formalmente aprovadas.');
      await openDetail(detail.order.id);
      await loadList();
    } catch (err) {
      setGradeApproveError(err instanceof PortalApiError ? err.message : 'Erro ao aprovar grade.');
    } finally {
      setApprovingGrade(false);
    }
  };

  const handleReleaseProduction = async (override = false) => {
    if (!detail) return;
    if (override && overrideReason.trim().length < 4) {
      setOverrideError('Descreva a justificativa obrigatória para exceção auditada (mínimo 4 caracteres).');
      return;
    }
    setReleasingProd(true);
    setDetailError(null);
    setOverrideError(null);
    setError(null);
    try {
      await portalFetch(`/orders/${detail.order.id}/release-production`, {
        method: 'POST',
        body: JSON.stringify({ override, overrideReason: override ? overrideReason.trim() : undefined }),
      });
      setOverrideModal(false);
      setOverrideReason('');
      setFeedback('Pedido validado e liberado na fila produtiva da Fábrica SP!');
      await openDetail(detail.order.id);
      await loadList();
    } catch (err) {
      if (err instanceof PortalApiError && err.statusCode === 422) {
        const msg = 'Gatekeeper bloqueou a liberação para fábrica: resolva os itens pendentes destacados abaixo.';
        if (override) {
          setOverrideError(msg);
        } else {
          setDetailError(msg);
        }
        await openDetail(detail.order.id);
      } else {
        const msg = err instanceof PortalApiError ? err.message : 'Erro ao solicitar liberação.';
        if (override) setOverrideError(msg);
        else setDetailError(msg);
      }
    } finally {
      setReleasingProd(false);
    }
  };

  const handleFactoryAccept = async () => {
    if (!detail) return;
    setFactoryAccepting(true);
    setDetailError(null);
    try {
      await portalFetch(`/orders/${detail.order.id}/factory-accept`, {
        method: 'POST',
        body: JSON.stringify({ capacityOk: true }),
      });
      setFeedback('Aceite fabril e capacidade confirmados pelo PCP São Paulo.');
      await openDetail(detail.order.id);
    } catch (err) {
      setDetailError(err instanceof PortalApiError ? err.message : 'Erro ao registrar aceite fabril.');
    } finally {
      setFactoryAccepting(false);
    }
  };

  const handleAdvancePcpStage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    setAdvancingPcp(true);
    setDetailError(null);
    try {
      await portalFetch(`/orders/${detail.order.id}/production-stage`, {
        method: 'POST',
        body: JSON.stringify({ stageCode: pcpStage, notes: pcpNotes.trim() || null }),
      });
      setPcpNotes('');
      setFeedback('Etapa industrial em SP atualizada com carimbo.');
      await openDetail(detail.order.id);
      await loadList();
    } catch (err) {
      setDetailError(err instanceof PortalApiError ? err.message : 'Erro ao avançar etapa.');
    } finally {
      setAdvancingPcp(false);
    }
  };

  const handleRegisterShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    if (shipStatus === 'delivered' && shipReceiver.trim().length < 2) {
      setDetailError('Informe o nome completo de quem recebeu a entrega para concluir.');
      return;
    }
    setSavingShipment(true);
    setDetailError(null);
    try {
      await portalFetch(`/orders/${detail.order.id}/shipment`, {
        method: 'POST',
        body: JSON.stringify({
          status: shipStatus,
          carrierName: shipCarrier.trim() || null,
          trackingCode: shipTracking.trim() || null,
          receiverName: shipStatus === 'delivered' ? shipReceiver.trim() : null,
        }),
      });
      setFeedback('Movimentação logística atualizada.');
      await openDetail(detail.order.id);
      await loadList();
    } catch (err) {
      setDetailError(err instanceof PortalApiError ? err.message : 'Erro ao atualizar logística.');
    } finally {
      setSavingShipment(false);
    }
  };

  const handleConfirmCancelOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detail) return;
    if (cancelReason.trim().length < 4) {
      setCancelError('Informe o motivo obrigatório do cancelamento (mínimo 4 caracteres).');
      return;
    }
    setCancelingOrder(true);
    setCancelError(null);
    try {
      await portalFetch(`/orders/${detail.order.id}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: cancelReason.trim() }),
      });
      setCancelOrderOpen(false);
      setCancelReason('');
      setDetail(null);
      setFeedback('Pedido cancelado preservando histórico e auditoria.');
      await loadList();
    } catch (err) {
      setCancelError(err instanceof PortalApiError ? err.message : 'Não foi possível cancelar o pedido.');
    } finally {
      setCancelingOrder(false);
    }
  };

  if (loading && orders.length === 0) return <LoadingCard message="Carregando pedidos e rastreio PCP SP..." />;

  return (
    <div className="space-y-5">
      {error ? <ErrorBanner message={error} onRetry={loadList} /> : null}
      {feedback ? (
        <div className="rounded-2xl bg-emerald-500/15 border border-emerald-400/35 px-4 py-3 text-xs font-semibold text-emerald-100 flex justify-between">
          <span>{feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} className="underline">Fechar</button>
        </div>
      ) : null}

      <div className="apple-glass rounded-3xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-wise-ink flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-blue-400" />
            Pedidos, Grade &amp; Produção Centralizada (Fábrica SP)
          </h2>
          <p className="text-xs text-wise-mute">
            Estados separados para Comercial, Financeiro, Aprovação (Arte/Grade), Produção SP e Entrega. Nenhum pedido entra em produção sem os pré-requisitos do gatekeeper.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isFactoryOrNetwork ? (
            <button
              type="button"
              onClick={() => setFactoryScopeAll((v) => !v)}
              className={`px-3.5 py-2 rounded-full text-xs font-semibold border ${
                factoryScopeAll ? 'apple-glass-cta text-white' : 'bg-white/8 border-white/15 text-wise-body'
              }`}
            >
              {factoryScopeAll ? 'Fila Global Fábrica SP' : 'Somente unidade selecionada'}
            </button>
          ) : null}
          {canCreate ? (
            <button
              type="button"
              onClick={() => {
                setCreateError(null);
                setCreateOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white"
            >
              <Plus className="w-4 h-4" /> Novo pedido
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-wise-mute absolute left-3 top-3" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pedido KS-XXXX ou cliente..."
            className="apple-glass-well rounded-full pl-9 pr-4 py-2 text-xs text-wise-ink outline-none w-64"
          />
        </div>
        <select
          value={prodFilter}
          onChange={(e) => setProdFilter(e.target.value)}
          className="apple-glass-well rounded-full px-3.5 py-2 text-xs text-wise-ink outline-none"
        >
          <option value="todos" className="bg-[#181818]">Todas etapas fabris</option>
          <option value="not_released" className="bg-[#181818]">Não liberado</option>
          <option value="blocked" className="bg-[#181818]">Bloqueado</option>
          <option value="queued_pcp" className="bg-[#181818]">Fila PCP SP</option>
          <option value="sublimation" className="bg-[#181818]">Sublimação</option>
          <option value="sewing" className="bg-[#181818]">Costura</option>
          <option value="finished" className="bg-[#181818]">Concluído</option>
        </select>
      </div>

      {orders.length === 0 ? (
        <EmptyStateCard
          title="Nenhum pedido encontrado"
          description="Converta uma proposta aprovada ou crie um pedido com grade."
        />
      ) : (
        <div className="space-y-3">
          {orders.map((ord) => (
            <div key={ord.id} className="apple-glass-subtle rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-wise-ink">{ord.order_number}</span>
                  <span className="text-xs text-blue-300 font-semibold">{ord.customer_name}</span>
                  {factoryScopeAll ? (
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/8 text-wise-body">
                      {ord.unit_code}
                    </span>
                  ) : null}
                  <span className="text-xs text-wise-mute">
                    {ord.total_pieces} pç · {formatBrl(ord.total_cents)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <StatusPill value={ord.commercial_status} />
                  <StatusPill value={ord.financial_status} />
                  <StatusPill value={ord.approval_status} />
                  <StatusPill value={ord.production_status} />
                  <StatusPill value={ord.logistics_status} />
                </div>
                {Array.isArray(ord.release_block_reasons) && ord.release_block_reasons.length > 0 && ord.commercial_status !== 'canceled' ? (
                  <p className="text-[11px] text-amber-200 flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    {ord.release_block_reasons[0]}
                  </p>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {ord.event_date ? (
                  <span className="text-[11px] text-wise-body">Evento: {formatDateBr(ord.event_date)}</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => openDetail(ord.id)}
                  className="px-4 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white"
                >
                  Abrir pedido &amp; Gatekeeper
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Criar Pedido */}
      <GlassModal
        open={createOpen}
        title={initialQuote ? `Converter Orçamento em Pedido` : 'Criar novo pedido'}
        subtitle="Pedido nasce confirmado comercialmente e passa pelo Gatekeeper antes de entrar em produção na fábrica SP."
        onClose={() => {
          setCreateOpen(false);
          setCreateError(null);
        }}
      >
        <form onSubmit={handleCreateOrder} className="space-y-4">
          {createError ? <ErrorBanner message={createError} /> : null}
          {!initialQuote && (customers.length === 0 || products.length === 0) ? (
            <div className="rounded-2xl bg-amber-500/15 border border-amber-400/35 px-3.5 py-2.5 text-xs text-amber-100">
              {customers.length === 0
                ? 'Cadastre pelo menos um cliente no CRM Comercial antes de criar um pedido.'
                : 'Nenhum produto disponível para venda encontrado no catálogo.'}
            </div>
          ) : null}
          {initialQuote ? (
            <div className="rounded-2xl bg-blue-500/10 border border-blue-400/30 p-3 text-xs space-y-1">
              <p className="font-bold text-blue-100">Cliente: {initialQuote.customer_name}</p>
              <p className="text-wise-body">{initialQuote.items.length} item(ns) importados do orçamento.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-wise-ink mb-1">Cliente *</label>
                  <select
                    required
                    value={newCustomerId}
                    onChange={(e) => setNewCustomerId(e.target.value)}
                    className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
                  >
                    {customers.length === 0 ? (
                      <option value="" className="bg-[#181818]">Nenhum cliente cadastrado</option>
                    ) : null}
                    {customers.map((c) => (
                      <option key={c.id} value={c.id} className="bg-[#181818]">{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-wise-ink mb-1">Produto *</label>
                  <select
                    required
                    value={newProductId}
                    onChange={(e) => setNewProductId(e.target.value)}
                    className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
                  >
                    {products.length === 0 ? (
                      <option value="" className="bg-[#181818]">Nenhum produto disponível</option>
                    ) : null}
                    {products.map((p) => (
                      <option key={p.id} value={p.id} className="bg-[#181818]">{p.name} ({p.sku})</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-wise-ink mb-1">Quantidade</label>
                  <input
                    type="number"
                    min={1}
                    value={newQty}
                    onChange={(e) => setNewQty(Number(e.target.value))}
                    className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-wise-ink mb-1">Valor unitário (R$)</label>
                  <input
                    type="text"
                    value={newPriceReais}
                    onChange={(e) => setNewPriceReais(e.target.value)}
                    className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                  />
                </div>
              </div>
            </>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Projeto de Arte vinculado (opcional)</label>
              <select
                value={newArtId}
                onChange={(e) => setNewArtId(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
              >
                <option value="" className="bg-[#181818]">Vincular depois</option>
                {arts.map((a) => (
                  <option key={a.id} value={a.id} className="bg-[#181818]">
                    {a.title} ({ART_STATUS_LABELS[a.status] || a.status})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Data do evento do cliente</label>
              <input
                type="date"
                value={newEventDate}
                onChange={(e) => setNewEventDate(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2.5 text-xs text-wise-ink outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Cidade de entrega *</label>
              <input
                type="text"
                required
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
                className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-wise-ink mb-1">Endereço / Rua *</label>
              <input
                type="text"
                required
                value={newStreet}
                onChange={(e) => setNewStreet(e.target.value)}
                placeholder="Ex: Av. Paulista, 1000"
                className="w-full apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
              />
            </div>
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
              disabled={creatingOrder || (!initialQuote && (customers.length === 0 || products.length === 0))}
              className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white disabled:opacity-50"
            >
              {creatingOrder ? 'Criando pedido...' : 'Confirmar pedido'}
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Detalhe Completo do Pedido + Gatekeeper + Grade + PCP SP */}
      <GlassModal
        open={Boolean(detail)}
        title={`Pedido ${detail?.order.order_number || ''}`}
        subtitle={
          detail
            ? `${detail.order.customer_name} (${detail.order.unit_name}) · Total ${formatBrl(detail.order.total_cents)}`
            : ''
        }
        onClose={() => {
          setDetail(null);
          setDetailError(null);
        }}
        maxWidthClass="max-w-4xl"
      >
        {detail ? (
          <div className="space-y-5 max-h-[75vh] overflow-y-auto pr-1">
            {detailError ? <ErrorBanner message={detailError} /> : null}
            {/* 5 Status Pills */}
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <div className="flex flex-wrap gap-1.5">
                <StatusPill value={detail.order.commercial_status} />
                <StatusPill value={detail.order.financial_status} />
                <StatusPill value={detail.order.approval_status} />
                <StatusPill value={detail.order.production_status} />
                <StatusPill value={detail.order.logistics_status} />
              </div>
              {canCreate &&
              detail.order.commercial_status !== 'canceled' &&
              ['not_released', 'blocked'].includes(detail.order.production_status) ? (
                <button
                  type="button"
                  onClick={() => {
                    setCancelReason('');
                    setCancelError(null);
                    setCancelOrderOpen(true);
                  }}
                  className="px-3 py-1.5 rounded-full bg-rose-500/15 hover:bg-rose-500/25 border border-rose-400/35 text-xs font-semibold text-rose-200"
                >
                  Cancelar pedido
                </button>
              ) : null}
            </div>

            {/* Gatekeeper de Liberação */}
            <div className="rounded-2xl apple-glass-well p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase text-wise-ink flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-400" />
                  Gatekeeper de Liberação para Fábrica (SP)
                </h3>
                {!detail.order.production_released && detail.order.commercial_status !== 'canceled' ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      disabled={releasingProd}
                      onClick={() => handleReleaseProduction(false)}
                      className="px-4 py-1.5 rounded-full apple-glass-cta text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {releasingProd ? 'Validando...' : 'Liberar para Produção SP'}
                    </button>
                    {canOverride && !detail.releaseGate.canRelease ? (
                      <button
                        type="button"
                        disabled={releasingProd}
                        onClick={() => {
                          setOverrideError(null);
                          setOverrideModal(true);
                        }}
                        className="px-3.5 py-1.5 rounded-full bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-100 text-xs font-semibold disabled:opacity-50"
                      >
                        Exceção Auditada (PCP/Rede)
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {detail.releaseGate.checks.map((chk) => (
                  <div
                    key={chk.key}
                    className={`rounded-xl p-2.5 border text-xs flex items-start gap-2 ${
                      chk.passed
                        ? 'bg-emerald-500/10 border-emerald-400/30 text-emerald-100'
                        : 'bg-rose-500/10 border-rose-400/30 text-rose-100'
                    }`}
                  >
                    {chk.passed ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-300 mt-0.5" />
                    ) : (
                      <XCircle className="w-4 h-4 shrink-0 text-rose-300 mt-0.5" />
                    )}
                    <div>
                      <p className="font-bold">{chk.label}</p>
                      <p className="text-[11px] opacity-90">{chk.message}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Vínculo Arte e Endereço enquanto não liberado */}
            {canCreate && ['not_released', 'blocked'].includes(detail.order.production_status) ? (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
                <span className="text-xs font-bold text-wise-ink block">Vínculo de Arte e Dados de Entrega</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <select
                    value={linkArtId}
                    onChange={(e) => setLinkArtId(e.target.value)}
                    className="apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                  >
                    <option value="" className="bg-[#181818]">Selecione projeto de arte</option>
                    {arts.map((a) => (
                      <option key={a.id} value={a.id} className="bg-[#181818]">
                        {a.title} ({ART_STATUS_LABELS[a.status] || a.status})
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={deliveryCity}
                    onChange={(e) => setDeliveryCity(e.target.value)}
                    placeholder="Cidade entrega"
                    className="apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                  />
                  <input
                    type="text"
                    value={deliveryStreet}
                    onChange={(e) => setDeliveryStreet(e.target.value)}
                    placeholder="Endereço / Rua"
                    className="apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                  />
                </div>
                <button
                  type="button"
                  disabled={savingDetails}
                  onClick={handleSaveOrderDetails}
                  className="px-4 py-1.5 rounded-full bg-white/10 hover:bg-white/18 border border-white/15 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {savingDetails ? 'Salvando...' : 'Atualizar vínculo e entrega'}
                </button>
              </div>
            ) : null}

            {/* Grade & Personalização Nominal */}
            <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-xs font-bold uppercase text-wise-ink">
                    Grade de Tamanhos &amp; Personalização ({gradeRows.reduce((s, r) => s + Number(r.quantity || 0), 0)} pçs lançadas)
                  </h3>
                  <p className="text-[11px] text-wise-mute">
                    {detail.order.grade_approved
                      ? `Grade aprovada por ${detail.order.grade_approved_by || 'Unidade'} em ${formatDateBr(detail.order.grade_approved_at, { withTime: true })}.`
                      : 'Grade aguardando conferência e aprovação nominal.'}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canCreate && ['not_released', 'blocked'].includes(detail.order.production_status) ? (
                    <>
                      <button
                        type="button"
                        onClick={() =>
                          setGradeRows((prev) => [
                            ...prev,
                            { sizeCode: 'M', playerName: '', playerNumber: '', shieldOrSponsorNotes: '', quantity: 1 },
                          ])
                        }
                        className="px-3 py-1.5 rounded-full bg-white/10 text-xs font-semibold text-white"
                      >
                        + Linha na grade
                      </button>
                      <button
                        type="button"
                        disabled={savingGrade}
                        onClick={handleSaveGrade}
                        className="px-3 py-1.5 rounded-full bg-blue-500/20 border border-blue-400/40 text-xs font-semibold text-blue-100 disabled:opacity-50"
                      >
                        {savingGrade ? 'Salvando grade...' : 'Salvar grade'}
                      </button>
                    </>
                  ) : null}
                  {!detail.order.grade_approved && detail.order.commercial_status !== 'canceled' ? (
                    <button
                      type="button"
                      onClick={() => {
                        setGradeApproverName(me.user.fullName || '');
                        setGradeApproveError(null);
                        setGradeApproveOpen(true);
                      }}
                      className="px-3.5 py-1.5 rounded-full apple-glass-cta text-xs font-semibold text-white"
                    >
                      Aprovar Grade
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="space-y-2 max-h-48 overflow-y-auto">
                {gradeRows.length === 0 ? (
                  <p className="text-xs text-wise-mute">Nenhuma linha individual cadastrada.</p>
                ) : (
                  gradeRows.map((row, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                      <input
                        type="text"
                        value={row.sizeCode}
                        onChange={(e) =>
                          setGradeRows((p) => p.map((r, i) => (i === idx ? { ...r, sizeCode: e.target.value } : r)))
                        }
                        placeholder="Tam"
                        className="col-span-2 apple-glass-well rounded-lg px-2 py-1.5 text-xs text-wise-ink"
                      />
                      <input
                        type="text"
                        value={row.playerName}
                        onChange={(e) =>
                          setGradeRows((p) => p.map((r, i) => (i === idx ? { ...r, playerName: e.target.value } : r)))
                        }
                        placeholder="Nome costas"
                        className="col-span-4 apple-glass-well rounded-lg px-2 py-1.5 text-xs text-wise-ink"
                      />
                      <input
                        type="text"
                        value={row.playerNumber}
                        onChange={(e) =>
                          setGradeRows((p) => p.map((r, i) => (i === idx ? { ...r, playerNumber: e.target.value } : r)))
                        }
                        placeholder="Nº"
                        className="col-span-2 apple-glass-well rounded-lg px-2 py-1.5 text-xs text-wise-ink"
                      />
                      <input
                        type="number"
                        min={1}
                        value={row.quantity}
                        onChange={(e) =>
                          setGradeRows((p) =>
                            p.map((r, i) => (i === idx ? { ...r, quantity: Number(e.target.value) } : r))
                          )
                        }
                        className="col-span-2 apple-glass-well rounded-lg px-2 py-1.5 text-xs text-wise-ink"
                      />
                      <button
                        type="button"
                        onClick={() => setGradeRows((p) => p.filter((_, i) => i !== idx))}
                        className="col-span-2 text-rose-300 hover:bg-rose-500/20 rounded-lg py-1.5 flex justify-center"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Controles Exclusivos da Fábrica PCP / Logística (SP) */}
            {(canAdvanceFactory || canLogistics) ? (
              <div className="rounded-2xl bg-blue-500/10 border border-blue-400/35 p-4 space-y-4">
                <h3 className="text-xs font-bold uppercase text-blue-200 flex items-center gap-1.5">
                  <Factory className="w-4 h-4" /> Controles Exclusivos Matriz / Fábrica São Paulo
                </h3>
                {!detail.order.factory_accepted && canAdvanceFactory ? (
                  <button
                    type="button"
                    disabled={factoryAccepting}
                    onClick={handleFactoryAccept}
                    className="px-4 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white disabled:opacity-50"
                  >
                    {factoryAccepting ? 'Confirmando...' : 'Confirmar Aceite Fabril & Capacidade PCP'}
                  </button>
                ) : null}

                {detail.order.production_released && canAdvanceFactory ? (
                  <form onSubmit={handleAdvancePcpStage} className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <select
                      value={pcpStage}
                      onChange={(e) => setPcpStage(e.target.value)}
                      className="apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                    >
                      <option value="sublimation" className="bg-[#181818]">Sublimação</option>
                      <option value="cutting" className="bg-[#181818]">Corte</option>
                      <option value="embroidery_tpu" className="bg-[#181818]">Bordado / TPU / DTF</option>
                      <option value="sewing" className="bg-[#181818]">Costura</option>
                      <option value="quality_check" className="bg-[#181818]">Qualidade</option>
                      <option value="finished" className="bg-[#181818]">Concluído</option>
                    </select>
                    <input
                      type="text"
                      value={pcpNotes}
                      onChange={(e) => setPcpNotes(e.target.value)}
                      placeholder="Observação do setor SP..."
                      className="sm:col-span-2 apple-glass-well rounded-xl px-3 py-2 text-xs text-wise-ink outline-none"
                    />
                    <button
                      type="submit"
                      disabled={advancingPcp}
                      className="px-4 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {advancingPcp ? 'Salvando...' : 'Avançar etapa'}
                    </button>
                  </form>
                ) : null}

                {canLogistics ? (
                  <form onSubmit={handleRegisterShipment} className="grid grid-cols-1 sm:grid-cols-5 gap-2 border-t border-white/10 pt-3">
                    <select
                      value={shipStatus}
                      onChange={(e) => setShipStatus(e.target.value)}
                      className="apple-glass-well rounded-xl px-2.5 py-2 text-xs text-wise-ink outline-none"
                    >
                      <option value="preparing" className="bg-[#181818]">Em preparação</option>
                      <option value="dispatched" className="bg-[#181818]">Despachado SP</option>
                      <option value="in_transit" className="bg-[#181818]">Em trânsito</option>
                      <option value="delivered" className="bg-[#181818]">Entregue</option>
                      <option value="delayed" className="bg-[#181818]">Ocorrência/Atraso</option>
                    </select>
                    <input
                      type="text"
                      value={shipCarrier}
                      onChange={(e) => setShipCarrier(e.target.value)}
                      placeholder="Transportadora"
                      className="apple-glass-well rounded-xl px-2.5 py-2 text-xs text-wise-ink outline-none"
                    />
                    <input
                      type="text"
                      value={shipTracking}
                      onChange={(e) => setShipTracking(e.target.value)}
                      placeholder="Cód. rastreio"
                      className="apple-glass-well rounded-xl px-2.5 py-2 text-xs text-wise-ink outline-none"
                    />
                    <input
                      type="text"
                      value={shipReceiver}
                      onChange={(e) => setShipReceiver(e.target.value)}
                      placeholder={shipStatus === 'delivered' ? 'Recebedor *' : 'Recebedor (se entregue)'}
                      className="apple-glass-well rounded-xl px-2.5 py-2 text-xs text-wise-ink outline-none"
                    />
                    <button
                      type="submit"
                      disabled={savingShipment}
                      className="px-3 py-2 rounded-full bg-white/15 hover:bg-white/25 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      {savingShipment ? 'Salvando...' : 'Salvar envio'}
                    </button>
                  </form>
                ) : null}
              </div>
            ) : null}

            {/* Timeline Produção & Logística */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 space-y-2">
                <h4 className="font-bold text-wise-ink uppercase text-[11px]">Timeline Industrial (SP)</h4>
                {detail.productionEvents.length === 0 ? (
                  <p className="text-wise-mute">Aguardando liberação no gatekeeper para iniciar produção.</p>
                ) : (
                  detail.productionEvents.map((ev) => (
                    <div key={ev.id} className="border-l-2 border-blue-400/60 pl-2.5 py-0.5">
                      <p className="font-bold text-wise-ink">{ev.status_label}</p>
                      <p className="text-[11px] text-wise-body">{ev.notes || 'Registrado pelo PCP'}</p>
                      <p className="text-[10px] text-wise-mute">{formatDateBr(ev.created_at, { withTime: true })}</p>
                    </div>
                  ))
                )}
              </div>

              <div className="rounded-2xl bg-white/5 border border-white/10 p-3.5 space-y-2">
                <h4 className="font-bold text-wise-ink uppercase text-[11px] flex items-center gap-1">
                  <Truck className="w-3.5 h-3.5" /> Expedição &amp; Recebimentos
                </h4>
                {detail.shipments.map((sh) => (
                  <div key={sh.id} className="rounded-xl bg-black/30 p-2 text-[11px] space-y-1">
                    <p className="font-bold text-wise-ink">
                      {sh.carrier_name || 'Expedição SP'} · {sh.tracking_code || 'Sem rastreio'}
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-wise-body">
                      <StatusPill value={sh.status} />
                      {sh.receiver_name ? <span>· Recebido por {sh.receiver_name}</span> : null}
                    </div>
                  </div>
                ))}
                {detail.receivables.map((rec) => (
                  <div key={rec.id} className="rounded-xl bg-black/30 p-2 text-[11px] flex justify-between">
                    <span>{rec.description} ({formatBrl(rec.amount_cents)})</span>
                    <StatusPill value={rec.status} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </GlassModal>

      {/* Modal Override Auditado */}
      <GlassModal
        open={overrideModal}
        title="Liberar produção com exceção auditada"
        subtitle="Apenas Fábrica (PCP) ou Administração da Rede. O motivo será gravado em log de auditoria."
        onClose={() => {
          setOverrideModal(false);
          setOverrideError(null);
        }}
        maxWidthClass="max-w-md"
      >
        <div className="space-y-4">
          {overrideError ? <ErrorBanner message={overrideError} /> : null}
          <textarea
            rows={3}
            value={overrideReason}
            onChange={(e) => setOverrideReason(e.target.value)}
            placeholder="Descreva a autorização excepcional (ex: Diretoria autorizou início pós-pago sem entrada prévia)..."
            className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setOverrideModal(false);
                setOverrideError(null);
              }}
              className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={releasingProd}
              onClick={() => handleReleaseProduction(true)}
              className="px-5 py-2 rounded-full bg-amber-500 text-slate-950 font-bold text-xs disabled:opacity-50"
            >
              {releasingProd ? 'Liberando...' : 'Autorizar e Liberar PCP'}
            </button>
          </div>
        </div>
      </GlassModal>

      {/* Modal Aprovação Nominal da Grade */}
      <GlassModal
        open={gradeApproveOpen}
        title="Confirmar aprovação formal da grade"
        subtitle="Registre o nome completo de quem conferiu todos os tamanhos, nomes e números antes de liberar para a Fábrica SP."
        onClose={() => {
          setGradeApproveOpen(false);
          setGradeApproveError(null);
        }}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleConfirmApproveGrade} className="space-y-4">
          {gradeApproveError ? <ErrorBanner message={gradeApproveError} /> : null}
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Nome completo de quem aprovou a grade *</label>
            <input
              type="text"
              required
              minLength={2}
              value={gradeApproverName}
              onChange={(e) => setGradeApproverName(e.target.value)}
              placeholder="Ex: Carlos Oliveira / Cliente"
              className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setGradeApproveOpen(false);
                setGradeApproveError(null);
              }}
              className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={approvingGrade}
              className="px-5 py-2 rounded-full apple-glass-cta text-xs font-semibold text-white disabled:opacity-50"
            >
              {approvingGrade ? 'Registrando...' : 'Registrar aprovação'}
            </button>
          </div>
        </form>
      </GlassModal>

      {/* Modal Cancelar Pedido */}
      <GlassModal
        open={cancelOrderOpen}
        title="Cancelar pedido antes da produção"
        subtitle="O histórico do pedido e dos recebíveis associados será preservado com registro de auditoria."
        onClose={() => {
          setCancelOrderOpen(false);
          setCancelError(null);
        }}
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleConfirmCancelOrder} className="space-y-4">
          {cancelError ? <ErrorBanner message={cancelError} /> : null}
          <div>
            <label className="block text-xs font-semibold text-wise-ink mb-1">Motivo do cancelamento *</label>
            <textarea
              required
              minLength={4}
              rows={3}
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="Descreva o motivo comercial ou operacional do cancelamento..."
              className="w-full apple-glass-well rounded-xl px-3.5 py-2.5 text-xs text-wise-ink outline-none"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCancelOrderOpen(false);
                setCancelError(null);
              }}
              className="px-4 py-2 rounded-full bg-white/8 text-xs font-semibold text-wise-body"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={cancelingOrder}
              className="px-5 py-2 rounded-full bg-rose-500/80 hover:bg-rose-500 text-xs font-semibold text-white disabled:opacity-50"
            >
              {cancelingOrder ? 'Cancelando...' : 'Confirmar cancelamento'}
            </button>
          </div>
        </form>
      </GlassModal>
    </div>
  );
}
