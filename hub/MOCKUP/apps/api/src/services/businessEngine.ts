import { PoolClient } from 'pg';

export interface QuoteItemCalculationInput {
  productId?: string | null;
  productSku: string;
  productName: string;
  quantity: number;
  unitSalePriceCents: number;
  unitSupplyCostCents: number | null;
  personalizationSummary?: string | null;
  personalizationCents?: number;
  priceSnapshot?: Record<string, unknown>;
}

export interface QuoteTotalsResult {
  subtotalCents: number;
  personalizationTotalCents: number;
  additionalServicesCents: number;
  shippingCents: number;
  discountCents: number;
  totalCents: number;
  knownCostCents: number | null;
  estimatedContributionCents: number | null;
  marginOnSalePct: number | null;
  markupPct: number | null;
  estimationStatus: 'complete' | 'incomplete';
  discountPctBps: number;
  computedItems: Array<QuoteItemCalculationInput & { lineTotalCents: number; personalizationCents: number }>;
}

export function computeQuoteTotals(params: {
  items: QuoteItemCalculationInput[];
  additionalServicesCents?: number;
  shippingCents?: number;
  discountCents?: number;
}): QuoteTotalsResult {
  if (!params.items || params.items.length === 0) {
    throw new Error('O orçamento deve conter pelo menos um item.');
  }

  let subtotalCents = 0;
  let personalizationTotalCents = 0;
  let allCostsKnown = true;
  let accumulatedKnownCost = 0;

  const computedItems = params.items.map((item) => {
    const qty = Math.trunc(Number(item.quantity));
    if (!Number.isFinite(qty) || qty <= 0) {
      throw new Error(`Quantidade inválida para o item ${item.productName}.`);
    }
    const unitSale = Math.trunc(Number(item.unitSalePriceCents));
    const persUnit = Math.trunc(Number(item.personalizationCents ?? 0));
    if (unitSale < 0 || persUnit < 0) {
      throw new Error(`Valores negativos não são permitidos para ${item.productName}.`);
    }

    const lineSubtotal = qty * unitSale;
    const linePers = qty * persUnit;
    const lineTotal = lineSubtotal + linePers;

    subtotalCents += lineSubtotal;
    personalizationTotalCents += linePers;

    if (item.unitSupplyCostCents === null || item.unitSupplyCostCents === undefined) {
      allCostsKnown = false;
    } else {
      accumulatedKnownCost += qty * Math.trunc(Number(item.unitSupplyCostCents));
    }

    return {
      ...item,
      quantity: qty,
      unitSalePriceCents: unitSale,
      personalizationCents: persUnit,
      lineTotalCents: lineTotal,
    };
  });

  const additionalServicesCents = Math.max(0, Math.trunc(Number(params.additionalServicesCents ?? 0)));
  const shippingCents = Math.max(0, Math.trunc(Number(params.shippingCents ?? 0)));
  const grossMerchandiseCents = subtotalCents + personalizationTotalCents + additionalServicesCents;
  const grossWithShipping = grossMerchandiseCents + shippingCents;
  const discountCents = Math.max(0, Math.trunc(Number(params.discountCents ?? 0)));

  if (discountCents > grossWithShipping) {
    throw new Error('O desconto não pode ser maior que o valor bruto do orçamento.');
  }

  const totalCents = grossWithShipping - discountCents;
  const discountPctBps =
    grossMerchandiseCents > 0 ? Math.round((discountCents / grossMerchandiseCents) * 10000) : 0;

  let knownCostCents: number | null = accumulatedKnownCost > 0 || allCostsKnown ? accumulatedKnownCost : null;
  let estimatedContributionCents: number | null = null;
  let marginOnSalePct: number | null = null;
  let markupPct: number | null = null;

  if (allCostsKnown) {
    const netProductRevenue = Math.max(0, totalCents - shippingCents);
    estimatedContributionCents = netProductRevenue - accumulatedKnownCost;
    marginOnSalePct =
      netProductRevenue > 0
        ? Number(((estimatedContributionCents / netProductRevenue) * 100).toFixed(2))
        : 0;
    markupPct =
      accumulatedKnownCost > 0
        ? Number(((estimatedContributionCents / accumulatedKnownCost) * 100).toFixed(2))
        : null;
  } else {
    knownCostCents = accumulatedKnownCost > 0 ? accumulatedKnownCost : null;
  }

  return {
    subtotalCents,
    personalizationTotalCents,
    additionalServicesCents,
    shippingCents,
    discountCents,
    totalCents,
    knownCostCents,
    estimatedContributionCents,
    marginOnSalePct,
    markupPct,
    estimationStatus: allCostsKnown ? 'complete' : 'incomplete',
    discountPctBps,
    computedItems,
  };
}

export interface GateCheckDetail {
  key:
    | 'complete_data'
    | 'approved_art'
    | 'approved_grade'
    | 'financial_condition'
    | 'mandatory_documents'
    | 'factory_acceptance';
  label: string;
  passed: boolean;
  required: boolean;
  message: string;
}

export interface OrderReleaseGateResult {
  canRelease: boolean;
  checks: GateCheckDetail[];
  blockers: string[];
  warnings: string[];
}

export async function evaluateOrderProductionReleaseGate(
  client: PoolClient,
  orderId: string,
  options?: { allowFactorySimultaneousAccept?: boolean }
): Promise<OrderReleaseGateResult> {
  const orderRes = await client.query<{
    id: string;
    order_number: string;
    unit_id: string;
    customer_id: string;
    art_project_id: string | null;
    approved_art_version_id: string | null;
    commercial_status: string;
    financial_status: string;
    approval_status: string;
    grade_approved: boolean;
    grade_approved_by: string | null;
    factory_accepted: boolean;
    factory_capacity_ok: boolean;
    delivery_address: Record<string, unknown>;
    commercial_snapshot: Record<string, unknown>;
    total_cents: string;
    operational_status: string;
    implantation_approved: boolean;
    production_release_rules: Record<string, boolean> | null;
  }>(
    `SELECT
       o.*,
       u.operational_status,
       u.implantation_approved,
       ucc.production_release_rules
     FROM portal.orders o
     JOIN portal.units u ON u.id = o.unit_id
     LEFT JOIN portal.unit_commercial_configs ucc ON ucc.unit_id = o.unit_id
     WHERE o.id = $1`,
    [orderId]
  );

  const order = orderRes.rows[0];
  if (!order) {
    throw new Error('Pedido não encontrado para avaliação de liberação.');
  }

  const rules = {
    require_complete_data: order.production_release_rules?.require_complete_data ?? true,
    require_approved_art: order.production_release_rules?.require_approved_art ?? true,
    require_approved_grade: order.production_release_rules?.require_approved_grade ?? true,
    require_financial_condition: order.production_release_rules?.require_financial_condition ?? true,
    require_required_documents: order.production_release_rules?.require_required_documents ?? true,
    require_factory_acceptance: order.production_release_rules?.require_factory_acceptance ?? true,
  };

  const itemsRes = await client.query<{ qty: string }>(
    `SELECT COALESCE(SUM(quantity), 0)::text AS qty FROM portal.order_items WHERE order_id = $1`,
    [orderId]
  );
  const totalOrderPieces = Number(itemsRes.rows[0]?.qty || 0);

  const persRes = await client.query<{ qty: string }>(
    `SELECT COALESCE(SUM(quantity), 0)::text AS qty FROM portal.order_personalizations WHERE order_id = $1`,
    [orderId]
  );
  const totalPersonalizedPieces = Number(persRes.rows[0]?.qty || 0);

  // 1. Dados completos
  const hasAddress =
    Boolean(order.delivery_address?.city || order.delivery_address?.street || order.delivery_address?.recipient);
  const completeDataPassed =
    order.commercial_status === 'confirmed' && totalOrderPieces > 0 && hasAddress;

  // 2. Arte aprovada e vinculada especificamente à versão ativa vigente
  let artPassed = false;
  let artMsg = 'Nenhuma arte vinculada ao pedido.';
  if (order.art_project_id) {
    const artRes = await client.query<{
      status: string;
      current_version_id: string | null;
      approved_version_id: string | null;
    }>(
      `SELECT status, current_version_id, approved_version_id
       FROM portal.art_projects
       WHERE id = $1 AND unit_id = $2`,
      [order.art_project_id, order.unit_id]
    );
    const artProj = artRes.rows[0];
    if (!artProj) {
      artMsg = 'Projeto de arte associado não foi encontrado.';
    } else if (!artProj.approved_version_id || artProj.status !== 'aprovado') {
      artMsg = `Projeto de arte encontra-se em '${artProj.status}' e não possui versão aprovada vigente.`;
    } else if (
      order.approved_art_version_id &&
      order.approved_art_version_id !== artProj.approved_version_id
    ) {
      artMsg = 'A versão de arte vinculada ao pedido foi substituída por revisão posterior.';
    } else {
      const approvalRes = await client.query<{ id: string; version_number: number }>(
        `SELECT a.id, av.version_number
         FROM portal.approvals a
         JOIN portal.art_versions av ON av.id = a.art_version_id
         WHERE a.art_project_id = $1
           AND a.art_version_id = $2
           AND a.entity_type = 'art_version'
           AND a.status = 'active'
         LIMIT 1`,
        [order.art_project_id, artProj.approved_version_id]
      );
      if (approvalRes.rows[0]) {
        artPassed = true;
        artMsg = `Arte aprovada com aceite registrado na versão v${approvalRes.rows[0].version_number}.`;
      } else {
        artMsg = 'Não há aceite ativo registrado na tabela de aprovações para a versão atual da arte.';
      }
    }
  }

  // 3. Grade aprovada
  let gradePassed = false;
  let gradeMsg = 'Grade de tamanhos ainda não foi aprovada pelo cliente/unidade.';
  if (order.grade_approved && (order.approval_status === 'grade_approved' || order.approval_status === 'all_approved')) {
    if (totalPersonalizedPieces > totalOrderPieces) {
      gradeMsg = `Soma das personalizações (${totalPersonalizedPieces}) excede o total de peças do pedido (${totalOrderPieces}).`;
    } else {
      gradePassed = true;
      gradeMsg =
        totalPersonalizedPieces > 0
          ? `Grade aprovada (${totalPersonalizedPieces}/${totalOrderPieces} peças nominais lançadas).`
          : `Grade aprovada para lote de ${totalOrderPieces} peças.`;
    }
  }

  // 4. Condição financeira e habilitação da unidade
  const confirmedPayRes = await client.query<{ confirmed_cents: string }>(
    `SELECT COALESCE(SUM(
       CASE
         WHEN transaction_type = 'payment' AND confirmation_status = 'confirmed' THEN amount_cents
         WHEN transaction_type = 'reversal' AND confirmation_status = 'confirmed' THEN -amount_cents
         ELSE 0
       END
     ), 0)::text AS confirmed_cents
     FROM portal.payment_transactions
     WHERE order_id = $1`,
    [orderId]
  );
  const confirmedPaidCents = Number(confirmedPayRes.rows[0]?.confirmed_cents || 0);
  const pendingValidationRes = await client.query<{ cnt: string }>(
    `SELECT COUNT(*)::text AS cnt
     FROM portal.payment_transactions
     WHERE order_id = $1 AND confirmation_status = 'pending_validation'`,
    [orderId]
  );
  const pendingValidationCount = Number(pendingValidationRes.rows[0]?.cnt || 0);
  const bypassEntry = Boolean(order.commercial_snapshot?.financial_cleared_postpaid);

  let financialPassed = false;
  let financialMsg = '';
  if (order.operational_status !== 'active' && !order.implantation_approved) {
    financialMsg = `Unidade está com status '${order.operational_status}' (habilitação operacional/implantação pendente).`;
  } else if (order.financial_status === 'overdue') {
    financialMsg = 'Pedido possui parcela financeira vencida em aberto.';
  } else if (!bypassEntry && confirmedPaidCents <= 0) {
    financialMsg =
      pendingValidationCount > 0
        ? 'Comprovante de pagamento enviado, porém aguardando validação financeira antes de liberar a fábrica.'
        : 'Entrada financeira ou liberação comercial pós-paga não confirmada para envio à produção.';
  } else {
    financialPassed = true;
    financialMsg = bypassEntry
      ? 'Condição financeira liberada conforme condição comercial aprovada.'
      : `Pagamento inicial confirmado (${(confirmedPaidCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).`;
  }

  // 5. Documentos obrigatórios (para implantação da unidade OU específicos do pedido/cliente)
  const pendingDocsRes = await client.query<{ id: string; title: string; requirement_level: string; status: string }>(
    `SELECT id, title, requirement_level, status
     FROM portal.documents
     WHERE unit_id = $1
       AND (
         requirement_level = 'mandatory_onboarding'
         OR (requirement_level = 'mandatory_order_production' AND (order_id = $2 OR customer_id = $3))
       )
       AND status NOT IN ('approved', 'signed')`,
    [order.unit_id, order.id, order.customer_id]
  );
  const docsPassed = pendingDocsRes.rows.length === 0;
  const docsMsg = docsPassed
    ? 'Documentação obrigatória aplicável devidamente aprovada/assinada.'
    : `Pendência documental: ${pendingDocsRes.rows.map((d) => d.title).join(', ')}.`;

  // 6. Aceite da fábrica e capacidade
  const factoryAcceptedEffective =
    options?.allowFactorySimultaneousAccept || (order.factory_accepted && order.factory_capacity_ok);
  const factoryMsg = factoryAcceptedEffective
    ? 'Aceite da fábrica e disponibilidade produtiva confirmados.'
    : 'Aguardando aceite fabril do PCP São Paulo e confirmação de capacidade.';

  const checks: GateCheckDetail[] = [
    {
      key: 'complete_data',
      label: 'Dados completos e confirmação comercial',
      passed: completeDataPassed,
      required: rules.require_complete_data,
      message: completeDataPassed
        ? 'Pedido confirmado com itens e endereço registrados.'
        : 'Pedido precisa estar confirmado, com itens válidos e endereço de entrega preenchido.',
    },
    {
      key: 'approved_art',
      label: 'Arte final aprovada na versão vigente',
      passed: artPassed,
      required: rules.require_approved_art,
      message: artMsg,
    },
    {
      key: 'approved_grade',
      label: 'Grade e personalizações aprovadas',
      passed: gradePassed,
      required: rules.require_approved_grade,
      message: gradeMsg,
    },
    {
      key: 'financial_condition',
      label: 'Condição financeira & habilitação da unidade',
      passed: financialPassed,
      required: rules.require_financial_condition,
      message: financialMsg,
    },
    {
      key: 'mandatory_documents',
      label: 'Documentos obrigatórios aprovados/assinados',
      passed: docsPassed,
      required: rules.require_required_documents,
      message: docsMsg,
    },
    {
      key: 'factory_acceptance',
      label: 'Aceite da fábrica & capacidade produtiva (PCP)',
      passed: factoryAcceptedEffective,
      required: rules.require_factory_acceptance,
      message: factoryMsg,
    },
  ];

  const blockers = checks.filter((c) => c.required && !c.passed).map((c) => c.message);
  const warnings = checks.filter((c) => !c.required && !c.passed).map((c) => c.message);

  return {
    canRelease: blockers.length === 0,
    checks,
    blockers,
    warnings,
  };
}

export async function recalculateReceivableAndOrderFinancials(
  client: PoolClient,
  receivableId: string
): Promise<{
  receivableId: string;
  paidCents: number;
  receivableStatus: string;
  orderId: string | null;
  orderFinancialStatus: string | null;
}> {
  const recRes = await client.query<{
    id: string;
    unit_id: string;
    order_id: string | null;
    amount_cents: string;
    due_date: string;
    status: string;
  }>(
    `SELECT id, unit_id, order_id, amount_cents, due_date::text, status
     FROM portal.receivables
     WHERE id = $1`,
    [receivableId]
  );

  const rec = recRes.rows[0];
  if (!rec) {
    throw new Error('Parcela a receber não encontrada para recálculo.');
  }

  const netRes = await client.query<{ net_cents: string }>(
    `SELECT COALESCE(SUM(
       CASE
         WHEN transaction_type = 'payment' AND confirmation_status = 'confirmed' THEN amount_cents
         WHEN transaction_type = 'reversal' AND confirmation_status = 'confirmed' THEN -amount_cents
         ELSE 0
       END
     ), 0)::text AS net_cents
     FROM portal.payment_transactions
     WHERE receivable_id = $1`,
    [receivableId]
  );

  const totalAmount = Number(rec.amount_cents);
  const rawNet = Number(netRes.rows[0]?.net_cents || 0);
  const paidCents = Math.max(0, Math.min(totalAmount, rawNet));

  const todayIso = new Date().toISOString().slice(0, 10);
  let newStatus = rec.status;
  if (rec.status !== 'canceled') {
    if (paidCents >= totalAmount && totalAmount > 0) {
      newStatus = 'paid';
    } else if (paidCents > 0) {
      newStatus = rec.due_date < todayIso ? 'overdue' : 'partial';
    } else {
      const hadConfirmedReversal = await client.query<{ cnt: string }>(
        `SELECT COUNT(*)::text AS cnt FROM portal.payment_transactions
         WHERE receivable_id = $1 AND transaction_type = 'reversal' AND confirmation_status = 'confirmed'`,
        [receivableId]
      );
      if (Number(hadConfirmedReversal.rows[0]?.cnt || 0) > 0 && paidCents === 0) {
        newStatus = rec.due_date < todayIso ? 'overdue' : 'pending';
      } else {
        newStatus = rec.due_date < todayIso ? 'overdue' : 'pending';
      }
    }
  }

  await client.query(
    `UPDATE portal.receivables
     SET paid_cents = $1, status = $2, updated_at = NOW()
     WHERE id = $3`,
    [paidCents, newStatus, receivableId]
  );

  let orderFinancialStatus: string | null = null;
  if (rec.order_id) {
    const orderRecs = await client.query<{
      amount_cents: string;
      paid_cents: string;
      status: string;
    }>(
      `SELECT amount_cents, paid_cents, status
       FROM portal.receivables
       WHERE order_id = $1 AND status <> 'canceled'`,
      [rec.order_id]
    );

    const activeRecs = orderRecs.rows;
    if (activeRecs.length > 0) {
      const totalDue = activeRecs.reduce((s, r) => s + Number(r.amount_cents), 0);
      const totalPaid = activeRecs.reduce((s, r) => s + Number(r.paid_cents), 0);
      const anyOverdue = activeRecs.some((r) => r.status === 'overdue');

      if (totalPaid >= totalDue && totalDue > 0) {
        orderFinancialStatus = 'settled';
      } else if (anyOverdue) {
        orderFinancialStatus = 'overdue';
      } else if (totalPaid > 0) {
        orderFinancialStatus = 'partial';
      } else {
        orderFinancialStatus = 'pending';
      }

      await client.query(
        `UPDATE portal.orders SET financial_status = $1, updated_at = NOW() WHERE id = $2`,
        [orderFinancialStatus, rec.order_id]
      );
    }
  }

  return {
    receivableId,
    paidCents,
    receivableStatus: newStatus,
    orderId: rec.order_id,
    orderFinancialStatus,
  };
}

export interface PriorityItem {
  id: string;
  dedupeKey: string;
  severity: 'critical' | 'high' | 'medium';
  severityRank: number;
  category:
    | 'order_blocked_approval'
    | 'art_revision_required'
    | 'quote_followup'
    | 'receivable_overdue'
    | 'order_delay_risk'
    | 'upcoming_event_delivery'
    | 'ticket_waiting_unit'
    | 'document_pending';
  customerName: string;
  referenceCode: string;
  problem: string;
  deadline: string | null;
  responsibleName: string;
  impact: string;
  recommendedAction: string;
  actionTab: string;
  actionEntityId: string;
}

export async function buildConsolidatedPriorities(
  client: PoolClient,
  unitId: string,
  isSandbox = false
): Promise<PriorityItem[]> {
  const map = new Map<string, PriorityItem>();

  const upsert = (item: PriorityItem) => {
    const existing = map.get(item.dedupeKey);
    if (!existing || item.severityRank < existing.severityRank) {
      map.set(item.dedupeKey, item);
    }
  };

  // 1. Pedidos bloqueados / aguardando aprovação / risco de atraso / entrega próxima do evento
  const ordersRes = await client.query<{
    id: string;
    order_number: string;
    customer_name: string;
    commercial_status: string;
    approval_status: string;
    production_status: string;
    logistics_status: string;
    grade_approved: boolean;
    release_block_reasons: string[];
    event_date: string | null;
    estimated_delivery_date: string | null;
    owner_name: string | null;
  }>(
    `SELECT
       o.id,
       o.order_number,
       c.name AS customer_name,
       o.commercial_status,
       o.approval_status,
       o.production_status,
       o.logistics_status,
       o.grade_approved,
       o.release_block_reasons,
       o.event_date::text,
       o.estimated_delivery_date::text,
       p.full_name AS owner_name
     FROM portal.orders o
     JOIN portal.customers c ON c.id = o.customer_id
     LEFT JOIN portal.profiles p ON p.id = o.created_by
     WHERE o.unit_id = $1
       AND o.is_sandbox = $2
       AND o.commercial_status = 'confirmed'
       AND o.logistics_status <> 'delivered'`,
    [unitId, isSandbox]
  );

  const nowMs = Date.now();
  const dayMs = 86_400_000;

  for (const ord of ordersRes.rows) {
    const eventDaysLeft = ord.event_date
      ? Math.ceil((new Date(`${ord.event_date}T23:59:59`).getTime() - nowMs) / dayMs)
      : null;
    const estDaysLeft = ord.estimated_delivery_date
      ? Math.ceil((new Date(`${ord.estimated_delivery_date}T23:59:59`).getTime() - nowMs) / dayMs)
      : null;

    if (!ord.grade_approved || ord.production_status === 'not_released' || ord.production_status === 'blocked') {
      const reasonText =
        !ord.grade_approved
          ? `Pedido ${ord.order_number} aguardando aprovação da grade`
          : ord.release_block_reasons?.[0] || `Pedido ${ord.order_number} bloqueado para liberação fabril`;
      const eventSuffix = eventDaysLeft !== null ? ` Evento em ${eventDaysLeft} dia(s).` : '';
      upsert({
        id: `prio_ord_${ord.id}`,
        dedupeKey: `order:${ord.id}`,
        severity: eventDaysLeft !== null && eventDaysLeft <= 15 ? 'critical' : 'high',
        severityRank: eventDaysLeft !== null && eventDaysLeft <= 15 ? 1 : 2,
        category: 'order_blocked_approval',
        customerName: ord.customer_name,
        referenceCode: ord.order_number,
        problem: `${reasonText}.${eventSuffix}`,
        deadline: ord.event_date || ord.estimated_delivery_date,
        responsibleName: ord.owner_name || 'Gestor da Unidade',
        impact: 'Produção em São Paulo ainda não liberada',
        recommendedAction: !ord.grade_approved ? 'Solicitar aprovação da grade' : 'Resolver bloqueio de liberação',
        actionTab: 'orders',
        actionEntityId: ord.id,
      });
    } else if (
      (estDaysLeft !== null && estDaysLeft < 0 && ord.logistics_status !== 'delivered') ||
      (eventDaysLeft !== null && eventDaysLeft <= 10 && ord.logistics_status !== 'dispatched')
    ) {
      upsert({
        id: `prio_delay_${ord.id}`,
        dedupeKey: `order:${ord.id}`,
        severity: 'critical',
        severityRank: 1,
        category: estDaysLeft !== null && estDaysLeft < 0 ? 'order_delay_risk' : 'upcoming_event_delivery',
        customerName: ord.customer_name,
        referenceCode: ord.order_number,
        problem:
          estDaysLeft !== null && estDaysLeft < 0
            ? `Previsão vencida há ${Math.abs(estDaysLeft)} dia(s) sem entrega concluída.`
            : `Evento do cliente em ${eventDaysLeft} dia(s) com expedição ainda '${ord.logistics_status}'.`,
        deadline: ord.event_date || ord.estimated_delivery_date,
        responsibleName: ord.owner_name || 'PCP / Unidade',
        impact: 'Risco direto no prazo do evento do cliente',
        recommendedAction: 'Verificar fila PCP / expedição',
        actionTab: 'orders',
        actionEntityId: ord.id,
      });
    }
  }

  // 2. Artes em ajustes ou revisão pendente
  const artsRes = await client.query<{
    id: string;
    title: string;
    status: string;
    customer_name: string;
    assignee_name: string | null;
    updated_at: string;
  }>(
    `SELECT ap.id, ap.title, ap.status, c.name AS customer_name, p.full_name AS assignee_name, ap.updated_at::text
     FROM portal.art_projects ap
     JOIN portal.customers c ON c.id = ap.customer_id
     LEFT JOIN portal.profiles p ON p.id = ap.assignee_user_id
     WHERE ap.unit_id = $1
       AND ap.is_sandbox = $2
       AND ap.status IN ('ajustes', 'revisao_interna', 'enviado_ao_cliente')`,
    [unitId, isSandbox]
  );

  for (const art of artsRes.rows) {
    const isRevision = art.status === 'ajustes';
    upsert({
      id: `prio_art_${art.id}`,
      dedupeKey: `art:${art.id}`,
      severity: isRevision ? 'high' : 'medium',
      severityRank: isRevision ? 2 : 4,
      category: 'art_revision_required',
      customerName: art.customer_name,
      referenceCode: art.title,
      problem: isRevision
        ? 'Arte devolvida pelo cliente/revisão solicitando ajustes.'
        : `Arte aguardando ação (${art.status.replace(/_/g, ' ')}).`,
      deadline: null,
      responsibleName: art.assignee_name || 'Designer da Unidade',
      impact: 'Impede aprovação final da versão de arte',
      recommendedAction: isRevision ? 'Subir nova versão corrigida' : 'Cobrar aprovação do cliente',
      actionTab: 'studio',
      actionEntityId: art.id,
    });
  }

  // 3. Parcelas vencidas
  const recsRes = await client.query<{
    id: string;
    description: string;
    due_date: string;
    amount_cents: string;
    paid_cents: string;
    customer_name: string | null;
    order_number: string | null;
  }>(
    `SELECT r.id, r.description, r.due_date::text, r.amount_cents::text, r.paid_cents::text,
            c.name AS customer_name, o.order_number
     FROM portal.receivables r
     LEFT JOIN portal.customers c ON c.id = r.customer_id
     LEFT JOIN portal.orders o ON o.id = r.order_id
     WHERE r.unit_id = $1
       AND r.is_sandbox = $2
       AND r.status IN ('pending', 'partial', 'overdue')
       AND r.due_date < CURRENT_DATE`,
    [unitId, isSandbox]
  );

  for (const r of recsRes.rows) {
    const openCents = Number(r.amount_cents) - Number(r.paid_cents);
    upsert({
      id: `prio_rec_${r.id}`,
      dedupeKey: `receivable:${r.id}`,
      severity: 'critical',
      severityRank: 1,
      category: 'receivable_overdue',
      customerName: r.customer_name || 'Recebimento da Unidade',
      referenceCode: r.order_number || r.description,
      problem: `Parcela vencida desde ${r.due_date.split('-').reverse().join('/')}. Saldo aberto de ${(openCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`,
      deadline: r.due_date,
      responsibleName: 'Financeiro da Unidade',
      impact: 'Atraso em caixa e possível bloqueio de liberação',
      recommendedAction: 'Cobrar cliente e registrar baixa',
      actionTab: 'finance',
      actionEntityId: r.id,
    });
  }

  // 4. Propostas aguardando acompanhamento
  const quotesRes = await client.query<{
    id: string;
    quote_number: string;
    valid_until: string | null;
    total_cents: string;
    customer_name: string;
  }>(
    `SELECT q.id, q.quote_number, q.valid_until::text, q.total_cents::text, c.name AS customer_name
     FROM portal.quotes q
     JOIN portal.customers c ON c.id = q.customer_id
     WHERE q.unit_id = $1
       AND q.is_sandbox = $2
       AND q.status = 'sent'`,
    [unitId, isSandbox]
  );

  for (const q of quotesRes.rows) {
    upsert({
      id: `prio_quote_${q.id}`,
      dedupeKey: `quote:${q.id}`,
      severity: 'medium',
      severityRank: 3,
      category: 'quote_followup',
      customerName: q.customer_name,
      referenceCode: q.quote_number,
      problem: `Proposta ${q.quote_number} (${(Number(q.total_cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}) aguardando retorno do cliente.`,
      deadline: q.valid_until,
      responsibleName: 'Vendedor / Gestor',
      impact: 'Risco de perda de oportunidade por demora no follow-up',
      recommendedAction: 'Realizar follow-up da proposta',
      actionTab: 'quotes',
      actionEntityId: q.id,
    });
  }

  // 5. Chamados SAC que exigem resposta
  const ticketsRes = await client.query<{
    id: string;
    ticket_number: string;
    subject: string;
    priority: string;
    status: string;
    sla_due_at: string | null;
    customer_name: string | null;
  }>(
    `SELECT st.id, st.ticket_number, st.subject, st.priority, st.status, st.sla_due_at::text, c.name AS customer_name
     FROM portal.support_tickets st
     LEFT JOIN portal.customers c ON c.id = st.customer_id
     WHERE st.unit_id = $1
       AND st.is_sandbox = $2
       AND st.status IN ('waiting_unit', 'open')`,
    [unitId, isSandbox]
  );

  for (const t of ticketsRes.rows) {
    const waitingUnit = t.status === 'waiting_unit';
    upsert({
      id: `prio_ticket_${t.id}`,
      dedupeKey: `ticket:${t.id}`,
      severity: waitingUnit || t.priority === 'urgent' ? 'high' : 'medium',
      severityRank: waitingUnit ? 2 : 3,
      category: 'ticket_waiting_unit',
      customerName: t.customer_name || 'Atendimento Franqueadora',
      referenceCode: t.ticket_number,
      problem: waitingUnit
        ? `Chamado ${t.ticket_number} aguardando retorno da unidade: ${t.subject}`
        : `Chamado ${t.ticket_number} em aberto (${t.subject}).`,
      deadline: t.sla_due_at ? t.sla_due_at.slice(0, 10) : null,
      responsibleName: waitingUnit ? 'Gestor da Unidade' : 'Suporte Franqueadora',
      impact: 'Prazo de resolução / SLA em andamento',
      recommendedAction: waitingUnit ? 'Responder chamado no SAC' : 'Acompanhar tratativa',
      actionTab: 'support',
      actionEntityId: t.id,
    });
  }

  // 6. Documentos obrigatórios pendentes
  const docsRes = await client.query<{
    id: string;
    title: string;
    requirement_level: string;
    status: string;
    valid_until: string | null;
  }>(
    `SELECT id, title, requirement_level, status, valid_until::text
     FROM portal.documents
     WHERE unit_id = $1
       AND requirement_level IN ('mandatory_onboarding', 'mandatory_order_production')
       AND status NOT IN ('approved', 'signed')`,
    [unitId]
  );

  for (const doc of docsRes.rows) {
    upsert({
      id: `prio_doc_${doc.id}`,
      dedupeKey: `document:${doc.id}`,
      severity: doc.requirement_level === 'mandatory_onboarding' ? 'high' : 'medium',
      severityRank: doc.requirement_level === 'mandatory_onboarding' ? 2 : 3,
      category: 'document_pending',
      customerName: 'Documentação Obrigatória',
      referenceCode: doc.title,
      problem: `Documento obrigatório com status '${doc.status}'.`,
      deadline: doc.valid_until,
      responsibleName: 'Gestor da Unidade',
      impact: 'Pode bloquear habilitação ou liberação de pedido à fábrica',
      recommendedAction: 'Enviar ou regularizar documento',
      actionTab: 'documents',
      actionEntityId: doc.id,
    });
  }

  return Array.from(map.values()).sort((a, b) => {
    if (a.severityRank !== b.severityRank) return a.severityRank - b.severityRank;
    if (a.deadline && b.deadline) return a.deadline.localeCompare(b.deadline);
    if (a.deadline) return -1;
    if (b.deadline) return 1;
    return a.referenceCode.localeCompare(b.referenceCode);
  });
}
