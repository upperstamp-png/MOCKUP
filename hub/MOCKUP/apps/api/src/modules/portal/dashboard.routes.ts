import { FastifyInstance } from 'fastify';
import { dbPool, dbQuery } from '../../plugins/db.js';
import { requirePortalAuth } from '../../middleware/portalAuth.js';
import { buildConsolidatedPriorities } from '../../services/businessEngine.js';

function resolvePeriodStart(period: string): { label: string; startIso: string | null } {
  const now = new Date();
  if (period === 'today') {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    return { label: 'Hoje', startIso: start.toISOString() };
  }
  if (period === '7d') {
    return {
      label: 'Últimos 7 dias',
      startIso: new Date(now.getTime() - 7 * 86_400_000).toISOString(),
    };
  }
  if (period === '90d') {
    return {
      label: 'Últimos 90 dias',
      startIso: new Date(now.getTime() - 90 * 86_400_000).toISOString(),
    };
  }
  if (period === 'all') {
    return { label: 'Todo o histórico', startIso: null };
  }
  // default: current month ('month')
  const startMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return { label: 'Mês atual', startIso: startMonth.toISOString() };
}

export async function portalDashboardRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get('/my-day', { preHandler: [requirePortalAuth] }, async (request, reply) => {
    const ctx = request.portal!;
    const query = request.query as { period?: string; sandbox?: string };
    const periodKey = query.period || 'month';
    const isSandbox = query.sandbox === 'true';
    const { label: periodLabel, startIso } = resolvePeriodStart(periodKey);

    const unitId = ctx.activeUnitId;

    // 1. Pendências de implantação / habilitação (sem misturar capacitação com produção)
    const [unitRes, missingDocsRes, coursesProgressRes, commConfigRes] = await Promise.all([
        dbQuery<{
          id: string;
          code: string;
          name: string;
          operational_status: string;
          training_completed: boolean;
          banca_approved: boolean;
          implantation_approved: boolean;
          implantation_notes: string | null;
          initial_franchise_fee_cents: string;
          initial_fee_status: string;
        }>(
          `SELECT id, code, name, operational_status, training_completed, banca_approved,
                  implantation_approved, implantation_notes, initial_franchise_fee_cents::text, initial_fee_status
           FROM portal.units WHERE id = $1`,
          [unitId]
        ),
        dbQuery<{ id: string; title: string; status: string }>(
          `SELECT id, title, status
           FROM portal.documents
           WHERE unit_id = $1 AND requirement_level = 'mandatory_onboarding' AND status NOT IN ('approved', 'signed')`,
          [unitId]
        ),
        dbQuery<{
          total_courses: string;
          completed_courses: string;
          total_lessons: string;
          completed_lessons: string;
        }>(
          `SELECT
             (SELECT COUNT(*)::text FROM portal.courses WHERE is_published = TRUE AND is_mandatory = TRUE) AS total_courses,
             (SELECT COUNT(*)::text FROM portal.enrollments e JOIN portal.courses c ON c.id = e.course_id
              WHERE e.unit_id = $1 AND e.user_id = $2 AND e.status = 'completed' AND c.is_mandatory = TRUE) AS completed_courses,
             (SELECT COUNT(*)::text FROM portal.lessons l JOIN portal.courses c ON c.id = l.course_id
              WHERE l.is_published = TRUE AND c.is_published = TRUE) AS total_lessons,
             (SELECT COUNT(*)::text FROM portal.lesson_progress lp
              WHERE lp.unit_id = $1 AND lp.user_id = $2 AND lp.status = 'completed') AS completed_lessons`,
          [unitId, ctx.userId]
        ),
        dbQuery<{
          config_status: string;
          commercial_modality: string;
          territory_rule_status: string;
        }>(
          `SELECT config_status, commercial_modality, territory_rule_status
           FROM portal.unit_commercial_configs WHERE unit_id = $1`,
          [unitId]
        ),
      ]);

      const unit = unitRes.rows[0];
      const implantationTasks: Array<{ key: string; label: string; tab: string; detail: string }> = [];
      if (!unit.training_completed) {
        implantationTasks.push({
          key: 'training',
          label: 'Concluir trilha obrigatória da Universidade King Sports',
          tab: 'training',
          detail: 'Capacitação do franqueado ainda não finalizada.',
        });
      }
      if (!unit.banca_approved) {
        implantationTasks.push({
          key: 'banca',
          label: 'Aprovação na Banca Prática (Sandbox)',
          tab: 'sandbox',
          detail: 'Submeter simulação de atendimento comercial e arte no Sandbox.',
        });
      }
      for (const doc of missingDocsRes.rows) {
        implantationTasks.push({
          key: `doc_${doc.id}`,
          label: `Regularizar documento obrigatório: ${doc.title}`,
          tab: 'documents',
          detail: `Status atual: ${doc.status}`,
        });
      }
      if (!unit.implantation_approved || unit.operational_status !== 'active') {
        implantationTasks.push({
          key: 'unit_enablement',
          label: 'Habilitação operacional final da franqueadora',
          tab: 'settings',
          detail: unit.implantation_notes || `Status da unidade: ${unit.operational_status}`,
        });
      }

      // 2. Indicadores Comerciais e Financeiros do Período (excluindo cancelados e taxa inicial!)
      const periodFilterOpp = startIso ? `AND created_at >= $3` : '';
      const periodFilterQuote = startIso ? `AND COALESCE(sent_at, created_at) >= $3` : '';
      const periodFilterOrder = startIso ? `AND created_at >= $3` : '';
      const periodFilterPay = startIso ? `AND occurred_at >= $3` : '';
      const periodParams = startIso ? [unitId, isSandbox, startIso] : [unitId, isSandbox];

      const [
        openOppsRes,
        sentQuotesRes,
        quoteConversionRes,
        confirmedOrdersRes,
        receivedPaymentsRes,
        openReceivablesRes,
      ] = await Promise.all([
        dbQuery<{ cnt: string; total_cents: string }>(
          `SELECT COUNT(*)::text AS cnt, COALESCE(SUM(estimated_value_cents), 0)::text AS total_cents
           FROM portal.opportunities
           WHERE unit_id = $1 AND is_sandbox = $2 AND status = 'open' ${periodFilterOpp}`,
          periodParams
        ),
        dbQuery<{ cnt: string; total_cents: string }>(
          `SELECT COUNT(*)::text AS cnt, COALESCE(SUM(total_cents), 0)::text AS total_cents
           FROM portal.quotes
           WHERE unit_id = $1 AND is_sandbox = $2 AND status IN ('sent', 'approved', 'converted') ${periodFilterQuote}`,
          periodParams
        ),
        dbQuery<{ sent_count: string; converted_count: string }>(
          `SELECT
             COUNT(*) FILTER (WHERE status IN ('sent', 'approved', 'rejected', 'expired', 'converted'))::text AS sent_count,
             COUNT(*) FILTER (WHERE status IN ('approved', 'converted'))::text AS converted_count
           FROM portal.quotes
           WHERE unit_id = $1 AND is_sandbox = $2 ${periodFilterQuote}`,
          periodParams
        ),
        dbQuery<{ cnt: string; total_cents: string }>(
          `SELECT COUNT(*)::text AS cnt, COALESCE(SUM(total_cents), 0)::text AS total_cents
           FROM portal.orders
           WHERE unit_id = $1 AND is_sandbox = $2 AND commercial_status = 'confirmed' ${periodFilterOrder}`,
          periodParams
        ),
        dbQuery<{ net_received_cents: string }>(
          `SELECT COALESCE(SUM(
             CASE
               WHEN transaction_type = 'payment' AND confirmation_status = 'confirmed' THEN amount_cents
               WHEN transaction_type = 'reversal' AND confirmation_status = 'confirmed' THEN -amount_cents
               ELSE 0
             END
           ), 0)::text AS net_received_cents
           FROM portal.payment_transactions
           WHERE unit_id = $1 AND is_sandbox = $2 ${periodFilterPay}`,
          periodParams
        ),
        dbQuery<{ balance_cents: string; overdue_cents: string }>(
          `SELECT
             COALESCE(SUM(amount_cents - paid_cents), 0)::text AS balance_cents,
             COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN amount_cents - paid_cents ELSE 0 END), 0)::text AS overdue_cents
           FROM portal.receivables
           WHERE unit_id = $1 AND is_sandbox = $2 AND status IN ('pending', 'partial', 'overdue')`,
          [unitId, isSandbox]
        ),
      ]);

      const sentTotal = Number(quoteConversionRes.rows[0]?.sent_count || 0);
      const convertedTotal = Number(quoteConversionRes.rows[0]?.converted_count || 0);
      const conversionPct = sentTotal > 0 ? Number(((convertedTotal / sentTotal) * 100).toFixed(1)) : null;

      // 3. Indicadores Operacionais (Fotografia Atual)
      const [
        artsWaitingRes,
        ordersInProdRes,
        ordersDelayedRes,
        upcomingDeliveriesRes,
        openTicketsRes,
      ] = await Promise.all([
        dbQuery<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt
           FROM portal.art_projects
           WHERE unit_id = $1 AND is_sandbox = $2 AND status IN ('briefing_pendente', 'em_criacao', 'revisao_interna', 'enviado_ao_cliente', 'ajustes')`,
          [unitId, isSandbox]
        ),
        dbQuery<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt
           FROM portal.orders
           WHERE unit_id = $1 AND is_sandbox = $2 AND commercial_status = 'confirmed'
             AND production_status IN ('queued_pcp', 'sublimation', 'cutting', 'embroidery_tpu', 'sewing', 'quality_check')`,
          [unitId, isSandbox]
        ),
        dbQuery<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt
           FROM portal.orders
           WHERE unit_id = $1 AND is_sandbox = $2 AND commercial_status = 'confirmed'
             AND logistics_status <> 'delivered'
             AND estimated_delivery_date IS NOT NULL
             AND estimated_delivery_date < CURRENT_DATE`,
          [unitId, isSandbox]
        ),
        dbQuery<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt
           FROM portal.orders
           WHERE unit_id = $1 AND is_sandbox = $2 AND commercial_status = 'confirmed'
             AND logistics_status <> 'delivered'
             AND estimated_delivery_date IS NOT NULL
             AND estimated_delivery_date >= CURRENT_DATE
             AND estimated_delivery_date <= CURRENT_DATE + INTERVAL '14 days'`,
          [unitId, isSandbox]
        ),
        dbQuery<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt
           FROM portal.support_tickets
           WHERE unit_id = $1 AND is_sandbox = $2 AND status IN ('open', 'in_progress', 'waiting_unit')`,
          [unitId, isSandbox]
        ),
      ]);

      // 4. Prioridades do Dia consolidadas + 5/6/7 em paralelo sem reter conexão do pool à toa
      const [priorities, agendaRes, scheduleEventsRes, featuredOrdersRes, announcementsRes] = await Promise.all([
        (async () => {
          const client = await dbPool.connect();
          try {
            return await buildConsolidatedPriorities(client, unitId, isSandbox);
          } finally {
            client.release();
          }
        })(),
        dbQuery(
          `SELECT t.id, t.task_type, t.title, t.description, t.due_at, t.status, t.priority,
                  c.name AS customer_name, o.order_number, p.full_name AS assigned_name
           FROM portal.tasks t
           LEFT JOIN portal.customers c ON c.id = t.customer_id
           LEFT JOIN portal.orders o ON o.id = t.order_id
           LEFT JOIN portal.profiles p ON p.id = t.assigned_to
           WHERE t.unit_id = $1 AND t.is_sandbox = $2 AND t.status IN ('pending', 'in_progress')
           ORDER BY t.due_at ASC
           LIMIT 12`,
          [unitId, isSandbox]
        ),
        dbQuery(
          `SELECT se.*,
                  c.name AS customer_name,
                  o.order_number,
                  p.full_name AS assigned_name
           FROM portal.schedule_events se
           LEFT JOIN portal.customers c ON c.id = se.customer_id
           LEFT JOIN portal.orders o ON o.id = se.order_id
           LEFT JOIN portal.profiles p ON p.id = se.assigned_to
           WHERE se.unit_id = $1
             AND se.is_sandbox = $2
             AND se.status IN ('scheduled', 'confirmed')
             AND se.end_at >= NOW() - INTERVAL '1 day'
           ORDER BY se.start_at ASC
           LIMIT 12`,
          [unitId, isSandbox]
        ),
        dbQuery(
          `SELECT
             o.id,
             o.order_number,
             c.name AS customer_name,
             o.commercial_status,
             o.financial_status,
             o.approval_status,
             o.production_status,
             o.logistics_status,
             o.grade_approved,
             o.estimated_delivery_date,
             o.event_date,
             o.release_block_reasons,
             COALESCE((SELECT SUM(oi.quantity) FROM portal.order_items oi WHERE oi.order_id = o.id), 0)::int AS total_pieces
           FROM portal.orders o
           JOIN portal.customers c ON c.id = o.customer_id
           WHERE o.unit_id = $1 AND o.is_sandbox = $2 AND o.commercial_status <> 'canceled' AND o.logistics_status <> 'delivered'
           ORDER BY COALESCE(o.event_date, o.estimated_delivery_date, CURRENT_DATE + 90) ASC, o.created_at DESC
           LIMIT 8`,
          [unitId, isSandbox]
        ),
        dbQuery(
          `SELECT id, title, body, category, is_pinned, published_at
           FROM portal.announcements
           WHERE is_active = TRUE
           ORDER BY is_pinned DESC, published_at DESC
           LIMIT 5`
        ),
      ]);

      return reply.send({
        generatedAt: new Date().toISOString(),
        period: { key: periodKey, label: periodLabel },
        unitGovernance: {
          unitCode: unit.code,
          unitName: unit.name,
          operationalStatus: unit.operational_status,
          trainingCompleted: unit.training_completed,
          bancaApproved: unit.banca_approved,
          implantationApproved: unit.implantation_approved,
          commercialConfigStatus: commConfigRes.rows[0]?.config_status ?? 'not_configured',
          commercialModality: commConfigRes.rows[0]?.commercial_modality ?? 'pending_definition',
          territoryRuleStatus: commConfigRes.rows[0]?.territory_rule_status ?? 'not_configured',
          implantationPendingItems: implantationTasks,
          initialFranchiseFeeCents: Number(unit.initial_franchise_fee_cents),
          initialFeeNote:
            'A taxa inicial de franquia (R$ 20.000,00) é item contratual e não entra em faturamento comercial da unidade.',
        },
        commercialKpis: {
          periodLabel,
          openOpportunities: {
            count: Number(openOppsRes.rows[0]?.cnt || 0),
            estimatedValueCents: Number(openOppsRes.rows[0]?.total_cents || 0),
            definition: 'Oportunidades com status aberto criadas no período selecionado.',
          },
          sentQuotes: {
            count: Number(sentQuotesRes.rows[0]?.cnt || 0),
            totalValueCents: Number(sentQuotesRes.rows[0]?.total_cents || 0),
            definition: 'Orçamentos enviados, aprovados ou convertidos no período (exclui rascunhos).',
          },
          proposalConversion: {
            ratePct: conversionPct,
            convertedCount: convertedTotal,
            baseCount: sentTotal,
            definition:
              sentTotal > 0
                ? `${convertedTotal} aprovados/convertidos de ${sentTotal} orçamentos enviados no período.`
                : 'Sem base comparável suficiente no período selecionado.',
          },
          confirmedOrders: {
            count: Number(confirmedOrdersRes.rows[0]?.cnt || 0),
            totalValueCents: Number(confirmedOrdersRes.rows[0]?.total_cents || 0),
            definition:
              'Valor total contratado em pedidos com status comercial confirmado no período (exclui cancelados e não representa caixa nem lucro).',
          },
          receivedValue: {
            amountCents: Number(receivedPaymentsRes.rows[0]?.net_received_cents || 0),
            definition:
              'Somatório de pagamentos confirmados descontados estornos confirmados dentro do período.',
          },
          openReceivablesBalance: {
            amountCents: Number(openReceivablesRes.rows[0]?.balance_cents || 0),
            overdueCents: Number(openReceivablesRes.rows[0]?.overdue_cents || 0),
            definition: 'Fotografia atual do saldo líquido ainda a receber em parcelas em aberto.',
          },
        },
        operationSnapshotKpis: {
          artsAwaitingAction: {
            count: Number(artsWaitingRes.rows[0]?.cnt || 0),
            definition: 'Fotografia atual de projetos de arte em briefing, criação, revisão ou ajustes.',
          },
          ordersInProduction: {
            count: Number(ordersInProdRes.rows[0]?.cnt || 0),
            definition: 'Fotografia atual de pedidos confirmados e já liberados nas etapas fabris de SP.',
          },
          delayedOrders: {
            count: Number(ordersDelayedRes.rows[0]?.cnt || 0),
            definition: 'Pedidos ativos cuja previsão de entrega já expirou e ainda não constam como entregues.',
          },
          upcomingDeliveries: {
            count: Number(upcomingDeliveriesRes.rows[0]?.cnt || 0),
            definition: 'Pedidos com entrega prevista nos próximos 14 dias.',
          },
          openTickets: {
            count: Number(openTicketsRes.rows[0]?.cnt || 0),
            definition: 'Chamados SAC abertos, em atendimento ou aguardando resposta da unidade.',
          },
        },
        priorities,
        agenda: agendaRes.rows,
        scheduleEvents: scheduleEventsRes.rows,
        featuredOrders: featuredOrdersRes.rows,
        trainingSummary: {
          totalMandatoryCourses: Number(coursesProgressRes.rows[0]?.total_courses || 0),
          completedMandatoryCourses: Number(coursesProgressRes.rows[0]?.completed_courses || 0),
          totalLessons: Number(coursesProgressRes.rows[0]?.total_lessons || 0),
          completedLessons: Number(coursesProgressRes.rows[0]?.completed_lessons || 0),
        },
        announcements: announcementsRes.rows,
      });
  });
}
