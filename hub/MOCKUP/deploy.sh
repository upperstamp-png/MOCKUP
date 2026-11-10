#!/usr/bin/env bash
# ====================================================================
# SCRIPT DE DEPLOY EM PRODUÇÃO: deploy.sh
# Plataforma B2B de Mockups de Uniformes & Vestuário
# ====================================================================

set -euo pipefail

# Cores para output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}====================================================${NC}"
echo -e "${BLUE}   INICIANDO DEPLOY EM PRODUÇÃO - MOCKUP B2B PRO    ${NC}"
echo -e "${BLUE}====================================================${NC}"

# 1. Verificação de Dependências Básicas
echo -e "\n${YELLOW}[1/8] Verificando dependências do host...${NC}"
command -v docker >/dev/null 2>&1 || { echo -e "${RED}Docker não está instalado. Abortando.${NC}"; exit 1; }
command -v docker compose >/dev/null 2>&1 || { echo -e "${RED}Docker Compose v2 não está instalado. Abortando.${NC}"; exit 1; }

# 2. Verificação do Arquivo de Ambiente (.env)
echo -e "\n${YELLOW}[2/8] Validando arquivo .env...${NC}"
if [ ! -f .env ]; then
  echo -e "${RED}Arquivo .env não encontrado! Crie o .env baseado no .env.example.${NC}"
  exit 1
fi

# Carrega e valida variáveis críticas
source .env
if [ -z "${JWT_SECRET:-}" ] || [ -z "${SUPABASE_URL:-}" ] || [ -z "${SUPABASE_SERVICE_ROLE_KEY:-}" ]; then
  echo -e "${RED}Variáveis de ambiente obrigatórias ausentes no .env (JWT_SECRET, SUPABASE_URL ou SERVICE_ROLE_KEY).${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Variáveis de ambiente validadas com sucesso.${NC}"

# 3. Atualização do Código Fonte (Git Pull)
echo -e "\n${YELLOW}[3/8] Atualizando repositório via Git...${NC}"
if [ -d .git ]; then
  git pull origin main || echo -e "${YELLOW}Aviso: Falha ao executar git pull ou branch não sincronizada.${NC}"
fi

# 4. Build dos Containers Multi-Stage
echo -e "\n${YELLOW}[4/8] Compilando imagens Docker (Web & API)...${NC}"
docker compose build --pull

# 5. Inicialização dos Serviços em Background
echo -e "\n${YELLOW}[5/8] Iniciando serviços (Nginx, Web, API)...${NC}"
docker compose up -d --remove-orphans

# 6. Aguarda e Executa Healthchecks
echo -e "\n${YELLOW}[6/8] Executando verificação de integridade (Healthchecks)...${NC}"
MAX_RETRIES=15
RETRY_COUNT=0
HEALTHY=false

while [ $RETRY_COUNT -lt $MAX_RETRIES ]; do
  if docker compose ps | grep -q "(healthy)"; then
    API_STATUS=$(docker inspect --format='{{json .State.Health.Status}}' mockup_api 2>/dev/null || echo '"unknown"')
    if [ "$API_STATUS" = '"healthy"' ]; then
      HEALTHY=true
      break
    fi
  fi
  echo "Aguardando inicialização dos containers... ($((RETRY_COUNT + 1))/$MAX_RETRIES)"
  sleep 3
  RETRY_COUNT=$((RETRY_COUNT + 1))
done

if [ "$HEALTHY" = false ]; then
  echo -e "${RED}❌ Falha no healthcheck após $MAX_RETRIES tentativas. Verifique os logs com: docker compose logs${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Todos os serviços estão ativos e saudáveis (healthy).${NC}"

# 7. Limpeza de Imagens e Camadas Antigas (Prune)
echo -e "\n${YELLOW}[7/8] Limpando imagens antigas e dangling...${NC}"
docker image prune -f

# 8. Relatório Final de Deploy
echo -e "\n${GREEN}====================================================${NC}"
echo -e "${GREEN}   ✓ DEPLOY CONCLUÍDO COM SUCESSO EM PRODUÇÃO!     ${NC}"
echo -e "${GREEN}====================================================${NC}"
echo -e "Frontend:  http://${DOMAIN:-localhost}"
echo -e "API:       http://${DOMAIN:-localhost}/api/v1"
echo -e "Status:    Online & Protegido"
echo -e "Logs:      docker compose logs -f"
