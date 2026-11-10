import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbQuery, withTransaction } from '../../plugins/db.js';
import {
  assertUnitOwnership,
  requireAnyPermission,
  requireNetworkOrFactoryScope,
  requirePermission,
  requirePortalAuth,
} from '../../middleware/portalAuth.js';
import { evaluateOrderProductionReleaseGate } from '../../services/businessEngine.js';
import { notifyUnitRoles, recordAuditLog } from '../../services/auditAndNotify.js';

const uuidSchema = z.string().uuid();

const orderItemInputSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  productSku: z.string().min(1),
  productName: z.string().min(1),
  sizeBreakdown: z.record(z.number().int().nonnegative()).default({}),
  quantity: z.number().int().positive(),
  unitPriceCents: z.number().int().nonnegative(),
  unitCostCents: z.number().int().nonnegative().nullable().optional(),
  notes: z.string().optional().nullable(),
});

const personalizationInputSchema = z.object({
  orderItemId: z.string().uuid().optional().nullable(),
  sizeCode: z.string().min(1),
  playerName: z.string().optional().nullable(),
  playerNumber: z.string().optional().nullable(),
  shieldOrSponsorNotes: z.string().optional().nullable(),
  quantity: z.number().int().positive().default(1),
});

const createOrderSchema = z.object({
  customerId: z.string().uuid(),
  opportunityId: z.string().uuid().optional().nullable(),
  quoteId: z.string().uuid().optional().nullable(),
  artProjectId: z.string().uuid().optional().nullable(),
  approvedArtVersionId: z.string().uuid().optional().nullable(),
  shippingCents: z.number().int().nonnegative().optional().default(0),
  discountCents: z.number().int().nonnegative().optional().default(0),
  shippingMethod: z.string().optional().nullable(),
  deliveryAddress: z.record(z.unknown()).default({}),
  eventDate: z.string().optional().nullable(),
  estimatedDeliveryDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  requireEntryPayment: z.boolean().optional().default(true),
  isSandbox: z.boolean().optional().default(false),
  items: z.array(orderItemInputSchema).min(1),
  personalizations: z.array(personalizationInputSchema).optional().default([]),
});

export async function portalOrdersRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/orders
  fastify.get(
    '/',
    { preHandler: [requirePortalAuth, requirePermission('orders:read')] },
    async (request, reply) => {
      const ctx = request.portal!;
      const q = request.query as {
        commercialStatus?: string;
        productionStatus?: string;
        search?: string;
        sandbox?: string;
      };
      const isSandbox = q.sandbox === 'true';

      // Para fábrica/rede, se informar scope=all permite enxergar fila da fábrica de todas as unidades
      const allUnitsRequested =
        (ctx.activeScope === 'factory' || ctx.activeScope === 'network') &&
        (request.query as { scope?: string }).scope === 'all';

      const conditions = allUnitsRequested ? [`o.is_sandbox = $1`] : [`o.unit_id = $1`, `o.is_sandbox = $2`];
      const params: unknown[] = allUnitsRequested ? [isSandbox] : [ctx.activeUnitId, isSandbox];
      let idx = params.length + 1;

      if (q.commercialStatus && q.commercialStatus !== 'todos') {
        conditions.push(`o.commercial_status = $${idx}`);
        params.push(q.commercialStatus);
        idx++;
      }
      if (q.productionStatus && q.productionStatus !== 'todos') {
        conditions.push(`o.production_status = $${idx}`);
        params.push(q.productionStatus);
        idx++;
      }
      if (q.search?.trim()) {
        conditions.push(`(LOWER(o.order_number) LIKE $${idx} OR LOWER(c.name) LIKE $${idx})`);
        params.push(`%${q.search.trim().toLowerCase()}%`);
        idx++;
      }

      const rows = await dbQuery(
        `SELECT o.*,
                c.name AS customer_name,
                u.code AS unit_code,
                u.name AS unit_name,
                ap.title AS art_project_title,
                ap.status AS art_project_status,
                av.version_number AS approved_art_version_number,
                COALESCE((SELECT SUM(oi.quantity)::int FROM portal.order_items oi WHERE oi.order_id = o.id), 0) AS total_pieces
         FROM portal.orders o
         JOIN portal.customers c ON c.id = o.customer_id
         JOIN portal.units u ON u.id = o.unit_id
         LEFT JOIN portal.art_projects ap ON ap.id = o.art_project_id
         LEFT JOIN portal.art_versions av ON av.id = o.approved_art_version_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY o.created_at DESC`,
        params
      );

      return reply.send({ items: rows.rows });
    }
  );

  // GET /api/v1/orders/:id (com gatekeeper em tempo real, itens, grade, timeline PCP e remessas)
  fastify.get(
    '/:id',
    { preHandler: [requirePortalAuth, requirePermission('orders:read')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID do pedido inválido.' });
      }
      const orderRes = await dbQuery(
        `SELECT o.*, c.name AS customer_name, u.name AS unit_name, u.code AS unit_code,
                ap.title AS art_project_title, ap.status AS art_project_status,
                av.version_number AS approved_art_version_number
         FROM portal.orders o
         JOIN portal.customers c ON c.id = o.customer_id
         JOIN portal.units u ON u.id = o.unit_id
         LEFT JOIN portal.art_projects ap ON ap.id = o.art_project_id
         LEFT JOIN portal.art_versions av ON av.id = o.approved_art_version_id
         WHERE o.id = $1`,
        [id]
      );
      const order = orderRes.rows[0];
      if (!order) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Pedido não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, order.unit_id)) return;

      const gateEvaluation = await withTransaction((client) =>
        evaluateOrderProductionReleaseGate(client, id)
      );

      const [itemsRes, persRes, eventsRes, shipmentsRes, receivablesRes] = await Promise.all([
        dbQuery(`SELECT * FROM portal.order_items WHERE order_id = $1 ORDER BY created_at ASC`, [id]),
        dbQuery(
          `SELECT * FROM portal.order_personalizations WHERE order_id = $1 ORDER BY size_code, player_number, player_name`,
          [id]
        ),
        dbQuery(
          `SELECT pe.*, p.full_name AS recorded_by_name
           FROM portal.production_events pe
           LEFT JOIN portal.profiles p ON p.id = pe.recorded_by
           WHERE pe.order_id = $1
           ORDER BY pe.created_at DESC`,
          [id]
        ),
        dbQuery(`SELECT * FROM portal.shipments WHERE order_id = $1 ORDER BY created_at DESC`, [id]),
        dbQuery(`SELECT * FROM portal.receivables WHERE order_id = $1 ORDER BY installment_number ASC`, [id]),
      ]);

      return reply.send({
        order,
        items: itemsRes.rows,
        personalizations: persRes.rows,
        productionEvents: eventsRes.rows,
        shipments: shipmentsRes.rows,
        receivables: receivablesRes.rows,
        releaseGate: gateEvaluation,
      });
    }
  );

  // POST /api/v1/orders (cria pedido com status comercial confirmado/draft, SEMPRE travado antes da aprovação)
  fastify.post(
    '/',
    { preHandler: [requirePortalAuth, requirePermission('orders:create')] },
    async (request, reply) => {
      const parsed = createOrderSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const ctx = request.portal!;
      const d = parsed.data;

      const custRes = await dbQuery<{ unit_id: string }>(`SELECT unit_id FROM portal.customers WHERE id = $1`, [
        d.customerId,
      ]);
      if (!custRes.rows[0] || custRes.rows[0].unit_id !== ctx.activeUnitId) {
        return reply.status(403).send({ statusCode: 403, code: 'CUSTOMER_UNIT_MISMATCH', message: 'Cliente inválido para esta unidade.' });
      }
      if (d.opportunityId) {
        const oppRes = await dbQuery<{ unit_id: string }>(`SELECT unit_id FROM portal.opportunities WHERE id = $1`, [d.opportunityId]);
        if (!oppRes.rows[0] || oppRes.rows[0].unit_id !== ctx.activeUnitId) {
          return reply.status(403).send({ statusCode: 403, code: 'OPPORTUNITY_UNIT_MISMATCH', message: 'Oportunidade inválida para esta unidade.' });
        }
      }
      if (d.quoteId) {
        const qRes = await dbQuery<{ unit_id: string }>(`SELECT unit_id FROM portal.quotes WHERE id = $1`, [d.quoteId]);
        if (!qRes.rows[0] || qRes.rows[0].unit_id !== ctx.activeUnitId) {
          return reply.status(403).send({ statusCode: 403, code: 'QUOTE_UNIT_MISMATCH', message: 'Orçamento inválido para esta unidade.' });
        }
      }
      if (d.artProjectId) {
        const apCheck = await dbQuery<{ unit_id: string }>(`SELECT unit_id FROM portal.art_projects WHERE id = $1`, [d.artProjectId]);
        if (!apCheck.rows[0] || apCheck.rows[0].unit_id !== ctx.activeUnitId) {
          return reply.status(403).send({ statusCode: 403, code: 'ART_UNIT_MISMATCH', message: 'Projeto de arte inválido para esta unidade.' });
        }
      }

      // Bloqueia criação de pedido para SKU/produto sob revisão jurídica de marca (P03)
      for (const it of d.items) {
        const pRes = await dbQuery<{ name: string; sku: string; availability_status: string }>(
          `SELECT name, sku, availability_status
           FROM portal.products
           WHERE ($1::uuid IS NOT NULL AND id = $1) OR ($1::uuid IS NULL AND UPPER(sku) = UPPER($2))
           LIMIT 1`,
          [it.productId || null, it.productSku]
        );
        if (pRes.rows[0]?.availability_status === 'legal_review') {
          return reply.status(422).send({
            statusCode: 422,
            code: 'PRODUCT_LEGAL_REVIEW_BLOCKED',
            message: `Produto '${pRes.rows[0].name}' (${pRes.rows[0].sku}) está bloqueado para venda até revisão jurídica.`,
          });
        }
      }

      const subtotalCents = d.items.reduce((acc, it) => acc + it.quantity * it.unitPriceCents, 0);
      const totalCents = Math.max(0, subtotalCents + d.shippingCents - d.discountCents);

      const created = await withTransaction(async (client) => {
        const countRes = await client.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM portal.orders WHERE unit_id = $1`,
          [ctx.activeUnitId]
        );
        const seq = 1001 + Number(countRes.rows[0]?.cnt || 0);
        const orderNumber = `${d.isSandbox ? 'SBX-KS' : 'KS'}-${seq}`;

        let artStatus: string | null = null;
        let resolvedApprovedVer = d.approvedArtVersionId || null;
        if (d.artProjectId) {
          const apRes = await client.query<{ status: string; approved_version_id: string | null }>(
            `SELECT status, approved_version_id FROM portal.art_projects WHERE id = $1 AND unit_id = $2`,
            [d.artProjectId, ctx.activeUnitId]
          );
          artStatus = apRes.rows[0]?.status || null;
          if (!resolvedApprovedVer) resolvedApprovedVer = apRes.rows[0]?.approved_version_id || null;
        }

        const ordRes = await client.query<{ id: string }>(
          `INSERT INTO portal.orders (
             order_number, unit_id, customer_id, opportunity_id, quote_id,
             art_project_id, approved_art_version_id,
             commercial_status, financial_status, approval_status, production_status, logistics_status,
             commercial_snapshot, subtotal_cents, shipping_cents, discount_cents, total_cents,
             delivery_address, shipping_method, event_date, estimated_delivery_date,
             notes, is_sandbox, created_by
           ) VALUES (
             $1,$2,$3,$4,$5,$6,$7,
             'confirmed','pending',$8,'not_released','pending',
             $9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20
           ) RETURNING *`,
          [
            orderNumber,
            ctx.activeUnitId,
            d.customerId,
            d.opportunityId || null,
            d.quoteId || null,
            d.artProjectId || null,
            resolvedApprovedVer,
            artStatus === 'aprovado' && resolvedApprovedVer ? 'art_approved' : 'pending',
            JSON.stringify({ financial_cleared_postpaid: !d.requireEntryPayment }),
            subtotalCents,
            d.shippingCents,
            d.discountCents,
            totalCents,
            JSON.stringify(d.deliveryAddress ?? {}),
            d.shippingMethod?.trim() || 'Transportadora / Correios SP',
            d.eventDate || null,
            d.estimatedDeliveryDate || null,
            d.notes?.trim() || null,
            d.isSandbox,
            ctx.userId,
          ]
        );
        const order = ordRes.rows[0];

        for (const it of d.items) {
          await client.query(
            `INSERT INTO portal.order_items (
               order_id, unit_id, product_id, product_sku, product_name,
               size_breakdown, quantity, unit_price_cents, unit_cost_cents, line_total_cents, notes
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
            [
              order.id,
              ctx.activeUnitId,
              it.productId || null,
              it.productSku,
              it.productName,
              JSON.stringify(it.sizeBreakdown),
              it.quantity,
              it.unitPriceCents,
              it.unitCostCents ?? null,
              it.quantity * it.unitPriceCents,
              it.notes || null,
            ]
          );
        }

        for (const p of d.personalizations) {
          await client.query(
            `INSERT INTO portal.order_personalizations (
               order_id, order_item_id, unit_id, size_code, player_name, player_number,
               shield_or_sponsor_notes, quantity
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              order.id,
              p.orderItemId || null,
              ctx.activeUnitId,
              p.sizeCode,
              p.playerName?.trim() || null,
              p.playerNumber?.trim() || null,
              p.shieldOrSponsorNotes?.trim() || null,
              p.quantity,
            ]
          );
        }

        if (d.quoteId) {
          await client.query(
            `UPDATE portal.quotes SET status = 'converted', updated_at = NOW() WHERE id = $1 AND unit_id = $2`,
            [d.quoteId, ctx.activeUnitId]
          );
        }

        // Gera parcela padrão caso não seja zero
        if (totalCents > 0) {
          await client.query(
            `INSERT INTO portal.receivables (
               unit_id, order_id, customer_id, installment_number, total_installments,
               description, due_date, amount_cents, status, is_sandbox, created_by
             ) VALUES ($1,$2,$3,1,1,$4,CURRENT_DATE + INTERVAL '3 days',$5,'pending',$6,$7)`,
            [
              ctx.activeUnitId,
              order.id,
              d.customerId,
              `Pedido ${orderNumber} — Parcela Única / Entrada`,
              totalCents,
              d.isSandbox,
              ctx.userId,
            ]
          );
        }

        const gate = await evaluateOrderProductionReleaseGate(client, order.id);
        await client.query(
          `UPDATE portal.orders SET release_block_reasons = $1 WHERE id = $2`,
          [JSON.stringify(gate.blockers), order.id]
        );

        await recordAuditLog(
          {
            unitId: ctx.activeUnitId,
            action: 'order.created',
            entityType: 'order',
            entityId: order.id,
            afterState: { orderNumber, totalCents, blockers: gate.blockers },
            request,
          },
          client
        );

        return { order, releaseGate: gate };
      });

      return reply.status(201).send(created);
    }
  );

  // PATCH /api/v1/orders/:id (vincular arte, completar endereço/evento enquanto ainda não liberado na fábrica)
  fastify.patch(
    '/:id',
    { preHandler: [requirePortalAuth, requirePermission('orders:create')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID do pedido inválido.' });
      }
      const existing = await dbQuery<{
        unit_id: string;
        production_status: string;
        grade_approved: boolean;
      }>(`SELECT unit_id, production_status, grade_approved FROM portal.orders WHERE id = $1`, [id]);

      if (!existing.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Pedido não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, existing.rows[0].unit_id)) return;
      if (!['not_released', 'blocked'].includes(existing.rows[0].production_status)) {
        return reply.status(409).send({
          statusCode: 409,
          code: 'ORDER_LOCKED_IN_PRODUCTION',
          message: 'Pedido já liberado para fábrica; alterações cadastrais devem ser tratadas via SAC/PCP.',
        });
      }

      const schema = z.object({
        artProjectId: z.string().uuid().nullable().optional(),
        shippingMethod: z.string().optional().nullable(),
        deliveryAddress: z.record(z.unknown()).optional(),
        eventDate: z.string().nullable().optional(),
        notes: z.string().nullable().optional(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const d = parsed.data;

      const updated = await withTransaction(async (client) => {
        let resolvedApprovedVer: string | null | undefined = undefined;
        let resolvedArtStatus: string | undefined = undefined;

        if (d.artProjectId !== undefined) {
          if (d.artProjectId === null) {
            resolvedApprovedVer = null;
            resolvedArtStatus = 'pending';
          } else {
            const apRes = await client.query<{ status: string; approved_version_id: string | null }>(
              `SELECT status, approved_version_id FROM portal.art_projects WHERE id = $1 AND unit_id = $2`,
              [d.artProjectId, existing.rows[0].unit_id]
            );
            if (!apRes.rows[0]) {
              throw Object.assign(new Error('Projeto de arte não pertence a esta unidade.'), { statusCode: 403 });
            }
            resolvedApprovedVer = apRes.rows[0].approved_version_id;
            resolvedArtStatus = apRes.rows[0].status;
          }
        }

        const up = await client.query(
          `UPDATE portal.orders SET
             art_project_id = CASE WHEN $1 THEN $2 ELSE art_project_id END,
             approved_art_version_id = CASE WHEN $1 THEN $3 ELSE approved_art_version_id END,
             approval_status = CASE
               WHEN $1 AND $4 = 'aprovado' AND $3 IS NOT NULL THEN CASE WHEN grade_approved THEN 'all_approved' ELSE 'art_approved' END
               WHEN $1 THEN CASE WHEN grade_approved THEN 'grade_approved' ELSE 'pending' END
               ELSE approval_status
             END,
             shipping_method = COALESCE($5, shipping_method),
             delivery_address = COALESCE($6, delivery_address),
             event_date = CASE WHEN $7 THEN $8 ELSE event_date END,
             notes = CASE WHEN $9 THEN $10 ELSE notes END,
             updated_at = NOW()
           WHERE id = $11
           RETURNING *`,
          [
            d.artProjectId !== undefined,
            d.artProjectId ?? null,
            resolvedApprovedVer ?? null,
            resolvedArtStatus ?? null,
            d.shippingMethod ?? null,
            d.deliveryAddress ? JSON.stringify(d.deliveryAddress) : null,
            d.eventDate !== undefined,
            d.eventDate || null,
            d.notes !== undefined,
            d.notes ?? null,
            id,
          ]
        );

        const gate = await evaluateOrderProductionReleaseGate(client, id);
        await client.query(`UPDATE portal.orders SET release_block_reasons = $1 WHERE id = $2`, [
          JSON.stringify(gate.blockers),
          id,
        ]);
        return { order: up.rows[0], releaseGate: gate };
      });

      return reply.send(updated);
    }
  );

  // PUT /api/v1/orders/:id/personalizations (salva/atualiza grade e personalização)
  fastify.put(
    '/:id/personalizations',
    { preHandler: [requirePortalAuth, requirePermission('orders:create')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID do pedido inválido.' });
      }
      const existing = await dbQuery<{ unit_id: string; production_status: string }>(
        `SELECT unit_id, production_status FROM portal.orders WHERE id = $1`,
        [id]
      );
      if (!existing.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Pedido não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, existing.rows[0].unit_id)) return;

      if (!['not_released', 'blocked'].includes(existing.rows[0].production_status)) {
        return reply.status(409).send({
          statusCode: 409,
          code: 'ORDER_ALREADY_IN_PRODUCTION',
          message: 'Pedido já liberado na fábrica; solicite ajuste via SAC ou PCP.',
        });
      }

      const schema = z.object({ personalizations: z.array(personalizationInputSchema) });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      await withTransaction(async (client) => {
        await client.query(`DELETE FROM portal.order_personalizations WHERE order_id = $1`, [id]);
        for (const p of parsed.data.personalizations) {
          await client.query(
            `INSERT INTO portal.order_personalizations (
               order_id, order_item_id, unit_id, size_code, player_name, player_number, shield_or_sponsor_notes, quantity
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
            [
              id,
              p.orderItemId || null,
              existing.rows[0].unit_id,
              p.sizeCode,
              p.playerName?.trim() || null,
              p.playerNumber?.trim() || null,
              p.shieldOrSponsorNotes?.trim() || null,
              p.quantity,
            ]
          );
        }
        // Alterar a grade revoga aprovação anterior de grade por segurança
        await client.query(
          `UPDATE portal.orders
           SET grade_approved = FALSE,
               approval_status = CASE WHEN approved_art_version_id IS NOT NULL THEN 'art_approved' ELSE 'pending' END,
               updated_at = NOW()
           WHERE id = $1`,
          [id]
        );
      });

      return reply.send({ success: true });
    }
  );

  // POST /api/v1/orders/:id/approve-grade
  fastify.post(
    '/:id/approve-grade',
    { preHandler: [requirePortalAuth, requireAnyPermission(['arts:approve', 'orders:create'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID do pedido inválido.' });
      }
      const existing = await dbQuery<{ unit_id: string; approved_art_version_id: string | null }>(
        `SELECT unit_id, approved_art_version_id FROM portal.orders WHERE id = $1`,
        [id]
      );
      if (!existing.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Pedido não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, existing.rows[0].unit_id)) return;

      const schema = z.object({
        approvedByName: z.string().min(2),
        acceptanceEvidence: z.string().min(3).default('Conferência completa da grade e numeração pela unidade'),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const result = await withTransaction(async (client) => {
        await client.query(
          `INSERT INTO portal.approvals (
             unit_id, entity_type, entity_id, approved_by_name, identification_method, acceptance_evidence,
             status, recorded_by_user_id
           ) VALUES ($1,'order_grade',$2,$3,'Conferência nominal da grade no Portal',$4,'active',$5)`,
          [
            existing.rows[0].unit_id,
            id,
            parsed.data.approvedByName.trim(),
            parsed.data.acceptanceEvidence.trim(),
            request.portal!.userId,
          ]
        );

        await client.query(
          `UPDATE portal.orders SET
             grade_approved = TRUE,
             grade_approved_by = $1,
             grade_approved_at = NOW(),
             approval_status = CASE WHEN approved_art_version_id IS NOT NULL THEN 'all_approved' ELSE 'grade_approved' END,
             updated_at = NOW()
           WHERE id = $2`,
          [parsed.data.approvedByName.trim(), id]
        );

        const gate = await evaluateOrderProductionReleaseGate(client, id);
        await client.query(`UPDATE portal.orders SET release_block_reasons = $1 WHERE id = $2`, [
          JSON.stringify(gate.blockers),
          id,
        ]);

        await recordAuditLog(
          {
            unitId: existing.rows[0].unit_id,
            action: 'order.grade_approved',
            entityType: 'order',
            entityId: id,
            afterState: { approvedByName: parsed.data.approvedByName },
            request,
          },
          client
        );

        return { gate };
      });

      return reply.send({ success: true, releaseGate: result.gate });
    }
  );

  // POST /api/v1/orders/:id/factory-accept (exclusivo Fábrica PCP / Admin Rede)
  fastify.post(
    '/:id/factory-accept',
    {
      preHandler: [
        requirePortalAuth,
        requireNetworkOrFactoryScope(['factory', 'network']),
        requirePermission('production:advance_stage'),
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID do pedido inválido.' });
      }
      const schema = z.object({
        capacityOk: z.boolean().default(true),
        estimatedDeliveryDate: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const ordRes = await dbQuery<{ unit_id: string }>(`SELECT unit_id FROM portal.orders WHERE id = $1`, [id]);
      if (!ordRes.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Pedido não encontrado.' });
      }

      const updated = await withTransaction(async (client) => {
        const up = await client.query(
          `UPDATE portal.orders SET
             factory_accepted = TRUE,
             factory_capacity_ok = $1,
             factory_accepted_by = $2,
             factory_accepted_at = NOW(),
             estimated_delivery_date = COALESCE($3, estimated_delivery_date),
             updated_at = NOW()
           WHERE id = $4
           RETURNING *`,
          [parsed.data.capacityOk, request.portal!.userId, parsed.data.estimatedDeliveryDate || null, id]
        );
        const gate = await evaluateOrderProductionReleaseGate(client, id);
        await client.query(`UPDATE portal.orders SET release_block_reasons = $1 WHERE id = $2`, [
          JSON.stringify(gate.blockers),
          id,
        ]);
        return { order: up.rows[0], releaseGate: gate };
      });

      return reply.send(updated);
    }
  );

  // POST /api/v1/orders/:id/release-production (Gatekeeper rigoroso; override apenas admin_rede / producao_fabrica)
  fastify.post(
    '/:id/release-production',
    { preHandler: [requirePortalAuth, requireAnyPermission(['orders:create', 'orders:override_release'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID do pedido inválido.' });
      }
      const schema = z.object({
        override: z.boolean().optional().default(false),
        overrideReason: z.string().optional().nullable(),
      });
      const parsed = schema.safeParse(request.body ?? {});
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const ordRes = await dbQuery<{ unit_id: string; order_number: string; commercial_status: string; is_sandbox: boolean }>(
        `SELECT unit_id, order_number, commercial_status, is_sandbox FROM portal.orders WHERE id = $1`,
        [id]
      );
      const ord = ordRes.rows[0];
      if (!ord) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Pedido não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, ord.unit_id)) return;
      if (ord.commercial_status === 'canceled') {
        return reply.status(409).send({ statusCode: 409, code: 'ORDER_CANCELED', message: 'Pedidos cancelados não podem entrar em produção.' });
      }

      const ctx = request.portal!;
      const allowFactoryAutoAccept =
        ctx.permissions.includes('production:advance_stage') && ctx.activeScope !== 'unit';

      const gateResult = await withTransaction(async (client) => {
        const gate = await evaluateOrderProductionReleaseGate(client, id, {
          allowFactorySimultaneousAccept: allowFactoryAutoAccept,
        });

        if (!gate.canRelease) {
          if (!parsed.data.override) {
            await client.query(
              `UPDATE portal.orders
               SET production_status = 'blocked', release_block_reasons = $1, updated_at = NOW()
               WHERE id = $2`,
              [JSON.stringify(gate.blockers), id]
            );
            return { released: false, gate };
          }

          if (!ctx.permissions.includes('orders:override_release')) {
            return { forbiddenOverride: true, gate };
          }
          if (!parsed.data.overrideReason || parsed.data.overrideReason.trim().length < 5) {
            return { overrideReasonMissing: true, gate };
          }
        }

        const isOverride = !gate.canRelease && parsed.data.override;
        await client.query(
          `UPDATE portal.orders SET
             factory_accepted = CASE WHEN $1 THEN TRUE ELSE factory_accepted END,
             factory_capacity_ok = CASE WHEN $1 THEN TRUE ELSE factory_capacity_ok END,
             production_released = TRUE,
             production_released_at = NOW(),
             production_status = 'queued_pcp',
             sla_started_at = COALESCE(sla_started_at, NOW()),
             release_block_reasons = '[]'::jsonb,
             release_override_reason = CASE WHEN $2 THEN $3 ELSE release_override_reason END,
             release_override_by = CASE WHEN $2 THEN $4 ELSE release_override_by END,
             updated_at = NOW()
           WHERE id = $5`,
          [allowFactoryAutoAccept, isOverride, parsed.data.overrideReason?.trim() || null, ctx.userId, id]
        );

        await client.query(
          `INSERT INTO portal.production_events (
             order_id, unit_id, stage_code, status_label, notes, recorded_by, is_sandbox
           ) VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [
            id,
            ord.unit_id,
            isOverride ? 'release_override' : 'queued_pcp',
            isOverride ? 'Liberado com Exceção Auditada' : 'Liberado na Fila do PCP (SP)',
            isOverride
              ? `Exceção aplicada por ${ctx.fullName}: ${parsed.data.overrideReason}`
              : 'Todos os critérios obrigatórios validados. Prazo produtivo iniciado.',
            ctx.userId,
            ord.is_sandbox,
          ]
        );

        await notifyUnitRoles(
          ord.unit_id,
          ['franqueado'],
          {
            eventType: 'order_released_production',
            title: `Pedido ${ord.order_number} liberado para PCP São Paulo`,
            body: isOverride
              ? `Liberado excepcionalmente pela fábrica/rede: ${parsed.data.overrideReason}`
              : 'Pedido validado e inserido na fila produtiva da fábrica.',
            actionUrl: '/?tab=orders',
            entityType: 'order',
            entityId: id,
            dedupeKey: `order_released:${id}`,
          },
          client
        );

        await recordAuditLog(
          {
            unitId: ord.unit_id,
            action: isOverride ? 'order.production_released_override' : 'order.production_released',
            entityType: 'order',
            entityId: id,
            reason: isOverride ? parsed.data.overrideReason : null,
            afterState: { blockersBefore: gate.blockers },
            request,
          },
          client
        );

        return { released: true, gate };
      });

      if ('forbiddenOverride' in gateResult) {
        return reply.status(403).send({
          statusCode: 403,
          code: 'OVERRIDE_FORBIDDEN',
          message: 'Somente Fábrica (PCP) ou Administração da Rede podem liberar pedidos com pendências.',
          releaseGate: gateResult.gate,
        });
      }
      if ('overrideReasonMissing' in gateResult) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'OVERRIDE_REASON_REQUIRED',
          message: 'Informe justificativa formal (mínimo 5 caracteres) para liberar produção com exceção.',
          releaseGate: gateResult.gate,
        });
      }
      if (!gateResult.released) {
        return reply.status(422).send({
          statusCode: 422,
          code: 'PRODUCTION_RELEASE_BLOCKED',
          message: 'Pedido bloqueado pelos critérios obrigatórios de liberação para fábrica.',
          releaseGate: gateResult.gate,
        });
      }

      return reply.send({ released: true, productionStatus: 'queued_pcp', releaseGate: gateResult.gate });
    }
  );

  // POST /api/v1/orders/:id/production-stage (EXCLUSIVO FÁBRICA / ADMIN REDE — franqueado recebe 403!)
  fastify.post(
    '/:id/production-stage',
    {
      preHandler: [
        requirePortalAuth,
        requireNetworkOrFactoryScope(['factory', 'network']),
        requirePermission('production:advance_stage'),
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID do pedido inválido.' });
      }
      const schema = z.object({
        stageCode: z.enum([
          'queued_pcp',
          'sublimation',
          'cutting',
          'embroidery_tpu',
          'sewing',
          'quality_check',
          'finished',
        ]),
        notes: z.string().optional().nullable(),
        newEstimatedDeliveryDate: z.string().optional().nullable(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const ordRes = await dbQuery<{
        unit_id: string;
        order_number: string;
        production_status: string;
        production_released: boolean;
        estimated_delivery_date: string | null;
        is_sandbox: boolean;
      }>(`SELECT * FROM portal.orders WHERE id = $1`, [id]);

      const ord = ordRes.rows[0];
      if (!ord) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Pedido não encontrado.' });
      }
      if (!ord.production_released) {
        return reply.status(409).send({
          statusCode: 409,
          code: 'NOT_RELEASED',
          message: 'Pedido ainda não foi liberado para produção.',
        });
      }

      const stageLabels: Record<string, string> = {
        queued_pcp: 'Fila PCP / Conferência',
        sublimation: 'Impressão & Sublimação',
        cutting: 'Corte & Enfesto',
        embroidery_tpu: 'Aplicação Bordado / TPU / DTF',
        sewing: 'Costura & Acabamento',
        quality_check: 'Controle de Qualidade',
        finished: 'Produção Concluída (Pronto para Expedição)',
      };

      const d = parsed.data;
      const updated = await withTransaction(async (client) => {
        const upRes = await client.query(
          `UPDATE portal.orders SET
             production_status = $1,
             logistics_status = CASE WHEN $1 = 'finished' AND logistics_status = 'pending' THEN 'ready_to_dispatch' ELSE logistics_status END,
             estimated_delivery_date = COALESCE($2, estimated_delivery_date),
             updated_at = NOW()
           WHERE id = $3
           RETURNING *`,
          [d.stageCode, d.newEstimatedDeliveryDate || null, id]
        );

        await client.query(
          `INSERT INTO portal.production_events (
             order_id, unit_id, stage_code, status_label, notes, old_forecast_date, new_forecast_date, recorded_by, is_sandbox
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            id,
            ord.unit_id,
            d.stageCode,
            stageLabels[d.stageCode] || d.stageCode,
            d.notes?.trim() || null,
            ord.estimated_delivery_date,
            d.newEstimatedDeliveryDate || null,
            request.portal!.userId,
            ord.is_sandbox,
          ]
        );

        await recordAuditLog(
          {
            unitId: ord.unit_id,
            action: 'order.production_stage_advanced',
            entityType: 'order',
            entityId: id,
            beforeState: { productionStatus: ord.production_status },
            afterState: { productionStatus: d.stageCode },
            request,
          },
          client
        );

        return upRes.rows[0];
      });

      return reply.send({ order: updated });
    }
  );

  // POST /api/v1/orders/:id/shipment (registra expedição vs entrega separadamente — exclusivo logística/fábrica/admin)
  fastify.post(
    '/:id/shipment',
    {
      preHandler: [
        requirePortalAuth,
        requireNetworkOrFactoryScope(['factory', 'network']),
        requirePermission('logistics:manage'),
      ],
    },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID do pedido inválido.' });
      }
      const schema = z.object({
        status: z.enum(['preparing', 'dispatched', 'in_transit', 'delivered', 'delayed']),
        carrierName: z.string().optional().nullable(),
        trackingCode: z.string().optional().nullable(),
        shippingCostCents: z.number().int().nonnegative().optional().default(0),
        estimatedDeliveryDate: z.string().optional().nullable(),
        receiverName: z.string().optional().nullable(),
        deliveryNotes: z.string().optional().nullable(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const ordRes = await dbQuery<{ unit_id: string; order_number: string; is_sandbox: boolean }>(
        `SELECT unit_id, order_number, is_sandbox FROM portal.orders WHERE id = $1`,
        [id]
      );
      if (!ordRes.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Pedido não encontrado.' });
      }

      const d = parsed.data;
      if (d.status === 'delivered' && (!d.receiverName || d.receiverName.trim().length < 2)) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'RECEIVER_REQUIRED',
          message: 'Informe o nome de quem recebeu a mercadoria para confirmar entrega.',
        });
      }

      const shipment = await withTransaction(async (client) => {
        const shipRes = await client.query(
          `INSERT INTO portal.shipments (
             order_id, unit_id, carrier_name, tracking_code, shipping_cost_cents, status,
             dispatched_at, estimated_delivery_date, delivered_at, receiver_name, delivery_notes, is_sandbox
           ) VALUES (
             $1,$2,$3,$4,$5,$6,
             CASE WHEN $6 IN ('dispatched','in_transit','delivered') THEN NOW() ELSE NULL END,
             $7,
             CASE WHEN $6 = 'delivered' THEN NOW() ELSE NULL END,
             $8,$9,$10
           ) RETURNING *`,
          [
            id,
            ordRes.rows[0].unit_id,
            d.carrierName?.trim() || null,
            d.trackingCode?.trim() || null,
            d.shippingCostCents,
            d.status,
            d.estimatedDeliveryDate || null,
            d.receiverName?.trim() || null,
            d.deliveryNotes?.trim() || null,
            ordRes.rows[0].is_sandbox,
          ]
        );

        const logisticsMap: Record<string, string> = {
          preparing: 'ready_to_dispatch',
          dispatched: 'dispatched',
          in_transit: 'in_transit',
          delivered: 'delivered',
          delayed: 'issue_reported',
        };
        const shipmentStatusLabels: Record<string, string> = {
          preparing: 'Em preparação',
          dispatched: 'Despachado',
          in_transit: 'Em trânsito',
          delivered: 'Entregue',
          delayed: 'Atraso registrado',
        };

        await client.query(
          `UPDATE portal.orders SET
             logistics_status = $1,
             estimated_delivery_date = COALESCE($2, estimated_delivery_date),
             updated_at = NOW()
           WHERE id = $3`,
          [logisticsMap[d.status], d.estimatedDeliveryDate || null, id]
        );

        await notifyUnitRoles(
          ordRes.rows[0].unit_id,
          ['franqueado'],
          {
            eventType: `shipment_${d.status}`,
            title:
              d.status === 'delivered'
                ? `Pedido ${ordRes.rows[0].order_number} entregue ao destinatário`
                : `Atualização logística — Pedido ${ordRes.rows[0].order_number}`,
            body:
              d.status === 'delivered'
                ? `Recebido por ${d.receiverName}.`
                : `Status: ${shipmentStatusLabels[d.status] || d.status}${d.trackingCode ? ` · Rastreio: ${d.trackingCode}` : ''}.`,
            actionUrl: '/?tab=orders',
            entityType: 'order',
            entityId: id,
          },
          client
        );

        return shipRes.rows[0];
      });

      return reply.status(201).send({ shipment });
    }
  );

  // POST /api/v1/orders/:id/cancel (cancela sem apagar histórico e sai de faturamento ativo)
  fastify.post(
    '/:id/cancel',
    { preHandler: [requirePortalAuth, requirePermission('orders:create')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID do pedido inválido.' });
      }
      const schema = z.object({ reason: z.string().min(4, 'Motivo de cancelamento obrigatório') });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const ordRes = await dbQuery<{ unit_id: string; production_status: string }>(
        `SELECT unit_id, production_status FROM portal.orders WHERE id = $1`,
        [id]
      );
      if (!ordRes.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Pedido não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, ordRes.rows[0].unit_id)) return;

      if (
        !['not_released', 'blocked'].includes(ordRes.rows[0].production_status) &&
        request.portal!.activeScope === 'unit'
      ) {
        return reply.status(409).send({
          statusCode: 409,
          code: 'CANNOT_CANCEL_IN_PRODUCTION',
          message: 'Pedido já está em produção na fábrica; solicite cancelamento via suporte/PCP.',
        });
      }

      await withTransaction(async (client) => {
        await client.query(
          `UPDATE portal.orders SET
             commercial_status = 'canceled',
             canceled_reason = $1,
             canceled_at = NOW(),
             updated_at = NOW()
           WHERE id = $2`,
          [parsed.data.reason.trim(), id]
        );
        await client.query(
          `UPDATE portal.receivables SET status = 'canceled', updated_at = NOW()
           WHERE order_id = $1 AND paid_cents = 0`,
          [id]
        );
        await recordAuditLog(
          {
            unitId: ordRes.rows[0].unit_id,
            action: 'order.canceled',
            entityType: 'order',
            entityId: id,
            reason: parsed.data.reason.trim(),
            request,
          },
          client
        );
      });

      return reply.send({ success: true });
    }
  );
}
