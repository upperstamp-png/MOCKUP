'use strict';

const express = require('express');
const { validateBody } = require('../middleware/validate');
const {
  campaignCreateSchema,
  campaignMetricSchema,
  blogPostSchema,
  settingsBulkUpdateSchema,
  automationRuleUpdateSchema,
  adminUserCreateSchema
} = require('../utils/validators');
const { requireCsrf } = require('../middleware/csrfMiddleware');
const { getEventCatalog } = require('../tracking/eventCatalog');
const { getQueueMetrics } = require('../jobs/queues');

function createAdminMarketingRoutes({
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
  enqueueJob,
  authMiddleware
}) {
  const router = express.Router();
  const { requireAdminAuth, requireRole } = authMiddleware;

  router.use(requireAdminAuth);
  router.use(requireCsrf);

  // --------------------------------------------------------------------------
  // Campanhas & Métricas de Mídia
  // --------------------------------------------------------------------------
  router.get('/campaigns', async (req, res, next) => {
    try {
      const analytics = await analyticsService.getDashboardAnalytics({
        days: req.query.days,
        startDate: req.query.start_date,
        endDate: req.query.end_date
      });
      const rawCampaigns = await campaignsRepo.listCampaigns();
      res.json({
        campaigns: analytics.campaigns,
        raw_campaigns: rawCampaigns,
        kpis: analytics.kpis,
        diagnostics: analytics.diagnostics,
        health_bars: analytics.health_bars
      });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/campaigns',
    requireRole(['super_admin', 'expansion_director', 'marketing_analyst']),
    validateBody(campaignCreateSchema),
    async (req, res, next) => {
      try {
        const created = await campaignsRepo.createCampaign(req.validatedBody);
        res.status(201).json({ campaign: created });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/campaigns/:id/metrics',
    requireRole(['super_admin', 'expansion_director', 'marketing_analyst']),
    validateBody(campaignMetricSchema),
    async (req, res, next) => {
      try {
        const metric = await campaignsRepo.upsertCampaignMetrics(req.params.id, req.validatedBody);
        res.status(201).json({ metric });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/campaigns/sync',
    requireRole(['super_admin', 'expansion_director', 'marketing_analyst']),
    async (req, res, next) => {
      try {
        const statuses = await integrationTestService.getAllIntegrationStatuses();
        const readyPlatforms = ['meta_marketing_api', 'ga4_data_api', 'google_ads_api'].filter(
          (k) => statuses[k]?.configured
        );
        if (!readyPlatforms.length) {
          return res.status(200).json({
            synced: false,
            reason: 'no_ads_api_configured',
            message:
              'Nenhuma API externa (Meta Marketing, Google Ads ou GA4 Data API) está configurada. Cadastre as credenciais em Configurações.',
            statuses
          });
        }
        const job = await enqueueJob({
          queueKey: 'marketingSync',
          jobName: 'sync-ads-platforms',
          idempotencyKey: `sync:${new Date().toISOString().slice(0, 13)}`,
          automationsRepo,
          payload: { platforms: readyPlatforms, requested_by: req.adminUser.id }
        });
        return res.json({ synced: true, queued: job.queued, platforms: readyPlatforms, job });
      } catch (err) {
        return next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Tracking Server-Side & Catálogo LGPD
  // --------------------------------------------------------------------------
  router.get('/tracking/events', async (req, res, next) => {
    try {
      const [conversions, marketingEvents] = await Promise.all([
        trackingRepo.listConversionEvents({
          limit: 80,
          platform: req.query.platform || null,
          status: req.query.status || null
        }),
        trackingRepo.listMarketingEvents({ limit: 80 })
      ]);
      res.json({
        conversions,
        marketing_events: marketingEvents,
        catalog: getEventCatalog()
      });
    } catch (err) {
      next(err);
    }
  });

  // --------------------------------------------------------------------------
  // Automações, Filas BullMQ & DLQ
  // --------------------------------------------------------------------------
  router.get('/automations', async (_req, res, next) => {
    try {
      const [rules, jobs, queueMetrics] = await Promise.all([
        automationsRepo.listRules(),
        automationsRepo.listJobs({ limit: 80 }),
        getQueueMetrics()
      ]);
      res.json({ rules, jobs, queue_metrics: queueMetrics });
    } catch (err) {
      next(err);
    }
  });

  router.patch(
    '/automations/rules/:id',
    requireRole(['super_admin', 'expansion_director']),
    validateBody(automationRuleUpdateSchema),
    async (req, res, next) => {
      try {
        const updated = await automationsRepo.updateRule(req.params.id, req.validatedBody);
        await settingsRepo.recordAuditLog({
          actor_admin_id: req.adminUser.id,
          actor_email: req.adminUser.email,
          action: 'automation_rule.updated',
          entity_type: 'automation_rule',
          entity_id: req.params.id,
          changes: req.validatedBody
        });
        res.json({ rule: updated });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/automations/jobs/:id/retry',
    requireRole(['super_admin', 'expansion_director', 'marketing_analyst']),
    async (req, res, next) => {
      try {
        const jobRecord = await automationsRepo.getJobById(req.params.id);
        const queueKey = jobRecord.queue_name === 'tracking-events' ? 'tracking' : 'automations';
        const resEnqueue = await enqueueJob({
          queueKey,
          jobName: jobRecord.job_name,
          idempotencyKey: `${jobRecord.idempotency_key || jobRecord.id}:retry:${Date.now()}`,
          automationsRepo,
          payload: jobRecord.payload
        });
        res.json({ retried: true, result: resEnqueue });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/automations/sla-scan',
    requireRole(['super_admin', 'expansion_director']),
    async (_req, res, next) => {
      try {
        const result = await automationService.scanUnattendedLeadsSla();
        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Blog CMS
  // --------------------------------------------------------------------------
  router.get('/blog/categories', async (_req, res, next) => {
    try {
      const categories = await blogRepo.listCategories();
      res.json({ categories });
    } catch (err) {
      next(err);
    }
  });

  router.get('/blog/posts', async (_req, res, next) => {
    try {
      const posts = await blogRepo.listAllPostsAdmin();
      res.json({ posts });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/blog/posts',
    requireRole(['super_admin', 'expansion_director', 'marketing_analyst', 'content_editor']),
    validateBody(blogPostSchema),
    async (req, res, next) => {
      try {
        const post = await blogService.createPostAdmin(req.validatedBody, req.adminUser);
        res.status(201).json({ post });
      } catch (err) {
        next(err);
      }
    }
  );

  router.put(
    '/blog/posts/:id',
    requireRole(['super_admin', 'expansion_director', 'marketing_analyst', 'content_editor']),
    validateBody(blogPostSchema),
    async (req, res, next) => {
      try {
        const post = await blogService.updatePostAdmin(req.params.id, req.validatedBody, req.adminUser);
        res.json({ post });
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    '/blog/posts/:id',
    requireRole(['super_admin', 'expansion_director']),
    async (req, res, next) => {
      try {
        const result = await blogRepo.deletePost(req.params.id);
        await settingsRepo.recordAuditLog({
          actor_admin_id: req.adminUser.id,
          actor_email: req.adminUser.email,
          action: 'blog.post_deleted',
          entity_type: 'blog_post',
          entity_id: req.params.id
        });
        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  // --------------------------------------------------------------------------
  // Configurações, Integrações, Usuários e Auditoria
  // --------------------------------------------------------------------------
  router.get('/settings', requireRole(['super_admin', 'expansion_director', 'marketing_analyst']), async (_req, res, next) => {
    try {
      const settings = await settingsRepo.listSettings({ includeSecretsDecrypted: false });
      res.json({ settings });
    } catch (err) {
      next(err);
    }
  });

  router.put(
    '/settings',
    requireRole(['super_admin', 'expansion_director']),
    validateBody(settingsBulkUpdateSchema),
    async (req, res, next) => {
      try {
        const updated = await settingsService.updateSettingsBulk(
          req.validatedBody.settings,
          req.adminUser
        );
        res.json({ updated });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get('/integrations/status', async (_req, res, next) => {
    try {
      const statuses = await integrationTestService.getAllIntegrationStatuses();
      res.json({ statuses });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/integrations/:target/test',
    requireRole(['super_admin', 'expansion_director', 'marketing_analyst']),
    async (req, res, next) => {
      try {
        const result = await integrationTestService.testIntegration(req.params.target);
        await settingsRepo.recordAuditLog({
          actor_admin_id: req.adminUser.id,
          actor_email: req.adminUser.email,
          action: 'integration.tested',
          entity_type: 'integration',
          entity_id: req.params.target,
          changes: { ok: result.ok, status: result.status }
        });
        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.get('/users', requireRole(['super_admin', 'expansion_director']), async (_req, res, next) => {
    try {
      const [users, roles] = await Promise.all([
        settingsRepo.listAdmins(),
        settingsRepo.listRoles()
      ]);
      res.json({ users, roles });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/users',
    requireRole(['super_admin']),
    validateBody(adminUserCreateSchema),
    async (req, res, next) => {
      try {
        const user = await settingsService.inviteOrCreateAdminUser(req.validatedBody, req.adminUser);
        res.status(201).json({ user });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get('/audit-logs', requireRole(['super_admin', 'expansion_director']), async (_req, res, next) => {
    try {
      const logs = await settingsRepo.listAuditLogs(100);
      res.json({ logs });
    } catch (err) {
      next(err);
    }
  });

  return router;
}

module.exports = { createAdminMarketingRoutes };
