import { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import { z } from 'zod';
import { dbQuery, withTransaction } from '../../plugins/db.js';
import {
  assertUnitOwnership,
  requirePermission,
  requirePortalAuth,
} from '../../middleware/portalAuth.js';
import { computeQuoteTotals } from '../../services/businessEngine.js';
import { recordAuditLog } from '../../services/auditAndNotify.js';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const uuidSchema = z.string().uuid();

const quoteItemSchema = z.object({
  productId: z.string().uuid().optional().nullable(),
  productSku: z.string().min(1),
  productName: z.string().min(1),
  quantity: z.number().int().positive(),
  unitSalePriceCents: z.number().int().nonnegative(),
  unitSupplyCostCents: z.number().int().nonnegative().nullable().optional(),
  personalizationSummary: z.string().optional().nullable(),
  personalizationCents: z.number().int().nonnegative().optional().default(0),
});

const createQuoteSchema = z.object({
  customerId: z.string().uuid(),
  opportunityId: z.string().uuid().optional().nullable(),
  priceListId: z.string().uuid().optional().nullable(),
  additionalServicesCents: z.number().int().nonnegative().optional().default(0),
  shippingCents: z.number().int().nonnegative().optional().default(0),
  discountCents: z.number().int().nonnegative().optional().default(0),
  paymentTerms: z.string().optional().nullable(),
  validUntil: z.string().optional().nullable(),
  estimatedDeliveryDays: z.number().int().positive().optional().nullable(),
  termsText: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isSandbox: z.boolean().optional().default(false),
  items: z.array(quoteItemSchema).min(1),
});

export async function portalQuotesRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/quotes
  fastify.get(
    '/',
    { preHandler: [requirePortalAuth, requirePermission('quotes:read')] },
    async (request, reply) => {
      const ctx = request.portal!;
      const q = request.query as { status?: string; search?: string; sandbox?: string };
      const isSandbox = q.sandbox === 'true';

      const conditions = [`qt.unit_id = $1`, `qt.is_sandbox = $2`];
      const params: unknown[] = [ctx.activeUnitId, isSandbox];
      let idx = 3;

      if (q.status && q.status !== 'todos') {
        conditions.push(`qt.status = $${idx}`);
        params.push(q.status);
        idx++;
      }
      if (q.search?.trim()) {
        conditions.push(`(LOWER(qt.quote_number) LIKE $${idx} OR LOWER(c.name) LIKE $${idx})`);
        params.push(`%${q.search.trim().toLowerCase()}%`);
        idx++;
      }

      const rows = await dbQuery(
        `SELECT qt.*,
                c.name AS customer_name,
                c.city AS customer_city,
                c.state AS customer_state,
                o.title AS opportunity_title,
                p.full_name AS created_by_name,
                COALESCE(
                  (SELECT json_agg(qi ORDER BY qi.created_at ASC)
                   FROM portal.quote_items qi WHERE qi.quote_id = qt.id),
                  '[]'::json
                ) AS items
         FROM portal.quotes qt
         JOIN portal.customers c ON c.id = qt.customer_id
         LEFT JOIN portal.opportunities o ON o.id = qt.opportunity_id
         LEFT JOIN portal.profiles p ON p.id = qt.created_by
         WHERE ${conditions.join(' AND ')}
         ORDER BY qt.created_at DESC`,
        params
      );

      return reply.send({ items: rows.rows });
    }
  );

  // POST /api/v1/quotes
  fastify.post(
    '/',
    { preHandler: [requirePortalAuth, requirePermission('quotes:write')] },
    async (request, reply) => {
      const parsed = createQuoteSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Dados do orçamento inválidos.',
          details: parsed.error.flatten(),
        });
      }

      const ctx = request.portal!;
      const d = parsed.data;

      const custRes = await dbQuery<{ unit_id: string }>(`SELECT unit_id FROM portal.customers WHERE id = $1`, [
        d.customerId,
      ]);
      if (!custRes.rows[0] || custRes.rows[0].unit_id !== ctx.activeUnitId) {
        return reply.status(403).send({
          statusCode: 403,
          code: 'CUSTOMER_UNIT_MISMATCH',
          message: 'Cliente inválido para a unidade ativa.',
        });
      }
      if (d.opportunityId) {
        const oppRes = await dbQuery<{ unit_id: string }>(`SELECT unit_id FROM portal.opportunities WHERE id = $1`, [
          d.opportunityId,
        ]);
        if (!oppRes.rows[0] || oppRes.rows[0].unit_id !== ctx.activeUnitId) {
          return reply.status(403).send({
            statusCode: 403,
            code: 'OPPORTUNITY_UNIT_MISMATCH',
            message: 'Oportunidade inválida para a unidade ativa.',
          });
        }
      }

      // Busca custos reais do catálogo por productId ou SKU (nunca confia cegamente nem permite item sob revisão jurídica)
      const resolvedItems: Array<{
        productId: string | null;
        productSku: string;
        productName: string;
        quantity: number;
        unitSalePriceCents: number;
        unitSupplyCostCents: number | null;
        personalizationSummary: string | null;
        personalizationCents: number;
        priceSnapshot: Record<string, unknown>;
      }> = [];

      for (const item of d.items) {
        let resolvedProductId = item.productId || null;
        let supplyCost = item.unitSupplyCostCents ?? null;
        let snapshot: Record<string, unknown> = {};

        const pRes = await dbQuery<{
          id: string;
          sku: string;
          name: string;
          fabric: string;
          availability_status: string;
          supply_price_cents: string | null;
          suggested_sale_price_cents: string | null;
          unit_cost_cents: string | null;
        }>(
          `SELECT p.id, p.sku, p.name, p.fabric, p.availability_status,
                  pli.supply_price_cents::text, pli.suggested_sale_price_cents::text, pli.unit_cost_cents::text
           FROM portal.products p
           LEFT JOIN portal.price_list_items pli
             ON pli.product_id = p.id
            AND ($3::uuid IS NULL OR pli.price_list_id = $3)
           WHERE ($1::uuid IS NOT NULL AND p.id = $1)
              OR ($1::uuid IS NULL AND UPPER(p.sku) = UPPER($2))
           ORDER BY pli.created_at DESC
           LIMIT 1`,
          [item.productId || null, item.productSku, d.priceListId || null]
        );
        const prod = pRes.rows[0];
        if (prod) {
          if (prod.availability_status === 'legal_review') {
            return reply.status(422).send({
              statusCode: 422,
              code: 'PRODUCT_LEGAL_REVIEW_BLOCKED',
              message: `Produto '${prod.name}' (${prod.sku}) está bloqueado para venda até validação de marca registrada (P03).`,
            });
          }
          resolvedProductId = prod.id;
          const dbCost = prod.unit_cost_cents ?? prod.supply_price_cents;
          if (supplyCost === null && dbCost !== null) {
            supplyCost = Number(dbCost);
          }
          snapshot = {
            sku: prod.sku,
            name: prod.name,
            fabric: prod.fabric,
            catalogSupplyPriceCents: prod.supply_price_cents ? Number(prod.supply_price_cents) : null,
            catalogSuggestedSaleCents: prod.suggested_sale_price_cents
              ? Number(prod.suggested_sale_price_cents)
              : null,
          };
        }

        resolvedItems.push({
          productId: resolvedProductId,
          productSku: item.productSku,
          productName: item.productName,
          quantity: item.quantity,
          unitSalePriceCents: item.unitSalePriceCents,
          unitSupplyCostCents: supplyCost,
          personalizationSummary: item.personalizationSummary || null,
          personalizationCents: item.personalizationCents || 0,
          priceSnapshot: snapshot,
        });
      }

      let calc;
      try {
        calc = computeQuoteTotals({
          items: resolvedItems,
          additionalServicesCents: d.additionalServicesCents,
          shippingCents: d.shippingCents,
          discountCents: d.discountCents,
        });
      } catch (err) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'QUOTE_CALC_ERROR',
          message: err instanceof Error ? err.message : 'Erro ao calcular orçamento.',
        });
      }

      // Valida limite de desconto por perfil sem aprovação de desconto
      const cfgRes = await dbQuery<{ max_discount_bps: number }>(
        `SELECT max_discount_bps FROM portal.unit_commercial_configs WHERE unit_id = $1`,
        [ctx.activeUnitId]
      );
      const maxDiscountBps = cfgRes.rows[0]?.max_discount_bps ?? 500;
      if (
        calc.discountPctBps > maxDiscountBps &&
        !ctx.permissions.includes('quotes:approve_discount')
      ) {
        return reply.status(403).send({
          statusCode: 403,
          code: 'DISCOUNT_LIMIT_EXCEEDED',
          message: `Desconto de ${(calc.discountPctBps / 100).toFixed(2)}% excede o limite do perfil (${(maxDiscountBps / 100).toFixed(2)}%). Solicite autorização do Gestor.`,
        });
      }

      const quote = await withTransaction(async (client) => {
        const countRes = await client.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM portal.quotes WHERE unit_id = $1`,
          [ctx.activeUnitId]
        );
        const seq = Number(countRes.rows[0]?.cnt || 0) + 1;
        const quoteNumber = `${d.isSandbox ? 'SBX-ORC' : 'ORC'}-${String(seq).padStart(4, '0')}`;
        const shareToken = crypto.randomBytes(18).toString('hex');

        const priceListSnap = d.priceListId
          ? (
              await client.query(
                `SELECT id, code, name, version_code, valid_from, valid_until FROM portal.price_lists WHERE id = $1`,
                [d.priceListId]
              )
            ).rows[0] || {}
          : {};

        const qRes = await client.query<{ id: string }>(
          `INSERT INTO portal.quotes (
             quote_number, unit_id, customer_id, opportunity_id, price_list_id,
             price_list_version_snapshot, status, subtotal_cents, personalization_total_cents,
             additional_services_cents, shipping_cents, discount_cents, total_cents,
             known_cost_cents, estimated_contribution_cents, margin_on_sale_pct, markup_pct,
             estimation_status, payment_terms, valid_until, estimated_delivery_days,
             terms_text, notes, share_token, share_enabled, is_sandbox, created_by
           ) VALUES (
             $1,$2,$3,$4,$5,$6,'draft',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,TRUE,$24,$25
           ) RETURNING *`,
          [
            quoteNumber,
            ctx.activeUnitId,
            d.customerId,
            d.opportunityId || null,
            d.priceListId || null,
            JSON.stringify(priceListSnap),
            calc.subtotalCents,
            calc.personalizationTotalCents,
            calc.additionalServicesCents,
            calc.shippingCents,
            calc.discountCents,
            calc.totalCents,
            calc.knownCostCents,
            calc.estimatedContributionCents,
            calc.marginOnSalePct,
            calc.markupPct,
            calc.estimationStatus,
            d.paymentTerms?.trim() || null,
            d.validUntil || null,
            d.estimatedDeliveryDays ?? null,
            d.termsText?.trim() ||
              'Prazo de entrega e produção iniciam somente após aprovação formal da arte final, grade completa de tamanhos e condição financeira.',
            d.notes?.trim() || null,
            shareToken,
            d.isSandbox,
            ctx.userId,
          ]
        );
        const createdQuote = qRes.rows[0];

        for (const item of calc.computedItems) {
          await client.query(
            `INSERT INTO portal.quote_items (
               quote_id, unit_id, product_id, product_sku, product_name, quantity,
               unit_sale_price_cents, unit_supply_cost_cents, personalization_summary,
               personalization_cents, line_total_cents, price_snapshot
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [
              createdQuote.id,
              ctx.activeUnitId,
              item.productId || null,
              item.productSku,
              item.productName,
              item.quantity,
              item.unitSalePriceCents,
              item.unitSupplyCostCents ?? null,
              item.personalizationSummary || null,
              item.personalizationCents,
              item.lineTotalCents,
              JSON.stringify(item.priceSnapshot ?? {}),
            ]
          );
        }

        if (d.opportunityId) {
          await client.query(
            `INSERT INTO portal.crm_activities (
               unit_id, customer_id, opportunity_id, activity_type, title, description, created_by, is_sandbox
             ) VALUES ($1,$2,$3,'quote_created',$4,$5,$6,$7)`,
            [
              ctx.activeUnitId,
              d.customerId,
              d.opportunityId,
              `Orçamento ${quoteNumber} criado`,
              `Total: ${(calc.totalCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} (${calc.estimationStatus === 'incomplete' ? 'Estimativa de margem incompleta' : `Margem est. ${calc.marginOnSalePct}%`}).`,
              ctx.userId,
              d.isSandbox,
            ]
          );
        }

        await recordAuditLog(
          {
            unitId: ctx.activeUnitId,
            action: 'quote.created',
            entityType: 'quote',
            entityId: createdQuote.id,
            afterState: { quoteNumber, totalCents: calc.totalCents, estimationStatus: calc.estimationStatus },
            request,
          },
          client
        );

        return createdQuote;
      });

      return reply.status(201).send({ quote, calculation: calc });
    }
  );

  // POST /api/v1/quotes/:id/status
  fastify.post(
    '/:id/status',
    { preHandler: [requirePortalAuth, requirePermission('quotes:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID de orçamento inválido.' });
      }
      const existing = await dbQuery<{ unit_id: string; status: string }>(
        `SELECT unit_id, status FROM portal.quotes WHERE id = $1`,
        [id]
      );
      if (!existing.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Orçamento não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, existing.rows[0].unit_id)) return;

      const schema = z.object({
        status: z.enum(['draft', 'sent', 'approved', 'rejected', 'expired']),
        approvedByName: z.string().optional().nullable(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const d = parsed.data;
      const updated = await dbQuery(
        `UPDATE portal.quotes SET
           status = $1,
           sent_at = CASE WHEN $1 = 'sent' AND sent_at IS NULL THEN NOW() ELSE sent_at END,
           approved_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE approved_at END,
           approved_by_name = CASE WHEN $1 = 'approved' THEN COALESCE($2, approved_by_name) ELSE approved_by_name END,
           updated_at = NOW()
         WHERE id = $3
         RETURNING *`,
        [d.status, d.approvedByName?.trim() || null, id]
      );

      await recordAuditLog({
        unitId: existing.rows[0].unit_id,
        action: 'quote.status_changed',
        entityType: 'quote',
        entityId: id,
        beforeState: { status: existing.rows[0].status },
        afterState: { status: d.status },
        request,
      });

      return reply.send({ quote: updated.rows[0] });
    }
  );

  // GET /api/v1/quotes/:id/print (HTML imprimível / PDF via window.print sem expor custos internos!)
  fastify.get(
    '/:id/print',
    { preHandler: [requirePortalAuth, requirePermission('quotes:read')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID de orçamento inválido.' });
      }
      const qRes = await dbQuery(
        `SELECT qt.*, c.name AS customer_name, c.city AS customer_city, c.state AS customer_state,
                u.name AS unit_name, u.city AS unit_city, u.state AS unit_state, u.code AS unit_code
         FROM portal.quotes qt
         JOIN portal.customers c ON c.id = qt.customer_id
         JOIN portal.units u ON u.id = qt.unit_id
         WHERE qt.id = $1`,
        [id]
      );
      const qt = qRes.rows[0];
      if (!qt) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Orçamento não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, qt.unit_id)) return;

      const itemsRes = await dbQuery(
        `SELECT product_sku, product_name, quantity, unit_sale_price_cents,
                personalization_summary, personalization_cents, line_total_cents
         FROM portal.quote_items WHERE quote_id = $1 ORDER BY created_at ASC`,
        [id]
      );

      const brl = (cents: number | string) =>
        (Number(cents) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

      const rowsHtml = itemsRes.rows
        .map(
          (i) => `
          <tr>
            <td><strong>${escapeHtml(i.product_name)}</strong><br/><small>${escapeHtml(i.product_sku)}</small></td>
            <td>${Number(i.quantity) || 0} un</td>
            <td>${escapeHtml(brl(i.unit_sale_price_cents))}</td>
            <td>${escapeHtml(i.personalization_summary || 'Padrão')}${Number(i.personalization_cents) > 0 ? ` (+${escapeHtml(brl(i.personalization_cents))}/un)` : ''}</td>
            <td style="text-align:right"><strong>${escapeHtml(brl(i.line_total_cents))}</strong></td>
          </tr>`
        )
        .join('');

      const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>Proposta ${escapeHtml(qt.quote_number)} — King Sports</title>
  <style>
    body{font-family:-apple-system,BlinkMacSystemFont,'Inter',sans-serif;color:#111827;margin:32px;line-height:1.45}
    .header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #1d4ed8;padding-bottom:16px;margin-bottom:24px}
    .badge{display:inline-block;padding:4px 10px;border-radius:99px;background:#dbeafe;color:#1e40af;font-size:12px;font-weight:600}
    table{width:100%;border-collapse:collapse;margin:20px 0}
    th,td{border-bottom:1px solid #e5e7eb;padding:10px 8px;text-align:left;font-size:13px}
    th{background:#f8fafc;color:#475569;font-size:11px;text-transform:uppercase}
    .totals{max-width:340px;margin-left:auto;background:#f8fafc;padding:14px 18px;border-radius:10px}
    .totals div{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}
    .totals .grand{font-size:17px;font-weight:700;border-top:1px solid #cbd5e1;margin-top:8px;padding-top:8px;color:#1e3a8a}
    .note{margin-top:24px;padding:12px 14px;background:#f1f5f9;border-radius:8px;font-size:12px;color:#334155}
    @media print { .no-print { display:none; } }
  </style>
</head>
<body>
  <div class="no-print" style="margin-bottom:16px">
    <button onclick="window.print()" style="background:#1d4ed8;color:#fff;border:0;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:600">Imprimir / Salvar PDF</button>
  </div>
  <div class="header">
    <div>
      <span class="badge">PROPOSTA COMERCIAL KING SPORTS</span>
      <h1 style="margin:8px 0 4px">Orçamento ${escapeHtml(qt.quote_number)}</h1>
      <p style="margin:0;color:#475569;font-size:13px">Unidade Emissora: ${escapeHtml(qt.unit_name)} (${escapeHtml(qt.unit_code)}) · ${escapeHtml(qt.unit_city)}/${escapeHtml(qt.unit_state)}</p>
    </div>
    <div style="text-align:right;font-size:13px">
      <div><strong>Cliente:</strong> ${escapeHtml(qt.customer_name)}</div>
      <div>${escapeHtml(qt.customer_city || '')} ${qt.customer_state ? `/${escapeHtml(qt.customer_state)}` : ''}</div>
      <div><strong>Validade:</strong> ${qt.valid_until ? escapeHtml(String(qt.valid_until).slice(0, 10).split('-').reverse().join('/')) : 'A confirmar'}</div>
    </div>
  </div>
  <table>
    <thead><tr><th>Produto</th><th>Qtd</th><th>Unitário</th><th>Personalização</th><th style="text-align:right">Total</th></tr></thead>
    <tbody>${rowsHtml}</tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal peças</span><span>${escapeHtml(brl(qt.subtotal_cents))}</span></div>
    <div><span>Personalização</span><span>${escapeHtml(brl(qt.personalization_total_cents))}</span></div>
    <div><span>Serviços adicionais</span><span>${escapeHtml(brl(qt.additional_services_cents))}</span></div>
    <div><span>Frete estimado</span><span>${escapeHtml(brl(qt.shipping_cents))}</span></div>
    <div><span>Desconto</span><span>-${escapeHtml(brl(qt.discount_cents))}</span></div>
    <div class="grand"><span>Total da Proposta</span><span>${escapeHtml(brl(qt.total_cents))}</span></div>
  </div>
  <div class="note">
    <strong>Condições comerciais:</strong> ${escapeHtml(qt.payment_terms || 'A combinar com a unidade.')}<br/>
    <strong>Prazo indicativo após aprovações:</strong> ${qt.estimated_delivery_days ? `${Number(qt.estimated_delivery_days)} dias corridos após aceite da arte, grade e entrada financeira` : 'A confirmar com PCP.'}<br/>
    <strong>Observação:</strong> ${escapeHtml(qt.terms_text || '')}
  </div>
</body>
</html>`;

      reply.header('Content-Type', 'text/html; charset=utf-8');
      return reply.send(html);
    }
  );

  // GET /api/v1/quotes/shared/:token (Link controlado para o cliente — sem expor custo/margem interna)
  fastify.get('/shared/:token', async (request, reply) => {
    const { token } = request.params as { token: string };
    if (!token || token.length < 16 || !/^[a-f0-9_-]+$/i.test(token)) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'SHARED_QUOTE_NOT_FOUND',
        message: 'Link de proposta inválido ou desativado.',
      });
    }
    const qRes = await dbQuery(
      `SELECT qt.id, qt.quote_number, qt.status, qt.subtotal_cents, qt.personalization_total_cents,
              qt.additional_services_cents, qt.shipping_cents, qt.discount_cents, qt.total_cents,
              qt.payment_terms, qt.valid_until, qt.estimated_delivery_days, qt.terms_text,
              qt.approved_at, qt.approved_by_name,
              c.name AS customer_name, u.name AS unit_name, u.city AS unit_city, u.state AS unit_state
       FROM portal.quotes qt
       JOIN portal.customers c ON c.id = qt.customer_id
       JOIN portal.units u ON u.id = qt.unit_id
       WHERE qt.share_token = $1 AND qt.share_enabled = TRUE`,
      [token]
    );
    const quote = qRes.rows[0];
    if (!quote) {
      return reply.status(404).send({
        statusCode: 404,
        code: 'SHARED_QUOTE_NOT_FOUND',
        message: 'Link de proposta inválido ou desativado.',
      });
    }
    const itemsRes = await dbQuery(
      `SELECT product_sku, product_name, quantity, unit_sale_price_cents,
              personalization_summary, personalization_cents, line_total_cents
       FROM portal.quote_items WHERE quote_id = $1 ORDER BY created_at ASC`,
      [quote.id]
    );
    return reply.send({ quote, items: itemsRes.rows });
  });
}
