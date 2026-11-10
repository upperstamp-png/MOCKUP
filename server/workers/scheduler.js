'use strict';

process.env.SERVICE_NAME = 'king-scheduler';

const { env, isSupabaseConfigured, isRedisConfigured } = require('../config/env');
const logger = require('../utils/logger');
const { createLeadsRepo } = require('../database/repositories/leadsRepo');
const { createCrmRepo } = require('../database/repositories/crmRepo');
const { createTrackingRepo } = require('../database/repositories/trackingRepo');
const { createAutomationsRepo } = require('../database/repositories/automationsRepo');
const { createBlogRepo } = require('../database/repositories/blogRepo');
const { createSettingsRepo } = require('../database/repositories/settingsRepo');
const { createSettingsService } = require('../services/settingsService');
const { createAutomationService } = require('../services/automationService');
const { enqueueJob, closeQueues } = require('../jobs/queues');
const { closeRedis } = require('../jobs/redis');

async function runScheduledTick() {
  if (!isSupabaseConfigured()) {
    logger.debug('Scheduler tick skipped: Supabase not configured');
    return;
  }

  const leadsRepo = createLeadsRepo();
  const crmRepo = createCrmRepo();
  const trackingRepo = createTrackingRepo();
  const automationsRepo = createAutomationsRepo();
  const blogRepo = createBlogRepo();
  const settingsRepo = createSettingsRepo();
  const settingsService = createSettingsService({ settingsRepo });
  const automationService = createAutomationService({
    leadsRepo,
    crmRepo,
    trackingRepo,
    automationsRepo,
    settingsService
  });

  try {
    // 1. Verifica leads sem atendimento além do SLA
    const slaResult = await automationService.scanUnattendedLeadsSla(env.UNATTENDED_LEAD_SLA_MINUTES);
    if (slaResult.alerted > 0) {
      logger.info('Unattended leads SLA alerts generated', slaResult);
    }

    // 2. Publica artigos agendados cujo horário já chegou
    const published = await blogRepo.publishDueScheduledPosts();
    if (published.length > 0) {
      logger.info('Scheduled blog posts published', { count: published.length });
    }
  } catch (err) {
    logger.error('Scheduler tick error', { error: err.message });
  }
}

async function runMarketingSyncTick() {
  if (!isSupabaseConfigured() || !isRedisConfigured()) return;
  const automationsRepo = createAutomationsRepo();
  await enqueueJob({
    queueKey: 'marketingSync',
    jobName: 'scheduled-ads-sync',
    idempotencyKey: `scheduled-sync:${new Date().toISOString().slice(0, 13)}`,
    automationsRepo,
    payload: { triggered_by: 'scheduler' }
  });
}

logger.info('King Sports Scheduler started');
runScheduledTick();

const fastInterval = setInterval(runScheduledTick, 5 * 60 * 1000);
const syncInterval = setInterval(runMarketingSyncTick, 60 * 60 * 1000);

async function shutdown(signal) {
  logger.info('Shutting down scheduler', { signal });
  clearInterval(fastInterval);
  clearInterval(syncInterval);
  await closeQueues();
  await closeRedis();
  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
