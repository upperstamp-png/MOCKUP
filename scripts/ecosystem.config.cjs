// ============================================================================
// PM2 ECOSYSTEM CONFIGURATION — KING SPORTS UNIFIED PLATFORM
// Inicia Gateway Express (Landing/CRM + Proxy), Portal API Fastify, Next.js HUB,
// Worker BullMQ e Scheduler recorrente.
// Uso: pm2 start scripts/ecosystem.config.cjs --env production
// ============================================================================

module.exports = {
  apps: [
    {
      name: 'king-portal-api',
      script: 'hub/MOCKUP/apps/api/dist/server.js',
      cwd: '/var/www/kingsports',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 8000,
      env_production: {
        NODE_ENV: 'production',
        SERVICE_NAME: 'king-portal-api',
        HOST: '127.0.0.1',
        PORT: 4000
      }
    },
    {
      name: 'king-hub-web',
      script: '../../node_modules/next/dist/bin/next',
      args: 'start -H 127.0.0.1 -p 3333',
      cwd: '/var/www/kingsports/hub/MOCKUP/apps/web',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '768M',
      kill_timeout: 8000,
      env_production: {
        NODE_ENV: 'production',
        SERVICE_NAME: 'king-hub-web',
        PORT: 3333,
        PORTAL_API_INTERNAL_URL: 'http://127.0.0.1:4000',
        API_INTERNAL_URL: 'http://127.0.0.1:4000'
      }
    },
    {
      name: 'king-api',
      script: 'server/app.js',
      cwd: '/var/www/kingsports',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 8000,
      env_production: {
        NODE_ENV: 'production',
        SERVICE_NAME: 'king-api',
        PORT: 3000,
        PORTAL_API_INTERNAL_URL: 'http://127.0.0.1:4000',
        HUB_WEB_INTERNAL_URL: 'http://127.0.0.1:3333'
      }
    },
    {
      name: 'king-worker',
      script: 'server/workers/worker.js',
      cwd: '/var/www/kingsports',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      kill_timeout: 8000,
      env_production: {
        NODE_ENV: 'production',
        SERVICE_NAME: 'king-worker'
      }
    },
    {
      name: 'king-scheduler',
      script: 'server/workers/scheduler.js',
      cwd: '/var/www/kingsports',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      kill_timeout: 8000,
      env_production: {
        NODE_ENV: 'production',
        SERVICE_NAME: 'king-scheduler'
      }
    }
  ]
};
