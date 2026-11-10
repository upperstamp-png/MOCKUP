'use strict';

const fs = require('fs');
const path = require('path');
const { resolveBaseUrl } = require('./geoService');

const CANONICAL_PLACEHOLDER_ORIGIN = 'https://franquia.kingsportsoficial.com.br';
const CANONICAL_HTTP_PLACEHOLDER_ORIGIN = 'http://franquia.kingsportsoficial.com.br';

function trimTrailingSlash(url) {
  return String(url || '').trim().replace(/\/+$/, '');
}

function escapeHtmlAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function extractRequestOrigin(req) {
  if (!req) return null;
  const forwardedHost =
    req.headers && req.headers['x-forwarded-host']
      ? String(req.headers['x-forwarded-host']).split(',')[0].trim()
      : '';
  const directHost = req.get && req.get('host') ? String(req.get('host')).trim() : '';
  const host = forwardedHost || directHost;
  if (!host || !/^[a-zA-Z0-9.:-]+$/.test(host)) {
    return null;
  }
  const proto =
    req.headers && req.headers['x-forwarded-proto']
      ? String(req.headers['x-forwarded-proto']).split(',')[0].trim()
      : req.protocol || 'http';
  return {
    host,
    proto,
    origin: `${proto}://${host}`.replace(/\/+$/, '')
  };
}

function resolveSeoBaseUrl(req, env = {}) {
  const configuredFallback = trimTrailingSlash(
    env.LP_URL || env.APP_URL || process.env.LP_URL || process.env.APP_URL || 'http://localhost:3000'
  );

  const reqOrigin = extractRequestOrigin(req);
  if (reqOrigin) {
    const isLoopback = /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(reqOrigin.host);
    if (isLoopback && env.NODE_ENV === 'production' && (env.LP_URL || process.env.LP_URL)) {
      return configuredFallback;
    }
    return reqOrigin.origin;
  }

  if (env.LP_URL || process.env.LP_URL) {
    return configuredFallback;
  }

  return trimTrailingSlash(resolveBaseUrl(req, env) || configuredFallback);
}

function getHostnameSafe(rawUrl) {
  try {
    return new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return '';
  }
}

function resolveCrossServiceLinks(req, env = {}, lpBaseUrl = '') {
  const reqOrigin = extractRequestOrigin(req);
  const lpHost = getHostnameSafe(lpBaseUrl);
  const host = reqOrigin ? reqOrigin.host : lpHost;
  const proto = reqOrigin ? reqOrigin.proto : lpBaseUrl.startsWith('https://') ? 'https' : 'http';
  const isLoopbackReq = Boolean(reqOrigin && /^(127\.0\.0\.1|localhost)(:\d+)?$/i.test(reqOrigin.host));
  const isLoopbackResolved = /^(127\.0\.0\.1|localhost)$/i.test(lpHost);
  const isLocalFallback = isLoopbackReq && isLoopbackResolved;
  const effectiveHost = isLoopbackReq && !isLoopbackResolved ? lpHost : host;
  const effectiveProto = isLoopbackReq && !isLoopbackResolved
    ? (lpBaseUrl.startsWith('https://') ? 'https' : 'http')
    : proto;
  const effectiveHostname = effectiveHost.split(':')[0].toLowerCase();
  const isLpSubdomain = /^lp\./i.test(effectiveHost);
  const isLocalSubdomain = effectiveHostname.endsWith('.localhost');

  let portalOrigin = '';
  let crmOrigin = '';

  if (isLocalSubdomain && isLpSubdomain) {
    const rest = effectiveHost.slice(3);
    portalOrigin = `${effectiveProto}://app.${rest}`;
    crmOrigin = `${effectiveProto}://crm.${rest}`;
  } else {
    portalOrigin = trimTrailingSlash(
      env.HUB_URL || env.PORTAL_URL || process.env.HUB_URL || process.env.PORTAL_URL || ''
    );
    if (!portalOrigin) {
      const appUrlCandidate = trimTrailingSlash(env.APP_URL || process.env.APP_URL || '');
      const appHost = getHostnameSafe(appUrlCandidate);
      if (appHost.startsWith('app.')) {
        portalOrigin = appUrlCandidate;
      } else if (isLpSubdomain) {
        portalOrigin = `${effectiveProto}://app.${effectiveHost.slice(3)}`;
      }
    }

    crmOrigin = trimTrailingSlash(env.CRM_URL || process.env.CRM_URL || '');
    if (!crmOrigin && isLpSubdomain) {
      crmOrigin = `${effectiveProto}://crm.${effectiveHost.slice(3)}`;
    }
  }

  // No fallback unificado local (localhost:3000 / 127.0.0.1), mantém rotas relativas /hub/login e /admin/login.html
  if (isLocalFallback || isLoopbackReq || req?.domainKind === 'unified') {
    portalOrigin = '';
    crmOrigin = '';
  }

  if (portalOrigin && portalOrigin === trimTrailingSlash(lpBaseUrl)) {
    portalOrigin = '';
  }
  if (crmOrigin && crmOrigin === trimTrailingSlash(lpBaseUrl)) {
    crmOrigin = '';
  }

  return {
    portalOrigin,
    portalLoginUrl: portalOrigin ? `${portalOrigin}/login` : '',
    crmLoginUrl: crmOrigin ? `${crmOrigin}/login.html` : ''
  };
}

function createSeoHtmlService({ publicDir = path.resolve(process.cwd(), 'public'), env = {} } = {}) {
  const fileCache = new Map();

  function readHtmlFile(relPath) {
    const fullPath = path.join(publicDir, relPath);
    const stat = fs.statSync(fullPath);
    const cached = fileCache.get(relPath);
    if (cached && cached.mtimeMs === stat.mtimeMs) {
      return cached.content;
    }
    const content = fs.readFileSync(fullPath, 'utf8');
    fileCache.set(relPath, { mtimeMs: stat.mtimeMs, content });
    return content;
  }

  function renderPublicHtml(relPath, req) {
    const baseUrl = resolveSeoBaseUrl(req, env);
    const safeBaseUrl = escapeHtmlAttr(baseUrl);
    const { portalOrigin, portalLoginUrl, crmLoginUrl } = resolveCrossServiceLinks(req, env, baseUrl);
    let html = readHtmlFile(relPath);

    if (baseUrl !== CANONICAL_PLACEHOLDER_ORIGIN) {
      html = html.split(CANONICAL_PLACEHOLDER_ORIGIN).join(safeBaseUrl);
    }
    if (baseUrl !== CANONICAL_HTTP_PLACEHOLDER_ORIGIN) {
      html = html.split(CANONICAL_HTTP_PLACEHOLDER_ORIGIN).join(safeBaseUrl);
    }

    // Normaliza canonical, hreflang e og:url caso o template HTML use caminhos relativos
    html = html
      .replace(
        /(<link\b[^>]*\brel=["']canonical["'][^>]*\bhref=["'])(\/(?!\/)[^"']*)(["'][^>]*>)/gi,
        `$1${safeBaseUrl}$2$3`
      )
      .replace(
        /(<link\b[^>]*\bhreflang=["'][^"']+["'][^>]*\bhref=["'])(\/(?!\/)[^"']*)(["'][^>]*>)/gi,
        `$1${safeBaseUrl}$2$3`
      )
      .replace(
        /(<meta\b[^>]*\bproperty=["']og:url["'][^>]*\bcontent=["'])(\/(?!\/)[^"']*)(["'][^>]*>)/gi,
        `$1${safeBaseUrl}$2$3`
      );

    if (portalLoginUrl) {
      const safePortalLogin = escapeHtmlAttr(portalLoginUrl);
      const safePortalOrigin = escapeHtmlAttr(portalOrigin);
      html = html
        .split('href="/hub/login"')
        .join(`data-ks-cross-link="hub" href="${safePortalLogin}"`)
        .replace(/href="\/hub"(?![\w/-])/g, `data-ks-cross-link="hub" href="${safePortalOrigin}"`);
    }

    if (crmLoginUrl) {
      const safeCrmLogin = escapeHtmlAttr(crmLoginUrl);
      html = html
        .split('href="/admin/login.html"')
        .join(`data-ks-cross-link="crm" href="${safeCrmLogin}"`);
    }

    return { html, baseUrl };
  }

  function sendSeoHtml(relPath, { indexable = true } = {}) {
    return (req, res, next) => {
      try {
        const { html, baseUrl } = renderPublicHtml(relPath, req);
        if (indexable) {
          const pathSuffix = relPath === 'index.html' ? '/' : `/${relPath}`;
          res.set('X-Robots-Tag', 'index, follow, max-snippet:-1, max-image-preview:large, max-video-preview:-1');
          res.set('Link', `<${baseUrl}${pathSuffix}>; rel="canonical", <${baseUrl}/llms.txt>; rel="alternate"; type="text/markdown"`);
        } else {
          res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
        }
        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
      } catch (err) {
        next(err);
      }
    };
  }

  return {
    renderPublicHtml,
    sendSeoHtml
  };
}

module.exports = {
  createSeoHtmlService,
  CANONICAL_PLACEHOLDER_ORIGIN
};
