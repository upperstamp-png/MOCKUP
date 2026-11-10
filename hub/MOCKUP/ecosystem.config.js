/**
 * @file ecosystem.config.js
 * @description Configuração do PM2 para execução direta em servidores Host / Bare-Metal Linux
 * 
 * NOTA DE ARQUITETURA:
 * Em ambientes containerizados com Docker, utilize o Docker Compose nativo para evitar
 * sobreposição de múltiplos gerenciadores de processo.
 * Utilize este arquivo PM2 exclusivamente ao rodar direto no host Ubuntu sem Docker.
 */

module.exports = {
  apps: [
    {
      name: 'mockup-api',
      cwd: './apps/api',
      script: 'dist/server.js',
      instances: 'max',
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
      max_memory_restart: '500M',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/api-error.log',
      out_file: './logs/api-out.log',
      merge_logs: true,
    },
    {
      name: 'mockup-web',
      cwd: './apps/web',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      instances: 2,
      exec_mode: 'cluster',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      max_memory_restart: '1G',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/web-error.log',
      out_file: './logs/web-out.log',
      merge_logs: true,
    },
  ],
};
