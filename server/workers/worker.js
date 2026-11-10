'use strict';

process.env.SERVICE_NAME = 'king-worker';

const { Worker } = require('bullmq');
const { env, isRedisConfigured, isSupabaseConfigured } = require('../config/env');
const logger = require('../utils/logger');
const { createRedisConnection, getRedisClient, closeRedis } = require('../jobs/redis');
const { QUEUE_NAMES, getQueues, enqueueJob, closeQueues } = require('../jobs/queues');

const { createLeadsRepo } = require('../database/repositories/leadsRepo');
const { createCrmRepo } = require('../database/repositories/crmRepo');
const { createTrackingRepo } = require('../database/repositories/trackingRepo');
const { createCampaignsRepo } = require('../database/repositories/campaignsRepo');
const { createAutomationsRepo } = require('../database/repositories/automationsRepo');
const { createSettingsRepo } = require('../database/repositories/settingsRepo');

const { createSettingsService } = require('../services/settingsService');
const { createAutomationService } = require('../services/automationService');
const {
  syncMetaCampaignInsights,
  syncGa4DataReport,
  syncGoogleAdsCampaignMetrics
} = require('../integrations/adsSyncClients');

async function moveToDeadLetterQueue(queueName, job, err) {
  const queues = getQueues();
  if (!queues) return;
  try {
    await queues.dlq.add('dead-letter-entry', {
      original_queue: queueName,
      original_job_name: job.name,
      original_job_id: job.id,
      attempts_made: job.attemptsMade,
      failed_reason: err.message,
      failed_at: new Date().toISOString(),
      payload: job.data
    });
  } catch (dlqErr) {
    logger.error('Failed pushing job to DLQ', { message: dlqErr.message });
  }
}

async function startWorkers() {
  if (!isRedisConfigured()) {
    logger.error('king-worker cannot start: REDIS_URL is not configured in .env');
    process.exit(1);
  }
  if (!isSupabaseConfigured()) {
    logger.warn('Supabase is not configured yet. Workers waiting for valid Supabase credentials.');
  }

  const leadsRepo = createLeadsRepo();
  const crmRepo = createCrmRepo();
  const trackingRepo = createTrackingRepo();
  const campaignsRepo = createCampaignsRepo();
  const automationsRepo = createAutomationsRepo();
  const settingsRepo = createSettingsRepo();
  const settingsService = createSettingsService({ settingsRepo });
  const redisClient = getRedisClient();

  const automationService = createAutomationService({
    leadsRepo,
    crmRepo,
    trackingRepo,
    automationsRepo,
    settingsService,
    redisClient
  });

  const workerConnection = createRedisConnection({ maxRetriesPerRequest: null });
  const baseWorkerOpts = {
    connection: workerConnection,
    prefix: env.BULLMQ_PREFIX,
    concurrency: env.WORKER_CONCURRENCY
  };

  async function runTracked(queueName, job, handler) {
    const start = Date.now();
    const idemKey = job.data?.idempotency_key || null;
    if (isSupabaseConfigured() && idemKey) {
      await automationsRepo.updateJobByIdempotency(idemKey, {
        status: 'active',
        started_at: new Date().toISOString(),
        attempts: job.attemptsMade + 1
      });
    }

    try {
      const result = await handler();
      if (isSupabaseConfigured() && idemKey) {
        await automationsRepo.updateJobByIdempotency(idemKey, {
          status: 'completed',
          result,
          duration_ms: Date.now() - start,
          completed_at: new Date().toISOString(),
          error_message: null
        });
      }
      return result;
    } catch (err) {
      const isFinalAttempt = job.attemptsMade + 1 >= (job.opts?.attempts || 5);
      if (isSupabaseConfigured() && idemKey) {
        await automationsRepo.updateJobByIdempotency(idemKey, {
          status: isFinalAttempt ? 'dlq' : 'failed',
          error_message: err.message,
          duration_ms: Date.now() - start
        });
      }
      if (isFinalAttempt) {
        await moveToDeadLetterQueue(queueName, job, err);
      }
      throw err;
    }
  }

  const trackingWorker = new Worker(
    QUEUE_NAMES.TRACKING,
    async (job) => runTracked(QUEUE_NAMES.TRACKING, job, () => automationService.dispatchConversionEvent(job.data)),
    baseWorkerOpts
  );

  const automationWorker = new Worker(
    QUEUE_NAMES.AUTOMATIONS,
    async (job) =>
      runTracked(QUEUE_NAMES.AUTOMATIONS, job, () =>
        automationService.executeAutomationWorkflow(job.name, job.data, { enqueueJob })
      ),
    baseWorkerOpts
  );

  const syncWorker = new Worker(
    QUEUE_NAMES.MARKETING_SYNC,
    async (job) =>
      runTracked(QUEUE_NAMES.MARKETING_SYNC, job, async () => {
        const secrets = await settingsService.getResolvedServerSecrets();
        const until = new Date().toISOString().slice(0, 10);
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        const summary = {};

        if (secrets.meta_ad_account_id && secrets.meta_capi_token) {
          const metaRes = await syncMetaCampaignInsights({
            adAccountId: secrets.meta_ad_account_id,
            accessToken: secrets.meta_capi_token,
            sinceDate: since,
            untilDate: until
          });
          summary.meta = { synced: metaRes.synced, rows: metaRes.rows?.length || 0, error: metaRes.error };
          if (metaRes.synced && Array.isArray(metaRes.rows)) {
            for (const row of metaRes.rows) {
              const camp = await campaignsRepo.createCampaign({
                platform: 'meta_ads',
                external_campaign_id: row.campaign_id,
                external_account_id: secrets.meta_ad_account_id,
                name: row.campaign_name || row.campaign_id,
                status: 'active'
              }).catch(() => null);
              if (camp) {
                await campaignsRepo.upsertCampaignMetrics(camp.id, {
                  metric_date: row.date_start,
                  impressions: Number(row.impressions || 0),
                  reach: Number(row.reach || 0),
                  clicks: Number(row.clicks || 0),
                  spend_cents: Math.round(Number(row.spend || 0) * 100),
                  sync_source: 'meta_api',
                  raw_payload: row
                });
              }
            }
          }
        }

        if (secrets.ga4_property_id && secrets.google_service_account_json) {
          const ga4Res = await syncGa4DataReport({
            propertyId: secrets.ga4_property_id,
            serviceAccountJson: secrets.google_service_account_json,
            startDate: since,
            endDate: until
          });
          summary.ga4 = { synced: ga4Res.synced, rows: ga4Res.rows?.length || 0, error: ga4Res.error };
        }

        if (secrets.google_ads_developer_token && secrets.google_ads_refresh_token && secrets.google_ads_customer_id) {
          const gadsRes = await syncGoogleAdsCampaignMetrics({
            developerToken: secrets.google_ads_developer_token,
            clientId: secrets.google_ads_client_id,
            clientSecret: secrets.google_ads_client_secret,
            refreshToken: secrets.google_ads_refresh_token,
            customerId: secrets.google_ads_customer_id,
            loginCustomerId: secrets.google_ads_login_customer_id,
            startDate: since,
            endDate: until
          });
          summary.google_ads = { synced: gadsRes.synced, rows: gadsRes.rows?.length || 0, error: gadsRes.error };
        }

        return summary;
      }),
    baseWorkerOpts
  );

  for (const w of [trackingWorker, automationWorker, syncWorker]) {
    w.on('completed', (job) => {
      logger.info('Worker job completed', { queue: w.name, job_id: job.id, name: job.name });
    });
    w.on('failed', (job, err) => {
      logger.warn('Worker job failed', {
        queue: w.name,
        job_id: job?.id,
        name: job?.name,
        attempts: job?.attemptsMade,
        error: err.message
      });
    });
  }

  logger.info('King Sports BullMQ workers started', {
    concurrency: env.WORKER_CONCURRENCY,
    queues: [QUEUE_NAMES.TRACKING, QUEUE_NAMES.AUTOMATIONS, QUEUE_NAMES.MARKETING_SYNC]
  });

  async function shutdown(signal) {
    logger.info('Shutting down workers', { signal });
    await Promise.all([trackingWorker.close(), automationWorker.close(), syncWorker.close()]);
    await workerConnection.quit().catch(() => {});
    await closeQueues();
    await closeRedis();
    process.exit(0);
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

startWorkers().catch((err) => {
  logger.error('Fatal worker startup error', { error: err.message });
  process.exit(1);
});
