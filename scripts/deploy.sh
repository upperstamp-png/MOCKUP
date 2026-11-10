#!/usr/bin/env bash
# ==============================================================================
# KING SPORTS — DEPLOY ZERO-DOWNTIME (PM2 / SYSTEMD + NGINX)
# Uso: bash scripts/deploy.sh
# ==============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/kingsports}"
cd "$APP_DIR"

if [ "$(id -u)" -eq 0 ]; then
  SUDO=""
else
  SUDO="sudo"
fi

echo "[1/4] Instalando dependências da plataforma unificada (Raiz + hub/MOCKUP)..."
# Garantir devDependencies (TypeScript / Next build) mesmo se NODE_ENV=production estiver no shell
NODE_ENV=development npm ci
NODE_ENV=development npm --prefix hub/MOCKUP ci

echo "[2/4] Carregando variáveis de ambiente e executando build completo (npm run build)..."
if [ -f "${APP_DIR}/hub/MOCKUP/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "${APP_DIR}/hub/MOCKUP/.env"
  set +a
fi

if [ -f "${APP_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "${APP_DIR}/.env"
  set +a
fi

export NEXT_PUBLIC_SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL:-${SUPABASE_URL:-}}"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="${NEXT_PUBLIC_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY:-}}"
export NEXT_PUBLIC_PORTAL_API_BASE="${NEXT_PUBLIC_PORTAL_API_BASE:-/api/v1}"
export NEXT_PUBLIC_HUB_BASE_PATH="${NEXT_PUBLIC_HUB_BASE_PATH:-}"

NODE_ENV=production npm run build

echo "[3/4] Reiniciando processos Node.js (zero-downtime)..."
if command -v pm2 >/dev/null 2>&1; then
  # Remove processo legado "king-api" caso exista de versões anteriores para evitar conflito na porta :3000
  if pm2 describe king-api >/dev/null 2>&1; then
    pm2 delete king-api || true
  fi
  pm2 startOrReload scripts/ecosystem.config.cjs --env production --update-env
  pm2 save
else
  UNITS=()
  for unit in king-portal-api king-hub-web king-gateway king-api king-worker king-scheduler; do
    if systemctl list-unit-files "${unit}.service" >/dev/null 2>&1 && systemctl list-unit-files "${unit}.service" | grep -q "${unit}.service"; then
      UNITS+=("$unit")
    fi
  done
  if [ "${#UNITS[@]}" -eq 0 ]; then
    echo "Erro: nem PM2 nem units systemd (king-*) foram encontrados." >&2
    exit 1
  fi
  $SUDO systemctl restart "${UNITS[@]}"
fi

echo "[4/4] Validando e recarregando Nginx..."
$SUDO nginx -t && $SUDO systemctl reload nginx

echo "Deploy concluído com sucesso em $(date -Iseconds)."
