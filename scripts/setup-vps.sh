#!/usr/bin/env bash
# ==============================================================================
# KING SPORTS — PROVISIONAMENTO INICIAL DE VPS UBUNTU (22.04 / 24.04)
# Executar como root ou sudo:
#   sudo DOMAIN="franquia.kingsportsoficial.com.br" EMAIL="devops@kingsportsoficial.com.br" bash scripts/setup-vps.sh
# ==============================================================================
set -euo pipefail

DOMAIN="${DOMAIN:-franquia.kingsportsoficial.com.br}"
EMAIL="${EMAIL:-admin@kingsportsoficial.com.br}"
APP_DIR="/var/www/kingsports"

echo "[1/7] Atualizando sistema e instalando dependências básicas..."
apt-get update -y
apt-get install -y curl gnupg ca-certificates lsb-release ufw fail2ban nginx certbot python3-certbot-nginx redis-server postgresql-client

echo "[2/7] Instalando Node.js LTS (v22)..."
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v
npm -v

echo "[3/7] Instalando PM2 globalmente..."
npm install -g pm2

echo "[4/7] Criando usuário não-root e diretórios..."
if ! id -u kingsports >/dev/null 2>&1; then
  useradd --system --create-home --shell /bin/bash kingsports
fi
mkdir -p "$APP_DIR" /var/www/certbot /var/backups/kingsports
chown -R kingsports:kingsports "$APP_DIR" /var/backups/kingsports

echo "[5/7] Aplicando hardening no Redis (bind localhost) e UFW Firewall..."
sed -i 's/^bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf || true
sed -i 's/^# maxmemory-policy .*/maxmemory-policy noeviction/' /etc/redis/redis.conf || true
systemctl enable redis-server
systemctl restart redis-server

ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

systemctl enable fail2ban
systemctl restart fail2ban

echo "[6/7] Configurando Nginx Bootstrap e renovação automática Certbot..."
if [ -f "$APP_DIR/nginx/nginx-http-bootstrap.conf" ]; then
  sed "s/franquia.kingsportsoficial.com.br/${DOMAIN}/g" "$APP_DIR/nginx/nginx-http-bootstrap.conf" > /etc/nginx/sites-available/kingsports.conf
  ln -sf /etc/nginx/sites-available/kingsports.conf /etc/nginx/sites-enabled/kingsports.conf
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx

  echo "Emitindo certificado SSL Let's Encrypt para ${DOMAIN}..."
  certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect || echo "Aviso: Certbot falhou — verifique o apontamento DNS antes de repetir."
  if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ] && [ -f "$APP_DIR/nginx/kingsports.conf" ]; then
    sed "s/franquia.kingsportsoficial.com.br/${DOMAIN}/g" "$APP_DIR/nginx/kingsports.conf" > /etc/nginx/sites-available/kingsports.conf
    nginx -t && systemctl reload nginx
  fi
fi

systemctl enable certbot.timer || true

echo "[7/7] Setup básico concluído! Configure ${APP_DIR}/.env e execute scripts/deploy.sh."
