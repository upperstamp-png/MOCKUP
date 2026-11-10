import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbQuery, withTransaction } from '../../plugins/db.js';
import {
  assertUnitOwnership,
  requirePermission,
  requirePortalAuth,
} from '../../middleware/portalAuth.js';
import { notifyUnitRoles, recordAuditLog } from '../../services/auditAndNotify.js';
import {
  createAuthorizedSignedUrl,
  parseDataUrlToBuffer,
  uploadPrivatePortalFile,
} from '../../services/storageService.js';

export async function portalSupportRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/support/tickets
  fastify.get(
    '/tickets',
    { preHandler: [requirePortalAuth, requirePermission('tickets:read')] },
    async (request, reply) => {
      const ctx = request.portal!;
      const q = request.query as { status?: string; category?: string; sandbox?: string; scope?: string };
      const isSandbox = q.sandbox === 'true';
      const allUnits =
        (ctx.activeScope === 'network' || ctx.activeScope === 'factory') && q.scope === 'all';

      const conditions = allUnits ? [`st.is_sandbox = $1`] : [`st.unit_id = $1`, `st.is_sandbox = $2`];
      const params: unknown[] = allUnits ? [isSandbox] : [ctx.activeUnitId, isSandbox];
      let idx = params.length + 1;

      if (q.status && q.status !== 'todos') {
        conditions.push(`st.status = $${idx}`);
        params.push(q.status);
        idx++;
      }
      if (q.category && q.category !== 'todos') {
        conditions.push(`st.category = $${idx}`);
        params.push(q.category);
        idx++;
      }

      const rows = await dbQuery(
        `SELECT st.*,
                u.code AS unit_code,
                u.name AS unit_name,
                o.order_number,
                c.name AS customer_name,
                p.full_name AS assignee_name
         FROM portal.support_tickets st
         JOIN portal.units u ON u.id = st.unit_id
         LEFT JOIN portal.orders o ON o.id = st.order_id
         LEFT JOIN portal.customers c ON c.id = st.customer_id
         LEFT JOIN portal.profiles p ON p.id = st.assignee_user_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY st.updated_at DESC`,
        params
      );

      return reply.send({ items: rows.rows });
    }
  );

  // GET /api/v1/support/tickets/:id (filtra notas internas se o usuário não tiver tickets:internal_notes!)
  fastify.get(
    '/tickets/:id',
    { preHandler: [requirePortalAuth, requirePermission('tickets:read')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const ctx = request.portal!;
      const tRes = await dbQuery(
        `SELECT st.*, u.code AS unit_code, u.name AS unit_name, o.order_number, c.name AS customer_name
         FROM portal.support_tickets st
         JOIN portal.units u ON u.id = st.unit_id
         LEFT JOIN portal.orders o ON o.id = st.order_id
         LEFT JOIN portal.customers c ON c.id = st.customer_id
         WHERE st.id = $1`,
        [id]
      );
      const ticket = tRes.rows[0];
      if (!ticket) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Chamado não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, ticket.unit_id)) return;

      const canSeeInternal = ctx.permissions.includes('tickets:internal_notes');
      const messagesRes = await dbQuery(
        `SELECT * FROM portal.support_messages
         WHERE ticket_id = $1 ${canSeeInternal ? '' : 'AND is_internal = FALSE'}
         ORDER BY created_at ASC`,
        [id]
      );

      return reply.send({ ticket, messages: messagesRes.rows });
    }
  );

  // POST /api/v1/support/tickets
  fastify.post(
    '/tickets',
    { preHandler: [requirePortalAuth, requirePermission('tickets:write')] },
    async (request, reply) => {
      const schema = z.object({
        orderId: z.string().uuid().optional().nullable(),
        customerId: z.string().uuid().optional().nullable(),
        category: z.enum(['Produto', 'Arte', 'Produção', 'Entrega', 'Financeiro', 'Sistema', 'Documentação']),
        priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
        subject: z.string().min(4),
        description: z.string().min(6),
        isSandbox: z.boolean().optional().default(false),
        attachment: z
          .object({ fileName: z.string(), dataUrl: z.string() })
          .optional()
          .nullable(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const ctx = request.portal!;
      const d = parsed.data;

      let attachmentMeta: Array<{ fileName: string; storagePath: string; mimeType: string }> = [];
      if (d.attachment?.dataUrl) {
        const decoded = parseDataUrlToBuffer(d.attachment.dataUrl);
        if (!decoded) {
          return reply.status(400).send({ statusCode: 400, code: 'INVALID_ATTACHMENT', message: 'Anexo inválido.' });
        }
        const stored = await uploadPrivatePortalFile({
          bucket: 'portal-ticket-attachments',
          unitId: ctx.activeUnitId,
          folder: 'tickets',
          fileName: d.attachment.fileName,
          mimeType: decoded.mimeType,
          buffer: decoded.buffer,
        });
        attachmentMeta = [{ fileName: stored.fileName, storagePath: stored.storagePath, mimeType: stored.mimeType }];
      }

      const ticket = await withTransaction(async (client) => {
        const cntRes = await client.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM portal.support_tickets WHERE unit_id = $1`,
          [ctx.activeUnitId]
        );
        const ticketNumber = `${d.isSandbox ? 'SBX-SAC' : 'SAC'}-${String(Number(cntRes.rows[0]?.cnt || 0) + 101)}`;
        const slaHours = d.priority === 'urgent' ? 4 : d.priority === 'high' ? 12 : 48;

        const tRes = await client.query<{ id: string }>(
          `INSERT INTO portal.support_tickets (
             ticket_number, unit_id, order_id, customer_id, category, priority, status,
             subject, description, sla_due_at, is_sandbox, created_by
           ) VALUES ($1,$2,$3,$4,$5,$6,'open',$7,$8,NOW() + ($9 || ' hours')::interval,$10,$11)
           RETURNING *`,
          [
            ticketNumber,
            ctx.activeUnitId,
            d.orderId || null,
            d.customerId || null,
            d.category,
            d.priority,
            d.subject.trim(),
            d.description.trim(),
            slaHours,
            d.isSandbox,
            ctx.userId,
          ]
        );
        const created = tRes.rows[0];

        await client.query(
          `INSERT INTO portal.support_messages (
             ticket_id, unit_id, sender_user_id, sender_name, sender_role, is_internal, body, attachments
           ) VALUES ($1,$2,$3,$4,$5,FALSE,$6,$7)`,
          [
            created.id,
            ctx.activeUnitId,
            ctx.userId,
            ctx.fullName,
            ctx.activeRoleName,
            d.description.trim(),
            JSON.stringify(attachmentMeta),
          ]
        );

        await recordAuditLog(
          {
            unitId: ctx.activeUnitId,
            action: 'ticket.created',
            entityType: 'support_ticket',
            entityId: created.id,
            afterState: { ticketNumber, category: d.category, priority: d.priority },
            request,
          },
          client
        );

        return created;
      });

      return reply.status(201).send({ ticket });
    }
  );

  // POST /api/v1/support/tickets/:id/messages
  fastify.post(
    '/tickets/:id/messages',
    { preHandler: [requirePortalAuth, requirePermission('tickets:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const schema = z.object({
        body: z.string().min(2),
        isInternal: z.boolean().optional().default(false),
        attachment: z.object({ fileName: z.string(), dataUrl: z.string() }).optional().nullable(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }

      const tRes = await dbQuery<{ unit_id: string; ticket_number: string }>(
        `SELECT unit_id, ticket_number FROM portal.support_tickets WHERE id = $1`,
        [id]
      );
      if (!tRes.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Chamado não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, tRes.rows[0].unit_id)) return;

      const ctx = request.portal!;
      const d = parsed.data;
      if (d.isInternal && !ctx.permissions.includes('tickets:internal_notes')) {
        return reply.status(403).send({
          statusCode: 403,
          code: 'INTERNAL_NOTES_FORBIDDEN',
          message: 'Apenas suporte da franqueadora, fábrica ou administrador podem registrar notas internas.',
        });
      }

      let attachmentMeta: Array<{ fileName: string; storagePath: string; mimeType: string }> = [];
      if (d.attachment?.dataUrl) {
        const decoded = parseDataUrlToBuffer(d.attachment.dataUrl);
        if (!decoded) {
          return reply.status(400).send({ statusCode: 400, code: 'INVALID_ATTACHMENT', message: 'Anexo inválido.' });
        }
        const stored = await uploadPrivatePortalFile({
          bucket: 'portal-ticket-attachments',
          unitId: tRes.rows[0].unit_id,
          folder: `tickets/${id}`,
          fileName: d.attachment.fileName,
          mimeType: decoded.mimeType,
          buffer: decoded.buffer,
        });
        attachmentMeta = [{ fileName: stored.fileName, storagePath: stored.storagePath, mimeType: stored.mimeType }];
      }

      const msgRes = await dbQuery(
        `INSERT INTO portal.support_messages (
           ticket_id, unit_id, sender_user_id, sender_name, sender_role, is_internal, body, attachments
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
        [
          id,
          tRes.rows[0].unit_id,
          ctx.userId,
          ctx.fullName,
          ctx.activeRoleName,
          d.isInternal,
          d.body.trim(),
          JSON.stringify(attachmentMeta),
        ]
      );

      if (!d.isInternal) {
        await dbQuery(`UPDATE portal.support_tickets SET updated_at = NOW() WHERE id = $1`, [id]);
        if (ctx.activeScope !== 'unit') {
          await notifyUnitRoles(tRes.rows[0].unit_id, ['franqueado'], {
            eventType: 'ticket_replied',
            title: `Nova resposta no chamado ${tRes.rows[0].ticket_number}`,
            body: d.body.trim().slice(0, 140),
            actionUrl: '/?tab=support',
            entityType: 'support_ticket',
            entityId: id,
          });
        }
      }

      return reply.status(201).send({ message: msgRes.rows[0] });
    }
  );

  // PATCH /api/v1/support/tickets/:id (status, retrabalho/custo, resumo resolução)
  fastify.patch(
    '/tickets/:id',
    { preHandler: [requirePortalAuth, requirePermission('tickets:write')] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const existing = await dbQuery<{ unit_id: string }>(`SELECT unit_id FROM portal.support_tickets WHERE id = $1`, [id]);
      if (!existing.rows[0]) {
        return reply.status(404).send({ statusCode: 404, code: 'NOT_FOUND', message: 'Chamado não encontrado.' });
      }
      if (!assertUnitOwnership(request, reply, existing.rows[0].unit_id)) return;

      const schema = z.object({
        status: z.enum(['open', 'in_progress', 'waiting_unit', 'resolved', 'closed']).optional(),
        resolutionSummary: z.string().optional().nullable(),
        reworkCostCents: z.number().int().nonnegative().optional(),
      });
      const parsed = schema.safeParse(request.body);
      if (!parsed.success) {
        return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
      }
      const d = parsed.data;
      const updated = await dbQuery(
        `UPDATE portal.support_tickets SET
           status = COALESCE($1, status),
           resolution_summary = COALESCE($2, resolution_summary),
           rework_cost_cents = COALESCE($3, rework_cost_cents),
           resolved_at = CASE WHEN $1 IN ('resolved', 'closed') THEN NOW() ELSE resolved_at END,
           updated_at = NOW()
         WHERE id = $4 RETURNING *`,
        [d.status ?? null, d.resolutionSummary ?? null, d.reworkCostCents ?? null, id]
      );
      return reply.send({ ticket: updated.rows[0] });
    }
  );

  // GET /api/v1/support/attachments/download?path=...&unitId=...
  fastify.get(
    '/attachments/download',
    { preHandler: [requirePortalAuth, requirePermission('tickets:read')] },
    async (request, reply) => {
      const q = request.query as { path?: string };
      if (!q.path) {
        return reply.status(400).send({ statusCode: 400, code: 'PATH_REQUIRED', message: 'Informe o caminho do anexo.' });
      }
      const pathUnitId = q.path.split('/')[0];
      if (!assertUnitOwnership(request, reply, pathUnitId)) return;

      const signedUrl = await createAuthorizedSignedUrl({
        bucket: 'portal-ticket-attachments',
        storagePath: q.path,
        authorizedUnitId: pathUnitId,
        allowNetworkScope: request.portal!.activeScope !== 'unit',
      });
      return reply.send({ signedUrl });
    }
  );
}
