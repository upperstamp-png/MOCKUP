import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { dbQuery, withTransaction } from '../../plugins/db.js';
import {
  assertUnitOwnership,
  requirePermission,
  requirePortalAuth,
} from '../../middleware/portalAuth.js';
import { recalculateReceivableAndOrderFinancials } from '../../services/businessEngine.js';
import {
  logIntegrationAttempt,
  notifyUnitRoles,
  recordAuditLog,
} from '../../services/auditAndNotify.js';
import {
  createAuthorizedSignedUrl,
  parseDataUrlToBuffer,
  uploadPrivatePortalFile,
} from '../../services/storageService.js';

export async function portalFinanceRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/finance/summary (com bloqueio honesto de regras não configuradas + separação taxa inicial R$ 20k)
  fastify.get(
    '/summary',
    { preHandler: [requirePortalAuth, requirePermission('finance:read')] },
    async (request, reply) => {
      const ctx = request.portal!;
      const q = request.query as { period?: string; sandbox?: string };
      const isSandbox = q.sandbox === 'true';

      let startIso: string | null = null;
      const now = new Date();
      if (q.period === '7d') startIso = new Date(now.getTime() - 7 * 86_400_000).toISOString();
      else if (q.period === '90d') startIso = new Date(now.getTime() - 90 * 86_400_000).toISOString();
      else if (q.period === 'all') startIso = null;
      else startIso = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();

      const periodFilterOrder = startIso ? `AND created_at >= $3` : '';
      const periodFilterTx = startIso ? `AND occurred_at >= $3` : '';
      const params = startIso ? [ctx.activeUnitId, isSandbox, startIso] : [ctx.activeUnitId, isSandbox];

      const [unitRes, cfgRes, ordersRes, txRes, receivablesRes, expensesRes] = await Promise.all([
        dbQuery<{ initial_franchise_fee_cents: string; initial_fee_status: string }>(
          `SELECT initial_franchise_fee_cents::text, initial_fee_status FROM portal.units WHERE id = $1`,
          [ctx.activeUnitId]
        ),
        dbQuery(
          `SELECT * FROM portal.unit_commercial_configs WHERE unit_id = $1`,
          [ctx.activeUnitId]
        ),
        dbQuery<{ confirmed_cents: string; canceled_cents: string }>(
          `SELECT
             COALESCE(SUM(CASE WHEN commercial_status = 'confirmed' THEN total_cents ELSE 0 END), 0)::text AS confirmed_cents,
             COALESCE(SUM(CASE WHEN commercial_status = 'canceled' THEN total_cents ELSE 0 END), 0)::text AS canceled_cents
           FROM portal.orders
           WHERE unit_id = $1 AND is_sandbox = $2 ${periodFilterOrder}`,
          params
        ),
        dbQuery<{
          confirmed_received_cents: string;
          pending_validation_cents: string;
          reversed_cents: string;
        }>(
          `SELECT
             COALESCE(SUM(CASE WHEN transaction_type = 'payment' AND confirmation_status = 'confirmed' THEN amount_cents ELSE 0 END), 0)::text AS confirmed_received_cents,
             COALESCE(SUM(CASE WHEN transaction_type = 'payment' AND confirmation_status = 'pending_validation' THEN amount_cents ELSE 0 END), 0)::text AS pending_validation_cents,
             COALESCE(SUM(CASE WHEN transaction_type = 'reversal' AND confirmation_status = 'confirmed' THEN amount_cents ELSE 0 END), 0)::text AS reversed_cents
           FROM portal.payment_transactions
           WHERE unit_id = $1 AND is_sandbox = $2 ${periodFilterTx}`,
          params
        ),
        dbQuery<{ open_cents: string; overdue_cents: string }>(
          `SELECT
             COALESCE(SUM(amount_cents - paid_cents), 0)::text AS open_cents,
             COALESCE(SUM(CASE WHEN due_date < CURRENT_DATE THEN amount_cents - paid_cents ELSE 0 END), 0)::text AS overdue_cents
           FROM portal.receivables
           WHERE unit_id = $1 AND is_sandbox = $2 AND status IN ('pending', 'partial', 'overdue')`,
          [ctx.activeUnitId, isSandbox]
        ),
        dbQuery<{
          total_expenses_cents: string;
          paid_expenses_cents: string;
          pending_factory_cents: string;
        }>(
          `SELECT
             COALESCE(SUM(CASE WHEN status <> 'canceled' THEN amount_cents ELSE 0 END), 0)::text AS total_expenses_cents,
             COALESCE(SUM(CASE WHEN status = 'paid' THEN paid_cents ELSE 0 END), 0)::text AS paid_expenses_cents,
             COALESCE(SUM(CASE WHEN status = 'pending' AND expense_category = 'pagamento_fabrica' THEN amount_cents - paid_cents ELSE 0 END), 0)::text AS pending_factory_cents
           FROM portal.expenses
           WHERE unit_id = $1 AND is_sandbox = $2`,
          [ctx.activeUnitId, isSandbox]
        ),
      ]);

      const cfg = cfgRes.rows[0];
      const confirmedReceivedCents = Number(txRes.rows[0]?.confirmed_received_cents || 0);
      const reversedCents = Number(txRes.rows[0]?.reversed_cents || 0);
      const netReceivedCents = Math.max(0, confirmedReceivedCents - reversedCents);

      const apportionmentReady =
        cfg &&
        cfg.config_status === 'approved' &&
        cfg.commercial_modality !== 'pending_definition' &&
        cfg.royalty_bps !== null &&
        cfg.marketing_fund_bps !== null;

      let apportionmentBreakdown: {
        available: boolean;
        reason?: string;
        modality?: string;
        estimatedRoyaltiesCents?: number;
        estimatedMarketingFundCents?: number;
        estimatedFactoryTransferCents?: number | null;
      };

      if (!apportionmentReady) {
        apportionmentBreakdown = {
          available: false,
          reason:
            'Regras de royalties, fundo de marketing, split ou modalidade (revenda vs intermediação) ainda não configuradas e aprovadas pela franqueadora para esta unidade. Nenhum percentual automático foi aplicado.',
        };
      } else {
        apportionmentBreakdown = {
          available: true,
          modality: cfg.commercial_modality,
          estimatedRoyaltiesCents: Math.round((netReceivedCents * Number(cfg.royalty_bps)) / 10000),
          estimatedMarketingFundCents: Math.round((netReceivedCents * Number(cfg.marketing_fund_bps)) / 10000),
          estimatedFactoryTransferCents:
            cfg.factory_transfer_bps !== null
              ? Math.round((netReceivedCents * Number(cfg.factory_transfer_bps)) / 10000)
              : null,
        };
      }

      return reply.send({
        contractualGovernance: {
          initialFranchiseFeeCents: Number(unitRes.rows[0]?.initial_franchise_fee_cents || 2000000),
          initialFeeStatus: unitRes.rows[0]?.initial_fee_status || 'contract_defined',
          includedInCommercialRevenue: false,
          note: 'A taxa inicial de franquia (R$ 20.000,00) é um compromisso contratual de entrada e não compõe faturamento comercial ou vendas da unidade.',
        },
        commercialRules: cfg || null,
        apportionmentBreakdown,
        kpis: {
          confirmedOrdersValueCents: Number(ordersRes.rows[0]?.confirmed_cents || 0),
          canceledOrdersValueCents: Number(ordersRes.rows[0]?.canceled_cents || 0),
          netReceivedCents,
          pendingValidationCents: Number(txRes.rows[0]?.pending_validation_cents || 0),
          reversedCents,
          openReceivablesCents: Number(receivablesRes.rows[0]?.open_cents || 0),
          overdueReceivablesCents: Number(receivablesRes.rows[0]?.overdue_cents || 0),
          totalExpensesCents: Number(expensesRes.rows[0]?.total_expenses_cents || 0),
          paidExpensesCents: Number(expensesRes.rows[0]?.paid_expenses_cents || 0),
          pendingFactoryPayableCents: Number(expensesRes.rows[0]?.pending_factory_cents || 0),
        },
      });
    }
  );

  // GET /api/v1/finance/receivables
  fastify.get(
    '/receivables',
    { preHandler: [requirePortalAuth, requirePermission('finance:read')] },
    async (request, reply) => {
      const ctx = request.portal!;
      const q = request.query as { status?: string; sandbox?: string };
      const isSandbox = q.sandbox === 'true';

      const conditions = [`r.unit_id = $1`, `r.is_sandbox = $2`];
      const params: unknown[] = [ctx.activeUnitId, isSandbox];
      if (q.status && q.status !== 'todos') {
        conditions.push(`r.status = $3`);
        params.push(q.status);
      }

      const [receivablesRes, txRes] = await Promise.all([
        dbQuery(
          `SELECT r.*, o.order_number, o.commercial_status AS order_commercial_status, c.name AS customer_name
           FROM portal.receivables r
           LEFT JOIN portal.orders o ON o.id = r.order_id
           LEFT JOIN portal.customers c ON c.id = r.customer_id
           WHERE ${conditions.join(' AND ')}
           ORDER BY r.due_date ASC`,
          params
        ),
        dbQuery(
          `SELECT pt.*, r.description AS receivable_description, o.order_number
           FROM portal.payment_transactions pt
           JOIN portal.receivables r ON r.id = pt.receivable_id
           LEFT JOIN portal.orders o ON o.id = pt.order_id
           WHERE pt.unit_id = $1 AND pt.is_sandbox = $2
           ORDER BY pt.occurred_at DESC
           LIMIT 100`,
          [ctx.activeUnitId, isSandbox]
        ),
      ]);

      return reply.send({ receivables: receivablesRes.rows, transactions: txRes.rows });
    }
  );

  // POST /api/v1/finance/receivables
  fastify.post(
    '/receivables',
    { preHandler: [requirePortalAuth, requirePermission('finance:write')] },
    async (request, reply) => {
      const schema = z.object({
        orderId: z.string().uuid().optional().nullable(),
        customerId: z.string().uuid().optional().nullable(),
        installmentNumber: z.number().int().positive().default(1),
        totalInstallments: z.number().int().positive().default(1),
        description: z.string().min(3),
        dueDate: z.string(),
        amountCents: z.number().int().positive(),
        isSandbox: z.boolean().optional().default(false),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const ctx = request.portal!;
      const d = parsed.data;
      const todayIso = new Date().toISOString().slice(0, 10);
      const initialStatus = d.dueDate < todayIso ? 'overdue' : 'pending';

      const ins = await dbQuery(
        `INSERT INTO portal.receivables (
           unit_id, order_id, customer_id, installment_number, total_installments,
           description, due_date, amount_cents, status, is_sandbox, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          ctx.activeUnitId,
          d.orderId || null,
          d.customerId || null,
          d.installmentNumber,
          Math.max(d.totalInstallments, d.installmentNumber),
          d.description.trim(),
          d.dueDate,
          d.amountCents,
          initialStatus,
          d.isSandbox,
          ctx.userId,
        ]
      );
      return reply.status(201).send({ receivable: ins.rows[0] });
    }
  );

  // POST /api/v1/finance/payments (idempotente + upload comprovante + aguardando validação por padrão)
  fastify.post(
    '/payments',
    { preHandler: [requirePortalAuth, requirePermission('finance:write')] },
    async (request, reply) => {
      const schema = z.object({
        receivableId: z.string().uuid(),
        idempotencyKey: z.string().min(6).max(120).optional(),
        amountCents: z.number().int().positive(),
        paymentMethod: z.enum(['pix', 'boleto', 'cartao_link_externo', 'transferencia', 'dinheiro']),
        externalReference: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        confirmImmediately: z.boolean().optional().default(false),
        proofFile: z
          .object({
            fileName: z.string(),
            dataUrl: z.string(),
          })
          .optional()
          .nullable(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const d = parsed.data;
      const ctx = request.portal!;
      const idemKey = d.idempotencyKey || `pay_${ctx.activeUnitId}_${crypto.randomUUID()}`;

      // Checa idempotência antes de qualquer upload ou alteração
      const existingTx = await dbQuery(
        `SELECT * FROM portal.payment_transactions WHERE idempotency_key = $1`,
        [idemKey]
      );
      if (existingTx.rows[0]) {
        if (!assertUnitOwnership(request, reply, existingTx.rows[0].unit_id)) return;
        return reply.status(200).send({ transaction: existingTx.rows[0], idempotentReplay: true });
      }

      const recRes = await dbQuery<{
        id: string;
        unit_id: string;
        order_id: string | null;
        amount_cents: string;
        paid_cents: string;
        is_sandbox: boolean;
      }>(`SELECT id, unit_id, order_id, amount_cents::text, paid_cents::text, is_sandbox FROM portal.receivables WHERE id = $1`, [
        d.receivableId,
      ]);
      const rec = recRes.rows[0];
      if (!rec) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Parcela a receber não encontrada.' });
      }
      if (!assertUnitOwnership(request, reply, rec.unit_id)) return;

      const remainingCents = Number(rec.amount_cents) - Number(rec.paid_cents);
      if (d.amountCents > remainingCents) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'OVERPAYMENT_REJECTED',
          message: `Valor informado excede o saldo em aberto da parcela (${(remainingCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}).`,
        });
      }

      let proofStoragePath: string | null = null;
      if (d.proofFile?.dataUrl) {
        const decoded = parseDataUrlToBuffer(d.proofFile.dataUrl);
        if (!decoded) {
          return reply.status(400).send({ statusCode: 400, code: 'INVALID_PROOF_FILE', message: 'Comprovante inválido.' });
        }
        const stored = await uploadPrivatePortalFile({
          bucket: 'portal-receipts',
          unitId: rec.unit_id,
          folder: `receipts/${rec.id}`,
          fileName: d.proofFile.fileName,
          mimeType: decoded.mimeType,
          buffer: decoded.buffer,
        });
        proofStoragePath = stored.storagePath;
      }

      // Somente quem tem finance:reconcile pode confirmar na hora; comprovantes normais entram como aguardando validação
      const initialStatus =
        d.confirmImmediately && ctx.permissions.includes('finance:reconcile')
          ? 'confirmed'
          : 'pending_validation';

      const result = await withTransaction(async (client) => {
        const txRes = await client.query<{ id: string }>(
          `INSERT INTO portal.payment_transactions (
             unit_id, receivable_id, order_id, idempotency_key, transaction_type,
             amount_cents, payment_method, confirmation_status, gateway_provider,
             external_reference, proof_storage_path, notes, recorded_by, validated_by, validated_at, is_sandbox
           ) VALUES (
             $1,$2,$3,$4,'payment',$5,$6,$7,'manual',$8,$9,$10,$11,$12,$13,$14
           ) RETURNING *`,
          [
            rec.unit_id,
            rec.id,
            rec.order_id,
            idemKey,
            d.amountCents,
            d.paymentMethod,
            initialStatus,
            d.externalReference?.trim() || null,
            proofStoragePath,
            d.notes?.trim() || null,
            ctx.userId,
            initialStatus === 'confirmed' ? ctx.userId : null,
            initialStatus === 'confirmed' ? new Date().toISOString() : null,
            rec.is_sandbox,
          ]
        );

        const recalc = await recalculateReceivableAndOrderFinancials(client, rec.id);

        await recordAuditLog(
          {
            unitId: rec.unit_id,
            action: 'payment.recorded',
            entityType: 'payment_transaction',
            entityId: txRes.rows[0].id,
            afterState: { amountCents: d.amountCents, confirmationStatus: initialStatus, recalc },
            request,
          },
          client
        );

        return { transaction: txRes.rows[0], recalculated: recalc, idempotentReplay: false };
      });

      return reply.status(201).send(result);
    }
  );

  // POST /api/v1/finance/payments/:id/validate (confirma ou rejeita pagamento pendente de validação)
  fastify.post(
    '/payments/:id/validate',
    { preHandler: [requirePortalAuth, requirePermission('finance:reconcile')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const schema = z.object({ decision: z.enum(['confirmed', 'rejected']), notes: z.string().optional().nullable() });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const txRes = await dbQuery<{
        unit_id: string;
        receivable_id: string;
        confirmation_status: string;
        amount_cents: string;
      }>(`SELECT unit_id, receivable_id, confirmation_status, amount_cents::text FROM portal.payment_transactions WHERE id = $1`, [id]);

      const tx = txRes.rows[0];
      if (!tx) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Lançamento não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, tx.unit_id)) return;
      if (tx.confirmation_status !== 'pending_validation') {
        return reply.status(409).send({
          statusCode: 409,
          code: 'INVALID_TX_STATUS',
          message: `Lançamento já está com status '${tx.confirmation_status}'.`,
        });
      }

      const recalc = await withTransaction(async (client) => {
        await client.query(
          `UPDATE portal.payment_transactions SET
             confirmation_status = $1,
             validated_by = $2,
             validated_at = NOW(),
             notes = COALESCE($3, notes)
           WHERE id = $4`,
          [parsed.data.decision, request.portal!.userId, parsed.data.notes?.trim() || null, id]
        );
        const rec = await recalculateReceivableAndOrderFinancials(client, tx.receivable_id);
        await recordAuditLog(
          {
            unitId: tx.unit_id,
            action: `payment.${parsed.data.decision}`,
            entityType: 'payment_transaction',
            entityId: id,
            afterState: rec,
            request,
          },
          client
        );
        return rec;
      });

      return reply.send({ success: true, recalculated: recalc });
    }
  );

  // POST /api/v1/finance/payments/:id/reverse (estorno rastreado sem apagar histórico)
  fastify.post(
    '/payments/:id/reverse',
    { preHandler: [requirePortalAuth, requirePermission('finance:reverse')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const schema = z.object({ reason: z.string().min(4, 'Motivo do estorno obrigatório') });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const txRes = await dbQuery<{
        id: string;
        unit_id: string;
        receivable_id: string;
        order_id: string | null;
        transaction_type: string;
        confirmation_status: string;
        amount_cents: string;
        payment_method: string;
        is_sandbox: boolean;
      }>(`SELECT * FROM portal.payment_transactions WHERE id = $1`, [id]);

      const tx = txRes.rows[0];
      if (!tx) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Lançamento não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, tx.unit_id)) return;
      if (tx.transaction_type !== 'payment' || tx.confirmation_status !== 'confirmed') {
        return reply.status(409).send({
          statusCode: 409,
          code: 'CANNOT_REVERSE',
          message: 'Apenas pagamentos confirmados podem ser estornados.',
        });
      }

      const result = await withTransaction(async (client) => {
        const revRes = await client.query(
          `INSERT INTO portal.payment_transactions (
             unit_id, receivable_id, order_id, idempotency_key, transaction_type,
             reversed_transaction_id, amount_cents, payment_method, confirmation_status,
             gateway_provider, notes, recorded_by, validated_by, validated_at, is_sandbox
           ) VALUES (
             $1,$2,$3,$4,'reversal',$5,$6,$7,'confirmed','manual',$8,$9,$9,NOW(),$10
           ) RETURNING *`,
          [
            tx.unit_id,
            tx.receivable_id,
            tx.order_id,
            `rev_${tx.id}`,
            tx.id,
            tx.amount_cents,
            tx.payment_method,
            `Estorno: ${parsed.data.reason.trim()}`,
            request.portal!.userId,
            tx.is_sandbox,
          ]
        );

        await client.query(
          `UPDATE portal.payment_transactions SET confirmation_status = 'reversed' WHERE id = $1`,
          [tx.id]
        );

        const recalc = await recalculateReceivableAndOrderFinancials(client, tx.receivable_id);

        await notifyUnitRoles(
          tx.unit_id,
          ['franqueado'],
          {
            eventType: 'payment_reversed',
            title: 'Estorno financeiro registrado',
            body: `Estorno de ${(Number(tx.amount_cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} — Motivo: ${parsed.data.reason.trim()}`,
            actionUrl: '/?tab=finance',
            entityType: 'payment_transaction',
            entityId: tx.id,
          },
          client
        );

        await recordAuditLog(
          {
            unitId: tx.unit_id,
            action: 'payment.reversed',
            entityType: 'payment_transaction',
            entityId: tx.id,
            reason: parsed.data.reason.trim(),
            afterState: recalc,
            request,
          },
          client
        );

        return { reversalTransaction: revRes.rows[0], recalculated: recalc };
      });

      return reply.status(201).send(result);
    }
  );

  // GET /api/v1/finance/receipts/:txId/download (URL assinada privada do comprovante)
  fastify.get(
    '/receipts/:txId/download',
    { preHandler: [requirePortalAuth, requirePermission('finance:read')] },
    async (request, reply) => {
      const { txId } = request.params as { txId: string };
      const txRes = await dbQuery<{ unit_id: string; proof_storage_path: string | null }>(
        `SELECT unit_id, proof_storage_path FROM portal.payment_transactions WHERE id = $1`,
        [txId]
      );
      if (!txRes.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Lançamento não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, txRes.rows[0].unit_id)) return;
      if (!txRes.rows[0].proof_storage_path) {
        return reply.status(404).send({ statusCode: 404, code: 'NO_RECEIPT', message: 'Lançamento sem comprovante anexado.' });
      }

      const signedUrl = await createAuthorizedSignedUrl({
        bucket: 'portal-receipts',
        storagePath: txRes.rows[0].proof_storage_path,
        authorizedUnitId: txRes.rows[0].unit_id,
        allowNetworkScope: request.portal!.activeScope === 'network',
        expiresInSeconds: 300,
      });

      return reply.send({ signedUrl, expiresInSeconds: 300 });
    }
  );

  // GET /api/v1/finance/expenses & POST /api/v1/finance/expenses & POST /api/v1/finance/expenses/:id/pay
  fastify.get(
    '/expenses',
    { preHandler: [requirePortalAuth, requirePermission('finance:read')] },
    async (request, reply) => {
      const ctx = request.portal!;
      const q = request.query as { sandbox?: string };
      const rows = await dbQuery(
        `SELECT e.*, o.order_number
         FROM portal.expenses e
         LEFT JOIN portal.orders o ON o.id = e.order_id
         WHERE e.unit_id = $1 AND e.is_sandbox = $2
         ORDER BY e.due_date ASC`,
        [ctx.activeUnitId, q.sandbox === 'true']
      );
      return reply.send({ items: rows.rows });
    }
  );

  fastify.post(
    '/expenses',
    { preHandler: [requirePortalAuth, requirePermission('finance:write')] },
    async (request, reply) => {
      const schema = z.object({
        orderId: z.string().uuid().optional().nullable(),
        expenseCategory: z.enum([
          'pagamento_fabrica',
          'frete',
          'servico_adicional',
          'taxa_rede',
          'despesa_operacional',
          'retrabalho',
        ]),
        description: z.string().min(3),
        vendorName: z.string().optional().nullable(),
        dueDate: z.string(),
        amountCents: z.number().int().nonnegative(),
        notes: z.string().optional().nullable(),
        isSandbox: z.boolean().optional().default(false),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const d = parsed.data;
      const ctx = request.portal!;
      const inserted = await dbQuery(
        `INSERT INTO portal.expenses (
           unit_id, order_id, expense_category, description, vendor_name, due_date,
           amount_cents, status, config_basis, notes, is_sandbox, created_by
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,'pending','manual',$8,$9,$10) RETURNING *`,
        [
          ctx.activeUnitId,
          d.orderId || null,
          d.expenseCategory,
          d.description.trim(),
          d.vendorName?.trim() || null,
          d.dueDate,
          d.amountCents,
          d.notes?.trim() || null,
          d.isSandbox,
          ctx.userId,
        ]
      );
      return reply.status(201).send({ expense: inserted.rows[0] });
    }
  );

  fastify.post(
    '/expenses/:id/pay',
    { preHandler: [requirePortalAuth, requirePermission('finance:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const existing = await dbQuery<{ unit_id: string; amount_cents: string }>(
        `SELECT unit_id, amount_cents::text FROM portal.expenses WHERE id = $1`,
        [id]
      );
      if (!existing.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Despesa não encontrada.' });
      }
      if (!assertUnitOwnership(request, reply, existing.rows[0].unit_id)) return;

      const updated = await dbQuery(
        `UPDATE portal.expenses SET status = 'paid', paid_cents = amount_cents, updated_at = NOW()
         WHERE id = $1 RETURNING *`,
        [id]
      );
      return reply.send({ expense: updated.rows[0] });
    }
  );

  // POST /api/v1/finance/integrations/attempt (registra honestamente integração externa pendente se credencial faltar)
  fastify.post(
    '/integrations/attempt',
    { preHandler: [requirePortalAuth, requirePermission('finance:read')] },
    async (request, reply) => {
      const schema = z.object({
        integrationName: z.enum(['asaas_payments', 'nfe_emitter']),
        operation: z.string().min(3),
        payload: z.record(z.unknown()).optional(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const attempt = await logIntegrationAttempt({
        unitId: request.portal!.activeUnitId,
        integrationName: parsed.data.integrationName,
        operation: parsed.data.operation,
        payload: parsed.data.payload,
      });
      return reply.status(attempt.configured ? 202 : 424).send(attempt);
    }
  );
}
