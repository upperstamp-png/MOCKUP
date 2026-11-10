#!/usr/bin/env bash
# ==============================================================================
# KING SPORTS — DEPLOY ZERO-DOWNTIME (PM2 / SYSTEMD + NGINX)
# Uso: bash scripts/deploy.sh
# ==============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/kingsports}"
cd "$APP_DIR"

echo "[1/4] Instalando dependências de produção..."
npm ci --omit=dev

echo "[2/4] Validando sintaxe JavaScript e HTML..."
npm run lint:syntax

echo "[3/4] Reiniciando processos Node.js..."
if command -v pm2 >/dev/null 2>&1; then
  pm2 startOrReload scripts/ecosystem.config.cjs --env production
  pm2 save
else
  sudo systemctl restart king-api king-worker king-scheduler
fi

echo "[4/4] Validando Nginx..."
sudo nginx -t && sudo systemctl reload nginx

echo "Deploy concluído com sucesso em $(date -Iseconds)."
