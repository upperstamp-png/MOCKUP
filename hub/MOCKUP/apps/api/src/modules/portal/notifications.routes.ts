import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { dbQuery } from '../../plugins/db.js';
import { requirePortalAuth } from '../../middleware/portalAuth.js';
import { getExternalIntegrationsStatus } from '../../config/env.js';

export async function portalNotificationsRoutes(fastify: FastifyInstance): Promise<void> {
  // GET /api/v1/notifications
  fastify.get('/', { preHandler: [requirePortalAuth] }, async (request, reply) => {
    const ctx = request.portal!;
    const [itemsRes, prefsRes, integrationsRes] = await Promise.all([
      dbQuery(
        `SELECT * FROM portal.notifications
         WHERE user_id = $1 AND unit_id = $2
         ORDER BY is_read ASC, created_at DESC
         LIMIT 60`,
        [ctx.userId, ctx.activeUnitId]
      ),
      dbQuery(
        `SELECT * FROM portal.notification_preferences WHERE user_id = $1 AND unit_id = $2`,
        [ctx.userId, ctx.activeUnitId]
      ),
      dbQuery(
        `SELECT * FROM portal.integration_attempts
         WHERE unit_id = $1 OR unit_id IS NULL
         ORDER BY created_at DESC
         LIMIT 25`,
        [ctx.activeUnitId]
      ),
    ]);

    return reply.send({
      items: itemsRes.rows,
      preferences: prefsRes.rows[0] || {
        in_app_enabled: true,
        email_enabled: false,
        muted_event_types: [],
      },
      integrationsStatus: getExternalIntegrationsStatus(),
      integrationAttempts: integrationsRes.rows,
    });
  });

  // POST /api/v1/notifications/:id/read
  fastify.post('/:id/read', { preHandler: [requirePortalAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    if (!z.string().uuid().safeParse(id).success) {
      return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', message: 'ID de notificação inválido.' });
    }
    const ctx = request.portal!;
    await dbQuery(
      `UPDATE portal.notifications
       SET is_read = TRUE, read_at = NOW()
       WHERE id = $1 AND user_id = $2 AND unit_id = $3`,
      [id, ctx.userId, ctx.activeUnitId]
    );
    return reply.send({ success: true });
  });

  // POST /api/v1/notifications/read-all
  fastify.post('/read-all', { preHandler: [requirePortalAuth] }, async (request, reply) => {
    const ctx = request.portal!;
    await dbQuery(
      `UPDATE portal.notifications
       SET is_read = TRUE, read_at = NOW()
       WHERE user_id = $1 AND unit_id = $2 AND is_read = FALSE`,
      [ctx.userId, ctx.activeUnitId]
    );
    return reply.send({ success: true });
  });

  // PUT /api/v1/notifications/preferences
  fastify.put('/preferences', { preHandler: [requirePortalAuth] }, async (request, reply) => {
    const schema = z.object({
      inAppEnabled: z.boolean().default(true),
      emailEnabled: z.boolean().default(false),
      mutedEventTypes: z.array(z.string()).default([]),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ statusCode: 400, code: 'VALIDATION_ERROR', details: parsed.error.flatten() });
    }
    const ctx = request.portal!;
    const d = parsed.data;
    const up = await dbQuery(
      `INSERT INTO portal.notification_preferences (user_id, unit_id, in_app_enabled, email_enabled, muted_event_types)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (user_id, unit_id)
       DO UPDATE SET in_app_enabled = EXCLUDED.in_app_enabled, email_enabled = EXCLUDED.email_enabled, muted_event_types = EXCLUDED.muted_event_types, updated_at = NOW()
       RETURNING *`,
      [ctx.userId, ctx.activeUnitId, d.inAppEnabled, d.emailEnabled, JSON.stringify(d.mutedEventTypes)]
    );
    return reply.send({ preferences: up.rows[0] });
  });
}
