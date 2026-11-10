# King Sports Franchising — Plataforma Unificada

Plataforma única compilada da **King Sports Franchising**, reunindo em um só projeto e na mesma origem (`:3000` via Gateway Express):

1. **Landing Page Institucional & Blog SEO SSR** (`/`, `/blog`, `/blog/:slug`, `/api/public/*`) — Captação e qualificação de candidatos à franquia home based de uniformes personalizados em São Paulo/SP (investimento de referência de R$ 20.000, conformidade Lei nº 13.966/2019), consentimento LGPD, tracking híbrido e filas BullMQ/Redis.
2. **CRM Administrativo de Expansão** (`/admin`, `/api/admin/*`) — Funil Kanban, Scorecard dos 5 Filtros, campanhas Meta/Google/GA4, auditoria LGPD, automações e CMS do blog.
3. **Portal do Franqueado + Studio 3D + Universidade** (`/hub`, `/hub/studio`, `/hub/universidade`, `/api/v1/*`) — Sistema Next.js 14 (`basePath: '/hub'`) + API Fastify/PostgreSQL/Supabase Auth com design **Apple Dark Liquid Glass** e exatamente **2 perfis de acesso**:
   - **Admin (`admin`)**: visão global da rede, governança e provisionamento de usuários/unidades.
   - **Franqueado (`franqueado`)**: gestão isolada por unidade de *Meu Dia*, *Agenda* (calendário estilo Google Calendar Mês/Semana/Dia para entregas e reuniões), *Tarefas Diárias*, *CRM Comercial*, *Catálogo*, *Orçamentos*, *Studio 3D / Artes*, *Pedidos & Produção SP*, *Financeiro*, *SAC* e *Treinamentos*.

---

## Estrutura Consolidada

```text
/
├── public/               # Landing page oficial, páginas legais e assets estáticos (/)
├── admin/                # CRM de Expansão HTML5/JS (/admin)
├── server/               # Gateway Express + Rotas Públicas + CRM Expansão + BullMQ Workers
├── hub/MOCKUP/           # Monorepo workspaces do HUB do Franqueado & Mockup Studio 3D
│   ├── apps/web/         # Frontend Next.js 14 (basePath '/hub')
│   ├── apps/api/         # Backend Fastify TypeScript (/api/v1)
│   ├── packages/         # @mockup/canvas-engine, @mockup/types, @mockup/validation
│   └── scripts/          # Seed idempotente do portal (seed-portal.ts)
├── sql/ & supabase/      # Migrações versionadas PostgreSQL + RLS (schemas public e portal)
├── scripts/
│   ├── start-unified.js  # Orquestrador único (Gateway :3000 + HUB :3333 + Portal API :4000)
│   └── check-syntax.js   # Validação sintática JS/CJS e scripts inline HTML
├── nginx/                # Proxies Nginx HTTP/TLS
└── tests/                # Testes unitários e de integração da raiz
```

---

## Execução Unificada (Local & Produção)

### Pré-requisitos
- **Node.js >= 20**
- **PostgreSQL / Supabase** (`54321` / `54322`) e **Redis** (`6379`) ativos.

### Instalação & Configuração
```bash
npm install
npm --prefix hub/MOCKUP install
cp .env.example .env
cp hub/MOCKUP/.env.example hub/MOCKUP/.env
```
Preencha os arquivos `.env` com suas chaves locais ou de produção (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `REDIS_URL`, segredos de sessão/JWT/CSRF/AES-256). **Nunca versione arquivos `.env`.**

### Banco, Seed & Build Único
```bash
# Popular unidades, perfis (Admin / Franqueado), catálogo, pedidos, tarefas e agenda
npm run seed:hub

# Validar sintaxe + compilar TypeScript (@mockup/api, packages) + build Next.js (/hub)
npm run build

# Executar toda a suíte de testes (Raiz + HUB API + Canvas Engine)
npm run test:all
```

### Subir a Plataforma Completa em Origem Única (`http://localhost:3000`)
```bash
# Modo produção (requer npm run build prévio)
npm start

# Modo desenvolvimento (watch)
npm run dev
```
Rotas atendidas em `http://localhost:3000`:
- `/` e `/blog` → Landing Page & Blog SSR
- `/admin/` → CRM de Expansão
- `/hub/` → Portal do Franqueado (`/hub/login`, `/hub/studio`, `/hub/universidade`)
- `/api/public/*` e `/api/admin/*` → Backend Gateway Express
- `/api/v1/*` → Backend Fastify Portal HUB (proxy com repasse integral de cookies `HttpOnly`)

### Workers Assíncronos (Opcional para Filas BullMQ de Expansão)
```bash
npm run worker
npm run scheduler
```
