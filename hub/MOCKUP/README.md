# Mockup Studio B2B — Plataforma Interativa de Uniformes & Vestuário

Plataforma SaaS B2B profissional desenvolvida para confecções, fábricas de uniformes esportivos/corporativos e empresas de estamparia criarem propostas visuais fotorrealistas de alta conversão em menos de 2 minutos, com exportação em 2000x2000px pronta para WhatsApp.

---

## 1. Requisitos do Sistema

* **Node.js**: v20.x ou superior (LTS)
* **NPM**: v10.x ou superior
* **Docker & Docker Compose**: v2.x (para deploy containerizado)
* **PostgreSQL / Supabase**: v15.x
* **Nginx**: v1.24+ (para reverse proxy e terminação SSL no host)

---

## 2. Instalação e Execução Local (Desenvolvimento)

### 2.1 Clonar o Repositório & Instalar Dependências
```bash
git clone <url-do-repositorio> mockup-platform
cd mockup-platform
npm install
```

### 2.2 Configurar Variáveis de Ambiente
Copie o arquivo de exemplo na raiz:
```bash
cp .env.example .env
```

### 2.3 Executar em Modo Dev (Monorepo)
```bash
# Executa simultaneamente Next.js (Porta 3000) e Fastify API (Porta 4000)
npm run dev
```

* **Frontend Web**: [http://localhost:3000](http://localhost:3000)
* **Backend API**: [http://localhost:4000](http://localhost:4000)
* **Documentação & Health**: [http://localhost:4000/health](http://localhost:4000/health)

---

## 3. Configuração do Banco de Dados Supabase

1. Crie um projeto no **Supabase** ou execute localmente via Supabase CLI (`supabase start`).
2. Acesse o **SQL Editor** do Supabase.
3. Execute o script de migração:
   * [`supabase/migrations/001_initial_schema.sql`](supabase/migrations/001_initial_schema.sql)
4. Execute o script de seed inicial para desenvolvimento:
   * [`supabase/seed.sql`](supabase/seed.sql)
5. No painel do Supabase, certifique-se de que os seguintes buckets de Storage foram criados:
   * `apparel-models` (Público)
   * `patterns` (Público)
   * `logos` (Privado com RLS)
   * `mockup-exports` (Privado com RLS)

---

## 4. Chave de Teste para Login Inicial (Dev)

Para testar a plataforma sem cadastrar um novo cliente:

* **Chave Serial**: `MOCK-PRO-2026-DEV01`
* **Tenant**: Fábrica Imperial Uniformes Esportivos Ltda
* **Limite**: 5 dispositivos ativos simultâneos

---

## 5. Arquitetura da Canvas 2D Engine

A engine opera sem tecnologias 3D, garantindo compatibilidade universal, leveza e fidelidade fotorrealista através de uma composição de 4 camadas:

```
┌────────────────────────────────────────────────────────┐
│ CAMADA 4 — SOMBRAS & TEXTURA TECIDO (Blend: Multiply) │
├────────────────────────────────────────────────────────┤
│ CAMADA 3 — DECALS (Logos transparentes, Nomes, Números)│
├────────────────────────────────────────────────────────┤
│ CAMADA 2 — ESTAMPA DUOTONE (SVG Normalizado Cor A / B) │
├────────────────────────────────────────────────────────┤
│ CAMADA 1 — MÁSCARA DE RECORTE (Silhouette Clipping)   │
└────────────────────────────────────────────────────────┘
```

* **Camada 1 (Máscara)**: Aplica o recorte da silhueta da peça via `CanvasRenderingContext2D.clip()` e operação alfa `destination-in`.
* **Camada 2 (Estampa Duotone)**: O método `applyDuotoneToSVG()` processa SVGs, convertendo cores pretas na Cor A e brancas na Cor B preservando opacidades e gerando `ImageBitmap` em cache.
* **Camada 3 (Decals)**: Manipula logos (PNG/WebP/SVG), nomes e números esportivos com rotação, escala e posicionamento em tempo real.
* **Camada 4 (Sombra)**: Renderiza o mapa de sombras e dobras do tecido em modo `globalCompositeOperation = 'multiply'`.

---

## 6. Exportação em Alta Resolução & Prancha Comercial (Sales Board)

* **Resolução**: 2000 × 2000 px independente do tamanho da viewport.
* **Prancha Comercial**: Layout com Vista Frontal, Vista Traseira, Paleta de Cores (Amostras Hex), Branding da Empresa, Nome do Cliente e Link direto para envio via WhatsApp em 1 clique.

---

## 7. Deploy em Produção com Docker & Nginx

### 7.1 Executar com Docker Compose
```bash
docker compose up -d --build
```

### 7.2 Script Automatizado de Deploy
O script [`deploy.sh`](deploy.sh) automatiza:
* Verificação de pré-requisitos e `.env`
* `git pull`
* `docker compose build --pull`
* Healthcheck com verificação de status `healthy`
* Limpeza de imagens antigas

Execute:
```bash
chmod +x deploy.sh
./deploy.sh
```

---

## 8. Execução com PM2 (Bare-Metal / Servidor Host)

Caso prefira rodar diretamente no Node.js do servidor sem Docker:

```bash
npm run build
pm2 start ecosystem.config.js --env production
```

---

## 9. Testes Automatizados

Para rodar a suite de testes unitários:

```bash
npm run test
```

* **Canvas Engine Tests**: Normalização Duotone, Bounding Box, Hit-Testing.
* **API Tests**: Hashing SHA-256 de chaves seriais, validação Zod de schemas e regras de negócio de licença.

---

## 10. Troubleshooting

| Problema | Causa Provável | Solução |
| :--- | :--- | :--- |
| `DEVICE_LIMIT_EXCEEDED` (409) | Limite de terminais da licença atingido | Acesse `/settings` ou o `/admin` e revogue dispositivos inativos |
| `LICENSE_EXPIRED` (403) | Data de expiração ultrapassada | Renove a licença no banco ou via painel `/admin` |
| Erro de CORS na API | Host não liberado no `CORS_ORIGIN` | Ajuste a variável `CORS_ORIGIN` no `.env` |
| Sombra não multiplica no Canvas | Falha ao carregar imagem PNG de sombra | Verifique a URL do mapa de sombra e cabeçalhos CORS do Storage |
