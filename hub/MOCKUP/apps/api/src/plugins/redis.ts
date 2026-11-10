import { Redis } from 'ioredis';
import { env } from '../config/env.js';

let redisClient: Redis | null = null;
let redisAvailable = false;

export function getRedisClient(): Redis | null {
  if (!env.REDIS_URL) return null;
  if (redisClient) return redisClient;

  redisClient = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
    enableReadyCheck: true,
    lazyConnect: false,
    retryStrategy(times: number) {
      if (times > 5) return null;
      return Math.min(times * 250, 1500);
    },
  });

  redisClient.on('ready', () => {
    redisAvailable = true;
  });

  redisClient.on('error', (err: Error) => {
    redisAvailable = false;
    console.warn('[redis warn]', err.message);
  });

  return redisClient;
}

export function isRedisAvailable(): boolean {
  return redisAvailable;
}

export function unitCacheKey(unitId: string, userId: string, scope: string): string {
  return `ks:portal:u:${unitId}:usr:${userId}:${scope}`;
}

export async function checkRedisHealth(): Promise<'connected' | 'unavailable'> {
  const client = getRedisClient();
  if (!client) return 'unavailable';
  try {
    const res = await client.ping();
    if (res === 'PONG') {
      redisAvailable = true;
      return 'connected';
    }
    return 'unavailable';
  } catch {
    redisAvailable = false;
    return 'unavailable';
  }
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      redisClient.disconnect();
    }
    redisClient = null;
    redisAvailable = false;
  }
}
