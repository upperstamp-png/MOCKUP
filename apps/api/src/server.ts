import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { licensingRoutes } from './modules/licensing/licensing.routes.js';
import { tenantsRoutes } from './modules/tenants/tenants.routes.js';
import { devicesRoutes } from './modules/devices/devices.routes.js';
import { exportsRoutes } from './modules/exports/exports.routes.js';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { sessionsRoutes } from './modules/sessions/sessions.routes.js';
import { sellersRoutes } from './modules/sellers/sellers.routes.js';
import { billingRoutes } from './modules/billing/billing.routes.js';

export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: env.NODE_ENV === 'production' ? 'info' : 'debug',
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: {
                translateTime: 'HH:MM:ss Z',
                ignore: 'pid,hostname',
              },
            }
          : undefined,
      redact: [
        'req.headers.authorization',
        'req.headers["x-admin-key"]',
        'body.serialKey',
        'body.password',
        'body.signature',
      ],
    },
    disableRequestLogging: false,
    trustProxy: true,
  });

  // 1. Security Headers (Helmet)
  app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  // 2. CORS
  app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(','),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  // 3. JWT Plugin
  app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: {
      expiresIn: env.JWT_EXPIRES_IN,
    },
  });

  // 4. Rate Limiting Global
  app.register(rateLimit, {
    max: 120,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Muitas requisições. Aguarde um momento antes de tentar novamente.',
    }),
  });

  // 5. Healthcheck & Metrics
  app.get('/health', async () => ({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    service: 'texcraft-quickmockup-api',
    version: '2.0.0',
  }));

  // 6. Registro de Módulos da API v1
  app.register(licensingRoutes, { prefix: '/api/v1/license' });
  app.register(tenantsRoutes, { prefix: '/api/v1/tenants' });
  app.register(devicesRoutes, { prefix: '/api/v1/devices' });
  app.register(exportsRoutes, { prefix: '/api/v1/exports' });
  app.register(adminRoutes, { prefix: '/api/v1/admin' });
  app.register(sessionsRoutes, { prefix: '/api/v1/session' });
  app.register(sellersRoutes, { prefix: '/api/v1/sellers' });
  app.register(billingRoutes, { prefix: '/api/v1/billing' });

  // 7. Error Handler Global com Observabilidade
  app.setErrorHandler((error, request, reply) => {
    request.log.error({
      err: error,
      url: request.raw.url,
      method: request.raw.method,
    }, 'Erro não tratado na API');

    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      statusCode,
      error: error.name || 'Internal Server Error',
      message: error.message || 'Ocorreu um erro interno no servidor',
      timestamp: new Date().toISOString(),
    });
  });

  return app;
}

// Inicialização do Servidor
if (process.env.NODE_ENV !== 'test') {
  const server = buildServer();

  server.listen({ port: env.PORT, host: env.HOST }, (err, address) => {
    if (err) {
      server.log.error(err);
      process.exit(1);
    }
    server.log.info(`🚀 TexCraft QuickMockup API 2.0 rodando em ${address}`);
  });

  const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];
  for (const signal of signals) {
    process.on(signal, async () => {
      server.log.info(`Recebido ${signal}, encerrando servidor com segurança...`);
      await server.close();
      process.exit(0);
    });
  }
}
