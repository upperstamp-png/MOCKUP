'use strict';

const crypto = require('crypto');

function generateEventId(prefix = 'ks') {
  return `${prefix}_${crypto.randomUUID()}`;
}

function buildIdempotencyKey({ platform, eventName, entityId, eventId }) {
  const safeEntity = entityId || eventId || crypto.randomUUID();
  return `${platform}:${eventName}:${safeEntity}`;
}

/**
 * Garante idempotência usando Redis (quando conectado) e banco conversion_events.
 */
async function ensureNotDuplicated({ idempotencyKey, redisClient = null, trackingRepo = null }) {
  if (!idempotencyKey) {
    return { duplicated: false };
  }

  if (redisClient) {
    try {
      const redisKey = `idem:${idempotencyKey}`;
      const acquired = await redisClient.set(redisKey, '1', 'EX', 60 * 60 * 24 * 30, 'NX');
      if (acquired === null) {
        return { duplicated: true, via: 'redis' };
      }
    } catch {
      // Fallback gracefully to database check if Redis temporarily unavailable
    }
  }

  if (trackingRepo) {
    const existing = await trackingRepo.findConversionByIdempotencyKey(idempotencyKey);
    if (existing && existing.status === 'sent') {
      return { duplicated: true, via: 'database', existing };
    }
  }

  return { duplicated: false };
}

module.exports = {
  generateEventId,
  buildIdempotencyKey,
  ensureNotDuplicated
};
