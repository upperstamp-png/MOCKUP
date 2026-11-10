#!/usr/bin/env bash
# ==============================================================================
# KING SPORTS — PROVISIONAMENTO INICIAL DE VPS UBUNTU (22.04 / 24.04)
# Executar como root ou sudo:
#   sudo LP_DOMAIN="lp.kinsports.com.br" LP_ALIAS_DOMAIN="lp.kingsports.com.br" \
#        CRM_DOMAIN="crm.kingsports.com.br" HUB_DOMAIN="app.kingsports.com.br" \
#        EMAIL="devops@kingsportsoficial.com.br" bash scripts/setup-vps.sh
# ==============================================================================
set -euo pipefail

LP_DOMAIN="${LP_DOMAIN:-lp.kinsports.com.br}"
if [ -z "${LP_ALIAS_DOMAIN+x}" ]; then
  if [ "$LP_DOMAIN" = "lp.kinsports.com.br" ]; then
    LP_ALIAS_DOMAIN="lp.kingsports.com.br"
  else
    LP_ALIAS_DOMAIN=""
  fi
fi
CRM_DOMAIN="${CRM_DOMAIN:-crm.kingsports.com.br}"
HUB_DOMAIN="${HUB_DOMAIN:-app.kingsports.com.br}"
EMAIL="${EMAIL:-admin@kingsportsoficial.com.br}"
APP_DIR="${APP_DIR:-/var/www/kingsports}"

if [ -n "$LP_ALIAS_DOMAIN" ] && [ "$LP_ALIAS_DOMAIN" != "$LP_DOMAIN" ]; then
  LP_SERVER_NAME="${LP_DOMAIN} ${LP_ALIAS_DOMAIN}"
else
  LP_SERVER_NAME="${LP_DOMAIN}"
fi

render_nginx_template() {
  local src="$1"
  local dst="$2"
  sed \
    -e "s|server_name lp\.kinsports\.com\.br lp\.kingsports\.com\.br;|server_name __LP_SERVER_NAME__;|g" \
    -e "s|live/lp\.kinsports\.com\.br|live/__LP_DOMAIN__|g" \
    -e "s|crm\.kingsports\.com\.br|__CRM_DOMAIN__|g" \
    -e "s|app\.kingsports\.com\.br|__HUB_DOMAIN__|g" \
    -e "s|__LP_SERVER_NAME__|${LP_SERVER_NAME}|g" \
    -e "s|__LP_DOMAIN__|${LP_DOMAIN}|g" \
    -e "s|__CRM_DOMAIN__|${CRM_DOMAIN}|g" \
    -e "s|__HUB_DOMAIN__|${HUB_DOMAIN}|g" \
    "$src" > "$dst"
}

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
chown -R www-data:www-data /var/www/certbot

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

echo "[6/7] Configurando Nginx Bootstrap e emissão Certbot TLS para todos os subdomínios..."
if [ -f "$APP_DIR/nginx/nginx-http-bootstrap.conf" ]; then
  render_nginx_template "$APP_DIR/nginx/nginx-http-bootstrap.conf" /etc/nginx/sites-available/kingsports.conf
  ln -sf /etc/nginx/sites-available/kingsports.conf /etc/nginx/sites-enabled/kingsports.conf
  rm -f /etc/nginx/sites-enabled/default
  systemctl enable nginx
  nginx -t && systemctl reload-or-restart nginx

  echo "Emitindo certificado SSL Let's Encrypt para LP (${LP_SERVER_NAME})..."
  if [ -n "$LP_ALIAS_DOMAIN" ] && [ "$LP_ALIAS_DOMAIN" != "$LP_DOMAIN" ]; then
    if ! certbot certonly --webroot -w /var/www/certbot --cert-name "$LP_DOMAIN" -d "$LP_DOMAIN" -d "$LP_ALIAS_DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --deploy-hook "systemctl reload nginx"; then
      echo "Aviso: emissão conjunta (${LP_DOMAIN} + ${LP_ALIAS_DOMAIN}) falhou; tentando somente ${LP_DOMAIN}..."
      certbot certonly --webroot -w /var/www/certbot --cert-name "$LP_DOMAIN" -d "$LP_DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --deploy-hook "systemctl reload nginx" || echo "Aviso: Certbot falhou para ${LP_DOMAIN} — verifique o apontamento DNS."
    fi
  else
    certbot certonly --webroot -w /var/www/certbot --cert-name "$LP_DOMAIN" -d "$LP_DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --deploy-hook "systemctl reload nginx" || echo "Aviso: Certbot falhou para ${LP_DOMAIN} — verifique o apontamento DNS."
  fi

  echo "Emitindo certificado SSL Let's Encrypt para CRM (${CRM_DOMAIN})..."
  certbot certonly --webroot -w /var/www/certbot --cert-name "$CRM_DOMAIN" -d "$CRM_DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --deploy-hook "systemctl reload nginx" || echo "Aviso: Certbot falhou para ${CRM_DOMAIN} — verifique o apontamento DNS."

  echo "Emitindo certificado SSL Let's Encrypt para HUB (${HUB_DOMAIN})..."
  certbot certonly --webroot -w /var/www/certbot --cert-name "$HUB_DOMAIN" -d "$HUB_DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --deploy-hook "systemctl reload nginx" || echo "Aviso: Certbot falhou para ${HUB_DOMAIN} — verifique o apontamento DNS."

  if [ -f "/etc/letsencrypt/live/${LP_DOMAIN}/fullchain.pem" ] && \
     [ -f "/etc/letsencrypt/live/${CRM_DOMAIN}/fullchain.pem" ] && \
     [ -f "/etc/letsencrypt/live/${HUB_DOMAIN}/fullchain.pem" ] && \
     [ -f "$APP_DIR/nginx/kingsports.conf" ]; then
    render_nginx_template "$APP_DIR/nginx/kingsports.conf" /etc/nginx/sites-available/kingsports.conf
    nginx -t && systemctl reload nginx
    echo "Nginx HTTPS de produção ativado para ${LP_SERVER_NAME}, ${CRM_DOMAIN} e ${HUB_DOMAIN}."
  else
    echo "Aviso: nem todos os certificados TLS foram emitidos ainda. Mantendo bootstrap HTTP até a regularização do DNS e reexecução do Certbot."
  fi
else
  echo "Aviso: ${APP_DIR}/nginx/nginx-http-bootstrap.conf não encontrado — copie o projeto para ${APP_DIR} antes de configurar o Nginx."
fi

systemctl enable certbot.timer || true

echo "[7/7] Setup básico concluído! Configure ${APP_DIR}/.env e execute scripts/deploy.sh."
