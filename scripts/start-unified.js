'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');

try {
  // Carrega variáveis da raiz unificada e complementa com hub/MOCKUP/.env sem sobrescrever flags da shell
  const dotenv = require('dotenv');
  dotenv.config({ path: path.join(ROOT, '.env') });
  dotenv.config({ path: path.join(ROOT, 'hub', 'MOCKUP', '.env') });
} catch {
  // Opcional se dotenv ainda não estiver disponível no contexto
}

const isDev = process.argv.includes('--dev');
const isWin = process.platform === 'win32';
const npmCmd = isWin ? 'npm.cmd' : 'npm';

const HUB_ROOT = path.join(ROOT, 'hub', 'MOCKUP');
const HUB_WEB_DIR = path.join(HUB_ROOT, 'apps', 'web');
const PORTAL_API_ENTRY = path.join(HUB_ROOT, 'apps', 'api', 'dist', 'server.js');
const NEXT_BIN = path.join(HUB_ROOT, 'node_modules', 'next', 'dist', 'bin', 'next');
const GATEWAY_ENTRY = path.join(ROOT, 'server', 'app.js');

const GATEWAY_PORT = String(process.env.PORT || '3000');
const PORTAL_API_HOST = process.env.PORTAL_API_HOST || '127.0.0.1';
const PORTAL_API_PORT = String(process.env.PORTAL_API_PORT || '4000');
const HUB_WEB_HOST = process.env.HUB_WEB_HOST || '127.0.0.1';
const HUB_WEB_PORT = String(process.env.HUB_WEB_PORT || '3333');

const PORTAL_API_INTERNAL_URL =
  process.env.PORTAL_API_INTERNAL_URL || `http://${PORTAL_API_HOST}:${PORTAL_API_PORT}`;
const HUB_WEB_INTERNAL_URL =
  process.env.HUB_WEB_INTERNAL_URL || `http://${HUB_WEB_HOST}:${HUB_WEB_PORT}`;

function assertProductionBuildExists() {
  const required = [
    { path: GATEWAY_ENTRY, label: 'Gateway Express (server/app.js)' },
    { path: PORTAL_API_ENTRY, label: 'Portal API build (hub/MOCKUP/apps/api/dist/server.js)' },
    { path: NEXT_BIN, label: 'Next.js CLI (hub/MOCKUP/node_modules/next/dist/bin/next)' },
    { path: path.join(HUB_WEB_DIR, '.next'), label: 'HUB Web build (hub/MOCKUP/apps/web/.next)' }
  ];

  const missing = required.filter((item) => !fs.existsSync(item.path));
  if (missing.length > 0) {
    console.error('[unified] Build de produção incompleto. Itens ausentes:');
    for (const m of missing) {
      console.error(`  - ${m.label}: ${m.path}`);
    }
    console.error('[unified] Execute "npm run build" na raiz antes de iniciar em produção.');
    process.exit(1);
  }
}

function pipeWithPrefix(stream, prefix, output) {
  if (!stream) return;
  let remainder = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    const lines = (remainder + chunk).split(/\r?\n/);
    remainder = lines.pop() || '';
    for (const line of lines) {
      output.write(`${prefix} ${line}\n`);
    }
  });
  stream.on('end', () => {
    if (remainder.length > 0) {
      output.write(`${prefix} ${remainder}\n`);
      remainder = '';
    }
  });
}

function killChildTree(entry, signal = 'SIGTERM') {
  const { child, usesShell } = entry;
  if (!child || child.exitCode !== null || child.killed) return;

  if (isWin && usesShell && child.pid) {
    try {
      spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      });
      return;
    } catch {
      // Fallback abaixo
    }
  }

  try {
    child.kill(signal);
  } catch {
    // Processo já encerrado
  }
}

function addOriginIfValid(set, rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return;
  try {
    set.add(new URL(rawUrl.trim()).origin);
  } catch {
    // Ignora URL malformado
  }
}

function main() {
  if (!isDev) {
    assertProductionBuildExists();
  }

  const modeEnv = isDev ? 'development' : process.env.NODE_ENV || 'production';
  const lpHost = process.env.LP_HOST || 'lp.kinsports.com.br';
  const lpHostAliases = process.env.LP_HOST_ALIASES || 'lp.kingsports.com.br,www.kingsports.com.br';
  const crmHost = process.env.CRM_HOST || 'crm.kingsports.com.br';
  const hubHost = process.env.HUB_HOST || 'app.kingsports.com.br';

  const defaultLocalBase = `http://localhost:${GATEWAY_PORT}`;
  const resolvedLpUrl = process.env.LP_URL || (isDev ? defaultLocalBase : `https://${lpHost}`);
  const resolvedCrmUrl =
    process.env.CRM_URL || (isDev ? `${defaultLocalBase}/admin` : `https://${crmHost}`);
  const resolvedHubUrl =
    process.env.HUB_URL || (isDev ? `${defaultLocalBase}/hub` : `https://${hubHost}`);
  const resolvedAppUrl = process.env.APP_URL || resolvedLpUrl;

  let resolvedCorsOrigin;
  if (String(process.env.CORS_ORIGIN || '').trim() === '*') {
    resolvedCorsOrigin = '*';
  } else {
    const unifiedOrigins = new Set(
      String(process.env.CORS_ORIGIN || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
    unifiedOrigins.add(`http://127.0.0.1:${GATEWAY_PORT}`);
    unifiedOrigins.add(`http://localhost:${GATEWAY_PORT}`);
    unifiedOrigins.add(`http://127.0.0.1:${HUB_WEB_PORT}`);
    unifiedOrigins.add(`http://localhost:${HUB_WEB_PORT}`);
    unifiedOrigins.add(`http://app.localhost:${GATEWAY_PORT}`);
    unifiedOrigins.add(`http://hub.localhost:${GATEWAY_PORT}`);
    unifiedOrigins.add(`http://crm.localhost:${GATEWAY_PORT}`);
    unifiedOrigins.add(`http://lp.localhost:${GATEWAY_PORT}`);
    unifiedOrigins.add('https://app.kingsports.com.br');
    unifiedOrigins.add('https://crm.kingsports.com.br');
    unifiedOrigins.add('https://lp.kinsports.com.br');
    unifiedOrigins.add('https://lp.kingsports.com.br');
    unifiedOrigins.add(`https://${hubHost.split(':')[0]}`);
    unifiedOrigins.add(`https://${crmHost.split(':')[0]}`);
    unifiedOrigins.add(`https://${lpHost.split(':')[0]}`);
    for (const alias of lpHostAliases.split(',').map((s) => s.trim()).filter(Boolean)) {
      unifiedOrigins.add(`https://${alias.split(':')[0]}`);
    }
    addOriginIfValid(unifiedOrigins, resolvedAppUrl);
    addOriginIfValid(unifiedOrigins, resolvedLpUrl);
    addOriginIfValid(unifiedOrigins, resolvedCrmUrl);
    addOriginIfValid(unifiedOrigins, resolvedHubUrl);
    resolvedCorsOrigin = Array.from(unifiedOrigins).join(',');
  }

  const baseEnv = {
    ...process.env,
    APP_URL: resolvedAppUrl,
    LP_HOST: lpHost,
    LP_HOST_ALIASES: lpHostAliases,
    CRM_HOST: crmHost,
    HUB_HOST: hubHost,
    LP_URL: resolvedLpUrl,
    CRM_URL: resolvedCrmUrl,
    HUB_URL: resolvedHubUrl,
    CORS_ORIGIN: resolvedCorsOrigin
  };

  const specs = isDev
    ? [
        {
          name: 'portal-api',
          command: npmCmd,
          args: ['--prefix', 'hub/MOCKUP', 'run', 'dev:api'],
          cwd: ROOT,
          shell: isWin,
          env: {
            ...baseEnv,
            NODE_ENV: 'development',
            PORT: PORTAL_API_PORT,
            HOST: PORTAL_API_HOST,
            SERVICE_NAME: 'king-portal-api'
          }
        },
        {
          name: 'hub-web',
          command: npmCmd,
          args: ['--prefix', 'hub/MOCKUP', 'run', 'dev:web'],
          cwd: ROOT,
          shell: isWin,
          env: {
            ...baseEnv,
            NODE_ENV: 'development',
            PORT: HUB_WEB_PORT,
            API_INTERNAL_URL: PORTAL_API_INTERNAL_URL,
            PORTAL_API_INTERNAL_URL,
            SERVICE_NAME: 'king-hub-web'
          }
        },
        {
          name: 'gateway',
          command: process.execPath,
          args: ['--watch', GATEWAY_ENTRY],
          cwd: ROOT,
          shell: false,
          env: {
            ...baseEnv,
            NODE_ENV: 'development',
            PORT: GATEWAY_PORT,
            PORTAL_API_INTERNAL_URL,
            HUB_WEB_INTERNAL_URL,
            SERVICE_NAME: 'king-api'
          }
        }
      ]
    : [
        {
          name: 'portal-api',
          command: process.execPath,
          args: [PORTAL_API_ENTRY],
          cwd: HUB_ROOT,
          shell: false,
          env: {
            ...baseEnv,
            NODE_ENV: modeEnv,
            PORT: PORTAL_API_PORT,
            HOST: PORTAL_API_HOST,
            SERVICE_NAME: 'king-portal-api'
          }
        },
        {
          name: 'hub-web',
          command: process.execPath,
          args: [NEXT_BIN, 'start', '-H', HUB_WEB_HOST, '-p', HUB_WEB_PORT],
          cwd: HUB_WEB_DIR,
          shell: false,
          env: {
            ...baseEnv,
            NODE_ENV: modeEnv,
            PORT: HUB_WEB_PORT,
            API_INTERNAL_URL: PORTAL_API_INTERNAL_URL,
            PORTAL_API_INTERNAL_URL,
            SERVICE_NAME: 'king-hub-web'
          }
        },
        {
          name: 'gateway',
          command: process.execPath,
          args: [GATEWAY_ENTRY],
          cwd: ROOT,
          shell: false,
          env: {
            ...baseEnv,
            NODE_ENV: modeEnv,
            PORT: GATEWAY_PORT,
            PORTAL_API_INTERNAL_URL,
            HUB_WEB_INTERNAL_URL,
            SERVICE_NAME: 'king-api'
          }
        }
      ];

  console.log(
    `[unified] Iniciando King Sports Platform (${isDev ? 'DEV' : 'PROD'}) -> Gateway :${GATEWAY_PORT} | HUB :${HUB_WEB_PORT} | Portal API :${PORTAL_API_PORT}`
  );

  const running = [];
  let shuttingDown = false;
  let finalExitCode = 0;

  function shutdown(reason, exitCode = 0) {
    if (shuttingDown) return;
    shuttingDown = true;
    finalExitCode = exitCode;
    console.log(`[unified] Encerrando processos (${reason})...`);

    for (const entry of running) {
      killChildTree(entry, 'SIGTERM');
    }

    const forceTimer = setTimeout(() => {
      for (const entry of running) {
        if (entry.child.exitCode === null) {
          if (isWin && entry.child.pid) {
            try {
              spawn('taskkill', ['/pid', String(entry.child.pid), '/T', '/F'], {
                stdio: 'ignore',
                windowsHide: true
              });
            } catch {
              killChildTree(entry, 'SIGKILL');
            }
          } else {
            killChildTree(entry, 'SIGKILL');
          }
        }
      }
      process.exit(finalExitCode);
    }, 5000);
    forceTimer.unref();
  }

  for (const spec of specs) {
    const child = spawn(spec.command, spec.args, {
      cwd: spec.cwd,
      env: spec.env,
      shell: spec.shell,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    const entry = { name: spec.name, child, usesShell: spec.shell };
    running.push(entry);

    pipeWithPrefix(child.stdout, `[${spec.name}]`, process.stdout);
    pipeWithPrefix(child.stderr, `[${spec.name}]`, process.stderr);

    child.on('error', (err) => {
      console.error(`[${spec.name}] Falha ao iniciar processo: ${err.message}`);
      shutdown(`${spec.name}-error`, 1);
    });

    child.on('exit', (code, signal) => {
      const aliveCount = running.filter((item) => item.child.exitCode === null).length;
      if (!shuttingDown) {
        const reason = signal ? `signal ${signal}` : `code ${code ?? 1}`;
        console.error(`[unified] Processo "${spec.name}" encerrou inesperadamente (${reason}).`);
        shutdown(`${spec.name}-exit`, code && code !== 0 ? code : 1);
      } else if (aliveCount === 0) {
        process.exit(finalExitCode);
      }
    });
  }

  process.on('SIGINT', () => shutdown('SIGINT', 0));
  process.on('SIGTERM', () => shutdown('SIGTERM', 0));
  if (!isWin) {
    process.on('SIGHUP', () => shutdown('SIGHUP', 0));
  }
}

main();
