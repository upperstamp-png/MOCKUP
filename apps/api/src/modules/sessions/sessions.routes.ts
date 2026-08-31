import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { authenticateSeller } from '../../middleware/auth.js';
import { heartbeatSchema, terminateSessionSchema } from '@mockup/validation';
import { sessionsService } from './sessions.service.js';
import { supabaseAdmin } from '../../plugins/supabase.js';

export async function sessionsRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
): Promise<void> {
  /**
   * POST /api/v1/session/heartbeat
   * Atualiza a presença da sessão e valida limite de usuários simultâneos
   */
  fastify.post(
    '/heartbeat',
    {
      preHandler: [authenticateSeller],
    },
    async (request, reply) => {
      const parse = heartbeatSchema.safeParse(request.body);
      if (!parse.success) return reply.status(400).send(parse.error.flatten());

      const session = request.userSession!;
      const clientIp = request.ip || request.headers['x-forwarded-for']?.toString();

      const result = await sessionsService.processHeartbeat(
        parse.data.sessionToken,
        session.tenantId,
        session.licenseId,
        clientIp
      );

      return reply.status(200).send(result);
    }
  );

  /**
   * POST /api/v1/session/terminate
   * Encerra uma sessão específica do tenant
   */
  fastify.post(
    '/terminate',
    {
      preHandler: [authenticateSeller],
    },
    async (request, reply) => {
      const parse = terminateSessionSchema.safeParse(request.body);
      if (!parse.success) return reply.status(400).send(parse.error.flatten());

      const session = request.userSession!;
      const success = await sessionsService.terminateSession(parse.data.sessionId, session.tenantId);

      return reply.status(200).send({
        success,
        terminatedSessionId: parse.data.sessionId,
      });
    }
  );

  /**
   * GET /api/v1/session/active
   * Lista todas as sessões ativas do tenant
   */
  fastify.get(
    '/active',
    {
      preHandler: [authenticateSeller],
    },
    async (request, reply) => {
      const session = request.userSession!;
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      const { data: sessions, error } = await supabaseAdmin
        .from('active_sessions')
        .select('id, user_id, device_label, ip_address, last_seen_at, created_at, seller:profiles(full_name, email)')
        .eq('tenant_id', session.tenantId)
        .gte('last_seen_at', fiveMinutesAgo)
        .order('last_seen_at', { ascending: false });

      if (error) return reply.status(500).send({ error: error.message });
      return reply.send({ activeSessions: sessions });
    }
  );
}
