'use strict';

const Redis = require('ioredis');
const { env, isRedisConfigured } = require('../config/env');
const logger = require('../utils/logger');

let sharedClient = null;
let lastStatus = {
  configured: isRedisConfigured(),
  connected: false,
  status: isRedisConfigured() ? 'initializing' : 'not_configured',
  message: isRedisConfigured() ? '' : 'REDIS_URL não configurada no .env.'
};

function createRedisConnection({ maxRetriesPerRequest = null } = {}) {
  if (!isRedisConfigured()) {
    return null;
  }

  const options = {
    maxRetriesPerRequest,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy(times) {
      if (times > 10) return null;
      return Math.min(times * 250, 3000);
    }
  };
  if (env.REDIS_PASSWORD) {
    options.password = env.REDIS_PASSWORD;
  }

  const client = new Redis(env.REDIS_URL, options);

  client.on('ready', () => {
    lastStatus = { configured: true, connected: true, status: 'connected', message: 'Redis conectado.' };
  });

  client.on('error', (err) => {
    lastStatus = { configured: true, connected: false, status: 'error', message: err.message };
    logger.warn('Redis connection error', { message: err.message });
  });

  return client;
}

function getRedisClient() {
  if (!isRedisConfigured()) return null;
  if (!sharedClient) {
    sharedClient = createRedisConnection({ maxRetriesPerRequest: 2 });
  }
  return sharedClient;
}

async function checkRedisHealth() {
  if (!isRedisConfigured()) {
    return {
      configured: false,
      connected: false,
      status: 'not_configured',
      message: 'Variável REDIS_URL não definida no .env.'
    };
  }
  const client = getRedisClient();
  try {
    if (client.status === 'wait') {
      await client.connect();
    }
    const start = Date.now();
    const pong = await client.ping();
    return {
      configured: true,
      connected: pong === 'PONG',
      status: pong === 'PONG' ? 'connected' : 'error',
      latency_ms: Date.now() - start
    };
  } catch (err) {
    return {
      configured: true,
      connected: false,
      status: 'error',
      message: err.message
    };
  }
}

async function closeRedis() {
  if (sharedClient) {
    try {
      await sharedClient.quit();
    } catch {
      sharedClient.disconnect();
    }
    sharedClient = null;
  }
}

module.exports = {
  createRedisConnection,
  getRedisClient,
  checkRedisHealth,
  closeRedis,
  getLastRedisStatus: () => lastStatus,
  isRedisConfigured
};
