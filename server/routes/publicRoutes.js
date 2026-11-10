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
const { isSupabaseConfigured } = require('../config/env');

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

  router.get('/public/config', async (_req, res, next) => {
    try {
      const config = await settingsService.getPublicConfig();
      res.json(config);
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
