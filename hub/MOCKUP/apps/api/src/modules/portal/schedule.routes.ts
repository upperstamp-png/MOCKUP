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

const createScheduleSchema = z.object({
  eventType: z.enum(['entrega', 'reuniao', 'follow_up', 'outro']),
  title: z.string().trim().min(2, 'Título do evento obrigatório').max(200),
  description: z.string().max(2000).optional().nullable(),
  startAt: z.string().min(1),
  endAt: z.string().min(1),
  allDay: z.boolean().optional().default(false),
  location: z.string().max(300).optional().nullable(),
  meetingUrl: z.string().max(500).optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  orderId: z.string().uuid().optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable(),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'canceled']).optional().default('scheduled'),
  colorTag: z.enum(['blue', 'cyan', 'emerald', 'amber', 'slate']).optional().default('blue'),
  isSandbox: z.boolean().optional().default(false),
});

const updateScheduleSchema = z.object({
  eventType: z.enum(['entrega', 'reuniao', 'follow_up', 'outro']).optional(),
  title: z.string().trim().min(2, 'Título do evento deve ter ao menos 2 caracteres').max(200).optional(),
  description: z.string().max(2000).optional().nullable(),
  startAt: z.string().min(1).optional(),
  endAt: z.string().min(1).optional(),
  allDay: z.boolean().optional(),
  location: z.string().max(300).optional().nullable(),
  meetingUrl: z.string().max(500).optional().nullable(),
  customerId: z.string().uuid().optional().nullable(),
  orderId: z.string().uuid().optional().nullable(),
  assignedTo: z.string().uuid().optional().nullable(),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'canceled']).optional(),
  colorTag: z.enum(['blue', 'cyan', 'emerald', 'amber', 'slate']).optional(),
});

export async function portalScheduleRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/schedule
  fastify.get(
    '/',
    { preHandler: [requirePortalAuth, requirePermission('agenda:read')] },
    async (request, reply) => {
      const ctx = request.portal!;
      const q = request.query as {
        start?: string;
        end?: string;
        eventType?: string;
        status?: string;
        search?: string;
        sandbox?: string;
      };
      const isSandbox = q.sandbox === 'true';

      const conditions = [`se.unit_id = $1`, `se.is_sandbox = $2`];
      const params: unknown[] = [ctx.activeUnitId, isSandbox];
      let idx = 3;

      if (q.start?.trim()) {
        const startDate = new Date(q.start.trim());
        if (Number.isNaN(startDate.getTime())) {
          return reply.status(400).send({
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Parâmetro start inválido.',
          });
        }
        conditions.push(`se.end_at >= $${idx}::timestamptz`);
        params.push(startDate.toISOString());
        idx++;
      }

      if (q.end?.trim()) {
        const endDate = new Date(q.end.trim());
        if (Number.isNaN(endDate.getTime())) {
          return reply.status(400).send({
            statusCode: 400,
            code: 'VALIDATION_ERROR',
            message: 'Parâmetro end inválido.',
          });
        }
        conditions.push(`se.start_at <= $${idx}::timestamptz`);
        params.push(endDate.toISOString());
        idx++;
      }

      if (q.eventType && q.eventType !== 'todos') {
        conditions.push(`se.event_type = $${idx}`);
        params.push(q.eventType);
        idx++;
      }

      if (q.status && q.status !== 'todos') {
        conditions.push(`se.status = $${idx}`);
        params.push(q.status);
        idx++;
      }

      if (q.search?.trim()) {
        conditions.push(
          `(LOWER(se.title) LIKE $${idx} OR LOWER(COALESCE(se.description, '')) LIKE $${idx} OR LOWER(COALESCE(se.location, '')) LIKE $${idx} OR LOWER(COALESCE(c.name, '')) LIKE $${idx} OR LOWER(COALESCE(o.order_number, '')) LIKE $${idx})`
        );
        params.push(`%${q.search.trim().toLowerCase()}%`);
        idx++;
      }

      const rows = await dbQuery(
        `SELECT se.*,
                c.name AS customer_name,
                o.order_number,
                p.full_name AS assigned_name
         FROM portal.schedule_events se
         LEFT JOIN portal.customers c ON c.id = se.customer_id
         LEFT JOIN portal.orders o ON o.id = se.order_id
         LEFT JOIN portal.profiles p ON p.id = se.assigned_to
         WHERE ${conditions.join(' AND ')}
         ORDER BY se.start_at ASC, se.created_at ASC`,
        params
      );

      return reply.send({ items: rows.rows });
    }
  );

  // POST /api/v1/schedule
  fastify.post(
    '/',
    { preHandler: [requirePortalAuth, requirePermission('agenda:write')] },
    async (request, reply) => {
      const parsed = createScheduleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Dados do evento inválidos.',
          details: parsed.error.flatten(),
        });
      }

      const ctx = request.portal!;
      const d = parsed.data;
      const startDate = new Date(d.startAt);
      const endDate = new Date(d.endAt);

      if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'INVALID_DATE_RANGE',
          message: 'A data/hora de término deve ser válida e igual ou posterior ao início.',
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

      const event = await withTransaction(async (client) => {
        const insRes = await client.query<{ id: string }>(
          `INSERT INTO portal.schedule_events (
             unit_id, event_type, title, description, start_at, end_at, all_day,
             location, meeting_url, customer_id, order_id, assigned_to, created_by,
             status, color_tag, is_sandbox
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           RETURNING id`,
          [
            ctx.activeUnitId,
            d.eventType,
            d.title,
            d.description?.trim() || null,
            startDate.toISOString(),
            endDate.toISOString(),
            d.allDay,
            d.location?.trim() || null,
            d.meetingUrl?.trim() || null,
            d.customerId ?? null,
            d.orderId ?? null,
            d.assignedTo ?? ctx.userId,
            ctx.userId,
            d.status,
            d.colorTag,
            d.isSandbox,
          ]
        );

        const joinedRes = await client.query(
          `SELECT se.*,
                  c.name AS customer_name,
                  o.order_number,
                  p.full_name AS assigned_name
           FROM portal.schedule_events se
           LEFT JOIN portal.customers c ON c.id = se.customer_id
           LEFT JOIN portal.orders o ON o.id = se.order_id
           LEFT JOIN portal.profiles p ON p.id = se.assigned_to
           WHERE se.id = $1`,
          [insRes.rows[0].id]
        );
        const createdEvent = joinedRes.rows[0];

        await recordAuditLog(
          {
            unitId: ctx.activeUnitId,
            action: 'schedule_event.created',
            entityType: 'schedule_event',
            entityId: createdEvent.id,
            afterState: createdEvent,
            request,
          },
          client
        );

        return createdEvent;
      });

      return reply.status(201).send({ event });
    }
  );

  // PATCH /api/v1/schedule/:id
  fastify.patch(
    '/:id',
    { preHandler: [requirePortalAuth, requirePermission('agenda:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID de evento inválido.' });
      }

      const existingRes = await dbQuery<{
        id: string;
        unit_id: string;
        start_at: string;
        end_at: string;
      }>(`SELECT * FROM portal.schedule_events WHERE id = $1`, [id]);

      const existing = existingRes.rows[0];
      if (!existing) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Evento não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, existing.unit_id)) return;

      const parsed = updateScheduleSchema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          message: 'Dados de atualização inválidos.',
          details: parsed.error.flatten(),
        });
      }

      const d = parsed.data;
      const effectiveStart = d.startAt !== undefined ? new Date(d.startAt) : new Date(existing.start_at);
      const effectiveEnd = d.endAt !== undefined ? new Date(d.endAt) : new Date(existing.end_at);

      if (Number.isNaN(effectiveStart.getTime()) || Number.isNaN(effectiveEnd.getTime()) || effectiveEnd < effectiveStart) {
        return reply.status(400).send({
          statusCode: 400,
          code: 'INVALID_DATE_RANGE',
          message: 'A data/hora de término deve ser válida e igual ou posterior ao início.',
        });
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
        const memRes = await dbQuery<{ user_id: string }>(
          `SELECT user_id FROM portal.unit_memberships
           WHERE unit_id = $1 AND user_id = $2 AND status = 'active'`,
          [existing.unit_id, d.assignedTo]
        );
        if (!memRes.rows[0]) {
          return reply.status(400).send({
            statusCode: 400,
            code: 'INVALID_ASSIGNEE',
            message: 'Responsável informado não pertence como membro ativo desta unidade.',
          });
        }
      }

      const event = await withTransaction(async (client) => {
        await client.query(
          `UPDATE portal.schedule_events SET
             event_type = COALESCE($1, event_type),
             title = COALESCE($2, title),
             description = CASE WHEN $3 THEN $4 ELSE description END,
             start_at = CASE WHEN $5 THEN $6::timestamptz ELSE start_at END,
             end_at = CASE WHEN $7 THEN $8::timestamptz ELSE end_at END,
             all_day = COALESCE($9, all_day),
             location = CASE WHEN $10 THEN $11 ELSE location END,
             meeting_url = CASE WHEN $12 THEN $13 ELSE meeting_url END,
             customer_id = CASE WHEN $14 THEN $15 ELSE customer_id END,
             order_id = CASE WHEN $16 THEN $17 ELSE order_id END,
             assigned_to = CASE WHEN $18 THEN $19 ELSE assigned_to END,
             status = COALESCE($20, status),
             color_tag = COALESCE($21, color_tag),
             updated_at = NOW()
           WHERE id = $22`,
          [
            d.eventType ?? null,
            d.title ?? null,
            d.description !== undefined,
            d.description !== undefined ? d.description?.trim() || null : null,
            d.startAt !== undefined,
            d.startAt !== undefined ? effectiveStart.toISOString() : null,
            d.endAt !== undefined,
            d.endAt !== undefined ? effectiveEnd.toISOString() : null,
            d.allDay ?? null,
            d.location !== undefined,
            d.location !== undefined ? d.location?.trim() || null : null,
            d.meetingUrl !== undefined,
            d.meetingUrl !== undefined ? d.meetingUrl?.trim() || null : null,
            d.customerId !== undefined,
            d.customerId ?? null,
            d.orderId !== undefined,
            d.orderId ?? null,
            d.assignedTo !== undefined,
            d.assignedTo ?? null,
            d.status ?? null,
            d.colorTag ?? null,
            id,
          ]
        );

        const joinedRes = await client.query(
          `SELECT se.*,
                  c.name AS customer_name,
                  o.order_number,
                  p.full_name AS assigned_name
           FROM portal.schedule_events se
           LEFT JOIN portal.customers c ON c.id = se.customer_id
           LEFT JOIN portal.orders o ON o.id = se.order_id
           LEFT JOIN portal.profiles p ON p.id = se.assigned_to
           WHERE se.id = $1`,
          [id]
        );
        const updatedEvent = joinedRes.rows[0];

        await recordAuditLog(
          {
            unitId: existing.unit_id,
            action: 'schedule_event.updated',
            entityType: 'schedule_event',
            entityId: id,
            beforeState: existing,
            afterState: updatedEvent,
            request,
          },
          client
        );

        return updatedEvent;
      });

      return reply.send({ event });
    }
  );

  // DELETE /api/v1/schedule/:id
  fastify.delete(
    '/:id',
    { preHandler: [requirePortalAuth, requirePermission('agenda:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      if (!uuidSchema.safeParse(id).success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID de evento inválido.' });
      }

      const existingRes = await dbQuery<{ id: string; unit_id: string }>(
        `SELECT * FROM portal.schedule_events WHERE id = $1`,
        [id]
      );
      const existing = existingRes.rows[0];
      if (!existing) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Evento não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, existing.unit_id)) return;

      await withTransaction(async (client) => {
        await client.query(`DELETE FROM portal.schedule_events WHERE id = $1`, [id]);
        await recordAuditLog(
          {
            unitId: existing.unit_id,
            action: 'schedule_event.deleted',
            entityType: 'schedule_event',
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
