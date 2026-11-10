'use strict';

const http = require('node:http');
const https = require('node:https');
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

const { env } = require('./config/env');
const logger = require('./utils/logger');
const { getRedisClient, closeRedis } = require('./jobs/redis');
const { enqueueJob, closeQueues } = require('./jobs/queues');

const { createLeadsRepo } = require('./database/repositories/leadsRepo');
const { createCrmRepo } = require('./database/repositories/crmRepo');
const { createTrackingRepo } = require('./database/repositories/trackingRepo');
const { createCampaignsRepo } = require('./database/repositories/campaignsRepo');
const { createAutomationsRepo } = require('./database/repositories/automationsRepo');
const { createBlogRepo } = require('./database/repositories/blogRepo');
const { createSettingsRepo } = require('./database/repositories/settingsRepo');

const { createLeadIngestionService } = require('./services/leadIngestionService');
const { createCrmService } = require('./services/crmService');
const { createAnalyticsService } = require('./services/analyticsService');
const { createBlogService } = require('./services/blogService');
const { createSeoHtmlService } = require('./services/seoHtmlService');
const { createSettingsService } = require('./services/settingsService');
const { createIntegrationTestService } = require('./services/integrationTestService');
const { createAutomationService } = require('./services/automationService');

const { createSecurityHeadersMiddleware } = require('./middleware/securityHeaders');
const { createRateLimiters } = require('./middleware/rateLimiter');
const { createAuthMiddleware } = require('./middleware/authMiddleware');
const { errorHandler } = require('./middleware/errorHandler');

const { createPublicRoutes } = require('./routes/publicRoutes');
const { createBlogPublicRoutes } = require('./routes/blogPublicRoutes');
const { createAdminAuthRoutes } = require('./routes/adminAuthRoutes');
const { createAdminCrmRoutes } = require('./routes/adminCrmRoutes');
const { createAdminMarketingRoutes } = require('./routes/adminMarketingRoutes');

const DEFAULT_PORTAL_API_URL = 'http://127.0.0.1:4000';
const DEFAULT_HUB_WEB_URL = 'http://127.0.0.1:3333';
const UPSTREAM_TIMEOUT_MS = 30000;

function normalizeHostToken(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw.startsWith('[')) {
    const endIdx = raw.indexOf(']');
    return endIdx !== -1 ? raw.slice(0, endIdx + 1) : raw;
  }
  return raw.split(':')[0].trim();
}

function extractRequestHostname(req) {
  const raw = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '')
    .split(',')[0]
    .trim();
  return normalizeHostToken(raw);
}

function parseHostAliases(rawAliases) {
  return String(rawAliases || '')
    .split(',')
    .map((item) => normalizeHostToken(item))
    .filter(Boolean);
}

function resolveRequestDomainKind(req, appEnv = env) {
  const hostname = extractRequestHostname(req);
  if (!hostname) {
    return 'unified';
  }

  const crmHost = normalizeHostToken(appEnv?.CRM_HOST);
  if (
    (crmHost && hostname === crmHost) ||
    hostname === 'crm.kingsports.com.br' ||
    hostname === 'crm.localhost' ||
    hostname.startsWith('crm.')
  ) {
    return 'crm';
  }

  const hubHost = normalizeHostToken(appEnv?.HUB_HOST);
  if (
    (hubHost && hostname === hubHost) ||
    hostname === 'app.kingsports.com.br' ||
    hostname === 'app.localhost' ||
    hostname === 'hub.localhost' ||
    hostname.startsWith('app.') ||
    hostname.startsWith('hub.')
  ) {
    return 'hub';
  }

  const lpHost = normalizeHostToken(appEnv?.LP_HOST);
  const lpAliases = parseHostAliases(appEnv?.LP_HOST_ALIASES);
  if (
    (lpHost && hostname === lpHost) ||
    lpAliases.includes(hostname) ||
    hostname === 'lp.kinsports.com.br' ||
    hostname === 'lp.kingsports.com.br' ||
    hostname === 'lp.localhost' ||
    hostname.startsWith('lp.')
  ) {
    return 'lp';
  }

  return 'unified';
}

function stripHubPrefix(pathname) {
  if (pathname === '/hub') return '/';
  if (pathname.startsWith('/hub/')) {
    const stripped = pathname.slice(4);
    return stripped || '/';
  }
  return pathname;
}

function isUnifiedUnprefixedHubPath(pathname) {
  return (
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/studio' ||
    pathname.startsWith('/studio/') ||
    pathname === '/universidade' ||
    pathname.startsWith('/universidade/') ||
    pathname === '/quotes' ||
    pathname.startsWith('/quotes/') ||
    pathname === '/crm' ||
    pathname.startsWith('/crm/') ||
    pathname === '/history' ||
    pathname.startsWith('/history/') ||
    pathname === '/settings' ||
    pathname.startsWith('/settings/') ||
    pathname === '/_next' ||
    pathname.startsWith('/_next/') ||
    pathname === '/king-sports' ||
    pathname.startsWith('/king-sports/') ||
    pathname === '/textures' ||
    pathname.startsWith('/textures/') ||
    pathname === '/api/textures' ||
    pathname.startsWith('/api/textures/') ||
    /^\/assets\/(?:MOCKUP_MULTIPLAY|[a-z0-9_-]+_mask)\.png$/i.test(pathname) ||
    pathname === '/videos' ||
    pathname.startsWith('/videos/')
  );
}

function resolveUpstreamTarget(reqOrUrl, { portalApiUrl, hubWebUrl, appEnv = env }) {
  const isStringInput = typeof reqOrUrl === 'string';
  const safeUrl = (isStringInput ? reqOrUrl : reqOrUrl?.originalUrl || reqOrUrl?.url) || '/';
  const domainKind = isStringInput
    ? 'unified'
    : reqOrUrl?.domainKind || resolveRequestDomainKind(reqOrUrl, appEnv);
  const method = isStringInput ? 'GET' : String(reqOrUrl?.method || 'GET').toUpperCase();

  const qIndex = safeUrl.indexOf('?');
  const pathname = qIndex === -1 ? safeUrl : safeUrl.slice(0, qIndex);
  const query = qIndex === -1 ? '' : safeUrl.slice(qIndex);

  if (domainKind === 'crm' || domainKind === 'lp') {
    return null;
  }

  if (domainKind === 'hub') {
    if (pathname === '/api/health' && (method === 'GET' || method === 'HEAD')) {
      return null;
    }

    if (pathname === '/api/v1' || pathname.startsWith('/api/v1/')) {
      return {
        upstreamBase: portalApiUrl,
        targetPath: safeUrl,
        name: 'portal-api',
        domainKind
      };
    }

    return {
      upstreamBase: hubWebUrl,
      targetPath: `${stripHubPrefix(pathname)}${query}`,
      name: 'hub-web',
      domainKind
    };
  }

  if (pathname === '/api/v1' || pathname.startsWith('/api/v1/')) {
    return {
      upstreamBase: portalApiUrl,
      targetPath: safeUrl,
      name: 'portal-api',
      domainKind
    };
  }

  if (pathname === '/hub' || pathname.startsWith('/hub/')) {
    return {
      upstreamBase: hubWebUrl,
      targetPath: `${stripHubPrefix(pathname)}${query}`,
      name: 'hub-web',
      domainKind
    };
  }

  // Fallback de compatibilidade para rotas Next sem prefixo e assets do HUB/Studio 3D no modo unificado
  if (isUnifiedUnprefixedHubPath(pathname)) {
    return {
      upstreamBase: hubWebUrl,
      targetPath: safeUrl,
      name: 'hub-web',
      domainKind
    };
  }

  return null;
}

function buildProxyHeaders(req, upstreamUrl, isHttps, isUpgrade) {
  const headers = { ...req.headers };
  const incomingHost = req.headers.host || '';
  headers['x-forwarded-host'] = req.headers['x-forwarded-host'] || incomingHost;
  headers['x-forwarded-proto'] = req.headers['x-forwarded-proto'] || req.protocol || 'http';

  const remoteIp = req.ip || req.socket?.remoteAddress || '';
  if (remoteIp) {
    headers['x-forwarded-for'] = req.headers['x-forwarded-for']
      ? `${req.headers['x-forwarded-for']}, ${remoteIp}`
      : remoteIp;
  }

  const isLocalUpstream =
    upstreamUrl.hostname === '127.0.0.1' || upstreamUrl.hostname === 'localhost';
  if (isHttps || !isLocalUpstream || !incomingHost) {
    headers.host = upstreamUrl.host;
  }

  if (!isUpgrade) {
    delete headers.connection;
    delete headers['keep-alive'];
    delete headers['proxy-connection'];
  }

  return headers;
}

function createUpstreamProxyMiddleware({ portalApiUrl, hubWebUrl, appEnv = env }) {
  return function upstreamProxyMiddleware(req, res, next) {
    const target = resolveUpstreamTarget(req, {
      portalApiUrl,
      hubWebUrl,
      appEnv
    });
    if (!target) {
      return next();
    }

    let upstreamUrl;
    try {
      upstreamUrl = new URL(target.upstreamBase);
    } catch {
      return res.status(502).json({
        error: {
          code: 'UPSTREAM_UNAVAILABLE',
          message: `Configuração inválida para o serviço ${target.name}.`
        }
      });
    }

    const isHttps = upstreamUrl.protocol === 'https:';
    const transport = isHttps ? https : http;
    const basePath =
      upstreamUrl.pathname && upstreamUrl.pathname !== '/'
        ? upstreamUrl.pathname.replace(/\/+$/, '')
        : '';
    const suffix = target.targetPath.startsWith('/') ? target.targetPath : `/${target.targetPath}`;
    const fullPath = `${basePath}${suffix}`;
    const headers = buildProxyHeaders(req, upstreamUrl, isHttps, Boolean(req.headers.upgrade));

    let settled = false;
    function sendUpstreamError(err) {
      if (settled) return;
      settled = true;
      req.unpipe(proxyReq);
      logger.warn('Reverse proxy upstream unavailable', {
        upstream: target.name,
        path: fullPath,
        error: err ? err.message : 'unknown'
      });
      if (!res.headersSent) {
        res.status(502).json({
          error: {
            code: 'UPSTREAM_UNAVAILABLE',
            message: `Serviço ${target.name} indisponível no momento.`
          }
        });
      } else if (!res.writableEnded) {
        res.end();
      }
    }

    const proxyReq = transport.request(
      {
        protocol: upstreamUrl.protocol,
        hostname: upstreamUrl.hostname,
        port: upstreamUrl.port || (isHttps ? 443 : 80),
        method: req.method,
        path: fullPath,
        headers,
        timeout: UPSTREAM_TIMEOUT_MS
      },
      (proxyRes) => {
        if (settled) {
          proxyRes.resume();
          return;
        }
        settled = true;

        const outHeaders = { ...proxyRes.headers };
        if (Array.isArray(proxyRes.headers['set-cookie'])) {
          outHeaders['set-cookie'] = proxyRes.headers['set-cookie'];
        }
        if (target.domainKind === 'hub') {
          outHeaders['x-robots-tag'] = 'noindex, nofollow, noarchive';
        }
        delete outHeaders['transfer-encoding'];
        delete outHeaders.connection;
        delete outHeaders['keep-alive'];

        res.writeHead(proxyRes.statusCode || 502, proxyRes.statusMessage, outHeaders);
        proxyRes.pipe(res);
        proxyRes.on('error', () => {
          if (!res.writableEnded) res.end();
        });
      }
    );

    proxyReq.on('timeout', () => {
      proxyReq.destroy(new Error('UPSTREAM_TIMEOUT'));
    });

    proxyReq.on('error', sendUpstreamError);

    res.on('close', () => {
      if (!res.writableEnded && !proxyReq.destroyed) {
        proxyReq.destroy();
      }
    });

    req.on('error', () => {
      if (!proxyReq.destroyed) {
        proxyReq.destroy();
      }
    });

    req.pipe(proxyReq);
  };
}

function attachWebSocketProxy(server, { portalApiUrl, hubWebUrl, appEnv = env }) {
  server.on('upgrade', (req, socket, head) => {
    const target = resolveUpstreamTarget(req, { portalApiUrl, hubWebUrl, appEnv });
    if (!target) {
      socket.destroy();
      return;
    }

    let upstreamUrl;
    try {
      upstreamUrl = new URL(target.upstreamBase);
    } catch {
      socket.destroy();
      return;
    }

    const isHttps = upstreamUrl.protocol === 'https:';
    const transport = isHttps ? https : http;
    const basePath =
      upstreamUrl.pathname && upstreamUrl.pathname !== '/'
        ? upstreamUrl.pathname.replace(/\/+$/, '')
        : '';
    const suffix = target.targetPath.startsWith('/') ? target.targetPath : `/${target.targetPath}`;
    const fullPath = `${basePath}${suffix}`;
    const headers = buildProxyHeaders(req, upstreamUrl, isHttps, true);

    const proxyReq = transport.request({
      protocol: upstreamUrl.protocol,
      hostname: upstreamUrl.hostname,
      port: upstreamUrl.port || (isHttps ? 443 : 80),
      method: req.method,
      path: fullPath,
      headers
    });

    proxyReq.on('upgrade', (proxyRes, proxySocket, proxyHead) => {
      const lines = [
        `HTTP/${proxyRes.httpVersion || '1.1'} ${proxyRes.statusCode || 101} ${
          proxyRes.statusMessage || 'Switching Protocols'
        }`
      ];
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (v === undefined) continue;
        if (Array.isArray(v)) {
          for (const item of v) lines.push(`${k}: ${item}`);
        } else {
          lines.push(`${k}: ${v}`);
        }
      }
      socket.write(`${lines.join('\r\n')}\r\n\r\n`);
      if (proxyHead && proxyHead.length > 0) socket.write(proxyHead);
      if (head && head.length > 0) proxySocket.write(head);

      proxySocket.pipe(socket);
      socket.pipe(proxySocket);

      proxySocket.on('error', () => {
        if (!socket.destroyed) socket.destroy();
      });
      socket.on('error', () => {
        if (!proxySocket.destroyed) proxySocket.destroy();
      });
      proxySocket.on('close', () => {
        if (!socket.destroyed) socket.destroy();
      });
      socket.on('close', () => {
        if (!proxySocket.destroyed) proxySocket.destroy();
      });
    });

    proxyReq.on('response', (proxyRes) => {
      // Upstream rejeitou o upgrade com uma resposta HTTP normal
      const lines = [
        `HTTP/${proxyRes.httpVersion || '1.1'} ${proxyRes.statusCode || 502} ${
          proxyRes.statusMessage || 'Bad Gateway'
        }`
      ];
      for (const [k, v] of Object.entries(proxyRes.headers)) {
        if (v === undefined) continue;
        if (Array.isArray(v)) {
          for (const item of v) lines.push(`${k}: ${item}`);
        } else {
          lines.push(`${k}: ${v}`);
        }
      }
      socket.write(`${lines.join('\r\n')}\r\n\r\n`);
      proxyRes.pipe(socket);
    });

    proxyReq.on('error', () => {
      if (!socket.destroyed) socket.destroy();
    });

    proxyReq.end();
  });
}

function sendNotFound(req, res) {
  if (req.path === '/api' || req.path.startsWith('/api/')) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint não encontrado.' } });
  }
  return res.status(404).type('text/plain').send('Not Found');
}

function createApp(overrides = {}) {
  const app = express();
  const appEnv = overrides.env || env;
  const portalApiUrl =
    appEnv.PORTAL_API_INTERNAL_URL || process.env.PORTAL_API_INTERNAL_URL || DEFAULT_PORTAL_API_URL;
  const hubWebUrl =
    appEnv.HUB_WEB_INTERNAL_URL || process.env.HUB_WEB_INTERNAL_URL || DEFAULT_HUB_WEB_URL;

  app.set('trust proxy', appEnv.TRUST_PROXY);
  app.disable('x-powered-by');

  // Classificação host-aware (lp / crm / hub / unified) + noindex obrigatório em CRM e HUB
  app.use((req, res, next) => {
    const domainKind = resolveRequestDomainKind(req, appEnv);
    req.domainKind = domainKind;
    if (domainKind === 'crm' || domainKind === 'hub') {
      res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    }
    next();
  });

  // Reverse proxy de streaming montado ANTES de Helmet e dos body parsers para preservar streams e cookies
  app.use(createUpstreamProxyMiddleware({ portalApiUrl, hubWebUrl, appEnv }));

  app.use(createSecurityHeadersMiddleware(appEnv));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(cookieParser());

  app.use('/api', (_req, res, next) => {
    res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    next();
  });

  // Isolamento explícito de rotas por subdomínio antes dos roteadores Express
  app.use((req, res, next) => {
    const kind = req.domainKind || 'unified';
    const p = req.path || '/';

    if (kind === 'crm') {
      const isAllowedPublicConfig =
        p === '/api/public/config' && (req.method === 'GET' || req.method === 'HEAD');
      if (
        p === '/hub' ||
        p.startsWith('/hub/') ||
        p === '/api/v1' ||
        p.startsWith('/api/v1/') ||
        p === '/studio' ||
        p.startsWith('/studio/') ||
        p === '/universidade' ||
        p.startsWith('/universidade/') ||
        ((p === '/api/public' || p.startsWith('/api/public/')) && !isAllowedPublicConfig)
      ) {
        return sendNotFound(req, res);
      }
    } else if (kind === 'lp') {
      if (p === '/portal' || p === '/portal/') {
        const rawHost = String(req.headers['x-forwarded-host'] || req.headers.host || '')
          .split(',')[0]
          .trim();
        const hostname = extractRequestHostname(req);
        let hubTarget = '';
        if (hostname && hostname.endsWith('.localhost')) {
          const proto =
            String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
              .split(',')[0]
              .trim() || 'http';
          const port = rawHost.includes(':') ? rawHost.slice(rawHost.indexOf(':')) : '';
          hubTarget = `${proto}://app.localhost${port}`;
        } else {
          hubTarget =
            String(appEnv.HUB_URL || '').trim() ||
            `https://${String(appEnv.HUB_HOST || 'app.kingsports.com.br').trim()}`;
        }
        return res.redirect(302, hubTarget);
      }
      if (
        p === '/admin' ||
        p.startsWith('/admin/') ||
        p === '/api/admin' ||
        p.startsWith('/api/admin/') ||
        p === '/api/v1' ||
        p.startsWith('/api/v1/') ||
        p === '/api/textures' ||
        p.startsWith('/api/textures/') ||
        p === '/studio' ||
        p.startsWith('/studio/') ||
        p === '/universidade' ||
        p.startsWith('/universidade/') ||
        p === '/hub' ||
        p.startsWith('/hub/')
      ) {
        return sendNotFound(req, res);
      }
    } else if (kind === 'hub') {
      if (p !== '/api/health') {
        return sendNotFound(req, res);
      }
    }

    return next();
  });

  // Repos (injetáveis para testes automatizados)
  const leadsRepo = overrides.leadsRepo || createLeadsRepo();
  const crmRepo = overrides.crmRepo || createCrmRepo();
  const trackingRepo = overrides.trackingRepo || createTrackingRepo();
  const campaignsRepo = overrides.campaignsRepo || createCampaignsRepo();
  const automationsRepo = overrides.automationsRepo || createAutomationsRepo();
  const blogRepo = overrides.blogRepo || createBlogRepo();
  const settingsRepo = overrides.settingsRepo || createSettingsRepo();
  const enqueue = overrides.enqueueJob || enqueueJob;

  // Services
  const settingsService =
    overrides.settingsService ||
    createSettingsService({
      settingsRepo,
      isStorageConfigured: overrides.isStorageConfigured
    });
  const blogService =
    overrides.blogService ||
    createBlogService({
      blogRepo,
      settingsRepo,
      isStorageConfigured: overrides.isStorageConfigured
    });
  const leadIngestionService =
    overrides.leadIngestionService ||
    createLeadIngestionService({
      leadsRepo,
      crmRepo,
      trackingRepo,
      campaignsRepo,
      blogRepo,
      automationsRepo,
      enqueueJob: enqueue
    });
  const crmService =
    overrides.crmService ||
    createCrmService({
      leadsRepo,
      crmRepo,
      trackingRepo,
      settingsRepo,
      automationsRepo,
      enqueueJob: enqueue
    });
  const analyticsService =
    overrides.analyticsService || createAnalyticsService({ campaignsRepo, settingsRepo });
  const integrationTestService =
    overrides.integrationTestService || createIntegrationTestService({ settingsService });
  const automationService =
    overrides.automationService ||
    createAutomationService({
      leadsRepo,
      crmRepo,
      trackingRepo,
      automationsRepo,
      settingsService,
      redisClient: 'redisClient' in overrides ? overrides.redisClient : getRedisClient()
    });

  // Security & Auth
  const limiters = overrides.limiters || createRateLimiters();
  const authMiddleware = createAuthMiddleware({
    settingsRepo,
    env: appEnv,
    authVerifier: overrides.authVerifier || null
  });

  // Rotas de API Públicas & Privadas
  app.use(
    '/api',
    createPublicRoutes({
      leadIngestionService,
      settingsService,
      trackingRepo,
      blogService,
      limiters,
      isStorageConfigured: overrides.isStorageConfigured,
      checkDbHealth: overrides.checkDatabaseHealth,
      checkCacheHealth: overrides.checkRedisHealth
    })
  );

  app.use(
    '/api/admin',
    limiters.adminApiLimiter,
    createAdminAuthRoutes({
      settingsRepo,
      authMiddleware,
      env: appEnv,
      limiters,
      signInFn: overrides.signInFn || null
    })
  );

  app.use(
    '/api/admin',
    createAdminCrmRoutes({
      leadsRepo,
      crmRepo,
      settingsRepo,
      crmService,
      analyticsService,
      authMiddleware
    })
  );

  app.use(
    '/api/admin',
    createAdminMarketingRoutes({
      campaignsRepo,
      trackingRepo,
      automationsRepo,
      blogRepo,
      settingsRepo,
      blogService,
      settingsService,
      integrationTestService,
      automationService,
      analyticsService,
      enqueueJob: enqueue,
      authMiddleware
    })
  );

  // Diretórios estáticos e Blog SSR + SEO + GEO (llms.txt, robots.txt, sitemap.xml)
  const publicDir = path.resolve(process.cwd(), 'public');
  const adminDir = path.resolve(process.cwd(), 'admin');
  const adminAssetsDir = path.join(adminDir, 'assets');
  const publicAssetsDir = path.join(publicDir, 'assets');
  const seoHtmlService = overrides.seoHtmlService || createSeoHtmlService({ publicDir, env: appEnv });

  const blogPublicRouter = createBlogPublicRoutes({ blogService, seoHtmlService, env: appEnv });
  const adminStatic = express.static(adminDir, { index: 'login.html', maxAge: '5m' });
  const adminStaticNoIndex = express.static(adminDir, { index: false, maxAge: '5m' });
  const adminAssetsStatic = express.static(adminAssetsDir, { maxAge: '5m' });
  const publicAssetsStatic = express.static(publicAssetsDir, { maxAge: '1h' });
  const publicStatic = express.static(publicDir, { index: 'index.html', maxAge: '1h' });

  // Subdomínio CRM Expansão (crm.kingsports.com.br)
  app.use((req, res, next) => {
    if (req.domainKind !== 'crm') return next();
    if ((req.method === 'GET' || req.method === 'HEAD') && req.path === '/') {
      return res.sendFile(path.join(adminDir, 'login.html'));
    }
    if ((req.method === 'GET' || req.method === 'HEAD') && req.path === '/favicon.ico') {
      return res.sendFile(path.join(publicDir, 'favicon.ico'));
    }
    return next();
  });
  app.use('/admin/assets', (req, res, next) => {
    if (req.domainKind !== 'crm') return next();
    return adminAssetsStatic(req, res, next);
  });
  app.use('/assets', (req, res, next) => {
    if (req.domainKind !== 'crm') return next();
    return adminAssetsStatic(req, res, (err) => {
      if (err) return next(err);
      return publicAssetsStatic(req, res, next);
    });
  });
  app.use('/', (req, res, next) => {
    if (req.domainKind !== 'crm') return next();
    return adminStaticNoIndex(req, res, next);
  });

  // Landing + Blog SSR + SEO + GEO (lp.* e modo unificado localhost/dev/test)
  app.use('/', (req, res, next) => {
    if (req.domainKind !== 'lp' && req.domainKind !== 'unified') return next();
    return blogPublicRouter(req, res, next);
  });

  // CRM Expansão em /admin/* no modo unificado (localhost/dev/test)
  app.use('/admin', (req, res, next) => {
    if (req.domainKind !== 'unified') return next();
    res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    return adminStatic(req, res, next);
  });
  app.use('/assets', (req, res, next) => {
    if (req.domainKind !== 'unified') return next();
    return adminAssetsStatic(req, res, next);
  });

  app.use('/', (req, res, next) => {
    if (req.domainKind !== 'lp' && req.domainKind !== 'unified') return next();
    return publicStatic(req, res, next);
  });

  // Fallback 404 para APIs e demais rotas
  app.use('/api/*', (_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint não encontrado.' } });
  });

  app.use((req, res) => sendNotFound(req, res));

  app.use(errorHandler);

  return app;
}

if (require.main === module) {
  process.env.SERVICE_NAME = 'king-api';
  const app = createApp();
  const portalApiUrl =
    env.PORTAL_API_INTERNAL_URL || process.env.PORTAL_API_INTERNAL_URL || DEFAULT_PORTAL_API_URL;
  const hubWebUrl =
    env.HUB_WEB_INTERNAL_URL || process.env.HUB_WEB_INTERNAL_URL || DEFAULT_HUB_WEB_URL;
  const server = app.listen(env.PORT, () => {
    logger.info('King Sports HTTP server started', {
      port: env.PORT,
      node_env: env.NODE_ENV,
      app_url: env.APP_URL,
      lp_host: env.LP_HOST,
      crm_host: env.CRM_HOST,
      hub_host: env.HUB_HOST,
      portal_api_upstream: portalApiUrl,
      hub_web_upstream: hubWebUrl
    });
  });

  attachWebSocketProxy(server, { portalApiUrl, hubWebUrl, appEnv: env });

  async function shutdown(signal) {
    logger.info('Shutting down HTTP server', { signal });
    server.close(async () => {
      await closeQueues();
      await closeRedis();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 8000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

module.exports = {
  createApp,
  resolveRequestDomainKind,
  resolveUpstreamTarget,
  attachWebSocketProxy
};
