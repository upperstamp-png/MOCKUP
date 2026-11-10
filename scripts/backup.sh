#!/usr/bin/env bash
# ==============================================================================
# KING SPORTS — BACKUP AUTOMATIZADO (SUPABASE POSTGRESQL + REDIS + CONFIG)
# Cron sugerido (03:15 todo dia):
#   15 3 * * * /var/www/kingsports/scripts/backup.sh >> /var/log/king-backup.log 2>&1
# Requer variável SUPABASE_DB_URL configurada no .env (connection string Postgres).
# ==============================================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/kingsports}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/kingsports}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"
STAMP="$(date +%Y%m%d_%H%M%S)"
TARGET_DIR="${BACKUP_ROOT}/${STAMP}"

if [ -f "${APP_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1090
  source "${APP_DIR}/.env"
  set +a
fi

mkdir -p "$TARGET_DIR"
chmod 700 "$BACKUP_ROOT" "$TARGET_DIR"

echo "[1/3] Backup do banco PostgreSQL (Supabase)..."
if [ -n "${SUPABASE_DB_URL:-}" ]; then
  pg_dump "$SUPABASE_DB_URL" --no-owner --no-privileges --format=custom --file="${TARGET_DIR}/supabase_db.dump"
  echo "Dump PostgreSQL gerado em ${TARGET_DIR}/supabase_db.dump"
else
  echo "AVISO: SUPABASE_DB_URL não definido — backup lógico PostgreSQL ignorado."
fi

echo "[2/3] Backup do snapshot Redis RDB..."
if [ -f /var/lib/redis/dump.rdb ]; then
  redis-cli BGSAVE >/dev/null 2>&1 || true
  sleep 2
  cp /var/lib/redis/dump.rdb "${TARGET_DIR}/redis_dump.rdb"
fi

echo "[3/3] Compactando e limpando backups com mais de ${RETENTION_DAYS} dias..."
tar -czf "${BACKUP_ROOT}/kingsports_${STAMP}.tar.gz" -C "$BACKUP_ROOT" "$STAMP"
rm -rf "$TARGET_DIR"
chmod 600 "${BACKUP_ROOT}/kingsports_${STAMP}.tar.gz"
find "$BACKUP_ROOT" -type f -name "kingsports_*.tar.gz" -mtime +"${RETENTION_DAYS}" -delete

echo "Backup finalizado: ${BACKUP_ROOT}/kingsports_${STAMP}.tar.gz"
