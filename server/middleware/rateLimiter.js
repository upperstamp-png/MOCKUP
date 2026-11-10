'use strict';

const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { getRedisClient } = require('../jobs/redis');

function buildStore(prefix) {
  const redis = getRedisClient();
  if (!redis) return undefined;
  return new RedisStore({
    prefix: `rl:${prefix}:`,
    sendCommand: (...args) => redis.call(...args)
  });
}

function createRateLimiters() {
  const publicLeadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 15,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildStore('lead'),
    message: {
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Muitas tentativas em curto intervalo. Aguarde alguns minutos antes de tentar novamente.'
      }
    }
  });

  const publicEventLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildStore('evt'),
    message: {
      error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Limite de eventos excedido.' }
    }
  });

  const adminLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildStore('login'),
    message: {
      error: {
        code: 'TOO_MANY_LOGIN_ATTEMPTS',
        message: 'Muitas tentativas de login. Aguarde 15 minutos e tente novamente.'
      }
    }
  });

  const adminApiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false,
    store: buildStore('admin')
  });

  return {
    publicLeadLimiter,
    publicEventLimiter,
    adminLoginLimiter,
    adminApiLimiter
  };
}

module.exports = { createRateLimiters };
