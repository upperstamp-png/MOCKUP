'use strict';

const helmet = require('helmet');
const { env } = require('../config/env');

function extractOrigin(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function uniqueValues(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function isHubOrPortalRequest(req) {
  if (req.domainKind === 'hub') {
    return true;
  }
  if (req.domainKind === 'crm' || req.domainKind === 'lp') {
    return false;
  }
  const rawUrl = req.originalUrl || req.url || '/';
  const pathname = rawUrl.split('?')[0];
  return (
    pathname === '/hub' ||
    pathname.startsWith('/hub/') ||
    pathname === '/api/v1' ||
    pathname.startsWith('/api/v1/') ||
    pathname === '/king-sports' ||
    pathname.startsWith('/king-sports/') ||
    pathname === '/textures' ||
    pathname.startsWith('/textures/') ||
    pathname === '/api/textures' ||
    pathname.startsWith('/api/textures/') ||
    pathname === '/_next' ||
    pathname.startsWith('/_next/') ||
    pathname === '/studio' ||
    pathname.startsWith('/studio/') ||
    pathname === '/universidade' ||
    pathname.startsWith('/universidade/')
  );
}

function isHttpsContext(req, appEnv) {
  const forwardedProto = String(req.headers?.['x-forwarded-proto'] || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  if (req.secure || forwardedProto === 'https') {
    return true;
  }
  const rawHost = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  const hostname = rawHost.startsWith('[')
    ? rawHost.slice(0, rawHost.indexOf(']') + 1)
    : rawHost.split(':')[0].trim();
  const isLocalHost =
    !hostname ||
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]' ||
    hostname.endsWith('.localhost');
  if (isLocalHost) {
    return false;
  }
  const configuredHttps = [appEnv.APP_URL, appEnv.LP_URL, appEnv.CRM_URL, appEnv.HUB_URL].some((u) =>
    String(u || '').startsWith('https://')
  );
  return Boolean(configuredHttps && appEnv.NODE_ENV === 'production');
}

function buildHelmetInstance(appEnv, useHttps) {
  const supabaseOrigin = extractOrigin(appEnv.SUPABASE_URL);
  const supabaseWsOrigin = supabaseOrigin
    ? supabaseOrigin.replace(/^https:/, 'wss:').replace(/^http:/, 'ws:')
    : null;
  const domainOrigins = uniqueValues([
    extractOrigin(appEnv.APP_URL),
    extractOrigin(appEnv.LP_URL),
    extractOrigin(appEnv.CRM_URL),
    extractOrigin(appEnv.HUB_URL)
  ]);

  return helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: uniqueValues([
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net',
          'https://www.googletagmanager.com',
          'https://www.google-analytics.com',
          'https://connect.facebook.net',
          'https://*.supabase.co',
          supabaseOrigin
        ]),
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: uniqueValues([
          "'self'",
          'data:',
          'blob:',
          'https://www.facebook.com',
          'https://www.google-analytics.com',
          'https://www.googletagmanager.com',
          'https://*.supabase.co',
          supabaseOrigin,
          ...domainOrigins
        ]),
        connectSrc: uniqueValues([
          "'self'",
          'https://www.google-analytics.com',
          'https://analytics.google.com',
          'https://www.googletagmanager.com',
          'https://connect.facebook.net',
          'https://www.facebook.com',
          'https://cdn.jsdelivr.net',
          'https://*.supabase.co',
          'wss://*.supabase.co',
          supabaseOrigin,
          supabaseWsOrigin,
          ...domainOrigins
        ]),
        frameSrc: ["'self'", 'https://www.googletagmanager.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        // Ativa upgrade-insecure-requests apenas quando a requisição/domínio é HTTPS (VPS Nginx+Certbot),
        // permitindo testar NODE_ENV=production em http://localhost sem quebrar assets locais.
        upgradeInsecureRequests: useHttps ? [] : null
      }
    },
    hsts: useHttps ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    crossOriginEmbedderPolicy: false
  });
}

function createSecurityHeadersMiddleware(appEnv = env) {
  const safeEnv = appEnv || env;
  const httpHelmet = buildHelmetInstance(safeEnv, false);
  const httpsHelmet = buildHelmetInstance(safeEnv, true);

  return (req, res, next) => {
    if (isHubOrPortalRequest(req)) {
      return next();
    }
    const middleware = isHttpsContext(req, safeEnv) ? httpsHelmet : httpHelmet;
    return middleware(req, res, next);
  };
}

module.exports = { createSecurityHeadersMiddleware };
