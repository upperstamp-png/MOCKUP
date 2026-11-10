import Fastify, { FastifyInstance } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import { env, getExternalIntegrationsStatus } from './config/env.js';
import { checkDbHealth, dbPool } from './plugins/db.js';
import { checkRedisHealth, closeRedis } from './plugins/redis.js';

// Rotas originais do Studio 3D (preservadas onde aplicável)
import { exportsRoutes } from './modules/exports/exports.routes.js';

// Rotas do Portal do Franqueado King Sports (PostgreSQL + Supabase Auth/Storage + RBAC)
import { portalAuthRoutes } from './modules/portal/auth.routes.js';
import { portalDashboardRoutes } from './modules/portal/dashboard.routes.js';
import { portalCrmRoutes } from './modules/portal/crm.routes.js';
import { portalCatalogRoutes } from './modules/portal/catalog.routes.js';
import { portalQuotesRoutes } from './modules/portal/quotes.routes.js';
import { portalArtsRoutes } from './modules/portal/arts.routes.js';
import { portalOrdersRoutes } from './modules/portal/orders.routes.js';
import { portalFinanceRoutes } from './modules/portal/finance.routes.js';
import { portalSupportRoutes } from './modules/portal/support.routes.js';
import { portalDocumentsRoutes } from './modules/portal/documents.routes.js';
import { portalTrainingRoutes } from './modules/portal/training.routes.js';
import { portalSandboxRoutes } from './modules/portal/sandbox.routes.js';
import { portalNotificationsRoutes } from './modules/portal/notifications.routes.js';
import { portalNetworkAdminRoutes } from './modules/portal/networkAdmin.routes.js';
import { portalScheduleRoutes } from './modules/portal/schedule.routes.js';

export function buildServer(): FastifyInstance {
  const app = Fastify({
    bodyLimit: 30 * 1024 * 1024, // Suporta uploads DataURL base64 (ex: comprovantes, pranchas Studio)
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
        'req.headers.cookie',
        'req.headers["x-admin-key"]',
        'body.serialKey',
        'body.password',
        'body.signature',
      ],
    },
    disableRequestLogging: false,
    trustProxy: true,
  });

  app.register(helmet, {
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  });

  app.register(cors, {
    origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',').map((s) => s.trim()),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  });

  app.register(cookie, {
    secret: env.COOKIE_SECRET,
  });

  app.register(multipart, {
    limits: { fileSize: 50 * 1024 * 1024 },
  });

  app.register(jwt, {
    secret: env.JWT_SECRET,
    sign: { expiresIn: env.JWT_EXPIRES_IN },
  });

  app.register(rateLimit, {
    max: 180,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Muitas requisições. Aguarde alguns instantes antes de tentar novamente.',
    }),
  });

  // Healthcheck operacional com verificação real de Postgres, Redis e integrações externas
  app.get('/health', async (_request, reply) => {
    const [dbOk, redisStatus] = await Promise.all([checkDbHealth(), checkRedisHealth()]);
    const status = dbOk ? 'ok' : 'degraded';
    return reply.status(dbOk ? 200 : 503).send({
      status,
      service: 'king-sports-portal-api',
      version: '2.1.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      dependencies: {
        postgresql: dbOk ? 'connected' : 'unavailable',
        redis: redisStatus,
      },
      integrations: getExternalIntegrationsStatus(),
    });
  });

  // Alias sob /api/v1/health para passar pelo proxy Next.js / Nginx
  app.get('/api/v1/health', async (_request, reply) => {
    const [dbOk, redisStatus] = await Promise.all([checkDbHealth(), checkRedisHealth()]);
    return reply.status(dbOk ? 200 : 503).send({
      status: dbOk ? 'ok' : 'degraded',
      dependencies: {
        postgresql: dbOk ? 'connected' : 'unavailable',
        redis: redisStatus,
      },
      integrations: getExternalIntegrationsStatus(),
    });
  });

  // Módulos oficiais do Portal do Franqueado
  app.register(portalAuthRoutes, { prefix: '/api/v1/auth' });
  app.register(portalDashboardRoutes, { prefix: '/api/v1/dashboard' });
  app.register(portalCrmRoutes, { prefix: '/api/v1/crm' });
  app.register(portalCatalogRoutes, { prefix: '/api/v1/catalog' });
  app.register(portalQuotesRoutes, { prefix: '/api/v1/quotes' });
  app.register(portalArtsRoutes, { prefix: '/api/v1/arts' });
  app.register(portalOrdersRoutes, { prefix: '/api/v1/orders' });
  app.register(portalFinanceRoutes, { prefix: '/api/v1/finance' });
  app.register(portalSupportRoutes, { prefix: '/api/v1/support' });
  app.register(portalDocumentsRoutes, { prefix: '/api/v1/documents' });
  app.register(portalTrainingRoutes, { prefix: '/api/v1/training' });
  app.register(portalSandboxRoutes, { prefix: '/api/v1/sandbox' });
  app.register(portalNotificationsRoutes, { prefix: '/api/v1/notifications' });
  app.register(portalNetworkAdminRoutes, { prefix: '/api/v1/network-admin' });
  app.register(portalScheduleRoutes, { prefix: '/api/v1/schedule' });

  // Rota de renderização/exportação server-side do Studio 3D preservada
  app.register(exportsRoutes, { prefix: '/api/v1/exports' });

  app.setErrorHandler((error, request, reply) => {
    request.log.error(
      { err: error, url: request.raw.url, method: request.raw.method },
      'Erro não tratado na API'
    );
    const statusCode = error.statusCode || 500;
    reply.status(statusCode).send({
      statusCode,
      error: error.name || 'Internal Server Error',
      message: error.message || 'Ocorreu um erro interno no servidor',
      timestamp: new Date().toISOString(),
    });
  });

  app.addHook('onClose', async () => {
    await closeRedis();
    await dbPool.end();
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const server = buildServer();

  server.listen({ port: env.PORT, host: env.HOST }, (err, address) => {
    if (err) {
      server.log.error(err);
      process.exit(1);
    }
    server.log.info(`King Sports Portal API rodando em ${address}`);
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
