import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { authenticateSeller } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../plugins/supabase.js';

export async function tenantsRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
): Promise<void> {
  /**
   * GET /api/v1/tenants/me
   * Retorna os detalhes da empresa/tenant autenticado
   */
  fastify.get(
    '/me',
    {
      preHandler: [authenticateSeller],
    },
    async (request, reply) => {
      const session = request.userSession!;

      const { data: tenant, error } = await supabaseAdmin
        .from('tenants')
        .select('id, name, cnpj, status, created_at')
        .eq('id', session.tenantId)
        .single();

      if (error || !tenant) {
        return reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          code: 'TENANT_NOT_FOUND',
          message: 'Tenant não localizado',
          timestamp: new Date().toISOString(),
        });
      }

      return reply.status(200).send(tenant);
    }
  );
}
