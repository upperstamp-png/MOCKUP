// ============================================================================
// PM2 ECOSYSTEM CONFIGURATION — KING SPORTS UNIFIED PLATFORM
// Gerencia como projeto único todos os processos de produção:
//   - king-portal-api  (Fastify HUB API em 127.0.0.1:4000)
//   - king-hub-web     (Next.js HUB + Studio 3D + Universidade em 127.0.0.1:3333)
//   - king-gateway     (Express Gateway LP/Blog/CRM/Proxy em :3000)
//   - king-worker      (BullMQ Worker de automações e tracking CAPI/GA4)
//   - king-scheduler   (Scheduler recorrente de SLA, blog agendado e sync Ads)
// Uso: pm2 startOrReload scripts/ecosystem.config.cjs --env production
// ============================================================================
'use strict';

const path = require('node:path');

const APP_DIR = process.env.APP_DIR || path.resolve(__dirname, '..');
const HUB_ROOT = path.join(APP_DIR, 'hub', 'MOCKUP');
const HUB_WEB_DIR = path.join(HUB_ROOT, 'apps', 'web');
const NEXT_BIN = path.join(HUB_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');

const PORTAL_API_INTERNAL_URL =
  process.env.PORTAL_API_INTERNAL_URL || 'http://127.0.0.1:4000';
const HUB_WEB_INTERNAL_URL =
  process.env.HUB_WEB_INTERNAL_URL || 'http://127.0.0.1:3333';

module.exports = {
  apps: [
    {
      name: 'king-portal-api',
      script: 'hub/MOCKUP/apps/api/dist/server.js',
      cwd: APP_DIR,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 8000,
      env: {
        NODE_ENV: 'production',
        SERVICE_NAME: 'king-portal-api',
        HOST: '127.0.0.1',
        PORT: 4000
      },
      env_production: {
        NODE_ENV: 'production',
        SERVICE_NAME: 'king-portal-api',
        HOST: '127.0.0.1',
        PORT: 4000
      }
    },
    {
      name: 'king-hub-web',
      script: NEXT_BIN,
      args: 'start -H 127.0.0.1 -p 3333',
      cwd: HUB_WEB_DIR,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '768M',
      kill_timeout: 8000,
      env: {
        NODE_ENV: 'production',
        SERVICE_NAME: 'king-hub-web',
        HOSTNAME: '127.0.0.1',
        PORT: 3333,
        PORTAL_API_INTERNAL_URL,
        API_INTERNAL_URL: PORTAL_API_INTERNAL_URL
      },
      env_production: {
        NODE_ENV: 'production',
        SERVICE_NAME: 'king-hub-web',
        HOSTNAME: '127.0.0.1',
        PORT: 3333,
        PORTAL_API_INTERNAL_URL,
        API_INTERNAL_URL: PORTAL_API_INTERNAL_URL
      }
    },
    {
      name: 'king-gateway',
      script: 'server/app.js',
      cwd: APP_DIR,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 8000,
      env: {
        NODE_ENV: 'production',
        SERVICE_NAME: 'king-gateway',
        PORT: 3000,
        PORTAL_API_INTERNAL_URL,
        HUB_WEB_INTERNAL_URL
      },
      env_production: {
        NODE_ENV: 'production',
        SERVICE_NAME: 'king-gateway',
        PORT: 3000,
        PORTAL_API_INTERNAL_URL,
        HUB_WEB_INTERNAL_URL
      }
    },
    {
      name: 'king-worker',
      script: 'server/workers/worker.js',
      cwd: APP_DIR,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 8000,
      env: {
        NODE_ENV: 'production',
        SERVICE_NAME: 'king-worker'
      },
      env_production: {
        NODE_ENV: 'production',
        SERVICE_NAME: 'king-worker'
      }
    },
    {
      name: 'king-scheduler',
      script: 'server/workers/scheduler.js',
      cwd: APP_DIR,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      kill_timeout: 8000,
      env: {
        NODE_ENV: 'production',
        SERVICE_NAME: 'king-scheduler'
      },
      env_production: {
        NODE_ENV: 'production',
        SERVICE_NAME: 'king-scheduler'
      }
    }
  ]
};
