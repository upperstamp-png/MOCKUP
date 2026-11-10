'use strict';

const express = require('express');
const { validateBody } = require('../middleware/validate');
const {
  leadSubmissionSchema,
  publicEventSchema,
  consentRecordSchema
} = require('../utils/validators');
const { hashIp } = require('../utils/crypto');
const { checkDatabaseHealth } = require('../database/supabase');
const { checkRedisHealth } = require('../jobs/redis');
const { getEventCatalog } = require('../tracking/eventCatalog');
const { env, isSupabaseConfigured } = require('../config/env');

function trimUrl(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function isLoopbackUrl(value) {
  return /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(String(value || '').trim());
}

function extractRequestOrigin(req) {
  if (!req) return null;
  const forwardedHost =
    req.headers && req.headers['x-forwarded-host']
      ? String(req.headers['x-forwarded-host']).split(',')[0].trim()
      : '';
  const directHost = req.get && req.get('host') ? String(req.get('host')).trim() : '';
  const host = forwardedHost || directHost;
  if (!host || !/^[a-zA-Z0-9.:-]+$/.test(host)) return null;
  const proto =
    req.headers && req.headers['x-forwarded-proto']
      ? String(req.headers['x-forwarded-proto']).split(',')[0].trim()
      : req.protocol || 'http';
  const hostname = host.split(':')[0].toLowerCase();
  const port = host.includes(':') ? host.slice(host.indexOf(':')) : '';
  return { proto, host, hostname, port, origin: `${proto}://${host}`.replace(/\/+$/, '') };
}

function resolvePublicUrlsForRequest(req, rawUrls) {
  const baseUrls = {
    lp_url: trimUrl(rawUrls?.lp_url || env.LP_URL || env.APP_URL || ''),
    crm_url: trimUrl(rawUrls?.crm_url || env.CRM_URL || ''),
    hub_url: trimUrl(rawUrls?.hub_url || env.HUB_URL || '')
  };

  const domainKind = req?.domainKind || 'unified';
  if (domainKind === 'unified') {
    return baseUrls;
  }

  const originInfo = extractRequestOrigin(req);
  if (!originInfo) {
    return baseUrls;
  }

  const { proto, hostname, port, origin } = originInfo;
  const isLocalSubdomain = hostname === 'localhost' || hostname.endsWith('.localhost');
  const dotIdx = hostname.indexOf('.');
  const baseDomain = dotIdx !== -1 ? hostname.slice(dotIdx + 1) : hostname;

  if (hostname.endsWith('.localhost')) {
    return {
      lp_url: `${proto}://lp.${baseDomain}${port}`,
      crm_url: `${proto}://crm.${baseDomain}${port}`,
      hub_url: `${proto}://app.${baseDomain}${port}`
    };
  }

  let lpUrl = baseUrls.lp_url;
  let crmUrl = baseUrls.crm_url;
  let hubUrl = baseUrls.hub_url;

  if (domainKind === 'lp' && (!lpUrl || isLoopbackUrl(lpUrl))) {
    lpUrl = origin;
  } else if (!lpUrl || isLoopbackUrl(lpUrl)) {
    lpUrl = `${proto}://${env.LP_HOST}`;
  }

  if (domainKind === 'crm' && (!crmUrl || isLoopbackUrl(crmUrl))) {
    crmUrl = origin;
  } else if (!crmUrl || isLoopbackUrl(crmUrl)) {
    crmUrl = `${proto}://${env.CRM_HOST}`;
  }

  if (domainKind === 'hub' && (!hubUrl || isLoopbackUrl(hubUrl))) {
    hubUrl = origin;
  } else if (!hubUrl || isLoopbackUrl(hubUrl)) {
    hubUrl = `${proto}://${env.HUB_HOST}`;
  }

  return {
    lp_url: trimUrl(lpUrl),
    crm_url: trimUrl(crmUrl),
    hub_url: trimUrl(hubUrl)
  };
}

function sanitizePublicConfigResponse(config, req) {
  const tracking = config?.tracking || {};
  return {
    tracking: {
      gtm_id: String(tracking.gtm_id || ''),
      ga4_measurement_id: String(tracking.ga4_measurement_id || ''),
      google_ads_conversion_id: String(tracking.google_ads_conversion_id || ''),
      google_ads_label_lead: String(tracking.google_ads_label_lead || ''),
      meta_pixel_id: String(tracking.meta_pixel_id || '')
    },
    franchise: config?.franchise || {},
    landing_content: config?.landing_content || {},
    urls: resolvePublicUrlsForRequest(req, config?.urls),
    storage_ready: Boolean(config?.storage_ready)
  };
}

function createPublicRoutes({
  leadIngestionService,
  settingsService,
  trackingRepo,
  blogService,
  limiters,
  isStorageConfigured = isSupabaseConfigured,
  checkDbHealth = checkDatabaseHealth,
  checkCacheHealth = checkRedisHealth
}) {
  const router = express.Router();

  router.get('/health', async (_req, res) => {
    const [db, redis] = await Promise.all([checkDbHealth(), checkCacheHealth()]);
    res.json({
      status: 'ok',
      service: 'king-sports-api',
      timestamp: new Date().toISOString(),
      dependencies: {
        supabase: db,
        redis
      }
    });
  });

  router.get('/public/config', async (req, res, next) => {
    try {
      const config = await settingsService.getPublicConfig();
      res.json(sanitizePublicConfigResponse(config, req));
    } catch (err) {
      next(err);
    }
  });

  router.get('/public/tracking/catalog', (_req, res) => {
    res.json({ events: getEventCatalog() });
  });

  router.post(
    '/public/leads',
    limiters.publicLeadLimiter,
    validateBody(leadSubmissionSchema),
    async (req, res, next) => {
      try {
        const result = await leadIngestionService.ingestPublicLead(req.validatedBody, {
          ip: req.ip,
          userAgent: req.get('user-agent'),
          referer: req.get('referer')
        });
        res.status(201).json({
          success: true,
          message: 'Candidatura registrada com sucesso.',
          ...result
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/public/events',
    limiters.publicEventLimiter,
    validateBody(publicEventSchema),
    async (req, res, next) => {
      try {
        if (!isStorageConfigured()) {
          return res.status(202).json({
            recorded: false,
            reason: 'supabase_not_configured'
          });
        }
        const body = req.validatedBody;
        const saved = await trackingRepo.insertMarketingEvent({
          event_id: body.event_id,
          session_id: body.session_id,
          event_name: body.event_name,
          source: 'client',
          page_url: body.page_url || null,
          referrer: body.referrer || null,
          payload: body.payload || {},
          consent_snapshot: body.consent || {}
        });
        return res.status(201).json({ recorded: true, id: saved.id });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post(
    '/public/consent',
    limiters.publicEventLimiter,
    validateBody(consentRecordSchema),
    async (req, res, next) => {
      try {
        if (!isStorageConfigured()) {
          return res.status(202).json({
            recorded: false,
            reason: 'supabase_not_configured'
          });
        }
        const body = req.validatedBody;
        const record = await trackingRepo.recordConsent({
          session_id: body.session_id,
          analytics_consent: body.analytics_consent,
          marketing_consent: body.marketing_consent,
          functional_consent: body.functional_consent,
          policy_version: body.policy_version,
          ip_hash: hashIp(req.ip),
          user_agent: String(req.get('user-agent') || '').slice(0, 400)
        });
        return res.status(201).json({ recorded: true, id: record.id });
      } catch (err) {
        return next(err);
      }
    }
  );

  router.post('/public/blog/:slug/view', limiters.publicEventLimiter, async (req, res, next) => {
    try {
      const result = await blogService.registerArticleView(req.params.slug);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createPublicRoutes };
