import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbQuery, withTransaction } from '../../plugins/db.js';
import {
  assertUnitOwnership,
  requirePermission,
  requirePortalAuth,
} from '../../middleware/portalAuth.js';
import { recordAuditLog } from '../../services/auditAndNotify.js';

const uuidSchema = z.string().uuid();

const stageLabelsPtBr: Record<string, string> = {
  novo: 'Novo',
  contato_iniciado: 'Contato iniciado',
  qualificacao: 'Qualificação',
  orcamento: 'Orçamento',
  negociacao: 'Negociação',
  ganho: 'Ganho',
  perdido: 'Perdido',
};

const customerSchema = z.object({
  name: z.string().trim().min(2, 'Nome do cliente obrigatório'),
  documentNumber: z.string().max(32).optional().nullable(),
  customerType: z
    .enum(['time', 'escolinha', 'academia', 'empresa', 'organizador_eventos', 'atletica', 'outro'])
    .default('time'),
  segment: z.string().max(80).optional().nullable(),
  city: z.string().max(120).optional().nullable(),
  state: z.string().length(2).optional().nullable(),
  zipCode: z.string().max(20).optional().nullable(),
  addressLine: z.string().max(250).optional().nullable(),
  origin: z.string().max(100).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  isSandbox: z.boolean().optional().default(false),
  primaryContact: z
    .object({
      name: z.string().min(2),
      roleTitle: z.string().optional().nullable(),
      email: z.string().email().optional().nullable(),
      phone: z.string().optional().nullable(),
      whatsapp: z.string().optional().nullable(),
    })
    .optional(),
});

const opportunitySchema = z.object({
  customerId: z.string().uuid(),
  title: z.string().min(2),
  stage: z
    .enum(['novo', 'contato_iniciado', 'qualificacao', 'orcamento', 'negociacao', 'ganho', 'perdido'])
    .default('novo'),
  segment: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().length(2).optional().nullable(),
  origin: z.string().optional().nullable(),
  estimatedValueCents: z.number().int().nonnegative().optional().nullable(),
  productsOfInterest: z.array(z.string()).default([]),
  eventDate: z.string().optional().nullable(),
  nextAction: z.string().optional().nullable(),
  nextActionAt: z.string().optional().nullable(),
  ownerUserId: z.string().uuid().optional().nullable(),
  lossReason: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  isSandbox: z.boolean().optional().default(false),
});

const taskSchema = z.object({
  taskType: z.enum([
    'contato',
    'reuniao',
    'follow_up',
    'vencimento',
    'aprovacao_esperada',
    'entrega',
    'implantacao',
  ]),
  title: z.string().trim().min(2),
  description: z.string().max(2000).optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  opportunityId: z.string().uuid().optional().nullable(),
  orderId: z.string().uuid().optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable(),
  dueAt: z.string().min(1),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  isSandbox: z.boolean().optional().default(false),
});

export async function portalCrmRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/crm/customers
  fastify.get(
    '/customers',
    { preHandler: [requirePortalAuth, requirePermission('crm:read')] },
    async (request, reply) => {
      const ctx = request.portal!;
      const q = request.query as { search?: string; type?: string; sandbox?: string; page?: string; limit?: string };
      const isSandbox = q.sandbox === 'true';
      const page = Math.max(1, Number(q.page || 1));
      const limit = Math.min(100, Math.max(1, Number(q.limit || 25)));
      const offset = (page - 1) * limit;

      const conditions = [`c.unit_id = $1`, `c.is_sandbox = $2`];
      const params: unknown[] = [ctx.activeUnitId, isSandbox];
      let idx = 3;

      if (q.search?.trim()) {
        conditions.push(
          `(LOWER(c.name) LIKE $${idx} OR COALESCE(c.document_number, '') LIKE $${idx} OR LOWER(COALESCE(c.city, '')) LIKE $${idx})`
        );
        params.push(`%${q.search.trim().toLowerCase()}%`);
        idx++;
      }
      if (q.type && q.type !== 'todos') {
        conditions.push(`c.customer_type = $${idx}`);
        params.push(q.type);
        idx++;
      }

      const whereSql = conditions.join(' AND ');
      const [rowsRes, countRes] = await Promise.all([
        dbQuery(
          `SELECT c.*,
             p.full_name AS owner_name,
             (SELECT json_agg(cc ORDER BY cc.is_primary DESC, cc.created_at ASC)
              FROM portal.customer_contacts cc WHERE cc.customer_id = c.id) AS contacts,
             (SELECT COUNT(*)::int FROM portal.opportunities o WHERE o.customer_id = c.id AND o.status = 'open') AS open_opportunities_count,
             (SELECT COUNT(*)::int FROM portal.orders ord WHERE ord.customer_id = c.id AND ord.commercial_status <> 'canceled') AS active_orders_count
           FROM portal.customers c
           LEFT JOIN portal.profiles p ON p.id = c.owner_user_id
           WHERE ${whereSql}
           ORDER BY c.created_at DESC
           LIMIT $${idx} OFFSET $${idx + 1}`,
          [...params, limit, offset]
        ),
        dbQuery<{ total: string }>(`SELECT COUNT(*)::text AS total FROM portal.customers c WHERE ${whereSql}`, params),
      ]);

      return reply.send({
        items: rowsRes.rows,
        pagination: { page, limit, total: Number(countRes.rows[0]?.total || 0) },
      });
    }
  );

  // GET /api/v1/crm/customers/duplicates-check
  fastify.get(
    '/customers/duplicates-check',
    { preHandler: [requirePortalAuth, requirePermission('crm:read')] },
    async (request, reply) => {
      const ctx = request.portal!;
      const q = request.query as { name?: string; documentNumber?: string; phone?: string };
      const nameTerm = q.name?.trim().toLowerCase() || '';
      const docTerm = q.documentNumber?.replace(/\D/g, '') || '';
      const phoneTerm = q.phone?.replace(/\D/g, '') || '';

      if (!nameTerm && !docTerm && !phoneTerm) {
        return reply.send({ possibleDuplicates: [] });
      }

      const res = await dbQuery(
        `SELECT DISTINCT c.id, c.name, c.customer_type, c.document_number, c.city, c.state,
                (SELECT cc.phone FROM portal.customer_contacts cc WHERE cc.customer_id = c.id LIMIT 1) AS primary_phone
         FROM portal.customers c
         LEFT JOIN portal.customer_contacts cc ON cc.customer_id = c.id
         WHERE c.unit_id = $1
           AND c.is_sandbox = FALSE
           AND (
             ($2 <> '' AND LOWER(c.name) LIKE '%' || $2 || '%')
             OR ($3 <> '' AND regexp_replace(COALESCE(c.document_number, ''), '\\D', '', 'g') = $3)
             OR ($4 <> '' AND (
               regexp_replace(COALESCE(cc.phone, ''), '\\D', '', 'g') = $4
               OR regexp_replace(COALESCE(cc.whatsapp, ''), '\\D', '', 'g') = $4
             ))
           )
         LIMIT 8`,
        [ctx.activeUnitId, nameTerm, docTerm, phoneTerm]
      );

      return reply.send({
        warningOnly: true,
        message:
          res.rows.length > 0
            ? 'Foram encontrados clientes semelhantes na carteira. Revise antes de criar duplicidade (não impede cadastro se forem instituições distintas).'
            : null,
        possibleDuplicates: res.rows,
      });
    }
  );

  // POST /api/v1/crm/customers
  fastify.post(
    '/customers',
    { preHandler: [requirePortalAuth, requirePermission('crm:write')] },
    async (request, reply) => {
      const parsed = customerSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Dados do cliente inválidos.',
          details: parsed.error.flatten(),
        });
      }

      const ctx = request.portal!;
      const d = parsed.data;

      const created = await withTransaction(async (client) => {
        const custRes = await client.query<{ id: string }>(
          `INSERT INTO portal.customers (
             unit_id, name, document_number, customer_type, segment, city, state,
             zip_code, address_line, origin, owner_user_id, notes, is_sandbox, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
           RETURNING *`,
          [
            ctx.activeUnitId,
            d.name.trim(),
            d.documentNumber?.trim() || null,
            d.customerType,
            d.segment?.trim() || null,
            d.city?.trim() || null,
            d.state?.toUpperCase() || null,
            d.zipCode?.trim() || null,
            d.addressLine?.trim() || null,
            d.origin?.trim() || null,
            ctx.userId,
            d.notes?.trim() || null,
            d.isSandbox,
            ctx.userId,
          ]
        );
        const customer = custRes.rows[0];

        if (d.primaryContact) {
          await client.query(
            `INSERT INTO portal.customer_contacts (
               unit_id, customer_id, name, role_title, email, phone, whatsapp, is_primary
             ) VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE)`,
            [
              ctx.activeUnitId,
              customer.id,
              d.primaryContact.name.trim(),
              d.primaryContact.roleTitle?.trim() || null,
              d.primaryContact.email?.trim() || null,
              d.primaryContact.phone?.trim() || null,
              d.primaryContact.whatsapp?.trim() || null,
            ]
          );
        }

        await client.query(
          `INSERT INTO portal.crm_activities (
             unit_id, customer_id, activity_type, title, description, created_by, is_sandbox
           ) VALUES ($1,$2,'system','Cliente cadastrado na carteira',$3,$4,$5)`,
          [ctx.activeUnitId, customer.id, `Cliente ${d.name} incluído por ${ctx.fullName}.`, ctx.userId, d.isSandbox]
        );

        await recordAuditLog(
          {
            unitId: ctx.activeUnitId,
            action: 'customer.created',
            entityType: 'customer',
            entityId: customer.id,
            afterState: customer,
            request,
          },
          client
        );

        return customer;
      });

      return reply.status(201).send({ customer: created });
    }
  );

  // PATCH /api/v1/crm/customers/:id
  fastify.patch(
    '/customers/:id',
    { preHandler: [requirePortalAuth, requirePermission('crm:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID de cliente inválido.' });
      }
      const existing = await dbQuery<{ id: string; unit_id: string }>(`SELECT id, unit_id FROM portal.customers WHERE id = $1`, [id]);
      if (!existing.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Cliente não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, existing.rows[0].unit_id)) return;

      const parsed = customerSchema.partial().safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const d = parsed.data;
      const updated = await dbQuery(
        `UPDATE portal.customers SET
           name = COALESCE($1, name),
           document_number = COALESCE($2, document_number),
           customer_type = COALESCE($3, customer_type),
           segment = COALESCE($4, segment),
           city = COALESCE($5, city),
           state = COALESCE($6, state),
           zip_code = COALESCE($7, zip_code),
           address_line = COALESCE($8, address_line),
           origin = COALESCE($9, origin),
           notes = COALESCE($10, notes),
           updated_at = NOW()
         WHERE id = $11
         RETURNING *`,
        [
          d.name?.trim() ?? null,
          d.documentNumber ?? null,
          d.customerType ?? null,
          d.segment ?? null,
          d.city ?? null,
          d.state?.toUpperCase() ?? null,
          d.zipCode ?? null,
          d.addressLine ?? null,
          d.origin ?? null,
          d.notes ?? null,
          id,
        ]
      );
      return reply.send({ customer: updated.rows[0] });
    }
  );

  // POST /api/v1/crm/customers/:id/contacts
  fastify.post(
    '/customers/:id/contacts',
    { preHandler: [requirePortalAuth, requirePermission('crm:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID de cliente inválido.' });
      }
      const custRes = await dbQuery<{ unit_id: string }>(`SELECT unit_id FROM portal.customers WHERE id = $1`, [id]);
      if (!custRes.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Cliente não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, custRes.rows[0].unit_id)) return;

      const schema = z.object({
        name: z.string().min(2),
        roleTitle: z.string().optional().nullable(),
        email: z.string().email().optional().nullable(),
        phone: z.string().optional().nullable(),
        whatsapp: z.string().optional().nullable(),
        isPrimary: z.boolean().default(false),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const d = parsed.data;
      const inserted = await dbQuery(
        `INSERT INTO portal.customer_contacts (unit_id, customer_id, name, role_title, email, phone, whatsapp, is_primary)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          custRes.rows[0].unit_id,
          id,
          d.name.trim(),
          d.roleTitle?.trim() || null,
          d.email?.trim() || null,
          d.phone?.trim() || null,
          d.whatsapp?.trim() || null,
          d.isPrimary,
        ]
      );
      return reply.status(201).send({ contact: inserted.rows[0] });
    }
  );

  // GET /api/v1/crm/opportunities
  fastify.get(
    '/opportunities',
    { preHandler: [requirePortalAuth, requirePermission('crm:read')] },
    async (request, reply) => {
      const ctx = request.portal!;
      const q = request.query as { stage?: string; status?: string; search?: string; sandbox?: string; page?: string; limit?: string };
      const isSandbox = q.sandbox === 'true';

      const conditions = [`o.unit_id = $1`, `o.is_sandbox = $2`];
      const params: unknown[] = [ctx.activeUnitId, isSandbox];
      let idx = 3;

      if (q.stage && q.stage !== 'todos') {
        conditions.push(`o.stage = $${idx}`);
        params.push(q.stage);
        idx++;
      }
      if (q.status && q.status !== 'todos') {
        conditions.push(`o.status = $${idx}`);
        params.push(q.status);
        idx++;
      }
      if (q.search?.trim()) {
        conditions.push(`(LOWER(o.title) LIKE $${idx} OR LOWER(c.name) LIKE $${idx})`);
        params.push(`%${q.search.trim().toLowerCase()}%`);
        idx++;
      }

      const requestedPage = Number(q.page);
      const requestedLimit = Number(q.limit);
      const page = Number.isSafeInteger(requestedPage) ? Math.max(1, Math.min(100000, requestedPage)) : 1;
      const limit = Number.isSafeInteger(requestedLimit) ? Math.max(1, Math.min(100, requestedLimit)) : 25;
      const paginated = q.page !== undefined || q.limit !== undefined;
      const rows = await dbQuery(
        `SELECT o.*,
                c.name AS customer_name,
                c.customer_type,
                c.city AS customer_city,
                c.state AS customer_state,
                p.full_name AS owner_name,
                o.updated_at::text AS edit_version,
                (SELECT MAX(ca.created_at) FROM portal.crm_activities ca WHERE ca.opportunity_id=o.id AND ca.activity_type IN ('call','whatsapp','meeting','email')) AS last_interaction_at,
                (SELECT COUNT(*)::int FROM portal.quotes qt WHERE qt.opportunity_id = o.id) AS quotes_count,
                (SELECT COUNT(*)::int FROM portal.crm_activities ca WHERE ca.opportunity_id = o.id) AS activities_count
         FROM portal.opportunities o
         JOIN portal.customers c ON c.id = o.customer_id
         LEFT JOIN portal.profiles p ON p.id = o.owner_user_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY o.updated_at DESC, o.id DESC ${paginated ? `LIMIT $${idx} OFFSET $${idx + 1}` : ''}`,
        paginated ? [...params, limit, (page - 1) * limit] : params
      );

      const totals = await dbQuery<{ stage: string; count: number; value: string }>(
        `SELECT o.stage, count(*)::int AS count, coalesce(sum(o.estimated_value_cents),0)::text AS value
         FROM portal.opportunities o JOIN portal.customers c ON c.id=o.customer_id
         WHERE ${conditions.join(' AND ')} GROUP BY o.stage`, params
      );
      return reply.send({ items: rows.rows, summary: totals.rows,
        pagination: { page, limit, total: totals.rows.reduce((sum, row) => sum + row.count, 0) } });
    }
  );

  // GET /api/v1/crm/opportunities/:id
  fastify.get(
    '/opportunities/:id',
    { preHandler: [requirePortalAuth, requirePermission('crm:read')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID de oportunidade inválido.' });
      }
      const oppRes = await dbQuery(
        `SELECT o.*, c.name AS customer_name, c.customer_type, c.city AS customer_city, c.state AS customer_state,
                p.full_name AS owner_name, o.updated_at::text AS edit_version
         FROM portal.opportunities o
         JOIN portal.customers c ON c.id = o.customer_id
         LEFT JOIN portal.profiles p ON p.id = o.owner_user_id
         WHERE o.id = $1`,
        [id]
      );
      const opp = oppRes.rows[0];
      if (!opp) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Oportunidade não encontrada.' });
      }
      if (!assertUnitOwnership(request, reply, opp.unit_id)) return;

      const [activitiesRes, quotesRes] = await Promise.all([
        dbQuery(
          `SELECT ca.*, p.full_name AS created_by_name
           FROM portal.crm_activities ca
           LEFT JOIN portal.profiles p ON p.id = ca.created_by
           WHERE ca.opportunity_id = $1
           ORDER BY ca.created_at DESC`,
          [id]
        ),
        dbQuery(
          `SELECT id, quote_number, status, total_cents, valid_until, created_at
           FROM portal.quotes
           WHERE opportunity_id = $1
           ORDER BY created_at DESC`,
          [id]
        ),
      ]);

      return reply.send({
        opportunity: opp,
        activities: activitiesRes.rows,
        quotes: quotesRes.rows,
      });
    }
  );

  // POST /api/v1/crm/opportunities
  fastify.post(
    '/opportunities',
    { preHandler: [requirePortalAuth, requirePermission('crm:write')] },
    async (request, reply) => {
      const parsed = opportunitySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Dados da oportunidade inválidos.',
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
          message: 'Cliente inválido ou pertencente a outra unidade.',
        });
      }

      if (d.ownerUserId) {
        const memRes = await dbQuery<{ user_id: string }>(
          `SELECT user_id FROM portal.unit_memberships
           WHERE unit_id = $1 AND user_id = $2 AND status = 'active'`,
          [ctx.activeUnitId, d.ownerUserId]
        );
        if (!memRes.rows[0]) {
          return reply.status(400).send({
            statusCode: 400,
            code: 'INVALID_ASSIGNEE',
            message: 'Responsável informado não pertence como membro ativo desta unidade.',
          });
        }
      }

      if (d.stage === 'perdido' && (!d.lossReason || d.lossReason.trim().length < 3)) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'LOSS_REASON_REQUIRED',
          message: 'É obrigatório registrar o motivo da perda da oportunidade.',
        });
      }

      const status = d.stage === 'ganho' ? 'won' : d.stage === 'perdido' ? 'lost' : 'open';

      const opp = await withTransaction(async (client) => {
        const res = await client.query<{ id: string }>(
          `INSERT INTO portal.opportunities (
             unit_id, customer_id, title, stage, status, segment, city, state, origin,
             estimated_value_cents, products_of_interest, event_date, next_action, next_action_at,
             owner_user_id, loss_reason, notes, won_at, lost_at, is_sandbox, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21)
           RETURNING *`,
          [
            ctx.activeUnitId,
            d.customerId,
            d.title.trim(),
            d.stage,
            status,
            d.segment?.trim() || null,
            d.city?.trim() || null,
            d.state?.toUpperCase() || null,
            d.origin?.trim() || null,
            d.estimatedValueCents ?? null,
            JSON.stringify(d.productsOfInterest ?? []),
            d.eventDate || null,
            d.nextAction?.trim() || null,
            d.nextActionAt || null,
            d.ownerUserId || ctx.userId,
            d.lossReason?.trim() || null,
            d.notes?.trim() || null,
            status === 'won' ? new Date().toISOString() : null,
            status === 'lost' ? new Date().toISOString() : null,
            d.isSandbox,
            ctx.userId,
          ]
        );
        const createdOpp = res.rows[0];

        await client.query(
          `INSERT INTO portal.crm_activities (
             unit_id, customer_id, opportunity_id, activity_type, title, description, created_by, is_sandbox
           ) VALUES ($1,$2,$3,'system',$4,$5,$6,$7)`,
          [
            ctx.activeUnitId,
            d.customerId,
            createdOpp.id,
            `Oportunidade criada na etapa '${stageLabelsPtBr[d.stage] || d.stage}'`,
            d.nextAction ? `Próxima ação: ${d.nextAction}` : null,
            ctx.userId,
            d.isSandbox,
          ]
        );

        await recordAuditLog(
          {
            unitId: ctx.activeUnitId,
            action: 'opportunity.created',
            entityType: 'opportunity',
            entityId: createdOpp.id,
            afterState: createdOpp,
            request,
          },
          client
        );

        return createdOpp;
      });

      return reply.status(201).send({ opportunity: opp });
    }
  );

  // PATCH /api/v1/crm/opportunities/:id/stage (Ganho NÃO cria produção automaticamente!)
  fastify.patch(
    '/opportunities/:id/stage',
    { preHandler: [requirePortalAuth, requirePermission('crm:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID de oportunidade inválido.' });
      }
      const schema = z.object({
        expectedUpdatedAt: z.string().max(50).optional(),
        stage: z.enum(['novo', 'contato_iniciado', 'qualificacao', 'orcamento', 'negociacao', 'ganho', 'perdido']),
        lossReason: z.string().optional().nullable(),
        reopenReason: z.string().optional().nullable(),
        nextAction: z.string().optional().nullable(),
        nextActionAt: z.string().optional().nullable(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const existingRes = await dbQuery<{
        id: string;
        unit_id: string;
        customer_id: string;
        stage: string;
        status: string;
        loss_reason: string | null;
        reopen_history: unknown[];
        is_sandbox: boolean;
        edit_version: string;
      }>(`SELECT *, updated_at::text AS edit_version FROM portal.opportunities WHERE id = $1`, [id]);

      const existing = existingRes.rows[0];
      if (!existing) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Oportunidade não encontrada.' });
      }
      if (!assertUnitOwnership(request, reply, existing.unit_id)) return;

      const d = parsed.data;
      if (d.expectedUpdatedAt && d.expectedUpdatedAt !== existing.edit_version) {
        return reply.status(409).send({ code: 'CRM_CONFLICT', message: 'Outro usuário atualizou a oportunidade. Atualize os dados e tente novamente.' });
      }
      if (d.stage === existing.stage) return reply.send({ opportunity: existing, productionCreatedAutomatically: false });
      if (d.stage === 'perdido' && (!d.lossReason || d.lossReason.trim().length < 3)) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'LOSS_REASON_REQUIRED',
          message: 'Informe o motivo da perda antes de encerrar a oportunidade como perdida.',
        });
      }

      const newStatus = d.stage === 'ganho' ? 'won' : d.stage === 'perdido' ? 'lost' : 'open';
      const isReopening = existing.status !== 'open' && newStatus === 'open';
      if (isReopening && (d.reopenReason?.trim().length ?? 0) < 3) {
        return reply.status(400).send({ code: 'REOPEN_REASON_REQUIRED', message: 'Informe o motivo da reabertura.' });
      }
      const nextReopenHistory = Array.isArray(existing.reopen_history) ? [...existing.reopen_history] : [];

      if (isReopening) {
        nextReopenHistory.push({
          reopenedAt: new Date().toISOString(),
          reopenedBy: request.portal!.fullName,
          fromStage: existing.stage,
          toStage: d.stage,
          previousLossReason: existing.loss_reason,
          reason: d.reopenReason?.trim() || 'Reabertura comercial solicitada pela unidade',
        });
      }

      const updated = await withTransaction(async (client) => {
        const upRes = await client.query(
          `UPDATE portal.opportunities SET
             stage = $1,
             status = $2,
             loss_reason = CASE WHEN $1 = 'perdido' THEN $3 WHEN $2 = 'open' THEN NULL ELSE loss_reason END,
             reopen_history = $4,
             next_action = COALESCE($5, next_action),
             next_action_at = COALESCE($6, next_action_at),
             won_at = CASE WHEN $2 = 'won' THEN NOW() ELSE won_at END,
             lost_at = CASE WHEN $2 = 'lost' THEN NOW() ELSE lost_at END,
             updated_at = NOW()
           WHERE id = $7 AND unit_id = $8 AND updated_at = $9::timestamptz
           RETURNING *`,
          [
            d.stage,
            newStatus,
            d.lossReason?.trim() || null,
            JSON.stringify(nextReopenHistory),
            d.nextAction?.trim() || null,
            d.nextActionAt || null,
            id,
            existing.unit_id,
            existing.edit_version,
          ]
        );

        if (!upRes.rows[0]) return null;

        await client.query(
          `INSERT INTO portal.crm_activities (
             unit_id, customer_id, opportunity_id, activity_type, title, description, metadata, created_by, is_sandbox
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [
            existing.unit_id,
            existing.customer_id,
            id,
            isReopening ? 'reopen' : 'stage_change',
            isReopening
              ? `Oportunidade reaberta de '${stageLabelsPtBr[existing.stage] || existing.stage}' para '${stageLabelsPtBr[d.stage] || d.stage}'`
              : `Etapa alterada de '${stageLabelsPtBr[existing.stage] || existing.stage}' para '${stageLabelsPtBr[d.stage] || d.stage}'`,
            d.stage === 'perdido'
              ? `Motivo da perda: ${d.lossReason}`
              : d.stage === 'ganho'
                ? 'Oportunidade marcada como ganha. Prossiga para orçamento/arte/aprovação para criar o pedido.'
                : d.reopenReason || null,
            JSON.stringify({ from: existing.stage, to: d.stage }),
            request.portal!.userId,
            existing.is_sandbox,
          ]
        );

        await recordAuditLog(
          {
            unitId: existing.unit_id,
            action: isReopening ? 'opportunity.reopened' : 'opportunity.stage_changed',
            entityType: 'opportunity',
            entityId: id,
            beforeState: { stage: existing.stage, status: existing.status },
            afterState: { stage: d.stage, status: newStatus },
            reason: d.lossReason || d.reopenReason || null,
            request,
          },
          client
        );

        return upRes.rows[0];
      });

      if (!updated) return reply.status(409).send({ code: 'CRM_CONFLICT', message: 'A oportunidade mudou durante a atualização. Tente novamente.' });
      return reply.send({
        opportunity: updated,
        productionCreatedAutomatically: false,
        nextStepHint:
          d.stage === 'ganho'
            ? 'Ganho registrado! Crie/vincule o orçamento e finalize a aprovação da arte e grade antes de liberar produção.'
            : null,
      });
    }
  );

  // POST /api/v1/crm/opportunities/:id/activities
  fastify.post(
    '/opportunities/:id/activities',
    { preHandler: [requirePortalAuth, requirePermission('crm:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID de oportunidade inválido.' });
      }
      const oppRes = await dbQuery<{ unit_id: string; customer_id: string; is_sandbox: boolean }>(
        `SELECT unit_id, customer_id, is_sandbox FROM portal.opportunities WHERE id = $1`,
        [id]
      );
      if (!oppRes.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Oportunidade não encontrada.' });
      }
      if (!assertUnitOwnership(request, reply, oppRes.rows[0].unit_id)) return;

      const schema = z.object({
        activityType: z.enum(['note', 'call', 'whatsapp', 'meeting', 'email']).default('note'),
        title: z.string().min(2),
        description: z.string().optional().nullable(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const actRes = await dbQuery(
        `INSERT INTO portal.crm_activities (
           unit_id, customer_id, opportunity_id, activity_type, title, description, created_by, is_sandbox
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          oppRes.rows[0].unit_id,
          oppRes.rows[0].customer_id,
          id,
          parsed.data.activityType,
          parsed.data.title.trim(),
          parsed.data.description?.trim() || null,
          request.portal!.userId,
          oppRes.rows[0].is_sandbox,
        ]
      );
      return reply.status(201).send({ activity: actRes.rows[0] });
    }
  );

  // GET /api/v1/crm/tasks
  fastify.get(
    '/tasks',
    { preHandler: [requirePortalAuth, requirePermission('tasks:read')] },
    async (request, reply) => {
      const ctx = request.portal!;
      const q = request.query as {
        status?: string;
        bucket?: string;
        priority?: string;
        taskType?: string;
        search?: string;
        sandbox?: string;
      };
      const isSandbox = q.sandbox === 'true';

      const conditions = [`t.unit_id = $1`, `t.is_sandbox = $2`];
      const params: unknown[] = [ctx.activeUnitId, isSandbox];
      let idx = 3;

      if (q.status && q.status !== 'todos') {
        conditions.push(`t.status = $${idx}`);
        params.push(q.status);
        idx++;
      }

      if (q.bucket && q.bucket !== 'todos') {
        const unitTz = ctx.activeUnit.timezone || 'America/Sao_Paulo';
        switch (q.bucket) {
          case 'hoje':
            if (!q.status || q.status === 'todos') {
              conditions.push(`t.status IN ('pending', 'in_progress')`);
            }
            conditions.push(`(t.due_at AT TIME ZONE $${idx})::date = (NOW() AT TIME ZONE $${idx})::date`);
            params.push(unitTz);
            idx++;
            break;
          case 'atrasadas':
            if (!q.status || q.status === 'todos') {
              conditions.push(`t.status IN ('pending', 'in_progress')`);
            }
            conditions.push(`t.due_at < NOW()`);
            break;
          case 'abertas':
            if (!q.status || q.status === 'todos') {
              conditions.push(`t.status IN ('pending', 'in_progress')`);
            }
            break;
          case 'concluidas':
            conditions.push(`t.status = 'completed'`);
            break;
          default:
            break;
        }
      }

      if (q.priority && q.priority !== 'todos') {
        conditions.push(`t.priority = $${idx}`);
        params.push(q.priority);
        idx++;
      }

      if (q.taskType && q.taskType !== 'todos') {
        conditions.push(`t.task_type = $${idx}`);
        params.push(q.taskType);
        idx++;
      }

      if (q.search?.trim()) {
        conditions.push(
          `(LOWER(t.title) LIKE $${idx} OR LOWER(COALESCE(t.description, '')) LIKE $${idx} OR LOWER(COALESCE(c.name, '')) LIKE $${idx} OR LOWER(COALESCE(o.order_number, '')) LIKE $${idx})`
        );
        params.push(`%${q.search.trim().toLowerCase()}%`);
        idx++;
      }

      const rows = await dbQuery(
        `SELECT t.*, p.full_name AS assigned_name, c.name AS customer_name, o.order_number
         FROM portal.tasks t
         LEFT JOIN portal.profiles p ON p.id = t.assigned_to
         LEFT JOIN portal.customers c ON c.id = t.customer_id
         LEFT JOIN portal.orders o ON o.id = t.order_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY (t.status = 'completed') ASC, t.due_at ASC`,
        params
      );
      return reply.send({ items: rows.rows });
    }
  );

  // POST /api/v1/crm/tasks
  fastify.post(
    '/tasks',
    { preHandler: [requirePortalAuth, requirePermission('tasks:write')] },
    async (request, reply) => {
      const parsed = taskSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const ctx = request.portal!;
      const d = parsed.data;
      const dueDate = new Date(d.dueAt);
      if (Number.isNaN(dueDate.getTime())) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Data de vencimento (dueAt) inválida.',
        });
      }

      if (d.customerId) {
        const custRes = await dbQuery<{ unit_id: string }>(`SELECT unit_id FROM portal.customers WHERE id = $1`, [
          d.customerId,
        ]);
        if (!custRes.rows[0] || custRes.rows[0].unit_id !== ctx.activeUnitId) {
          return reply.status(403).send({
            statusCode: 403,
            code: 'CUSTOMER_UNIT_MISMATCH',
            message: 'Cliente inválido ou pertencente a outra unidade.',
          });
        }
      }

      if (d.opportunityId) {
        const oppRes = await dbQuery<{ unit_id: string }>(`SELECT unit_id FROM portal.opportunities WHERE id = $1`, [
          d.opportunityId,
        ]);
        if (!oppRes.rows[0] || oppRes.rows[0].unit_id !== ctx.activeUnitId) {
          return reply.status(403).send({
            statusCode: 403,
            code: 'OPPORTUNITY_UNIT_MISMATCH',
            message: 'Oportunidade inválida ou pertencente a outra unidade.',
          });
        }
      }

      if (d.orderId) {
        const ordRes = await dbQuery<{ unit_id: string }>(`SELECT unit_id FROM portal.orders WHERE id = $1`, [
          d.orderId,
        ]);
        if (!ordRes.rows[0] || ordRes.rows[0].unit_id !== ctx.activeUnitId) {
          return reply.status(403).send({
            statusCode: 403,
            code: 'ORDER_UNIT_MISMATCH',
            message: 'Pedido inválido ou pertencente a outra unidade.',
          });
        }
      }

      if (d.assignedTo) {
        const memberRes = await dbQuery<{ user_id: string }>(
          `SELECT user_id FROM portal.unit_memberships WHERE unit_id = $1 AND user_id = $2 AND status = 'active'`,
          [ctx.activeUnitId, d.assignedTo]
        );
        if (!memberRes.rows[0]) {
          return reply.status(403).send({
            statusCode: 403,
            code: 'ASSIGNEE_UNIT_MISMATCH',
            message: 'Responsável inválido ou não vinculado a esta unidade.',
          });
        }
      }

      const task = await withTransaction(async (client) => {
        const insRes = await client.query<{ id: string }>(
          `INSERT INTO portal.tasks (
             unit_id, task_type, title, description, customer_id, opportunity_id, order_id,
             assigned_to, created_by, due_at, priority, is_sandbox
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           RETURNING id`,
          [
            ctx.activeUnitId,
            d.taskType,
            d.title,
            d.description?.trim() || null,
            d.customerId || null,
            d.opportunityId || null,
            d.orderId || null,
            d.assignedTo || ctx.userId,
            ctx.userId,
            dueDate.toISOString(),
            d.priority,
            d.isSandbox,
          ]
        );

        const joinedRes = await client.query(
          `SELECT t.*, p.full_name AS assigned_name, c.name AS customer_name, o.order_number
           FROM portal.tasks t
           LEFT JOIN portal.profiles p ON p.id = t.assigned_to
           LEFT JOIN portal.customers c ON c.id = t.customer_id
           LEFT JOIN portal.orders o ON o.id = t.order_id
           WHERE t.id = $1`,
          [insRes.rows[0].id]
        );
        const createdTask = joinedRes.rows[0];

        await recordAuditLog(
          {
            unitId: ctx.activeUnitId,
            action: 'task.created',
            entityType: 'task',
            entityId: createdTask.id,
            afterState: createdTask,
            request,
          },
          client
        );

        return createdTask;
      });

      return reply.status(201).send({ task });
    }
  );

  // PATCH /api/v1/crm/tasks/:id (editar, reagendar, concluir, reabrir, atribuir)
  fastify.patch(
    '/tasks/:id',
    { preHandler: [requirePortalAuth, requirePermission('tasks:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!z.string().uuid().safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID de tarefa inválido.' });
      }
      const existingRes = await dbQuery<{ id: string; unit_id: string; status: string }>(
        `SELECT * FROM portal.tasks WHERE id = $1`,
        [id]
      );
      const existing = existingRes.rows[0];
      if (!existing) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Tarefa não encontrada.' });
      }
      if (!assertUnitOwnership(request, reply, existing.unit_id)) return;

      const schema = z.object({
        status: z.enum(['pending', 'in_progress', 'completed', 'canceled']).optional(),
        dueAt: z.string().min(1).optional(),
        assignedTo: z.string().uuid().optional().nullable(),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
        title: z.string().trim().min(2).optional(),
        description: z.string().max(2000).optional().nullable(),
        taskType: z
          .enum(['contato', 'reuniao', 'follow_up', 'vencimento', 'aprovacao_esperada', 'entrega', 'implantacao'])
          .optional(),
        customerId: z.string().uuid().optional().nullable(),
        orderId: z.string().uuid().optional().nullable(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const d = parsed.data;

      let dueIso: string | null = null;
      if (d.dueAt !== undefined) {
        const dueDate = new Date(d.dueAt);
        if (Number.isNaN(dueDate.getTime())) {
          return reply.status(400).send({
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Data de vencimento (dueAt) inválida.',
          });
        }
        dueIso = dueDate.toISOString();
      }

      if (d.customerId) {
        const custRes = await dbQuery<{ unit_id: string }>(`SELECT unit_id FROM portal.customers WHERE id = $1`, [
          d.customerId,
        ]);
        if (!custRes.rows[0] || custRes.rows[0].unit_id !== existing.unit_id) {
          return reply.status(403).send({
            statusCode: 403,
            code: 'CUSTOMER_UNIT_MISMATCH',
            message: 'Cliente inválido ou pertencente a outra unidade.',
          });
        }
      }

      if (d.orderId) {
        const ordRes = await dbQuery<{ unit_id: string }>(`SELECT unit_id FROM portal.orders WHERE id = $1`, [
          d.orderId,
        ]);
        if (!ordRes.rows[0] || ordRes.rows[0].unit_id !== existing.unit_id) {
          return reply.status(403).send({
            statusCode: 403,
            code: 'ORDER_UNIT_MISMATCH',
            message: 'Pedido inválido ou pertencente a outra unidade.',
          });
        }
      }

      if (d.assignedTo) {
        const memberRes = await dbQuery<{ user_id: string }>(
          `SELECT user_id FROM portal.unit_memberships WHERE unit_id = $1 AND user_id = $2 AND status = 'active'`,
          [existing.unit_id, d.assignedTo]
        );
        if (!memberRes.rows[0]) {
          return reply.status(403).send({
            statusCode: 403,
            code: 'ASSIGNEE_UNIT_MISMATCH',
            message: 'Responsável inválido ou não vinculado a esta unidade.',
          });
        }
      }

      const task = await withTransaction(async (client) => {
        await client.query(
          `UPDATE portal.tasks SET
             status = COALESCE($1::text, status),
             due_at = COALESCE($2::timestamptz, due_at),
             assigned_to = CASE WHEN $3 THEN $4::uuid ELSE assigned_to END,
             priority = COALESCE($5::text, priority),
             title = COALESCE($6::text, title),
             description = CASE WHEN $7 THEN $8::text ELSE description END,
             task_type = COALESCE($9::text, task_type),
             customer_id = CASE WHEN $10 THEN $11::uuid ELSE customer_id END,
             order_id = CASE WHEN $12 THEN $13::uuid ELSE order_id END,
             completed_at = CASE WHEN $1::text = 'completed' THEN NOW() WHEN $1::text IN ('pending', 'in_progress') THEN NULL ELSE completed_at END,
             updated_at = NOW()
           WHERE id = $14`,
          [
            d.status ?? null,
            dueIso,
            d.assignedTo !== undefined,
            d.assignedTo ?? null,
            d.priority ?? null,
            d.title ?? null,
            d.description !== undefined,
            d.description !== undefined ? d.description?.trim() || null : null,
            d.taskType ?? null,
            d.customerId !== undefined,
            d.customerId ?? null,
            d.orderId !== undefined,
            d.orderId ?? null,
            id,
          ]
        );

        const joinedRes = await client.query(
          `SELECT t.*, p.full_name AS assigned_name, c.name AS customer_name, o.order_number
           FROM portal.tasks t
           LEFT JOIN portal.profiles p ON p.id = t.assigned_to
           LEFT JOIN portal.customers c ON c.id = t.customer_id
           LEFT JOIN portal.orders o ON o.id = t.order_id
           WHERE t.id = $1`,
          [id]
        );
        const updatedTask = joinedRes.rows[0];

        await recordAuditLog(
          {
            unitId: existing.unit_id,
            action: 'task.updated',
            entityType: 'task',
            entityId: id,
            beforeState: existing,
            afterState: updatedTask,
            request,
          },
          client
        );

        return updatedTask;
      });

      return reply.send({ task });
    }
  );

  // DELETE /api/v1/crm/tasks/:id
  fastify.delete(
    '/tasks/:id',
    { preHandler: [requirePortalAuth, requirePermission('tasks:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!z.string().uuid().safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID de tarefa inválido.' });
      }
      const existingRes = await dbQuery<{ id: string; unit_id: string }>(
        `SELECT * FROM portal.tasks WHERE id = $1`,
        [id]
      );
      const existing = existingRes.rows[0];
      if (!existing) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Tarefa não encontrada.' });
      }
      if (!assertUnitOwnership(request, reply, existing.unit_id)) return;

      await withTransaction(async (client) => {
        await client.query(`DELETE FROM portal.tasks WHERE id = $1`, [id]);
        await recordAuditLog(
          {
            unitId: existing.unit_id,
            action: 'task.deleted',
            entityType: 'task',
            entityId: id,
            beforeState: existing,
            request,
          },
          client
        );
      });

      return reply.send({ deleted: true, id });
    }
  );
}
