import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { authenticateSeller } from '../../middleware/auth.js';
import { supabaseAdmin } from '../../plugins/supabase.js';

export async function devicesRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
): Promise<void> {
  /**
   * GET /api/v1/devices
   * Lista todos os dispositivos registrados na licença do tenant
   */
  fastify.get(
    '/',
    {
      preHandler: [authenticateSeller],
    },
    async (request, reply) => {
      const session = request.userSession!;

      const { data: devices, error } = await supabaseAdmin
        .from('devices')
        .select('id, device_name, user_agent, ip_address, is_active, last_login, created_at')
        .eq('license_id', session.licenseId)
        .order('last_login', { ascending: false });

      if (error) {
        return reply.status(500).send({
          statusCode: 500,
          error: 'Internal Server Error',
          code: 'FETCH_DEVICES_ERROR',
          message: 'Erro ao buscar dispositivos da licença',
          timestamp: new Date().toISOString(),
        });
      }

      return reply.status(200).send({
        devices: devices.map((d) => ({
          ...d,
          isCurrent: d.id === session.deviceId,
        })),
      });
    }
  );
}
