'use strict';

const helmet = require('helmet');
const { env } = require('../config/env');

function isHubOrPortalRequest(req) {
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
    pathname.startsWith('/api/textures/')
  );
}

function createSecurityHeadersMiddleware(appEnv = env) {
  const isHttpsApp = String(appEnv.APP_URL || '').startsWith('https://');

  const strictHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://cdn.jsdelivr.net',
          'https://www.googletagmanager.com',
          'https://www.google-analytics.com',
          'https://connect.facebook.net'
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: [
          "'self'",
          'data:',
          'blob:',
          'https://www.facebook.com',
          'https://www.google-analytics.com',
          'https://www.googletagmanager.com',
          'https://*.supabase.co'
        ],
        connectSrc: [
          "'self'",
          'https://www.google-analytics.com',
          'https://analytics.google.com',
          'https://www.googletagmanager.com',
          'https://connect.facebook.net',
          'https://www.facebook.com'
        ],
        frameSrc: ["'self'", 'https://www.googletagmanager.com'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        // Ativa upgrade-insecure-requests apenas quando APP_URL é HTTPS (VPS Nginx+Certbot),
        // permitindo testar NODE_ENV=production em http://localhost sem quebrar assets locais.
        upgradeInsecureRequests: isHttpsApp ? [] : null
      }
    },
    hsts: isHttpsApp ? { maxAge: 31536000, includeSubDomains: true, preload: true } : false,
    crossOriginEmbedderPolicy: false
  });

  return (req, res, next) => {
    if (isHubOrPortalRequest(req)) {
      return next();
    }
    return strictHelmet(req, res, next);
  };
}

module.exports = { createSecurityHeadersMiddleware };
