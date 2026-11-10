'use strict';

const { Queue } = require('bullmq');
const { env, isRedisConfigured } = require('../config/env');
const { createRedisConnection } = require('./redis');
const logger = require('../utils/logger');

const QUEUE_NAMES = {
  TRACKING: 'tracking-events',
  AUTOMATIONS: 'crm-automations',
  MARKETING_SYNC: 'marketing-sync',
  DLQ: 'dead-letter'
};

const DEFAULT_JOB_OPTIONS = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000
  },
  removeOnComplete: {
    age: 60 * 60 * 24 * 7,
    count: 1000
  },
  removeOnFail: false
};

let queuesCache = null;
let queueConnection = null;

function getQueues() {
  if (!isRedisConfigured()) {
    return null;
  }
  if (!queuesCache) {
    queueConnection = createRedisConnection({ maxRetriesPerRequest: null });
    const opts = {
      connection: queueConnection,
      prefix: env.BULLMQ_PREFIX,
      defaultJobOptions: DEFAULT_JOB_OPTIONS
    };
    queuesCache = {
      tracking: new Queue(QUEUE_NAMES.TRACKING, opts),
      automations: new Queue(QUEUE_NAMES.AUTOMATIONS, opts),
      marketingSync: new Queue(QUEUE_NAMES.MARKETING_SYNC, opts),
      dlq: new Queue(QUEUE_NAMES.DLQ, opts)
    };
  }
  return queuesCache;
}

async function enqueueJob({ queueKey, jobName, payload, idempotencyKey = null, automationsRepo = null }) {
  const queues = getQueues();
  const bullJobId = idempotencyKey ? idempotencyKey.replace(/[^a-zA-Z0-9_-]/g, '_') : undefined;
  const jobData =
    idempotencyKey && payload && typeof payload === 'object' && !payload.idempotency_key
      ? { ...payload, idempotency_key: idempotencyKey }
      : payload;
  let dbRecord = null;

  if (automationsRepo) {
    try {
      dbRecord = await automationsRepo.recordJob({
        queue_name: QUEUE_NAMES[queueKey.toUpperCase()] || queueKey,
        job_name: jobName,
        bull_job_id: bullJobId || null,
        idempotency_key: idempotencyKey,
        lead_id: payload?.lead_id || null,
        opportunity_id: payload?.opportunity_id || null,
        status: queues ? 'queued' : 'pending_worker',
        payload: jobData
      });
    } catch (err) {
      logger.warn('Could not persist automation_job record before enqueue', { message: err.message });
    }
  }

  if (!queues) {
    return {
      queued: false,
      status: 'pending_worker',
      reason: 'redis_not_configured',
      jobRecordId: dbRecord?.id || null
    };
  }

  const targetQueue =
    queueKey === 'tracking'
      ? queues.tracking
      : queueKey === 'marketingSync'
      ? queues.marketingSync
      : queues.automations;

  try {
    const jobOpts = bullJobId ? { jobId: bullJobId } : {};
    const job = await targetQueue.add(jobName, jobData, jobOpts);
    return {
      queued: true,
      status: 'queued',
      bull_job_id: String(job.id),
      jobRecordId: dbRecord?.id || null
    };
  } catch (err) {
    logger.warn('Failed to enqueue job into Redis/BullMQ', { queueKey, jobName, message: err.message });
    if (automationsRepo && idempotencyKey) {
      await automationsRepo.updateJobByIdempotency(idempotencyKey, {
        status: 'pending_worker',
        error_message: err.message
      });
    }
    return {
      queued: false,
      status: 'pending_worker',
      reason: err.message,
      jobRecordId: dbRecord?.id || null
    };
  }
}

async function getQueueMetrics() {
  const queues = getQueues();
  if (!queues) {
    return {
      configured: false,
      connected: false,
      queues: {}
    };
  }

  try {
    const entries = await Promise.all(
      Object.entries(queues).map(async ([key, q]) => {
        const counts = await q.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed');
        return [key, counts];
      })
    );
    return {
      configured: true,
      connected: true,
      queues: Object.fromEntries(entries)
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      error: err.message,
      queues: {}
    };
  }
}

async function closeQueues() {
  if (queuesCache) {
    await Promise.all(Object.values(queuesCache).map((q) => q.close().catch(() => {})));
    queuesCache = null;
  }
  if (queueConnection) {
    await queueConnection.quit().catch(() => {});
    queueConnection = null;
  }
}

module.exports = {
  QUEUE_NAMES,
  DEFAULT_JOB_OPTIONS,
  getQueues,
  enqueueJob,
  getQueueMetrics,
  closeQueues
};
