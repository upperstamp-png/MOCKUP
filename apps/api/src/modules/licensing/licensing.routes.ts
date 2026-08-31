import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { licenseValidateSchema, revokeDeviceSchema } from '@mockup/validation';
import { licensingService } from './licensing.service.js';
import { authenticateSeller } from '../../middleware/auth.js';

export async function licensingRoutes(
  fastify: FastifyInstance,
  _options: FastifyPluginOptions
): Promise<void> {
  /**
   * POST /api/v1/license/validate
   * Endpoint de login/ativação de licença de vendedor e dispositivo
   */
  fastify.post(
    '/validate',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (request, reply) => {
      const parseResult = licenseValidateSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          code: 'VALIDATION_ERROR',
          message: 'Dados de validação de licença inválidos',
          details: parseResult.error.flatten(),
          timestamp: new Date().toISOString(),
        });
      }

      const clientIp = request.ip || request.headers['x-forwarded-for']?.toString();

      try {
        const response = await licensingService.validateLicense(
          parseResult.data,
          clientIp,
          (payload) => fastify.jwt.sign(payload)
        );

        return reply.status(200).send(response);
      } catch (err: unknown) {
        const errorObj = err as { statusCode?: number; code?: string; message?: string };
        const status = errorObj.statusCode || 500;
        return reply.status(status).send({
          statusCode: status,
          error: status === 404 ? 'Not Found' : status === 409 ? 'Conflict' : status === 403 ? 'Forbidden' : 'Internal Server Error',
          code: errorObj.code || 'INTERNAL_ERROR',
          message: errorObj.message || 'Erro ao processar licença',
          timestamp: new Date().toISOString(),
        });
      }
    }
  );

  /**
   * POST /api/v1/license/revoke-device
   * Revoga um dispositivo ativo da licença
   */
  fastify.post(
    '/revoke-device',
    {
      preHandler: [authenticateSeller],
    },
    async (request, reply) => {
      const parseResult = revokeDeviceSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          statusCode: 400,
          error: 'Bad Request',
          code: 'VALIDATION_ERROR',
          message: 'ID do dispositivo inválido',
          details: parseResult.error.flatten(),
          timestamp: new Date().toISOString(),
        });
      }

      const session = request.userSession!;
      const clientIp = request.ip || request.headers['x-forwarded-for']?.toString();

      try {
        const result = await licensingService.revokeDevice(
          parseResult.data.deviceId,
          session.tenantId,
          session.sub,
          clientIp
        );

        return reply.status(200).send(result);
      } catch (err: unknown) {
        const errorObj = err as { statusCode?: number; code?: string; message?: string };
        const status = errorObj.statusCode || 500;
        return reply.status(status).send({
          statusCode: status,
          error: status === 404 ? 'Not Found' : 'Internal Server Error',
          code: errorObj.code || 'REVOKE_ERROR',
          message: errorObj.message || 'Erro ao revogar dispositivo',
          timestamp: new Date().toISOString(),
        });
      }
    }
  );

  /**
   * GET /api/v1/license/status
   * Consulta o status atual da licença do vendedor autenticado
   */
  fastify.get(
    '/status',
    {
      preHandler: [authenticateSeller],
    },
    async (request, reply) => {
      const session = request.userSession!;

      try {
        const status = await licensingService.getLicenseStatus(
          session.tenantId,
          session.licenseId,
          session.deviceId || session.sub
        );

        return reply.status(200).send(status);
      } catch (err: unknown) {
        const errorObj = err as { statusCode?: number; code?: string; message?: string };
        const status = errorObj.statusCode || 500;
        return reply.status(status).send({
          statusCode: status,
          error: status === 404 ? 'Not Found' : 'Internal Server Error',
          code: errorObj.code || 'STATUS_ERROR',
          message: errorObj.message || 'Erro ao consultar status da licença',
          timestamp: new Date().toISOString(),
        });
      }
    }
  );
}
